import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, RefreshCw, Calendar, X, AlertCircle } from 'lucide-react';
import { User, AttendanceRecord } from '../types';
import { Header } from '../components/layout/Header';
import { fixImageUrl } from '../utils/formatters';
import { cn } from '../lib/utils';
import { robustFetch, parseServerDate } from '../utils/api';
import { API_URL } from '../constants';

interface AttendanceHistoryProps {
  user: User;
  navigateTo: (page: any) => void;
  onViewImage: (url: string | null) => void;
}

export const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({
  user,
  navigateTo,
  onViewImage
}) => {
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const urlObj = new URL(API_URL.trim());
      urlObj.searchParams.set('action', 'getAdminData');
      urlObj.searchParams.set('type', 'attendance');
      urlObj.searchParams.set('empId', user.empId); // Some backends might filter by empId if provided
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const response = await res.json();
      let data = response.status === "success" ? response.data : response;
      
      // Handle different response formats
      if (data && !Array.isArray(data)) {
        if (data.attendance) data = data.attendance;
        else if (data.data && Array.isArray(data.data)) data = data.data;
      }
      
      if (Array.isArray(data)) {
        // Filter by empId client-side to be safe
        const userRecords = data.filter(r => 
          String(r.empId || r.EmpId || r.emp_id || "").trim() === String(user.empId).trim()
        );
        setHistory(userRecords);
      }
    } catch (e) {
      console.error("Failed to fetch attendance history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user.empId]);

  // Group records by date
  const groupedHistory = history
    .filter(r => {
      const date = parseServerDate(r.timestamp);
      const monthStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      return monthStr === filterMonth;
    })
    .reduce((acc, record) => {
      const dateObj = parseServerDate(record.timestamp);
      const date = dateObj.toISOString().split('T')[0];
      if (!acc[date]) acc[date] = { in: null, out: null };
      if (record.type === 'In') acc[date].in = record;
      else if (record.type === 'Out') acc[date].out = record;
      return acc;
    }, {} as Record<string, { in: AttendanceRecord | null, out: AttendanceRecord | null }>);

  const sortedDates = Object.keys(groupedHistory).sort((a, b) => b.localeCompare(a));

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <div className="p-4 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
            <Calendar className="text-blue-600" size={18} />
            <input 
              type="month" 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)} 
              className="font-black text-slate-700 outline-none bg-transparent text-sm w-full"
            />
          </div>
          <motion.button 
            whileTap={{ rotate: 180 }}
            onClick={fetchHistory}
            className="h-12 w-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-blue-600"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </motion.button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="py-20 text-center space-y-4">
              <RefreshCw className="animate-spin mx-auto text-blue-400" size={32} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading History...</p>
            </div>
          ) : sortedDates.length > 0 ? (
            sortedDates.map((date) => {
              const { in: inRec, out: outRec } = groupedHistory[date];
              const dateObj = new Date(date);
              const dayOfMonth = dateObj.getDate();
              const monthName = dateObj.toLocaleDateString([], { month: 'short' });
              const weekday = dateObj.toLocaleDateString([], { weekday: 'short' });
              
              let duration = "--";
              if (inRec) {
                const start = parseServerDate(inRec.timestamp).getTime();
                const end = outRec ? parseServerDate(outRec.timestamp).getTime() : null;
                if (end) {
                  const diff = end - start;
                  const hrs = Math.floor(diff / (1000 * 60 * 60));
                  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  duration = `${hrs}h ${mins}m`;
                }
              }

              return (
                <motion.div 
                  key={date}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100">
                      <span className="text-[8px] font-black text-slate-400 uppercase leading-none mb-1">{monthName} {weekday}</span>
                      <span className="text-xl font-black text-slate-800 leading-none">{dayOfMonth}</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Punch Status</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={cn("h-2 w-2 rounded-full", inRec ? "bg-emerald-500" : "bg-slate-200")} />
                        <span className="text-xs font-bold text-slate-700">{inRec ? parseServerDate(inRec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}</span>
                        <span className="text-slate-300 mx-1">→</span>
                        <div className={cn("h-2 w-2 rounded-full", outRec ? "bg-blue-500" : "bg-slate-200")} />
                        <span className="text-xs font-bold text-slate-700">{outRec ? parseServerDate(outRec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                      <p className="text-xs font-black text-blue-600 mt-1">{duration}</p>
                    </div>
                    <div className="flex gap-1">
                      {inRec && (
                        <button 
                          onClick={() => setSelectedRecord(inRec)}
                          className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      {outRec && (
                        <button 
                          onClick={() => setSelectedRecord(outRec)}
                          className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="py-20 text-center space-y-4">
              <Calendar className="mx-auto text-slate-200" size={48} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No records found for this month</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedRecord && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl relative"
            >
              <button onClick={() => setSelectedRecord(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={24} />
              </button>
              
              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight">Punch {selectedRecord.type}</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Verification Details</p>
              </div>

              <div className="space-y-6">
                <div className="relative aspect-square overflow-hidden rounded-3xl border-4 border-slate-50 shadow-lg cursor-zoom-in" onClick={() => onViewImage(fixImageUrl(selectedRecord.imageUrl))}>
                  <img src={fixImageUrl(selectedRecord.imageUrl)} className="w-full h-full object-cover" alt="Verification" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 p-3 text-xs text-white font-black text-center backdrop-blur-sm">
                    {parseServerDate(selectedRecord.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Store ID</span>
                  <span className="font-black text-slate-700">{selectedRecord.storeId}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
