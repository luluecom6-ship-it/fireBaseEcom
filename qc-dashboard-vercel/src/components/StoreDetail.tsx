import React, { useMemo, useState } from 'react';
import { Order, STATUS_ORDER, STATUS_LABELS, getTotalItems, getPickedItems, getSkuCount, getPickedSkuCount, getOrderDistance, getPickerInfo, getDriverInfo, getStatusColor, extractStoreCode, getOrderAgeMinutes, getAgeBucket, getOrderLifecycle, getTimeDiffMinutes, formatDuration, getRemovedItemsCount, getCustomerCancelledCount, mapStatus } from '../types';

interface StoreDetailProps {
  storeId: string;
  data: Order[];
}

interface PickingStep {
  id: string;
  type: string;
  status: string;
  actualStart: string | null;
  actualEnd: string | null;
}

// Order detail with real items
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
}

const StoreDetail: React.FC<StoreDetailProps> = ({ storeId, data }) => {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);

  const stats = useMemo(() => {
    const quick = data.filter(o => o.source === 'EXPRESS').length;
    const schedule = data.filter(o => o.source === 'DEFAULT').length;
    return { quick, schedule, total: data.length };
  }, [data]);

  const statusDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    STATUS_ORDER.forEach(status => {
      distribution[status] = 0;
    });
    data.forEach(order => {
      // Use mapStatus for consistent status mapping
      const displayStatus = mapStatus(order.partial_status);
      if (distribution[displayStatus] !== undefined) {
        distribution[displayStatus]++;
      }
    });
    return distribution;
  }, [data]);

  const recentOrders = useMemo(() => {
    let filtered = [...data];
    if (selectedStatus) {
      filtered = filtered.filter(order => {
        // Use mapStatus for consistent status mapping
        const displayStatus = mapStatus(order.partial_status);
        return displayStatus === selectedStatus;
      });
    }
    return filtered
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);
  }, [data, selectedStatus]);

  const handleStatusClick = (status: string) => {
    setSelectedStatus(selectedStatus === status ? null : status);
  };

  const handleOrderClick = (order: Order) => {
    const picker = getPickerInfo(order);
    const driver = getDriverInfo(order);

    // Get picking timeline from tasks
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
      distance: getOrderDistance(order)
    });
  };

  const closeOrderDetail = () => {
    setSelectedOrder(null);
  };

  const closeImageModal = () => {
    setSelectedImage(null);
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
      case 'ADDED':
        return 'picked';
      case 'REJECTED':
        return 'rejected';
      case 'REMOVED':
        return 'removed';
      case 'PENDING':
        return 'pending';
      case 'OUT_OF_STOCK':
        return 'oos';
      default:
        return 'pending';
    }
  };

  const getItemStatusIcon = (status: string) => {
    switch (status) {
      case 'picked':
        return (
          <svg className="item-icon picked" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        );
      case 'partial':
        return (
          <svg className="item-icon partial" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        );
      case 'oos':
      case 'removed':
        return (
          <svg className="item-icon oos" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M15 9l-6 6M9 9l6 6"/>
          </svg>
        );
      case 'rejected':
        return (
          <svg className="item-icon rejected" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        );
      default:
        return (
          <svg className="item-icon pending" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        );
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

  return (
    <div className="store-detail-container">
      <div className="store-detail-header">
        <div className="store-stats-row">
          <div className="stat-box">
            <span className="stat-box-label">Quick Commerce</span>
            <span className="stat-box-value green">{stats.quick}</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-label">Schedule Commerce</span>
            <span className="stat-box-value blue">{stats.schedule}</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-label">Total Orders</span>
            <span className="stat-box-value purple">{stats.total}</span>
          </div>
        </div>
      </div>

      <div className="store-detail-grid">
        <div className="detail-section status-distribution">
          <h3>Order Status Distribution</h3>
          <p className="section-hint">Click a status to filter orders below</p>
          <div className="status-bars">
            {STATUS_ORDER.map(status => {
              const count = statusDistribution[status];
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              const isSelected = selectedStatus === status;
              return (
                <div
                  key={status}
                  className={`status-bar-item clickable ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleStatusClick(status)}
                >
                  <div className="status-bar-label">
                    <span className="status-dot" style={{ backgroundColor: getStatusColor(status) }}></span>
                    {STATUS_LABELS[status]}
                  </div>
                  <div className="status-bar-track">
                    <div
                      className="status-bar-fill"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: getStatusColor(status)
                      }}
                    ></div>
                  </div>
                  <span className="status-bar-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="detail-section recent-orders">
          <h3>
            Recent Orders
            {selectedStatus && (
              <span className="filter-badge">
                Filtered: {STATUS_LABELS[selectedStatus]}
                <button onClick={() => setSelectedStatus(null)} className="clear-filter">×</button>
              </span>
            )}
          </h3>
          <div className="orders-list">
            {recentOrders.length === 0 ? (
              <div className="empty-state">No orders with this status</div>
            ) : (
              recentOrders.map(order => (
                <div
                  key={order.job_number}
                  className="order-item clickable"
                  onClick={() => handleOrderClick(order)}
                >
                  <div className="order-info">
                    <span className="order-number">{order.job_number}</span>
                    <span className="order-customer">{extractStoreCode(order.store_name)}</span>
                  </div>
                  <div className="order-meta">
                    <span className="order-source">{order.source}</span>
                    <span
                      className="order-status"
                      style={{ color: getStatusColor(order.partial_status) }}
                    >
                      {getStatusLabel(order)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="order-detail-overlay" onClick={closeOrderDetail}>
          <div className="order-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Order Details</h3>
              <button className="close-btn" onClick={closeOrderDetail}>
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
                {/* OOS and Cancelled counts */}
                <div className="progress-grid" style={{ marginTop: '16px' }}>
                  <div className="progress-item">
                    <div className="progress-label">OOS (REMOVED)</div>
                    <div className="progress-value">
                      <span className="highlight" style={{ color: '#ef4444' }}>{getRemovedItemsCount(selectedOrder.order)}</span>
                      <span className="separator">/</span>
                      <span>{selectedOrder.totalItems}</span>
                    </div>
                  </div>
                  <div className="progress-item">
                    <div className="progress-label">Cancelled/Rejected</div>
                    <div className="progress-value">
                      <span className="highlight" style={{ color: '#f59e0b' }}>{getCustomerCancelledCount(selectedOrder.order)}</span>
                      <span className="separator">/</span>
                      <span>{selectedOrder.totalItems}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Lifecycle Timeline - Grid Format */}
              <div className="detail-section-card order-lifecycle-grid">
                <h4>Order Lifecycle (O2D)</h4>
                <div className="lifecycle-grid">
                  {(() => {
                    const lifecycle = getOrderLifecycle(selectedOrder.order);
                    const order = selectedOrder.order;
                    const isExpress = order.source === 'EXPRESS';

                    // Calculate all metrics
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
                        {/* Row 1: Fulfillment stages */}
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
                        {/* Row 2: Delivery stages */}
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
              <div className="detail-section-card picker-driver-compact">
                <div className="picker-driver-split">
                  {/* Picker Info */}
                  <div className="picker-section">
                    <h4>Picker</h4>
                    {selectedOrder.picker ? (
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
                    ) : (
                      <span className="no-data">No picker assigned</span>
                    )}
                  </div>

                  {/* Driver Info */}
                  <div className="driver-section">
                    <h4>Driver</h4>
                    {selectedOrder.driver ? (
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
                    ) : (
                      <span className="no-data">No driver assigned</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="detail-section-card items-list">
                <h4>Items ({selectedOrder.order.items.length})</h4>
                <div className="items-table">
                  <div className="items-header">
                    <span className="col-status">Status</span>
                    <span className="col-sku">SKU</span>
                    <span className="col-name">Item Name</span>
                    <span className="col-qty">Quantity</span>
                  </div>
                  {selectedOrder.order.items.map((item, idx) => {
                    const statusClass = getItemStatusClass(item.item_status);
                    const hasImage = !!item.photo_url;
                    return (
                      <div
                        key={idx}
                        className={`item-row ${statusClass} ${hasImage ? 'clickable' : ''}`}
                        onClick={() => hasImage && setSelectedImage({ url: item.photo_url!, name: item.item_name })}
                      >
                        <span className="col-status">
                          {getItemStatusIcon(statusClass)}
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
                          {hasImage && <span className="image-indicator" title="Click to view image">📷</span>}
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
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={closeImageModal}>
          <div className="image-modal-content" onClick={e => e.stopPropagation()}>
            <button className="image-modal-close" onClick={closeImageModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <img src={selectedImage.url} alt={selectedImage.name} />
            <div className="image-modal-caption">{selectedImage.name}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreDetail;