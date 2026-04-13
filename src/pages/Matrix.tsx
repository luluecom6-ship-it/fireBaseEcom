import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, LayoutDashboard, TrendingUp, Clock, X, ChevronDown } from 'lucide-react';
import { MatrixData, User } from '../types';
import { Header } from '../components/layout/Header';
import { MatrixTable, sortSlots } from '../components/Matrix/MatrixTable';
import { AGE_BUCKETS, QUICK_STATUSES, SCHEDULE_STATUSES } from '../constants';
import { cn } from '../lib/utils';
import { parseServerDate } from '../utils/api';

interface MatrixProps {
  matrixData: MatrixData | null;
  isMatrixLoading: boolean;
  onRefetch: () => Promise<void>;
  setMatrixDetail: (detail: any) => void;
  navigateTo: (page: any) => void;
  user: User | null;
}

export const Matrix: React.FC<MatrixProps> = ({
  matrixData,
  isMatrixLoading,
  onRefetch,
  setMatrixDetail,
  navigateTo,
  user
}) => {
  const [storeFilter, setStoreFilter] = React.useState<string>(() => {
    if (user && user.role !== 'admin' && user.role !== 'supervisor') {
      const sid = String(user.storeId || "").trim();
      return sid.toLowerCase() === 'all' ? "" : sid;
    }
    return "";
  });
  
  const allQuick = matrixData?.quick || [];
  const allSchedule = matrixData?.schedule || [];

  const storeIds = React.useMemo(() => {
    const ids = new Set<string>();
    allQuick.forEach(item => {
      if (item.storeID) ids.add(String(item.storeID));
    });
    allSchedule.forEach(item => {
      if (item.storeID) ids.add(String(item.storeID));
    });
    return Array.from(ids).sort();
  }, [allQuick, allSchedule]);
  
  const filteredQuick = React.useMemo(() => {
    if (!storeFilter) return allQuick;
    const filterStr = String(storeFilter).toLowerCase().trim();
    if (filterStr === 'all') return allQuick;
    return allQuick.filter(d => 
      String(d.storeID || "").toLowerCase().includes(filterStr)
    );
  }, [allQuick, storeFilter]);
    
  const filteredSchedule = React.useMemo(() => {
    if (!storeFilter) return allSchedule;
    const filterStr = String(storeFilter).toLowerCase().trim();
    if (filterStr === 'all') return allSchedule;
    return allSchedule.filter(d => 
      String(d.storeID || "").toLowerCase().includes(filterStr)
    );
  }, [allSchedule, storeFilter]);
    
  const totalOrders = filteredQuick.length + filteredSchedule.length;

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:-- --';
    const d = parseServerDate(timeStr);
    return isNaN(d.getTime()) ? timeStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div 
      key="matrix"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="min-h-screen bg-[#f8fafc] pb-10"
    >
      <Header title="Matrix Intelligence" showBack onBack={() => navigateTo("dashboard")} user={user} />
      
      {/* Top Loading Bar */}
      <AnimatePresence>
        {isMatrixLoading && (
          <motion.div 
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-[64px] left-0 right-0 h-1 bg-blue-600 origin-left z-50"
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>

      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-[#0f172a] tracking-tight">Matrix Intelligence</h2>
            <p className="text-slate-500 font-bold text-xs mt-1 flex items-center gap-2">
              Real-time ageing & store-wise distribution 
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-blue-600">{(allQuick.length + allSchedule.length)} Total Orders</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by Store */}
            <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
              <div className="bg-blue-500 p-2 rounded-xl text-white">
                <LayoutDashboard size={16} />
              </div>
              <div className="px-2">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Filter by Store</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-900 whitespace-nowrap">
                    {storeFilter ? storeFilter : "All Stores"}
                  </span>
                  <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                  <div className="relative flex items-center">
                    <input 
                      list="store-ids"
                      value={storeFilter}
                      onChange={(e) => setStoreFilter(e.target.value)}
                      placeholder="Type or select..."
                      className="text-[11px] font-bold text-slate-600 outline-none bg-transparent w-24 pr-6"
                    />
                    {storeFilter ? (
                      <button 
                        onClick={() => setStoreFilter("")}
                        className="absolute right-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    ) : (
                      <ChevronDown size={10} className="absolute right-0 text-slate-400 pointer-events-none" />
                    )}
                  </div>
                  <datalist id="store-ids">
                    {storeIds.map(id => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Sync Time */}
            <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
              <div className="bg-emerald-500 p-2 rounded-xl text-white">
                <RefreshCw size={16} />
              </div>
              <div className="px-2 pr-4">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Sync Time</p>
                <p className="text-[11px] font-black text-slate-900">{formatTime(matrixData?.syncTime)}</p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
              <div className="bg-blue-500 p-2 rounded-xl text-white">
                <Clock size={16} />
              </div>
              <div className="px-2 pr-4">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Last Updated</p>
                <p className="text-[11px] font-black text-slate-900">{formatTime(matrixData?.timestamp)}</p>
              </div>
            </div>

            {/* Refresh Button */}
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={onRefetch}
              disabled={isMatrixLoading}
              className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 disabled:bg-slate-300"
            >
              <RefreshCw size={20} className={cn(isMatrixLoading && "animate-spin")} />
            </motion.button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Commerce</p>
              <p className="text-2xl font-black text-slate-900">{filteredQuick.length}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Schedule Commerce</p>
              <p className="text-2xl font-black text-slate-900">{filteredSchedule.length}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
              <LayoutDashboard size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Volume</p>
              <p className="text-2xl font-black text-slate-900">{totalOrders}</p>
            </div>
          </div>
        </div>

        {!matrixData && !isMatrixLoading ? (
          <div className="bg-white p-12 sm:p-20 rounded-[2rem] sm:rounded-[3rem] shadow-xl border border-slate-100 text-center">
            <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-[1.5rem] sm:rounded-[2rem] bg-slate-50 text-slate-200 flex items-center justify-center mx-auto mb-6">
              <LayoutDashboard size={32} className="sm:hidden" />
              <LayoutDashboard size={48} className="hidden sm:block" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">No Matrix Data Available</h3>
            <p className="text-slate-400 font-bold mt-2 max-w-md mx-auto text-xs sm:text-sm">Run the bookmarklet on the source system to sync live data to this dashboard.</p>
            <div className="flex items-center justify-center mt-8">
              <button 
                onClick={onRefetch}
                className="px-6 py-3 sm:px-8 sm:py-4 bg-blue-600 text-white font-black rounded-xl sm:rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2 text-sm sm:text-base"
              >
                <RefreshCw size={18} className={cn(isMatrixLoading && "animate-spin")} />
                Try Refreshing
              </button>
            </div>
          </div>
        ) : isMatrixLoading && !matrixData ? (
          <div className="flex flex-col items-center justify-center py-20 sm:py-40">
            <div className="h-12 w-12 sm:h-16 sm:w-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] sm:text-xs">Synchronizing Matrix...</p>
          </div>
        ) : (
          <div className="space-y-8 sm:space-y-12">
            {/* Quick Commerce Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="h-8 w-8 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-100">
                  <TrendingUp size={18} />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Quick Commerce</h3>
              </div>
              
              <div className="space-y-6">
                <MatrixTable 
                  title="Hourly Ageing View" 
                  headers={AGE_BUCKETS} 
                  data={filteredQuick} 
                  keyField="bucket" 
                  themeColor="bg-[#e11d48]" 
                  statuses={QUICK_STATUSES}
                  isQuick={true}
                  onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Quick Commerce Ageing', stat, key, orders })}
                />
                
                <MatrixTable 
                  title="Store Distribution View" 
                  headers={([...new Set(filteredQuick.map(d => d.storeID))] as string[]).sort()} 
                  data={filteredQuick} 
                  keyField="storeID" 
                  themeColor="bg-[#f43f5e]" 
                  statuses={QUICK_STATUSES}
                  isQuick={true}
                  onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Quick Commerce Store', stat, key, orders })}
                />
              </div>
            </div>

            {/* Schedule Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                  <Clock size={18} />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Schedule Commerce</h3>
              </div>
              
              <div className="space-y-6">
                <MatrixTable 
                  title="Delivery Slot View" 
                  headers={sortSlots([...new Set(filteredSchedule.map(d => d.slot))] as string[])} 
                  data={filteredSchedule} 
                  keyField="slot" 
                  themeColor="bg-[#059669]" 
                  statuses={SCHEDULE_STATUSES}
                  onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Schedule Commerce Slot', stat, key, orders })}
                />
                
                <MatrixTable 
                  title="Store Distribution View" 
                  headers={([...new Set(filteredSchedule.map(d => d.storeID))] as string[]).sort()} 
                  data={filteredSchedule} 
                  keyField="storeID" 
                  themeColor="bg-[#10b981]" 
                  statuses={SCHEDULE_STATUSES}
                  onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Schedule Commerce Store', stat, key, orders })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
