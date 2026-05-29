import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Activity, Calendar, XCircle, Clock, 
  Eye, X, AlertCircle, TrendingUp, RefreshCw 
} from 'lucide-react';
import './MatrixV2.css';
import { Store, extractStoreCode, Order } from '../typesV2';
import { User, AdminData } from '../types';
import { useApiDataV2 } from '../hooks/useApiDataV2';
import DashboardHeader from '../components/MatrixV2/DashboardHeader';
import SummaryCards from '../components/MatrixV2/SummaryCards';
import DeliverySlotView from '../components/MatrixV2/DeliverySlotView';
import StoreDistributionView from '../components/MatrixV2/StoreDistributionView';
import HourlyAgeingMatrix from '../components/MatrixV2/HourlyAgeingMatrix';
import QuickCommerceStoreView from '../components/MatrixV2/QuickCommerceStoreView';
import StoreList from '../components/MatrixV2/StoreList';
import StoreDetail from '../components/MatrixV2/StoreDetail';
import { OrderDetailsModal } from '../components/MatrixV2/OrderDetailsModal';
import { SmartImage } from '../components/layout/common/SmartImage';
import { fixImageUrl } from '../utils/formatters';
import { parseServerDate } from '../utils/api';

import { useAlertTrigger } from '../hooks/useAlertTrigger';
import { mapOrdersToMatrixData } from '../utils/v2Mapping';

type ViewType = 'management' | 'store';
type ManagementTabType = 'matrix' | 'delivery' | 'stores';

interface MatrixV2Props {
  user: User | null;
  adminData: AdminData;
  staffStatus: any[];
  navigateTo: (page: any) => void;
  escalationRules: any[];
  alertLogs: any[];
  logAlertAction: (action: any, mode: 'trigger') => Promise<void>;
  scheduledThreshold: number;
  scheduledConfig?: {
    pastSlot?: { isActive: boolean, regions: string[] };
    runningSlot?: { isActive: boolean, regions: string[] };
  };
}

const ROSTER_ROLES = new Set(['picker', 'supervisor', 'driver', 'store', 'manager']);
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function normalizeDay(day: string): string {
  const d = day.trim().toLowerCase();
  if (d.startsWith('sun')) return 'sunday';
  if (d.startsWith('mon')) return 'monday';
  if (d.startsWith('tue')) return 'tuesday';
  if (d.startsWith('wed')) return 'wednesday';
  if (d.startsWith('thu')) return 'thursday';
  if (d.startsWith('fri')) return 'friday';
  if (d.startsWith('sat')) return 'saturday';
  return d;
}

function toYMD(ts: any): string {
  try {
    return parseServerDate(ts).toLocaleDateString('en-CA');
  } catch { return ''; }
}

