import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Order, STATUS_LABELS, getTotalItems, getPickedItems, getSkuCount, getPickedSkuCount, getOrderDistance, getPickerInfo, getDriverInfo, getStatusColor, getOrderAgeMinutes, getAgeBucket, getOrderLifecycle, getTimeDiffMinutes, formatDuration, getRemovedItemsCount, getCustomerCancelledCount } from '../../typesV2';

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

  const [coords, setCoords] = useState<{
    x: number;
    y: number;
    transform: string;
    visibility: 'visible' | 'hidden';
    isFlipped: boolean;
  }>({
    x: position.x,
    y: position.y,
    transform: 'translate(-50%, -105%)',
    visibility: 'hidden',
    isFlipped: false
  });

  // useLayoutEffect runs synchronously before browser paint, so updating coords here is flash-free.

  useLayoutEffect(() => {
    if (showDetailModal || !popupRef.current) return;

    const rect = popupRef.current.getBoundingClientRect();
    const width = rect.width || 300;
    const height = rect.height || 220;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let targetX = position.x;
    let targetY = position.y;
    let transform = 'translate(-50%, -105%)';
    let isFlipped = false;

    // Define boundaries
    let leftBoundary = targetX - (width / 2);
    let rightBoundary = targetX + (width / 2);
    let topBoundary = targetY - (height * 1.05);

    // Adjust horizontal position if overflowing viewport edges
    if (leftBoundary < 12) {
      targetX = 12 + (width / 2);
    } else if (rightBoundary > viewportWidth - 12) {
      targetX = viewportWidth - 12 - (width / 2);
    }

    // Adjust vertical position: if it goes off the top edge, display it BELOW the cell instead
    if (topBoundary < 12) {
      transform = 'translate(-50%, 20px)';
      isFlipped = true;
    }

    setCoords({
      x: targetX,
      y: targetY,
      transform,
      visibility: 'visible',
      isFlipped
    });
  }, [position.x, position.y, orders.length, showDetailModal]);

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
    onShowDetails(order);
  };

  const closeDetailModal = () => {
    // This is now handled by the parent
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

    const arrowOffset = position.x - coords.x;
    const arrowLeftStyle = `calc(50% + ${Math.min(130, Math.max(-130, arrowOffset))}px)`;

    return (
      <div
        ref={popupRef}
        className="matrix-tooltip"
        style={{
          left: coords.x,
          top: coords.y,
          transform: coords.transform,
          visibility: coords.visibility
        }}
      >
        <div className="tooltip-header-matrix">
          <span className="popup-title">{header}</span>
          <button className="popup-close" onClick={onClose}>×</button>
        </div>

        <div className="popup-actions">
          <button className="popup-btn copy-btn" onClick={handleCopy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copied ? 'Copied!' : 'Copy All'}
          </button>
        </div>

        <div className="tooltip-content-matrix">
          {orders.map((order, idx) => (
            <div key={idx} className="tooltip-order-row">
              <div className="tooltip-order-header">
                <span className="tooltip-job">{order.jobNumber}</span>
                <span className="tooltip-store-pill">{order.storeCode}</span>
              </div>
              
              <div className="tooltip-order-stats">
                 <span className="stat-label">SKUs: <span className="stat-value">{order.skuPicked}/{order.skuTotal}</span></span>
                 <span className="stat-label">Items: <span className="stat-value">{order.itemsPicked}/{order.itemsTotal}</span></span>
              </div>

              {getFullOrder(order.jobNumber) && (
                <button
                  className="popup-details-btn-v2"
                  onClick={() => getFullOrder(order.jobNumber) && handleDetails(getFullOrder(order.jobNumber)!)}
                >
                  View Details
                </button>
              )}
            </div>
          ))}
        </div>
        <div 
          className={`tooltip-arrow ${coords.isFlipped ? 'arrow-flipped' : ''}`}
          style={{ left: arrowLeftStyle }}
        ></div>
      </div>
    );
  };

  // Render detail modal
  const renderDetailModal = () => {
    if (!showDetailModal || !selectedOrder) return null;

    const showPhotos = shouldShowPhotos(selectedOrder.order);

    return (
      <div className="order-detail-overlay" onClick={closeDetailModal}>
        <div className="order-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 style={{ color: 'white' }}>Order Details</h3>
            <button className="close-btn" onClick={closeDetailModal} style={{ color: 'white' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-content" style={{ padding: '20px', color: 'white' }}>
            {/* Order Summary */}
            <div className="detail-section-card" style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="detail-label">Order Number</span>
                <span className="detail-value">{selectedOrder.order.job_number}</span>
              </div>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="detail-label">Store</span>
                <span className="detail-value">{selectedOrder.order.store_name}</span>
              </div>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="detail-label">Status</span>
                <span
                  className="detail-value status-badge"
                  style={{ color: getStatusColor(selectedOrder.order.partial_status), fontWeight: '700' }}
                >
                  {getStatusLabel(selectedOrder.order)}
                </span>
              </div>
            </div>

            {/* Picking Progress */}
            <div className="detail-section-card picking-progress" style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#94a3b8' }}>Picking Progress</h4>
              <div className="progress-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="progress-item">
                  <div className="progress-label" style={{ fontSize: '12px', color: '#64748b' }}>Items</div>
                  <div className="progress-value" style={{ fontSize: '18px', fontWeight: '700' }}>
                    {selectedOrder.pickedItems}/{selectedOrder.totalItems}
                  </div>
                </div>
                <div className="progress-item">
                  <div className="progress-label" style={{ fontSize: '12px', color: '#64748b' }}>SKUs</div>
                  <div className="progress-value" style={{ fontSize: '18px', fontWeight: '700' }}>
                    {selectedOrder.pickedSkus}/{selectedOrder.totalSkus}
                  </div>
                </div>
              </div>
            </div>

            {/* Items List */}
            <div className="detail-section-card" style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '14px', color: '#94a3b8' }}>Items</h4>
              <div className="items-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {selectedOrder.order.items.map((item, idx) => (
                  <div key={idx} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {showPhotos && item.photo_url && (
                        <img src={item.photo_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain', background: 'white', borderRadius: '4px' }} />
                    )}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>{item.item_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>SKU: {item.sku}</div>
                    </div>
                    <div style={{ fontWeight: '700', fontSize: '13px' }}>{item.found_qty}/{item.quantity}</div>
                  </div>
                ))}
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
    </>
  );
};

export default OrderPopup;
