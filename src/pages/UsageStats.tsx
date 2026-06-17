import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, HardDrive, Zap, Trash2, ExternalLink, RefreshCw, Archive } from 'lucide-react';
import { cn } from '../lib/utils';
import { User } from '../types';

interface UsageStatsProps {
  user: User | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const UsageStats: React.FC<UsageStatsProps> = ({ user, showToast }) => {
  const [isArchiving, setIsArchiving] = useState(false);

  const handleArchive = async () => {
    if (!window.confirm("Archive logs older than 48 hours to Google Sheets and delete them from Firestore?")) return;
    setIsArchiving(true);
    try {
      const res = await fetch("/api/admin/archive-logs", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        showToast(`Successfully archived ${data.archivedCount} old logs!`, 'success');
      } else {
        showToast(`Failed to archive logs: ${data.error || data.message}`, 'error');
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const limits = [
    { name: 'Document Reads', value: '50,000', unit: '/ day', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-100' },
    { name: 'Document Writes', value: '20,000', unit: '/ day', icon: Database, color: 'text-blue-500', bg: 'bg-blue-100' },
    { name: 'Document Deletes', value: '20,000', unit: '/ day', icon: Trash2, color: 'text-red-500', bg: 'bg-red-100' },
    { name: 'Storage', value: '1', unit: 'GB Total', icon: HardDrive, color: 'text-purple-500', bg: 'bg-purple-100' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <Database className="text-indigo-600" size={32} />
              System Usage & Archival
            </h1>
            <p className="text-sm font-bold text-slate-500 mt-2">
              Monitor Firebase free-tier limits and archive old logs to Google Sheets.
            </p>
          </div>
          <a
            href="https://console.firebase.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-white text-slate-700 font-bold rounded-2xl shadow-sm border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
          >
            Firebase Console <ExternalLink size={16} />
          </a>
        </div>

        {/* Free Tier Quotas Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {limits.map((limit, idx) => {
            const Icon = limit.icon;
            return (
              <motion.div 
                key={limit.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm", limit.bg, limit.color)}>
                    <Icon size={24} />
                  </div>
                </div>
                <div>
                  <h3 className="text-slate-400 font-black text-xs uppercase tracking-widest mb-1">{limit.name}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-800">{limit.value}</span>
                    <span className="text-slate-500 font-bold text-sm">{limit.unit}</span>
                  </div>
                </div>
                <div className="absolute -bottom-6 -right-6 opacity-[0.03] pointer-events-none">
                  <Icon size={120} />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Archival Section */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 md:p-10 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 font-black text-xs uppercase tracking-widest rounded-full">
                <Archive size={14} /> Log Archival System
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                Archive Old Logs (&gt; 48 hours)
              </h2>
              <p className="text-slate-500 font-medium leading-relaxed max-w-2xl">
                Automatically triggered every day via Vercel Cron. You can also manually push logs from <span className="font-bold text-slate-700">oos_history</span> and <span className="font-bold text-slate-700">alerts</span> collections that are older than 48 hours to the <span className="font-bold text-indigo-500">Google Sheet V2 URL</span>. 
                <br/><br/>
                Once synced, they are <strong className="text-red-500">deleted from Firestore</strong> to conserve database read and storage limits.
              </p>
            </div>
            <div className="flex-shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleArchive}
                disabled={isArchiving}
                className={cn(
                  "relative group overflow-hidden px-8 py-5 rounded-3xl font-black text-white shadow-xl transition-all duration-300 flex items-center gap-3",
                  isArchiving 
                    ? "bg-slate-400 cursor-not-allowed" 
                    : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-indigo-500/25"
                )}
              >
                {isArchiving ? (
                  <>
                    <RefreshCw className="animate-spin" size={24} />
                    Archiving...
                  </>
                ) : (
                  <>
                    <Database size={24} className="group-hover:-translate-y-1 transition-transform" />
                    Archive Old Logs Now
                  </>
                )}
              </motion.button>
            </div>
          </div>
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 -mr-20 -mt-20 pointer-events-none"></div>
        </div>

      </div>
    </motion.div>
  );
};