const MatrixV2: React.FC<MatrixV2Props> = ({ 
  user, 
  adminData, 
  staffStatus, 
  navigateTo,
  escalationRules,
  alertLogs,
  logAlertAction,
  scheduledThreshold,
  scheduledConfig
}) => {
  const [view, setView] = useState<ViewType>('management');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [managementTab, setManagementTab] = useState<ManagementTabType>('matrix');
  const [filterRegion, setFilterRegion] = useState<string>('All Regions');
  const [filterStore, setFilterStore] = useState<string>('All Stores');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Fetch data from GAS API with fallback
  const { data: apiData, loading, error, lastUpdated, refresh, dataSource } = useApiDataV2();

  // Region and Store Mapping Intelligence
  const storeToRegion = useMemo(() => {
    const map: Record<string, string> = {};
    if (adminData.regions) {
      adminData.regions.forEach((r: any) => {
        const sid = String(r.storeId || r.storeid || "").trim();
        const reg = String(r.region || "").trim();
        if (sid) map[sid] = reg;
      });
    }
    return map;
  }, [adminData.regions]);

  // Alert Trigger Intelligence
  const matrixDataForAlerts = useMemo(() => {
    if (!apiData || apiData.length === 0) return null;
    return mapOrdersToMatrixData(apiData);
  }, [apiData]);

  useAlertTrigger(
    user,
    matrixDataForAlerts,
    escalationRules || [],
    alertLogs || [],
    logAlertAction,
    scheduledThreshold || 30,
    storeToRegion,
    scheduledConfig
  );

  // RBAC: Set initial filters based on user role
  useEffect(() => {
    if (!user) return;
    
    const role = String(user.role || "").toLowerCase().trim();

    if (role === 'supervisor') {
      if (user.region) {
        setFilterRegion(user.region);
      }
    } else if (['picker', 'store', 'manager'].includes(role)) {
      if (user.storeId) {
        const storeId = String(user.storeId).trim();
        setFilterStore(storeId);
        // We'll also try to set the region if we can find it
        const region = storeToRegion[storeId];
        if (region) {
          setFilterRegion(region);
        }
      }
    }
  }, [user, storeToRegion]);

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  const todayDayName = DAYS_OF_WEEK[today.getDay()];

  // Show data source indicator
  const showDataSourceBadge = dataSource === 'fallback';

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    
    // If user is supervisor, they only see their region
    if (user?.role === 'supervisor' && user.region) {
      return [user.region];
    }
    
    // If user is picker/store/manager, they only see their store's region
    if ((user?.role === 'picker' || user?.role === 'store' || user?.role === 'manager') && user.storeId) {
      const region = storeToRegion[user.storeId];
      return region ? [region] : [];
    }

    if (adminData.regions && Array.isArray(adminData.regions)) {
      adminData.regions.forEach(r => {
        if (r && r.region) regions.add(String(r.region).trim());
      });
    }
    if (adminData.users && Array.isArray(adminData.users)) {
      adminData.users.forEach(u => {
        if (u && u.region) regions.add(String(u.region).trim());
      });
    }
    return Array.from(regions).filter(Boolean).sort();
  }, [adminData.regions, adminData.users]);

  const filteredData = useMemo(() => {
    let data = apiData;

    // RBAC: Hard data constraints
    if ((user?.role === 'picker' || user?.role === 'store' || user?.role === 'manager') && user.storeId) {
      data = data.filter(order => extractStoreCode(order.store_name) === user.storeId);
    } else if (user?.role === 'supervisor' && user.region) {
      data = data.filter(order => {
        const storeCode = extractStoreCode(order.store_name);
        return storeToRegion[storeCode] === user.region;
      });
    }

    // Secondary UI filters
    if (filterRegion !== 'All Regions') {
      data = data.filter(order => {
        const storeCode = extractStoreCode(order.store_name);
        const region = storeToRegion[storeCode];
        return region === filterRegion;
      });
    }
    if (filterStore !== 'All Stores') {
      data = data.filter(order => extractStoreCode(order.store_name) === filterStore);
    }
    return data;
  }, [apiData, filterRegion, filterStore, storeToRegion, user]);

  const stores = useMemo(() => {
    const storeMap = new Map<string, Store>();
    
    // Initialize stores from API data
    apiData.forEach(order => {
      const storeCode = extractStoreCode(order.store_name);
      if (!storeMap.has(storeCode)) {
        storeMap.set(storeCode, {
          id: storeCode,
          name: order.store_name,
          code: storeCode,
          timezone: 'UTC',
          region: storeToRegion[storeCode],
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

    const list = Array.from(storeMap.values()).filter(s => s.id !== 'All' && s.id !== '3800');

    // Filter list by user permissions FIRST
    let filteredList = list;
    if ((user?.role === 'picker' || user?.role === 'store' || user?.role === 'manager') && user.storeId) {
      filteredList = list.filter(s => s.id === user.storeId);
    } else if (user?.role === 'supervisor' && user.region) {
      filteredList = list.filter(s => storeToRegion[s.id] === user.region);
    }

    // Then filter list by region selection if it's still broad
    if (filterRegion !== 'All Regions') {
      filteredList = filteredList.filter(s => storeToRegion[s.id] === filterRegion);
    }

    return filteredList.sort((a, b) => a.id.localeCompare(b.id));
  }, [apiData, filterRegion, storeToRegion, user]);

  const handleStoreSelect = (storeId: string) => {
    setSelectedStore(storeId);
    setView('store');
  };

  const handleViewChange = (newView: ViewType) => {
    if (newView === 'store' && !selectedStore) {
      // If user is restricted to a store, auto-select it
      if ((user?.role === 'picker' || user?.role === 'store' || user?.role === 'manager') && user.storeId) {
        setSelectedStore(user.storeId);
      } else if (stores.length > 0) {
        // Otherwise pick first available store
        setSelectedStore(stores[0].id);
      }
    }
    setView(newView);
  };

  const handleBackToManagement = () => {
    setView('management');
    setSelectedStore(null);
  };

  const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const syncTime = lastUpdated ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';

  return (
    <div className="matrix-v2-scope app-container">
      {view === 'management' ? (
        <>
          <DashboardHeader
            title="Matrix Intelligence V2"
            subtitle="Real-time ageing & store-wise distribution"
            view={view}
            onViewChange={handleViewChange}
            syncTime={syncTime}
            currentTime={currentTime}
          />

          <div className="controls-bar">
            <div className="filters">
              <select
                className="filter-select"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                disabled={user?.role !== 'admin' && user?.role !== 'operator'}
              >
                {(user?.role === 'admin' || user?.role === 'operator') && <option>All Regions</option>}
                {availableRegions.map(regionName => (
                  <option key={regionName} value={regionName}>{regionName}</option>
                ))}
              </select>
              <select
                className="filter-select"
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
                disabled={user?.role === 'picker' || user?.role === 'store' || user?.role === 'manager'}
              >
                {(user?.role === 'admin' || user?.role === 'operator' || user?.role === 'supervisor') && <option>All Stores</option>}
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

          {loading && apiData.length === 0 ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">Loading data from API...</p>
            </div>
          ) : error && apiData.length === 0 ? (
            <div className="error-container">
              <div className="error-icon">!</div>
              <h2 className="error-title">Unable to Load Data</h2>
              <p className="error-message">{error}</p>
              <button className="retry-button" onClick={refresh}>
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              <SummaryCards 
                data={filteredData} 
              />

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
                    <HourlyAgeingMatrix data={filteredData} onOrderClick={setSelectedOrder} />
                    <QuickCommerceStoreView 
                      data={filteredData} 
                      stores={stores} 
                      onOrderClick={setSelectedOrder} 
                    />
                  </>
                )}
                {managementTab === 'delivery' && (
                  <>
                    <DeliverySlotView 
                      data={filteredData} 
                      stores={stores} 
                      onOrderClick={setSelectedOrder} 
                    />
                    <StoreDistributionView 
                      data={filteredData} 
                      stores={stores} 
                      onOrderClick={setSelectedOrder} 
                    />
                  </>
                )}
                {managementTab === 'stores' && (
                  <StoreList stores={stores} onStoreSelect={handleStoreSelect} />
                )}
              </div>
            </>
          )}

          <AnimatePresence>
            {selectedOrder && (
              <OrderDetailsModal 
                order={selectedOrder} 
                onClose={() => setSelectedOrder(null)} 
              />
            )}
          </AnimatePresence>
        </>
      ) : (
        <StoreDetail
          storeId={selectedStore!}
          data={apiData.filter(o => extractStoreCode(o.store_name) === selectedStore)}
          adminData={adminData}
          onOrderClick={setSelectedOrder}
          onBack={handleBackToManagement}
        />
      )}
      
      <AnimatePresence>
        {selectedOrder && (
          <OrderDetailsModal 
            order={selectedOrder} 
            onClose={() => setSelectedOrder(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MatrixV2;
