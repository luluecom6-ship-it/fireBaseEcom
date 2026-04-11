import React from 'react';
import { motion } from 'motion/react';
import { 
  RefreshCw, BarChart3, Zap, Clock, AlertTriangle, 
  Activity, PieChart as PieChartIcon 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, PieChart, Pie, Cell 
} from 'recharts';
import { MatrixData, User } from '../types';
import { Header } from '../components/layout/Header';
import { cn } from '../lib/utils';

interface AnalyticsProps {
  matrixData: MatrixData | null;
  isMatrixLoading: boolean;
  onRefetch: () => Promise<void>;
  navigateTo: (page: any) => void;
  user: User | null;
}

export const Analytics: React.FC<AnalyticsProps> = ({
  matrixData,
  isMatrixLoading,
  onRefetch,
  navigateTo,
  user
}) => {
  return (
    <motion.div 
      key="analytics"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <Header title="Operational Analytics" showBack onBack={() => navigateTo("dashboard")} user={user} />
      
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Operational Insights</h2>
            <p className="text-slate-500 font-bold text-xs mt-1">Advanced data visualization & metrics</p>
          </div>
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={onRefetch}
            disabled={isMatrixLoading}
            className="h-12 sm:h-14 px-4 sm:px-6 rounded-xl sm:rounded-2xl bg-blue-600 text-white flex items-center justify-center gap-3 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all disabled:bg-slate-300"
          >
            <RefreshCw size={20} className={cn(isMatrixLoading && "animate-spin")} />
            <span className="font-black uppercase tracking-widest text-[10px] sm:text-xs">Refresh Data</span>
          </motion.button>
        </div>

        {!matrixData ? (
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
                <p className="text-xl sm:text-3xl font-black text-slate-900">{(matrixData?.quick || []).length}</p>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Clock className="text-emerald-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Schedule Vol</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">{(matrixData?.schedule || []).length}</p>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <AlertTriangle className="text-red-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">High Risk</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">
                  {(matrixData?.quick || []).filter(d => d.bucket.includes("45Min+") || d.bucket.includes("60Min+") || d.bucket.includes("45-50") || d.bucket.includes("50-55") || d.bucket.includes("55-60")).length}
                </p>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Activity className="text-blue-500" size={14} />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Stores</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900">
                  {new Set([...(matrixData?.quick || []).map(d => d.storeID), ...(matrixData?.schedule || []).map(d => d.storeID)]).size}
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
                        const all = [...(matrixData?.quick || []), ...(matrixData?.schedule || [])];
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
                          (matrixData?.quick || []).forEach(item => {
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
                          (matrixData?.quick || []).forEach(item => {
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
