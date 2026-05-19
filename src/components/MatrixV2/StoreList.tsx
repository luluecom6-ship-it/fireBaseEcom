import React from 'react';
import { Store } from '../../typesV2';

interface StoreListProps {
  stores: Store[];
  onStoreSelect: (storeId: string) => void;
}

const StoreList: React.FC<StoreListProps> = ({ stores, onStoreSelect }) => {
  return (
    <div className="store-overview-v2">
      <div className="store-list-header-v2">
        <h3 className="section-header-title">Store Overview</h3>
        <div className="stores-count-badge">
          {stores.length} Stores
        </div>
      </div>

      <div className="store-grid">
        {stores.map(store => {
          return (
            <div
              key={store.id}
              className="store-card-v2"
              onClick={() => onStoreSelect(store.id)}
            >
              <div className="store-card-header">
                <span className="store-id-badge">{store.code}</span>
                {store.region && <span className="region-badge">{store.region}</span>}
                <span className="active-pill">Active</span>
              </div>
              
              <h4 className="store-card-title">{store.code} - {store.name}</h4>

              <div className="store-metrics-grid">
                <div className="metric-col">
                  <span className="metric-label">QUICK</span>
                  <span className="metric-value">{store.quickCommerceCount}</span>
                </div>
                <div className="metric-col">
                  <span className="metric-label">SCHEDULE</span>
                  <span className="metric-value">{store.scheduleCommerceCount}</span>
                </div>
                <div className="metric-col">
                  <span className="metric-label">TOTAL</span>
                  <span className="metric-value highlight">{store.totalVolume}</span>
                </div>
              </div>

              <div className="store-card-footer">
                <div className="footer-progress-bar">
                  <div className="progress-fill-v2"></div>
                </div>
                <span className="view-details-link">View Details →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StoreList;
