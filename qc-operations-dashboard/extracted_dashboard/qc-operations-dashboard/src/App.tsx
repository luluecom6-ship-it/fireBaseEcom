import React, { useState, useMemo } from 'react';
import './App.css';
import { Order, Store, extractStoreCode, mapStatus } from './types';
import { useApiData } from './hooks/useApiData';
import DashboardHeader from './components/DashboardHeader';
import SummaryCards from './components/SummaryCards';
import OrderMatrix from './components/OrderMatrix';
import DeliverySlotView from './components/DeliverySlotView';
import StoreDistributionView from './components/StoreDistributionView';
import HourlyAgeingMatrix from './components/HourlyAgeingMatrix';
import QuickCommerceStoreView from './components/QuickCommerceStoreView';
import StoreList from './components/StoreList';
import StoreDetail from './components/StoreDetail';

type ViewType = 'management' | 'store';
type ManagementTabType = 'matrix' | 'delivery' | 'stores';

function App() {
  const [view, setView] = useState<ViewType>('management');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [managementTab, setManagementTab] = useState<ManagementTabType>('matrix');
  const [filterRegion, setFilterRegion] = useState<string>('All Regions');
  const [filterStore, setFilterStore] = useState<string>('All Stores');

  // Fetch data from GAS API with fallback
  const { data: apiData, loading, error, lastUpdated, refresh, dataSource } = useApiData();

  // Show data source indicator
  const showDataSourceBadge = dataSource === 'fallback';

  const filteredData = useMemo(() => {
    let data = apiData;
    if (filterRegion !== 'All Regions') {
      data = data.filter(order => order.store_name?.includes(filterRegion));
    }
    if (filterStore !== 'All Stores') {
      data = data.filter(order => extractStoreCode(order.store_name) === filterStore);
    }
    return data;
  }, [apiData, filterRegion, filterStore]);

  const stores = useMemo(() => {
    const storeMap = new Map<string, Store>();
    apiData.forEach(order => {
      const storeCode = extractStoreCode(order.store_name);
      if (!storeMap.has(storeCode)) {
        storeMap.set(storeCode, {
          id: storeCode,
          name: order.store_name,
          code: storeCode,
          timezone: 'UTC', // Default timezone
          quickCommerceCount: 0,
          scheduleCommerceCount: 0,
          totalVolume: 0
        });
      }
      const store = storeMap.get(storeCode);
      if (store) {
        if (order.source === 'EXPRESS') {
          store.quickCommerceCount++;
        } else {
          store.scheduleCommerceCount++;
        }
        store.totalVolume++;
      }
    });
    return Array.from(storeMap.values());
  }, [apiData]);

  const handleStoreSelect = (storeId: string) => {
    setSelectedStore(storeId);
    setView('store');
  };

  const handleBackToManagement = () => {
    setView('management');
    setSelectedStore(null);
  };

  const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const syncTime = lastUpdated ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';

  // Loading state
  if (loading && apiData.length === 0) {
    return (
      <div className="app-container">
        <DashboardHeader
          title="Matrix Intelligence"
          subtitle="Real-time ageing & store-wise distribution"
          view={view}
          onViewChange={setView}
          syncTime="--:--"
          currentTime={currentTime}
        />
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading data from API...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && apiData.length === 0) {
    return (
      <div className="app-container">
        <DashboardHeader
          title="Matrix Intelligence"
          subtitle="Real-time ageing & store-wise distribution"
          view={view}
          onViewChange={setView}
          syncTime="--:--"
          currentTime={currentTime}
        />
        <div className="error-container">
          <div className="error-icon">!</div>
          <h2 className="error-title">Unable to Load Data</h2>
          <p className="error-message">{error}</p>
          <button className="retry-button" onClick={refresh}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {view === 'management' ? (
        <>
          <DashboardHeader
            title="Matrix Intelligence"
            subtitle="Real-time ageing & store-wise distribution"
            view={view}
            onViewChange={setView}
            syncTime={syncTime}
            currentTime={currentTime}
          />

          <div className="controls-bar">
            <div className="filters">
              <select
                className="filter-select"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
              >
                <option>All Regions</option>
                <option>Riyadh</option>
                <option>Jeddah</option>
                <option>Dammam</option>
              </select>
              <select
                className="filter-select"
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
              >
                <option>All Stores</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
            <div className="time-info">
              {showDataSourceBadge && (
                <span className="data-source-badge fallback">Demo Data</span>
              )}
              <span className="sync-time">Sync: {syncTime}</span>
              <span className="last-updated">Updated: {currentTime}</span>
              <button className="refresh-button" onClick={refresh} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <SummaryCards data={filteredData} />

          <div className="tab-navigation">
            <button
              className={`tab-btn ${managementTab === 'matrix' ? 'active' : ''}`}
              onClick={() => setManagementTab('matrix')}
            >
              Quick Commerce Hourly Ageing
            </button>
            <button
              className={`tab-btn ${managementTab === 'delivery' ? 'active' : ''}`}
              onClick={() => setManagementTab('delivery')}
            >
              Schedule Commerce
            </button>
            <button
              className={`tab-btn ${managementTab === 'stores' ? 'active' : ''}`}
              onClick={() => setManagementTab('stores')}
            >
              Store Overview
            </button>
          </div>

          <div className="dashboard-content">
            {managementTab === 'matrix' && (
              <>
                <HourlyAgeingMatrix data={filteredData} />
                <QuickCommerceStoreView data={filteredData} stores={stores} />
              </>
            )}
            {managementTab === 'delivery' && (
              <>
                <DeliverySlotView data={filteredData} stores={stores} />
                <StoreDistributionView data={filteredData} stores={stores} />
              </>
            )}
            {managementTab === 'stores' && (
              <StoreList stores={stores} onStoreSelect={handleStoreSelect} />
            )}
          </div>
        </>
      ) : (
        <>
          <DashboardHeader
            title="Store Operations"
            subtitle={stores.find(s => s.id === selectedStore)?.name || 'Store Detail'}
            view={view}
            onViewChange={handleBackToManagement}
            syncTime={syncTime}
            currentTime={currentTime}
            showBackButton={true}
            onBack={handleBackToManagement}
          />
          <StoreDetail
            storeId={selectedStore!}
            data={apiData.filter(o => extractStoreCode(o.store_name) === selectedStore)}
          />
        </>
      )}
    </div>
  );
}

export default App;