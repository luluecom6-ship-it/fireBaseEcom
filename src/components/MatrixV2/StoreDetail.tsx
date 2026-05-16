import React, { useMemo, useState } from 'react';
import { Eye, ArrowLeft, LayoutDashboard, Store, User } from 'lucide-react';
import { Order, STATUS_ORDER, STATUS_LABELS, getTotalItems, getPickedItems, getSkuCount, getPickedSkuCount, getOrderDistance, getPickerInfo, getDriverInfo, getStatusColor, extractStoreCode, getOrderAgeMinutes, getAgeBucket, getOrderLifecycle, getTimeDiffMinutes, formatDuration, getRemovedItemsCount, getCustomerCancelledCount, mapStatus } from '../../typesV2';
import { AdminData } from '../../types';

interface StoreDetailProps {
  storeId: string;
  data: Order[];
  adminData?: AdminData;
  onStaffClick?: (staff: any) => void;
  onOrderClick?: (order: Order) => void;
  onBack?: () => void;
}

const StoreDetail: React.FC<StoreDetailProps> = ({ storeId, data, adminData, onStaffClick, onOrderClick, onBack }) => {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);

  const stats = useMemo(() => {
    const quick = data.filter(o => o.source === 'EXPRESS').length;
    const schedule = data.filter(o => o.source === 'DEFAULT').length;
    return { quick, schedule, total: data.length };
  }, [data]);

  const storeName = data.length > 0 ? data[0].store_name : `${storeId} - Store`;

  const statusDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    STATUS_ORDER.forEach(status => {
      distribution[status] = 0;
    });
    data.forEach(order => {
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
    onOrderClick?.(order);
  };

  const closeImageModal = () => {
    setSelectedImage(null);
  };

  const getStatusLabel = (order: Order): string => {
    const status = order.partial_status.toUpperCase();
    if (STATUS_LABELS[status]) return STATUS_LABELS[status];
    if (status === 'DOING' || status === 'PROCESSING') return 'Picking';
    if (status === 'FINISHED') return 'Delivered';
    return status;
  };

  return (
    <div className="store-operations-scope">
      {/* Header Section */}
      <div className="store-ops-header">
        <div className="header-left">
          <button className="back-btn-v2" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <div className="title-group">
            <h2 className="header-title">Store Operations</h2>
            <p className="store-subtitle">{storeName}</p>
          </div>
        </div>
        <div className="header-actions-v2">
          <div className="header-tabs">
            <button className="header-tab" onClick={onBack}>
              <LayoutDashboard size={16} />
              <span>Management</span>
            </button>
            <button className="header-tab active-green">
              <Store size={16} />
              <span>Store Level</span>
            </button>
            <button className="header-tab active-purple">
              <div className="tab-icon-bg">
                <User size={16} />
              </div>
              <span>Operations</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="ops-stats-grid">
        <div className="ops-stat-card">
          <div className="stat-label">Quick Commerce</div>
          <div className="stat-value green">{stats.quick}</div>
        </div>
        <div className="ops-stat-card">
          <div className="stat-label">Schedule Commerce</div>
          <div className="stat-value blue">{stats.schedule}</div>
        </div>
        <div className="ops-stat-card">
          <div className="stat-label">Total Orders</div>
          <div className="stat-value purple">{stats.total}</div>
        </div>
      </div>

      <div className="ops-main-grid">
        {/* Left: Status Distribution */}
        <div className="ops-distribution-card">
          <h3 className="section-title">Order Status Distribution</h3>
          <p className="section-hint">Click a status to filter orders below</p>
          <div className="status-rows-container">
            {STATUS_ORDER.map(status => {
              const count = statusDistribution[status];
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              const isSelected = selectedStatus === status;
              return (
                <div
                  key={status}
                  className={`status-row-v2 clickable ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleStatusClick(status)}
                >
                  <div className="status-info-left">
                    <span className="dot" style={{ backgroundColor: getStatusColor(status) }}></span>
                    <span className="label">{STATUS_LABELS[status]}</span>
                  </div>
                  <div className="status-progress-track">
                    <div
                      className="status-progress-fill"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: getStatusColor(status)
                      }}
                    ></div>
                  </div>
                  <div className="status-value-right">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Recent Orders */}
        <div className="ops-recent-orders-card">
          <h3 className="section-title">Recent Orders</h3>
          <div className="recent-orders-list">
            {recentOrders.length === 0 ? (
              <div className="empty-state">No orders found</div>
            ) : (
              recentOrders.map(order => (
                <div
                  key={order.job_number}
                  className="ops-order-item clickable"
                  onClick={() => handleOrderClick(order)}
                >
                  <div className="order-item-left">
                    <div className="order-job-num">{order.job_number}</div>
                    <div className="order-store-code">{extractStoreCode(order.store_name)}</div>
                  </div>
                  <div className="order-item-right">
                    <span className={`source-tag ${String(order.source).toUpperCase() === 'EXPRESS' ? 'express' : 'schedule'}`}>
                      {String(order.source).toUpperCase() === 'EXPRESS' ? 'EXPRESS' : 'SCHEDULE'}
                    </span>
                    <span 
                      className="status-text" 
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

      {selectedImage && (
        <div className="image-modal-overlay" onClick={closeImageModal}>
          <div className="image-modal-content" onClick={e => e.stopPropagation()}>
            <img src={selectedImage.url} alt={selectedImage.name} />
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreDetail;
