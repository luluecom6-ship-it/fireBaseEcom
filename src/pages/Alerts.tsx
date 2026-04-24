import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, RefreshCw } from 'lucide-react';
import { AlertLog, User } from '../types';
import { Header } from '../components/layout/Header';
import { getBucketFromAgeing } from '../utils/formatters';
import { cn } from '../lib/utils';

interface AlertsProps {
  alertLogs: AlertLog[];
  onViewImage: (url: string | null) => void;
  navigateTo: (page: any) => void;
  user: User | null;
}

export const Alerts: React.FC<AlertsProps> = ({
  alertLogs,
  onViewImage,
  navigateTo,
  user
}) => {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // If useAlerts provides a way to refetch history, call it
      if ((window as any).refreshAlertHistory) {
        await (window as any).refreshAlertHistory();
      }
      // Real-time sync handles Firestore, but we wait a bit for UI feedback
      await new Promise(resolve => setTimeout(resolve, 800));
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredLogs = alertLogs.filter(log => {
    if (!log.timestamp) return false;
    const tsStr = String(log.timestamp);
    let matchesDate = tsStr.includes(filterDate);
    
    if (!matchesDate) {
      try {
        const d = new Date(log.timestamp);
        if (!isNaN(d.getTime())) {
          matchesDate = d.toISOString().split('T')[0] === filterDate;
        }
      } catch (e) {}
    }
    
    if (!matchesDate) return false;

    // Role-based store restriction
    const role = String(user?.role || "").toLowerCase().trim();
    if (user && role !== 'admin' && role !== 'supervisor') {
      const userStoreId = String(user.storeId || "").toLowerCase().trim();
      if (userStoreId !== 'all') {
        return String(log.storeId || "").toLowerCase().trim() === userStoreId;
      }
    }
    return true;
  });

  return (
    <motion.div 
      key="alerts"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Audit Logs</h2>
            <p className="text-slate-500 font-bold text-xs sm:text-sm mt-1">Operational history for {filterDate}</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
              <Clock className="text-blue-600" size={18} />
              <input 
                type="date" 
                value={filterDate} 
                onChange={(e) => setFilterDate(e.target.value)} 
                className="font-black text-slate-700 outline-none bg-transparent text-sm"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              className="h-11 w-11 sm:h-14 sm:w-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-blue-600"
            >
              <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
            </motion.button>
          </div>
        </div>

        <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Store</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Ageing</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Trigger</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 sm:p-20 text-center text-slate-300 font-bold">No alert logs found</td>
                  </tr>
                ) : (
                  [...filteredLogs].reverse().map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 sm:p-6 text-[10px] sm:text-xs font-bold text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 sm:p-6 font-black text-slate-800 text-xs sm:text-sm">{log.orderId}</td>
                      <td className="p-4 sm:p-6 text-[10px] sm:text-xs font-bold text-slate-500">{log.storeId}</td>
                      <td className="p-4 sm:p-6 text-[10px] sm:text-xs font-bold text-slate-500">
                        {log.bucket || getBucketFromAgeing(log.orderCreatedAt, log.timestamp)}
                      </td>
                      <td className="p-4 sm:p-6 text-[10px] sm:text-xs font-bold text-slate-500">{log.statusTrigger}</td>
                      <td className="p-4 sm:p-6">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase tracking-widest w-fit",
                            log.status === "Acknowledged" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {log.status}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">{log.storeStaffName || "--"}</span>
                        </div>
                      </td>
                      <td className="p-4 sm:p-6">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase tracking-widest w-fit",
                            log.managerStatus === "Accepted" ? "bg-emerald-50 text-emerald-600" : (log.escalation === "TRUE" ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400")
                          )}>
                            {log.managerStatus || (log.escalation === "TRUE" ? "ESCALATED" : "NORMAL")}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">{log.managerName || "--"}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
