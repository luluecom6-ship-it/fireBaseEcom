import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RefreshCw, BarChart3, Zap, Clock, AlertTriangle, 
  Activity, PieChart as PieChartIcon 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, PieChart, Pie, Cell 
} from 'recharts';
import { MatrixData, User, AdminData } from '../types';
import { Header } from '../components/layout/Header';
import { cn } from '../lib/utils';
import { Globe, ChevronDown, X, LayoutDashboard } from 'lucide-react';

interface AnalyticsProps {
  matrixData: MatrixData | null;
  adminData: AdminData;
  isMatrixLoading: boolean;
  onRefetch: () => Promise<void>;
  navigateTo: (page: any) => void;
  user: User | null;
}

export const Analytics: React.FC<AnalyticsProps> = ({
  matrixData,
  adminData,
  isMatrixLoading,
  onRefetch,
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

  const [regionFilter, setRegionFilter] = React.useState<string[]>([]);
  const [showRegionDropdown, setShowRegionDropdown] = React.useState(false);

  // Create store-to-region mapping
  const storeToRegion = React.useMemo(() => {
    const mapping: Record<string, string> = {};
    if (adminData.regions) {
      adminData.regions.forEach(r => {
        mapping[String(r.storeId).trim()] = r.region;
      });
    }
    return mapping;
  }, [adminData.regions]);

  const availableRegions = React.useMemo(() => {
    const regions = new Set<string>();
    if (adminData.regions) {
      adminData.regions.forEach(r => regions.add(r.region));
    }
    adminData.users.forEach(u => {
      if (u.region) regions.add(u.region);
    });
    return Array.from(regions).sort();
  }, [adminData.regions, adminData.users]);

  const filteredMatrixData = React.useMemo(() => {
    if (!matrixData) return null;
    
    const filterItems = (items: any[]) => {
      let filtered = items;

      // Apply Store Filter
      if (storeFilter) {
        const filterStr = String(storeFilter).toLowerCase().trim();
        if (filterStr !== 'all') {
          filtered = filtered.filter(item => 
            String(item.storeID || "").toLowerCase().includes(filterStr)
          );
        }
      }

      // Apply Region Filter
      if (regionFilter.length > 0) {
        filtered = filtered.filter(item => {
          const region = storeToRegion[String(item.storeID).trim()];
          return region && regionFilter.includes(region);
        });
      }

      return filtered;
    };

    return {
      ...matrixData,
      quick: filterItems(matrixData.quick || []),
      schedule: filterItems(matrixData.schedule || [])
    };
  }, [matrixData, storeFilter, regionFilter, storeToRegion]);

  const displayData = filteredMatrixData;

  return (
    <motion.div 
      key="analytics"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
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

      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Operational Insights</h2>
            <p className="text-slate-500 font-bold text-xs mt-1">Advanced data visualization & metrics</p>
          </div>
          
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3">
            {/* Filter by Region */}
            <div className="relative">
              <div 
                onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2 cursor-pointer hover:border-blue-300 transition-colors"
              >
                <div className="bg-indigo-500 p-2 rounded-xl text-white">
                  <Globe size={16} />
                </div>
                <div className="px-2 min-w-[100px]">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Filter by Region</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-slate-900 whitespace-nowrap">
                      {regionFilter.length === 0 ? "All Regions" : 
                       regionFilter.length === 1 ? regionFilter[0] : 
                       `${regionFilter.length} Regions`}
                    </span>
                    <ChevronDown size={10} className={cn("text-slate-400 transition-transform", showRegionDropdown && "rotate-180")} />
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {showRegionDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowRegionDropdown(false)} 
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Regions</span>
                        {regionFilter.length > 0 && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setRegionFilter([]); }}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                      <div className="max-h-60 overflow-y-auto p-2">
                        {availableRegions.length === 0 ? (
                          <p className="text-[10px] text-slate-400 text-center py-4 font-bold italic">No regions found</p>
                        ) : (
                          availableRegions.map(region => (
                            <label 
                              key={region}
                              className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
                            >
                              <input 
                                type="checkbox"
                                checked={regionFilter.includes(region)}
                                onChange={() => {
                                  setRegionFilter(prev => 
                                    prev.includes(region) 
                                      ? prev.filter(r => r !== region)
                                      : [...prev, region]
                                  );
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs font-bold text-slate-700">{region}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

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
                      value={storeFilter}
                      onChange={(e) => setStoreFilter(e.target.value)}
                      placeholder="Store ID..."
                      className="text-[11px] font-bold text-slate-600 outline-none bg-transparent w-20 pr-6"
                    />
                    {storeFilter && (
                      <button 
                        onClick={() => setStoreFilter("")}
                        className="absolute right-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={onRefetch}
              disabled={isMatrixLoading}
              className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all disabled:bg-slate-300"
            >
              <RefreshCw size={20} className={cn(isMatrixLoading && "animate-spin")} />
            </motion.button>
          </div>
        </div>

        {!displayData ? (
          <div className="bg-white p-12 sm:p-20 rounded-[2rem] sm:rounded-[3rem] shadow-xl border border-slate-100 text-center">
            <BarChart3 size={48} className="mx-auto text-slate-200 mb-6" />
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">No Analytics Data</h3>
            <p className="text-slate-400 font-bold mt-2 text-xs sm:text-sm">Please sync matrix data first to view insights.</p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {/* Top Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Zap className="text-amber-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Vol</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">{(displayData?.quick || []).length}</p>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Clock className="text-emerald-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Schedule Vol</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">{(displayData?.schedule || []).length}</p>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <AlertTriangle className="text-red-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">High Risk</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">
                  {(displayData?.quick || []).filter(d => d.bucket.includes("45Min+") || d.bucket.includes("60Min+") || d.bucket.includes("45-50") || d.bucket.includes("50-55") || d.bucket.includes("55-60")).length}
                </p>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Activity className="text-blue-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Stores</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">
                  {new Set([...(displayData?.quick || []).map(d => d.storeID), ...(displayData?.schedule || []).map(d => d.storeID)]).size}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              {/* Status Distribution */}
              <div className="bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-xl border border-slate-100">
                <div className="flex items-center justify-between mb-6 sm:mb-8">
                  <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-tight">Status Distribution</h3>
                  <BarChart3 className="text-slate-300" size={20} />
                </div>
                <div className="h-[250px] sm:h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={(() => {
                        const all = [...(displayData?.quick || []), ...(displayData?.schedule || [])];
                        const counts: Record<string, number> = {};
                        all.forEach(item => {
                          const s = item.status || "Unknown";
                          counts[s] = (counts[s] || 0) + 1;
                        });
                        return Object.entries(counts)
                          .map(([name, value]) => ({ name, value }))
                          .sort((a, b) => b.value - a.value);
                      })()}
                      layout="vertical"
                      margin={{ left: 20, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900, fontSize: '10px' }}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Ageing Risk Profile */}
              <div className="bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-xl border border-slate-100">
                <div className="flex items-center justify-between mb-6 sm:mb-8">
                  <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-tight">Quick Ageing Risk</h3>
                  <PieChartIcon className="text-slate-300" size={20} />
                </div>
                <div className="h-[250px] sm:h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          let low = 0, mid = 0, high = 0;
                          (displayData?.quick || []).forEach(item => {
                            const b = item.bucket || "";
                            if (b.includes("60Min+") || b.includes("45-50") || b.includes("50-55") || b.includes("55-60")) high++;
                            else if (b.includes("20-25") || b.includes("25-30") || b.includes("30-35") || b.includes("35-40") || b.includes("40-45")) mid++;
                            else low++;
                          });
                          return [
                            { name: 'Low (0-20m)', value: low, color: '#10b981' },
                            { name: 'Mid (20-45m)', value: mid, color: '#f59e0b' },
                            { name: 'High (45m+)', value: high, color: '#ef4444' }
                          ];
                        })()}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {(() => {
                          let low = 0, mid = 0, high = 0;
                          (displayData?.quick || []).forEach(item => {
                            const b = item.bucket || "";
                            if (b.includes("60Min+") || b.includes("45-50") || b.includes("50-55") || b.includes("55-60")) high++;
                            else if (b.includes("20-25") || b.includes("25-30") || b.includes("30-35") || b.includes("35-40") || b.includes("40-45")) mid++;
                            else low++;
                          });
                          const data = [
                            { name: 'Low (0-20m)', value: low, color: '#10b981' },
                            { name: 'Mid (20-45m)', value: mid, color: '#f59e0b' },
                            { name: 'High (45m+)', value: high, color: '#ef4444' }
                          ];
                          return data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ));
                        })()}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900, fontSize: '10px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 sm:gap-6 mt-4">
                  {[
                    { label: 'Low', color: 'bg-emerald-500' },
                    { label: 'Mid', color: 'bg-amber-500' },
                    { label: 'High', color: 'bg-red-500' }
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-1.5 sm:gap-2">
                      <div className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full", item.color)} />
                      <span className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
