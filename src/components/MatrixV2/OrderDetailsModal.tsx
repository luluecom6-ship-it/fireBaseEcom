import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, MapPin, Clock, Truck, User, Phone, 
  ShoppingBag, Package, CheckCircle2, AlertCircle, Ban,
  ExternalLink, Copy, Calendar
} from 'lucide-react';
import { 
  Order, getOrderLifecycle, formatDuration, getOrderDistance,
  getTotalItems, getPickedItems, getSkuCount, getPickedSkuCount,
  getRemovedItemsCount, getCustomerCancelledCount, extractStoreCode,
  getStatusColor, getPickerInfo, getDriverInfo
} from '../../typesV2';
import { SmartImage } from '../layout/common/SmartImage';
import { fixImageUrl } from '../../utils/formatters';

interface OrderDetailsModalProps {
  order: Order;
  onClose: () => void;
}

const OrderLifecycleBox = ({ 
  title, 
  start, 
  end, 
  duration, 
  sublabel,
  isActive = false
}: { 
  title: string; 
  start: string | null; 
  end: string | null; 
  duration: string; 
  sublabel: string;
  isActive?: boolean;
}) => {
  const formatTime = (isoString: string | null) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + 
           date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className={`lifecycle-box ${isActive ? 'active' : ''}`}>
      <div className="box-title">{title}</div>
      <div className="box-metrics">
        <div className="metric">
          <span className="label">S:</span>
          <span className="value">{formatTime(start)}</span>
        </div>
        <div className="metric">
          <span className="label">E:</span>
          <span className="value">{formatTime(end)}</span>
        </div>
        <div className="metric">
          <span className="label">D:</span>
          <span className="value duration">{duration}</span>
        </div>
      </div>
      <div className="box-sublabel">{sublabel}</div>
    </div>
  );
};

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, onClose }) => {
  const [selectedImageUrl, setSelectedImageUrl] = React.useState<string | null>(null);
  const lifecycle = getOrderLifecycle(order);
  const picker = getPickerInfo(order);
  const driver = getDriverInfo(order);
  const distance = getOrderDistance(order);
  
  // Base calculation helper
  const calculateDuration = (s: string | null, e: string | null) => {
    if (!s || !e) return '—';
    const diff = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000);
    return `${diff} min`;
  };

  // Helper for waiting times based on screenshot logic
  const getWaitingDuration = (type: 'picker' | 'driver') => {
    if (!lifecycle.storingEnd || !lifecycle.goingToOriginEnd) return '—';
    const diff = Math.round((new Date(lifecycle.goingToOriginEnd).getTime() - new Date(lifecycle.storingEnd).getTime()) / 60000);
    
    if (type === 'picker') {
      // Picker Waiting: 0 if negative
      const val = Math.max(0, diff);
      return `${val} min`;
    } else {
      // Driver Waiting: 0 if positive, multiply by -1
      const val = diff > 0 ? 0 : Math.abs(diff);
      return `${val} min`;
    }
  };

  // Helper for age string
  const getAgeString = () => {
    const start = new Date(order.created_at).getTime();
    const now = Date.now();
    const diff = Math.floor((now - start) / 60000);
    if (diff < 5) return '0-5 min';
    if (diff < 10) return '5-10 min';
    if (diff < 15) return '10-15 min';
    return `${diff} min`;
  };

  return (
    <motion.div 
      className="order-detail-overlay-v2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div 
        className="order-detail-modal-v2"
        initial={{ y: 50, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 50, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-v2">
          <div className="header-title">Order Details</div>
          <button className="close-modal-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body-v2">
          {/* Section 1: Basic Info */}
          <div className="info-grid-v2">
            <div className="info-item">
              <div className="info-label">Order Number</div>
              <div className="info-value highlight">{order.job_number}</div>
            </div>
            <div className="info-item">
              <div className="info-label">Store</div>
              <div className="info-value">{order.store_name}</div>
            </div>
            <div className="info-item">
              <div className="info-label">Status</div>
              <div className="info-value">
                <span className="status-pill-v2" style={{ backgroundColor: getStatusColor(order.partial_status) }}>
                  {order.partial_status}
                </span>
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">Source</div>
              <div className="info-value font-bold">{order.source}</div>
            </div>
            <div className="info-item">
              <div className="info-label">Is Big Order</div>
              <div className="info-value">
                <span className={`toggle-pill ${order.is_big_order === 'YES' ? 'yes' : 'no'}`}>
                  {order.is_big_order}
                </span>
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">Distance</div>
              <div className="info-value info-with-icon">
                <MapPin size={14} className="text-blue-400" />
                {distance ? `${distance.toFixed(1)} km` : '—'}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">Age</div>
              <div className="info-value">{getAgeString()}</div>
            </div>
          </div>

          {/* Section 2: Picking Progress */}
          <div className="section-title-v2">PICKING PROGRESS</div>
          <div className="picking-stats-grid">
            <div className="stat-card-v2">
              <div className="stat-label-v2">ITEMS PICKED</div>
              <div className="stat-value-v2">
                <span className="current">{getPickedItems(order)}</span>
                <span className="total"> / {getTotalItems(order)}</span>
              </div>
            </div>
            <div className="stat-card-v2">
              <div className="stat-label-v2">SKUS PICKED</div>
              <div className="stat-value-v2">
                <span className="current">{getPickedSkuCount(order)}</span>
                <span className="total"> / {getSkuCount(order)}</span>
              </div>
            </div>
            <div className="stat-card-v2">
              <div className="stat-label-v2">OOS (REMOVED)</div>
              <div className="stat-value-v2 danger">{getRemovedItemsCount(order)}</div>
            </div>
            <div className="stat-card-v2">
              <div className="stat-label-v2">CANCELLED/REJECTED</div>
              <div className="stat-value-v2 warning">{getCustomerCancelledCount(order)}</div>
            </div>
          </div>

          {/* Section 3: Order Lifecycle (O2D) */}
          <div className="section-title-v2">ORDER LIFECYCLE (O2D)</div>
          <div className="lifecycle-grid-v2">
            <OrderLifecycleBox 
              title="Order Created - Pending" 
              start={lifecycle.orderCreatedAt} 
              end={lifecycle.orderCreatedAt} 
              duration={calculateDuration(lifecycle.orderCreatedAt, new Date().toISOString())} 
              sublabel="current time -Order Creation Time" 
            />
            <OrderLifecycleBox 
              title="Pick Delay -" 
              start={lifecycle.orderCreatedAt} 
              end={lifecycle.pickStart} 
              duration={calculateDuration(lifecycle.orderCreatedAt, lifecycle.pickStart)} 
              sublabel="Pick Actual Start - Order Creation Time" 
            />
            <OrderLifecycleBox 
              title="Pick Time" 
              start={lifecycle.pickStart} 
              end={lifecycle.pickEnd} 
              duration={calculateDuration(lifecycle.pickStart, lifecycle.pickEnd)} 
              sublabel="Pick Actual End - Pick Actual Start" 
              isActive={!!lifecycle.pickStart && !lifecycle.pickEnd}
            />
            <OrderLifecycleBox 
              title="Pick to Store Gap" 
              start={lifecycle.pickEnd} 
              end={lifecycle.storingStart} 
              duration={calculateDuration(lifecycle.pickEnd, lifecycle.storingStart)} 
              sublabel="STORING Actual start - Pick Actual End" 
              isActive={!!lifecycle.pickEnd && !lifecycle.storingStart}
            />
            <OrderLifecycleBox 
              title="Storage" 
              start={lifecycle.storingStart} 
              end={lifecycle.storingEnd} 
              duration={calculateDuration(lifecycle.storingStart, lifecycle.storingEnd)} 
              sublabel="STORING Actual End - STORING Actual Start" 
              isActive={!!lifecycle.storingStart && !lifecycle.storingEnd}
            />
            <OrderLifecycleBox 
              title="Picker Waiting for Driver" 
              start={lifecycle.storingEnd} 
              end={lifecycle.goingToOriginEnd} 
              duration={getWaitingDuration('picker')} 
              sublabel="(goingToOriginEnd - storingEnd), displays 0 if negative, NO multiply by -1" 
            />
            <OrderLifecycleBox 
              title="Driver Waiting for Order" 
              start={lifecycle.storingEnd} 
              end={lifecycle.goingToOriginEnd} 
              duration={getWaitingDuration('driver')} 
              sublabel="(goingToOriginEnd - storingEnd), displays 0 if positive, multiply by -1" 
            />
            <OrderLifecycleBox 
              title="Going to Origin" 
              start={lifecycle.goingToOriginStart} 
              end={lifecycle.goingToOriginEnd} 
              duration={calculateDuration(lifecycle.goingToOriginStart, lifecycle.goingToOriginEnd)} 
              sublabel="Difference of above" 
            />
            <OrderLifecycleBox 
              title="Dispatch" 
              start={lifecycle.storingEnd} 
              end={lifecycle.transferToDeliveryEnd} 
              duration={calculateDuration(lifecycle.storingEnd, lifecycle.transferToDeliveryEnd)} 
              sublabel="(TRANSFERRING_FROM_STORAGE_TO_DELIVERY actual_end - STORING actual_end)" 
            />
            <OrderLifecycleBox 
              title="Going to Destination" 
              start={lifecycle.goingToDestinationStart} 
              end={lifecycle.goingToDestinationEnd} 
              duration={calculateDuration(lifecycle.goingToDestinationStart, lifecycle.goingToDestinationEnd)} 
              sublabel="difference above" 
              isActive={!!lifecycle.goingToDestinationStart && !lifecycle.goingToDestinationEnd}
            />
            <OrderLifecycleBox 
              title="DELIVERING" 
              start={lifecycle.deliveringStart} 
              end={lifecycle.deliveringEnd} 
              duration={calculateDuration(lifecycle.deliveringStart, lifecycle.deliveringEnd)} 
              sublabel="difference above" 
              isActive={!!lifecycle.deliveringStart && !lifecycle.deliveringEnd}
            />
            <OrderLifecycleBox 
              title="Transferring" 
              start={lifecycle.storingEnd} 
              end={lifecycle.transferToDeliveryEnd} 
              duration={calculateDuration(lifecycle.storingEnd, lifecycle.transferToDeliveryEnd)} 
              sublabel="(TRANSFERRING_FROM_STORAGE_TO_DELIVERY actual_end - STORING actual_end)" 
            />
          </div>

          {/* Section 4: Personnel */}
          <div className="personnel-grid-v2">
            <div className="personnel-card">
              <div className="person-label-header">PICKER</div>
              {picker ? (
                <div className="person-details">
                  <div className="person-name">{picker.name}</div>
                  <div className="person-phone">
                    <Phone size={12} /> {picker.phone}
                  </div>
                  <div className="person-metrics mt-4">
                    <div className="metric-row">
                      <span>Est. Pick Time:</span>
                      <span className="val">14 min</span>
                    </div>
                    <div className="metric-row">
                      <span>Actual Pick Time:</span>
                      <span className="val">{calculateDuration(lifecycle.pickStart, lifecycle.pickEnd)}</span>
                    </div>
                    <div className="metric-row">
                      <span>Started:</span>
                      <span className="val">{lifecycle.pickStart ? new Date(lifecycle.pickStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</span>
                    </div>
                    <div className="metric-row">
                      <span>Completed:</span>
                      <span className="val">{lifecycle.pickEnd ? new Date(lifecycle.pickEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-person">Not Assigned</div>
              )}
            </div>

            <div className="personnel-card">
              <div className="person-label-header primary">DRIVER</div>
              {driver ? (
                <div className="person-details">
                  <div className="person-name">{driver.name}</div>
                  <div className="person-status-pill">Delivery</div>
                  <div className="person-metrics mt-4">
                    <div className="metric-row">
                      <span>Driver Reached store:</span>
                      <span className="val font-bold text-white">
                        {lifecycle.goingToOriginEnd ? new Date(lifecycle.goingToOriginEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span>Driver Collected Order:</span>
                      <span className="val font-bold text-white">
                        {lifecycle.transferToDeliveryEnd ? new Date(lifecycle.transferToDeliveryEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span>Driver Reach to Customer:</span>
                      <span className="val font-bold text-white">
                        {lifecycle.goingToDestinationEnd ? new Date(lifecycle.goingToDestinationEnd).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-person">Not Assigned</div>
              )}
            </div>
          </div>

          {/* Section 5: Items */}
          <div className="section-title-v2 flex justify-between items-center">
            <span>ITEMS ({order.items.length})</span>
          </div>
          <div className="items-list-v2">
            <div className="items-header-v2">
              <div className="col-photo">PHOTO</div>
              <div className="col-status">STATUS</div>
              <div className="col-sku">SKU</div>
              <div className="col-name">ITEM NAME</div>
              <div className="col-qty">QUANTITY</div>
            </div>
            {order.items.map((item: any, idx) => {
              // Statuses where picking is definitely NOT finished
              const activePickingStatuses = ['CREATED', 'PICKING', 'PICKING_WITH_PACKING', 'PICKING_WITH_UNASSIGNED_ZONE'];
              const currentStatus = order.partial_status.toUpperCase();
              
              // Picking is complete if status is beyond picking states
              const isPickComplete = !activePickingStatuses.includes(currentStatus);
              
              // Robust image detection
              const photoUrl = item.photo_url || item.image_url || item.ImageUrl || item.image || "";
              const hasImage = !!photoUrl && photoUrl.length > 5;
              
              return (
                <div key={`${item.sku}-${idx}`} className="item-card-row-v2">
                  <div className="col-photo">
                    {!isPickComplete && hasImage ? (
                      <div className="product-img-wrapper" onClick={() => setSelectedImageUrl(photoUrl)}>
                        <SmartImage 
                          src={fixImageUrl(photoUrl)} 
                          alt={item.item_name} 
                          className="product-img"
                        />
                      </div>
                    ) : (
                      <div className="img-placeholder">
                        <ShoppingBag size={14} />
                      </div>
                    )}
                  </div>
                  <div className="col-status">
                    <div className={`item-status-display ${item.item_status.toLowerCase()}`}>
                      {item.item_status === 'ADDED' ? 'Picked' : item.item_status === 'REMOVED' ? 'Removed' : item.item_status}
                    </div>
                  </div>
                  <div className="col-sku">
                    <span className="sku-text">{item.sku}</span>
                  </div>
                  <div className="col-name">
                    <div 
                      className={`item-name-clickable ${isPickComplete ? 'view-mode' : ''}`}
                      onClick={() => isPickComplete && hasImage && setSelectedImageUrl(photoUrl)}
                    >
                      <div className="name-text">{item.item_name}</div>
                      <div className="name-tags">
                        {item.package_name && <span className="tag-package">{item.package_name}</span>}
                        {item.location && <span className="tag-location">{item.location}</span>}
                      </div>
                      {isPickComplete && hasImage && (
                        <div className="view-image-hint">
                          <ExternalLink size={10} /> View Image
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-qty">
                    <div className="qty-pill">
                      {item.found_qty}/{item.quantity}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Image Viewer Modal */}
        <AnimatePresence>
          {selectedImageUrl && (
            <motion.div 
              className="image-preview-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedImageUrl(null)}
            >
              <motion.div 
                className="image-preview-content"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="close-preview" onClick={() => setSelectedImageUrl(null)}>
                  <X size={24} />
                </button>
                <SmartImage 
                  src={fixImageUrl(selectedImageUrl)} 
                  alt="Product preview" 
                  className="full-product-image"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};
