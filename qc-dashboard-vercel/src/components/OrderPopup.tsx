import React, { useState, useEffect, useRef } from 'react';
import { Order, STATUS_LABELS, getTotalItems, getPickedItems, getSkuCount, getPickedSkuCount, getOrderDistance, getPickerInfo, getDriverInfo, getStatusColor, getOrderAgeMinutes, getAgeBucket, getOrderLifecycle, getTimeDiffMinutes, formatDuration, getRemovedItemsCount, getCustomerCancelledCount } from '../types';

export interface PopupOrder {
  jobNumber: string;
  storeCode: string;
  ageBucket?: string;
  skuPicked?: number;
  skuTotal?: number;
  itemsPicked?: number;
  itemsTotal?: number;
}

interface OrderPopupProps {
  orders: PopupOrder[];
  allOrders: Order[];
  position: { x: number; y: number };
  header: string;
  onClose: () => void;
  onShowDetails: (order: Order) => void;
}

interface OrderDetail {
  order: Order;
  picker: { name: string; phone: string; fleet: string } | null;
  driver: { name: string; phone: string; fleet: string } | null;
  pickingStartedAt: string | null;
  pickingCompletedAt: string | null;
  totalItems: number;
  pickedItems: number;
  totalSkus: number;
  pickedSkus: number;
  distance: number | null;
  removedCount: number;
  rejectedCount: number;
}

