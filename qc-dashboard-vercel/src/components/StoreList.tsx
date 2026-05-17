import React from 'react';
import { Store } from '../types';

interface StoreListProps {
  stores: Store[];
  onStoreSelect: (storeId: string) => void;
}

const StoreList: React.FC<StoreListProps> = ({ stores, onStoreSelect }) => {
  return (
    <div className="store-list-container">
      <div className="store-list-header">
        <h3>Store Overview</h3>
        <span className="store-count">{stores.length} Stores</span>
      </div>

      <div className="store-grid">
        {stores.map(store => {
          // Safely calculate percentages
          const quickPercent = store.totalVolume > 0
            ? (store.quickCommerceCount / store.totalVolume) * 100
            : 0;
          const schedulePercent = store.totalVolume > 0
            ? (store.scheduleCommerceCount / store.totalVolume) * 100
            : 0;

          return (
            <div
              key={store.id}
              className="store-card"
              onClick={() => onStoreSelect(store.id)}
            >
              <div className="store-card-header">
                <span className="store-id-badge">{store.code}</span>
                <span className="store-status active">Active</span>
              </div>
              <h4 className="store-card-name" title={store.name}>{store.name}</h4>

              <div className="store-stats">
                <div className="stat-item">
                  <span className="stat-label">Quick</span>
                  <span className="stat-value green">{store.quickCommerceCount}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Schedule</span>
                  <span className="stat-value blue">{store.scheduleCommerceCount}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total</span>
                  <span className="stat-value purple">{store.totalVolume}</span>
                </div>
              </div>

              <div className="store-card-footer">
                <div className="progress-bar">
                  <div
                    className="progress-fill green"
                    style={{ width: `${quickPercent}%` }}
                  ></div>
                  <div
                    className="progress-fill blue"
                    style={{ width: `${schedulePercent}%` }}
                  ></div>
                </div>
                <span className="view-detail">View Details →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StoreList;