const OrderPopup: React.FC<OrderPopupProps> = ({ orders, allOrders, position, header, onClose, onShowDetails }) => {
  const [copied, setCopied] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside (only when detail modal is NOT open)
  useEffect(() => {
    if (showDetailModal) return; // Don't close on click outside when detail modal is open

    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, showDetailModal]);

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDetailModal) {
          closeDetailModal();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose, showDetailModal]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(orders.map(o => o.jobNumber).join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDetails = (order: Order) => {
    const picker = getPickerInfo(order);
    const driver = getDriverInfo(order);

    let pickingStartedAt: string | null = null;
    let pickingCompletedAt: string | null = null;

    order.tasks.forEach(task => {
      if (task.task_type === 'PICKING_AND_STORAGE') {
        task.steps.forEach(step => {
          if (step.step_type === 'PICKING_WITH_PACKING') {
            if (step.actual_start && !pickingStartedAt) {
              pickingStartedAt = step.actual_start;
            }
            if (step.actual_end && !pickingCompletedAt) {
              pickingCompletedAt = step.actual_end;
            }
          }
        });
      }
    });

    setSelectedOrder({
      order,
      picker,
      driver,
      pickingStartedAt,
      pickingCompletedAt,
      totalItems: getTotalItems(order),
      pickedItems: getPickedItems(order),
      totalSkus: getSkuCount(order),
      pickedSkus: getPickedSkuCount(order),
      distance: getOrderDistance(order),
      removedCount: getRemovedItemsCount(order),
      rejectedCount: getCustomerCancelledCount(order)
    });
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedOrder(null);
  };

  const formatTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getItemStatusClass = (itemStatus: string): string => {
    switch (itemStatus) {
      case 'ADDED': return 'picked';
      case 'REJECTED': return 'rejected';
      case 'REMOVED': return 'removed';
      case 'PENDING': return 'pending';
      case 'OUT_OF_STOCK': return 'oos';
      default: return 'pending';
    }
  };

  const getItemStatusLabel = (itemStatus: string, foundQty: number, quantity: number): string => {
    if (itemStatus === 'REMOVED') return 'OOS';
    if (itemStatus === 'REJECTED') return 'Cancelled/Rejected';
    if (foundQty >= quantity) return 'Picked';
    if (foundQty > 0) return 'Partial';
    return 'Pending';
  };

  const getStatusLabel = (order: Order): string => {
    const status = order.partial_status.toUpperCase();
    if (STATUS_LABELS[status]) return STATUS_LABELS[status];
    if (status === 'DOING' || status === 'PROCESSING') return 'Picking';
    if (status === 'FINISHED') return 'Delivered';
    return status;
  };

  // Check if status should show photos (NOT TRANSFERRING, DELIVERED, GOING_TO_DESTINATION, IN_ROUTE)
  const shouldShowPhotos = (order: Order): boolean => {
    const status = order.partial_status.toUpperCase();
    const hidePhotoStatuses = ['TRANSFERRING', 'DELIVERED', 'GOING_TO_DESTINATION', 'IN_ROUTE'];
    return !hidePhotoStatuses.includes(status);
  };

  // Find full order data from allOrders
  const getFullOrder = (jobNumber: string): Order | undefined => {
    return allOrders.find(o => o.job_number === jobNumber);
  };

  // Render cell popup (hidden when detail modal is open)
  const renderCellPopup = () => {
    if (showDetailModal) return null;

    return (
      <div
        ref={popupRef}
        className="order-popup"
        style={{
          left: position.x,
          top: position.y,
        }}
      >
        <div className="popup-header">
          <span className="popup-title">{header}</span>
          <button className="popup-close" onClick={onClose}>×</button>
        </div>

        <div className="popup-actions">
          <button className="popup-btn copy-btn" onClick={handleCopy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copied ? 'Copied!' : 'Copy All'}
          </button>
        </div>

        <div className="popup-orders-list">
          {orders.map((order, idx) => (
            <div key={idx} className="popup-order-item">
              <div className="popup-order-main">
                <span className="popup-job">{order.jobNumber}</span>
                <span className="popup-store">{order.storeCode}</span>
              </div>
              <div className="popup-order-meta">
                {order.skuPicked !== undefined && (
                  <span className="popup-picked-info">
                    SKUs: {order.skuPicked}/{order.skuTotal}
                  </span>
                )}
                {order.itemsPicked !== undefined && (
                  <span className="popup-picked-info">
                    Items: {order.itemsPicked}/{order.itemsTotal}
                  </span>
                )}
                {order.ageBucket && (
                  <span className="popup-age">{order.ageBucket} min</span>
                )}
              </div>
              {getFullOrder(order.jobNumber) && (
                <button
                  className="popup-details-btn"
                  onClick={() => getFullOrder(order.jobNumber) && handleDetails(getFullOrder(order.jobNumber)!)}
                >
                  View Details
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render detail modal
  const renderDetailModal = () => {
    if (!showDetailModal || !selectedOrder) return null;

    const showPhotos = shouldShowPhotos(selectedOrder.order);

    return (
      <div className="order-detail-overlay" onClick={closeDetailModal}>
        <div className="order-detail-modal popup-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Order Details</h3>
            <button className="close-btn" onClick={closeDetailModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-content">
            {/* Order Summary */}
            <div className="detail-section-card">
              <div className="detail-row">
                <span className="detail-label">Order Number</span>
                <span className="detail-value">{selectedOrder.order.job_number}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Store</span>
                <span className="detail-value">{selectedOrder.order.store_name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span
                  className="detail-value status-badge"
                  style={{ color: getStatusColor(selectedOrder.order.partial_status) }}
                >
                  {getStatusLabel(selectedOrder.order)}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Source</span>
                <span className="detail-value">{selectedOrder.order.source}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Is Big Order</span>
                <span className="detail-value">
                  <span className={`big-order-badge ${selectedOrder.order.is_big_order.toLowerCase()}`}>
                    {selectedOrder.order.is_big_order}
                  </span>
                </span>
              </div>
              {selectedOrder.order.packages_count > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Packages</span>
                  <span className="detail-value">{selectedOrder.order.packages_count}</span>
                </div>
              )}
              {selectedOrder.distance !== null && (
                <div className="detail-row">
                  <span className="detail-label">Distance</span>
                  <span className="detail-value distance-value">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {selectedOrder.distance.toFixed(1)} km
                  </span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Age</span>
                <span className="detail-value">{getAgeBucket(getOrderAgeMinutes(selectedOrder.order))} min</span>
              </div>
            </div>

            {/* Picking Progress */}
            <div className="detail-section-card picking-progress">
              <h4>Picking Progress</h4>
              <div className="progress-grid">
                <div className="progress-item">
                  <div className="progress-label">Items Picked</div>
                  <div className="progress-value">
                    <span className="highlight">{selectedOrder.pickedItems}</span>
                    <span className="separator">/</span>
                    <span>{selectedOrder.totalItems}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill green"
                      style={{ width: `${selectedOrder.totalItems > 0 ? (selectedOrder.pickedItems / selectedOrder.totalItems) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
                <div className="progress-item">
                  <div className="progress-label">SKUs Picked</div>
                  <div className="progress-value">
                    <span className="highlight">{selectedOrder.pickedSkus}</span>
                    <span className="separator">/</span>
                    <span>{selectedOrder.totalSkus}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill purple"
                      style={{ width: `${selectedOrder.totalSkus > 0 ? (selectedOrder.pickedSkus / selectedOrder.totalSkus) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="progress-grid" style={{ marginTop: '16px' }}>
                <div className="progress-item">
                  <div className="progress-label">OOS (REMOVED)</div>
                  <div className="progress-value">
                    <span className="highlight" style={{ color: '#ef4444' }}>
                      {selectedOrder.removedCount}
                    </span>
                  </div>
                </div>
                <div className="progress-item">
                  <div className="progress-label">Cancelled/Rejected</div>
                  <div className="progress-value">
                    <span className="highlight" style={{ color: '#f59e0b' }}>
                      {selectedOrder.rejectedCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pick Time Comparison */}
            {selectedOrder.pickingStartedAt && selectedOrder.pickingCompletedAt && (
              <div className="detail-section-card picking-time-comparison">
                <h4>Pick Time Analysis</h4>
                <div className="time-comparison-grid">
                  <div className="time-item estimated">
                    <div className="time-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                      Estimated Pick Time
                    </div>
                    <div className="time-value">{selectedOrder.totalItems} min</div>
                    <div className="time-detail">({selectedOrder.totalItems} units × 1 min/unit)</div>
                  </div>
                  <div className="time-item actual">
                    <div className="time-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                      Actual Pick Time
                    </div>
                    <div className="time-value">{formatDuration(getTimeDiffMinutes(selectedOrder.pickingStartedAt, selectedOrder.pickingCompletedAt))}</div>
                    <div className="time-detail">({formatTime(selectedOrder.pickingStartedAt)} - {formatTime(selectedOrder.pickingCompletedAt)})</div>
                  </div>
                </div>
              </div>
            )}

            {/* Order Lifecycle Grid */}
            <div className="detail-section-card order-lifecycle-grid">
              <h4>Order Lifecycle (O2D)</h4>
              <div className="lifecycle-grid">
                {(() => {
                  const lifecycle = getOrderLifecycle(selectedOrder.order);
                  const order = selectedOrder.order;
                  const isExpress = order.source === 'EXPRESS';

                  const pickDelay = getTimeDiffMinutes(lifecycle.orderCreatedAt, lifecycle.pickStart);
                  const pickTime = getTimeDiffMinutes(lifecycle.pickStart, lifecycle.pickEnd);
                  const gapPick2Store = getTimeDiffMinutes(lifecycle.pickEnd, lifecycle.storingStart);
                  const storageTime = getTimeDiffMinutes(lifecycle.storingStart, lifecycle.storingEnd);
                  const pickerWaiting = lifecycle.storingEnd && lifecycle.goingToOriginStart
                    ? Math.max(0, getTimeDiffMinutes(lifecycle.storingEnd, lifecycle.goingToOriginStart) || 0)
                    : null;
                  const driverWaiting = lifecycle.storingEnd && lifecycle.goingToOriginStart
                    ? Math.max(0, -1 * (getTimeDiffMinutes(lifecycle.storingEnd, lifecycle.goingToOriginStart) || 0))
                    : null;
                  const goingToOriginTime = getTimeDiffMinutes(lifecycle.goingToOriginStart, lifecycle.goingToOriginEnd);
                  const collectionTime = getTimeDiffMinutes(lifecycle.transferToDeliveryStart, lifecycle.transferToDeliveryEnd);
                  const goingToDestTime = getTimeDiffMinutes(lifecycle.goingToDestinationStart, lifecycle.goingToDestinationEnd);
                  const deliveringTime = getTimeDiffMinutes(lifecycle.deliveringStart, lifecycle.deliveringEnd);

                  const formatDateTime = (dateStr: string | null) => {
                    if (!dateStr) return '—';
                    return new Date(dateStr).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: false
                    });
                  };

                  return (
                    <>
                      <div className="lifecycle-grid-row">
                        <div className="lifecycle-cell">
                          <div className="cell-header">Order Created</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.orderCreatedAt)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">—</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">—</span></div>
                            <div className="cell-desc">Order entry time</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Pick Delay</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.orderCreatedAt)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.pickStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(pickDelay)}</span></div>
                            <div className="cell-desc">Order Created → Pick Start</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Pick Time</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.pickStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.pickEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(pickTime)}</span></div>
                            <div className="cell-desc">Pick Start → Pick End</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Gap: Pick→Store</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.pickEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.storingStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(gapPick2Store)}</span></div>
                            <div className="cell-desc">Pick End → Store Start</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Storage</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.storingStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.storingEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(storageTime)}</span></div>
                            <div className="cell-desc">Store Start → Store End</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell highlight">
                          <div className="cell-header">Picker Waiting</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.storingEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.goingToOriginStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(pickerWaiting)}</span></div>
                            <div className="cell-desc">0 if negative</div>
                          </div>
                        </div>
                      </div>
                      <div className="lifecycle-grid-row">
                        <div className="lifecycle-cell highlight">
                          <div className="cell-header">Driver Waiting</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.storingEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.goingToOriginStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(driverWaiting)}</span></div>
                            <div className="cell-desc">×(-1) if negative</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Going to Origin</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.goingToOriginStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.goingToOriginEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(goingToOriginTime)}</span></div>
                            <div className="cell-desc">Driver to store</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Collection</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.transferToDeliveryStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.transferToDeliveryEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(collectionTime)}</span></div>
                            <div className="cell-desc">Transfer to delivery</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Going to Destination</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.goingToDestinationStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.goingToDestinationEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(goingToDestTime)}{selectedOrder.distance !== null && ` (${selectedOrder.distance.toFixed(1)}km)`}</span></div>
                            <div className="cell-desc">{isExpress ? 'Fallback: TRANSFERRING step' : 'Driver to customer'}</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Delivering</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">{formatDateTime(lifecycle.deliveringStart)}</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.deliveringEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">{formatDuration(deliveringTime)}</span></div>
                            <div className="cell-desc">Hand over to customer</div>
                          </div>
                        </div>
                        <div className="lifecycle-cell">
                          <div className="cell-header">Delivered</div>
                          <div className="cell-content">
                            <div className="cell-row"><span className="cell-label">S:</span><span className="cell-value">—</span></div>
                            <div className="cell-row"><span className="cell-label">E:</span><span className="cell-value">{formatDateTime(lifecycle.deliveringEnd)}</span></div>
                            <div className="cell-row"><span className="cell-label">D:</span><span className="cell-value">—</span></div>
                            <div className="cell-desc">Order complete</div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Picker & Driver Info Combined */}
            {selectedOrder.picker && selectedOrder.driver && (
              <div className="detail-section-card picker-driver-compact">
                <div className="picker-driver-split">
                  {/* Picker Info */}
                  <div className="picker-section">
                    <h4>Picker</h4>
                    <div className="person-info">
                      <span className="person-name">{selectedOrder.picker.name}</span>
                      {selectedOrder.picker.phone && <span className="person-phone">{selectedOrder.picker.phone}</span>}
                      {(() => {
                        const lifecycle = getOrderLifecycle(selectedOrder.order);
                        const actualPickTime = getTimeDiffMinutes(lifecycle.pickStart, lifecycle.pickEnd);
                        return (
                          <div className="pick-time-info">
                            <div className="pick-time-row">
                              <span className="pt-label">Est. Pick Time:</span>
                              <span className="pt-value">{selectedOrder.totalItems} min</span>
                            </div>
                            <div className="pick-time-row">
                              <span className="pt-label">Actual Pick Time:</span>
                              <span className="pt-value">{formatDuration(actualPickTime)}</span>
                            </div>
                            <div className="pick-time-row">
                              <span className="pt-label">Started:</span>
                              <span className="pt-value">{formatTime(lifecycle.pickStart)}</span>
                            </div>
                            <div className="pick-time-row">
                              <span className="pt-label">Completed:</span>
                              <span className="pt-value">{formatTime(lifecycle.pickEnd)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Driver Info */}
                  <div className="driver-section">
                    <h4>Driver</h4>
                    <div className="person-info">
                      <span className="person-name">{selectedOrder.driver.name}</span>
                      <span className="person-badge">Delivery</span>
                      <div className="driver-time-info">
                        <div className="driver-time-row">
                          <span className="dt-label">Driver Start Time:</span>
                          <span className="dt-value">
                            {(() => {
                              const lifecycle = getOrderLifecycle(selectedOrder.order);
                              return lifecycle.goingToOriginStart ? formatTime(lifecycle.goingToOriginStart) : '—';
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* If only picker or only driver is available, show individually */}
            {selectedOrder.picker && !selectedOrder.driver && (
              <div className="detail-section-card picker-driver-compact">
                <div className="picker-driver-split">
                  <div className="picker-section">
                    <h4>Picker</h4>
                    <div className="person-info">
                      <span className="person-name">{selectedOrder.picker.name}</span>
                      {selectedOrder.picker.phone && <span className="person-phone">{selectedOrder.picker.phone}</span>}
                      {(() => {
                        const lifecycle = getOrderLifecycle(selectedOrder.order);
                        const actualPickTime = getTimeDiffMinutes(lifecycle.pickStart, lifecycle.pickEnd);
                        return (
                          <div className="pick-time-info">
                            <div className="pick-time-row">
                              <span className="pt-label">Est. Pick Time:</span>
                              <span className="pt-value">{selectedOrder.totalItems} min</span>
                            </div>
                            <div className="pick-time-row">
                              <span className="pt-label">Actual Pick Time:</span>
                              <span className="pt-value">{formatDuration(actualPickTime)}</span>
                            </div>
                            <div className="pick-time-row">
                              <span className="pt-label">Started:</span>
                              <span className="pt-value">{formatTime(lifecycle.pickStart)}</span>
                            </div>
                            <div className="pick-time-row">
                              <span className="pt-label">Completed:</span>
                              <span className="pt-value">{formatTime(lifecycle.pickEnd)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="driver-section">
                    <h4>Driver</h4>
                    <span className="no-data">No driver assigned</span>
                  </div>
                </div>
              </div>
            )}

            {!selectedOrder.picker && selectedOrder.driver && (
              <div className="detail-section-card picker-driver-compact">
                <div className="picker-driver-split">
                  <div className="picker-section">
                    <h4>Picker</h4>
                    <span className="no-data">No picker assigned</span>
                  </div>
                  <div className="driver-section">
                    <h4>Driver</h4>
                    <div className="person-info">
                      <span className="person-name">{selectedOrder.driver.name}</span>
                      <span className="person-badge">Delivery</span>
                      <div className="driver-time-info">
                        <div className="driver-time-row">
                          <span className="dt-label">Driver Start Time:</span>
                          <span className="dt-value">
                            {(() => {
                              const lifecycle = getOrderLifecycle(selectedOrder.order);
                              return lifecycle.goingToOriginStart ? formatTime(lifecycle.goingToOriginStart) : '—';
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Items List */}
            <div className="detail-section-card items-list">
              <h4>Items ({selectedOrder.order.items.length})</h4>
              <div className="items-table">
                <div className={`items-header ${showPhotos ? 'with-thumb' : 'no-thumb'}`}>
                  {showPhotos && <span className="col-thumb-header">Photo</span>}
                  <span className="col-status">Status</span>
                  <span className="col-sku">SKU</span>
                  <span className="col-name">Item Name</span>
                  <span className="col-qty">Quantity</span>
                </div>
                {selectedOrder.order.items.map((item, idx) => {
                  const statusClass = getItemStatusClass(item.item_status);
                  return (
                    <div key={idx} className={`item-row ${statusClass} ${showPhotos ? 'with-thumb' : 'no-thumb'}`}>
                      {showPhotos && (
                        <div className="col-thumb">
                          {item.photo_url ? (
                            <div className="item-thumbnail">
                              <img src={item.photo_url} alt={item.item_name} />
                            </div>
                          ) : (
                            <div className="item-thumbnail-small">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      )}
                      <span className="col-status">
                        <span className={`status-text ${statusClass}`}>{getItemStatusLabel(item.item_status, item.found_qty, item.quantity)}</span>
                      </span>
                      <span className="col-sku">{item.sku}</span>
                      <span className="col-name">
                        {item.item_name}
                        {item.package_name && (
                          <span className="package-tag">{item.package_name}</span>
                        )}
                        {item.location && item.location !== '-' && (
                          <span className="location-tag">{item.location}</span>
                        )}
                      </span>
                      <span className="col-qty">
                        <span className={`qty-badge ${statusClass}`}>
                          {item.found_qty}/{item.quantity}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderCellPopup()}
      {renderDetailModal()}
    </>
  );
};

export default OrderPopup;