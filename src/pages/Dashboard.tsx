import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  LogOut, Clock, Package, Search, ShieldCheck, 
  History, LayoutDashboard, BarChart3, ArrowRight,
  AlertCircle, Zap, X, Download
} from 'lucide-react';
import { User, AttendanceStatus } from '../types';
import { RealTimeClock } from '../components/common/RealTimeClock';
import { usePWA } from '../hooks/usePWA';
import { parseServerDate } from '../utils/api';
import { cn } from '../lib/utils';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  attendanceStatus: AttendanceStatus;
  hoursWorked: string;
  isShiftComplete: boolean;
  navigateTo: (page: any) => void;
  fetchAdminData: (isManual?: boolean) => Promise<void>;
  fetchMatrixData: () => Promise<void>;
  isMatrixLoading: boolean;
  setShowEarlyPunchOutConfirm: (show: boolean) => void;
  requestNotificationPermission: () => Promise<boolean>;
  testAlert: () => void;
  testBuzzer: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  onLogout,
  attendanceStatus,
  hoursWorked,
  isShiftComplete,
  navigateTo,
  fetchAdminData,
  fetchMatrixData,
  isMatrixLoading,
  setShowEarlyPunchOutConfirm,
  requestNotificationPermission,
  testAlert,
  testBuzzer
}) => {
  const { isInstallable, showInstallPrompt } = usePWA();
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };
    setIsIOS(checkIOS());
  }, []);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    "Notification" in window ? Notification.permission : "default"
  );

  useEffect(() => {
    // Check permission status periodically or on focus
    const checkPermission = () => {
      if ("Notification" in window) {
        setNotifPermission(Notification.permission);
      }
    };
    
    window.addEventListener('focus', checkPermission);
    const interval = setInterval(checkPermission, 2000);
    
    return () => {
      window.removeEventListener('focus', checkPermission);
      clearInterval(interval);
    };
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) setNotifPermission("granted");
    else if (Notification.permission === "denied") {
      setNotifPermission("denied");
    }
  };

  return (
    <motion.div 
      key="dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-20"
    >
      <div className="bg-blue-900 pb-20 pt-6 px-6 text-white rounded-b-[2rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-800 rounded-full -mr-32 -mt-32 opacity-20 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-600 rounded-full -ml-24 -mb-24 opacity-20 blur-3xl"></div>
        
        <div className="flex items-start justify-between mb-6 relative z-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Hello, {user.name.split(' ')[0]} 👋</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-blue-200 font-bold text-xs sm:text-sm flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-blue-800 rounded text-[9px] uppercase tracking-widest">{user.role}</span>
                {user.empId}
              </p>
              <button 
                onClick={onLogout}
                className="text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white flex items-center gap-1 transition-colors"
              >
                <LogOut size={10} /> Logout
              </button>
            </div>
            
            {notifPermission === "default" && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={handleEnableNotifications}
                className="mt-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <AlertCircle size={12} /> Enable System Alerts
              </motion.button>
            )}

            {notifPermission === "granted" && (
              <div className="flex flex-wrap gap-2 mt-3">
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={testAlert}
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all text-emerald-200"
                >
                  <Zap size={12} /> Test Background Alert
                </motion.button>
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={testBuzzer}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all text-amber-200"
                >
                  <Zap size={12} /> Test Audio Buzzer
                </motion.button>
              </div>
            )}

            {notifPermission === "denied" && (
              <div className="mt-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-400">
                <X size={12} /> Alerts Blocked (Check Browser Settings)
              </div>
            )}

            {isInstallable && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={showInstallPrompt}
                className="mt-3 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all text-blue-200 w-full justify-center"
              >
                <Download size={12} /> Install Mobile App
              </motion.button>
            )}

            {isIOS && !isInstallable && (
              <div className="mt-3 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] text-white/50 leading-tight">
                <span className="font-bold text-white/80 block mb-1">iOS INSTALL TIP:</span>
                Tap <span className="text-blue-400">Share</span> then <span className="text-blue-400">"Add to Home Screen"</span> to install as an app.
              </div>
            )}
          </div>
          <RealTimeClock />
        </div>

        {/* Attendance Card */}
        <motion.div 
          layout
          className="bg-white rounded-[1.5rem] p-5 sm:p-8 text-slate-800 shadow-2xl border border-blue-100 relative z-10"
        >
          {attendanceStatus.missingPunchOut && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3 text-amber-700">
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest">Previous shift missing punch out - Session Reset</p>
            </div>
          )}

          {!attendanceStatus.inTime ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Clock size={24} />
              </div>
              <p className="text-slate-500 mb-4 font-bold text-sm">You haven't started your shift today</p>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => navigateTo("attendance")} 
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 p-4 font-black text-white shadow-xl shadow-emerald-200 text-base"
              >
                <Clock size={20} /> Punch In Now
              </motion.button>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 font-black mb-0.5">Shift Duration</p>
                  <h3 className={cn(
                    "text-4xl sm:text-5xl font-black tracking-tighter tabular-nums transition-colors duration-500",
                    isShiftComplete ? "text-emerald-600" : "text-blue-900"
                  )}>
                    {hoursWorked}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mb-0.5">Login Time</p>
                  <p className="font-mono font-black text-slate-700 text-base sm:text-lg">
                    {parseServerDate(attendanceStatus.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1.5 mb-6">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Shift Progress</span>
                  <span className={cn(
                    "transition-colors duration-500",
                    isShiftComplete ? "text-emerald-600" : "text-blue-500"
                  )}>
                    {isShiftComplete ? "Target Met" : "In Progress"}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${Math.min(((() => {
                        const [h, m] = hoursWorked.split(":").map(Number);
                        return h + m / 60;
                      })() / 10) * 100, 100)}%` 
                    }}
                    className={cn("h-full rounded-full transition-all duration-1000", isShiftComplete ? "bg-emerald-500" : "bg-blue-600")}
                  ></motion.div>
                </div>
              </div>

              {attendanceStatus.outTime ? (
                <div className="space-y-3">
                  <div className="bg-slate-50 p-3 rounded-xl border-2 border-dashed border-slate-200 text-center text-slate-500 font-black uppercase tracking-widest text-xs">
                    Shift Ended at {parseServerDate(attendanceStatus.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigateTo("attendance")} 
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 p-4 font-black text-white shadow-xl shadow-emerald-200 text-base"
                  >
                    <Clock size={20} /> Punch In Again
                  </motion.button>
                </div>
              ) : (
              <div className="space-y-2">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (!isShiftComplete) {
                        setShowEarlyPunchOutConfirm(true);
                      } else {
                        navigateTo("attendance");
                      }
                    }}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl p-4 font-black text-white transition-all shadow-2xl text-base",
                      isShiftComplete ? "bg-blue-600 shadow-blue-200" : "bg-amber-500 shadow-amber-200"
                    )}
                  >
                    <LogOut size={20} /> Punch Out
                  </motion.button>
                  {!isShiftComplete && (
                    <p className="text-[10px] text-amber-600 font-bold text-center uppercase tracking-widest animate-pulse">
                      ⚠️ Supervisor Notification Required for Early Departure
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Action Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 px-6 -mt-8 relative z-20">
        <motion.div 
          whileHover={{ y: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigateTo("upload")}
          className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
        >
          <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
            <Package size={20} className="sm:hidden" />
            <Package size={36} className="hidden sm:block" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Upload Order</h4>
            <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Scan Barcode</p>
          </div>
          <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
            <ArrowRight size={20} />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { navigateTo("search"); }}
          className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
        >
          <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
            <Search size={20} className="sm:hidden" />
            <Search size={36} className="hidden sm:block" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Search Orders</h4>
            <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Find Evidence</p>
          </div>
          <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all">
            <ArrowRight size={20} />
          </div>
        </motion.div>

        {user.role !== "admin" && user.role !== "supervisor" && (
          <motion.div 
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigateTo("attendance-history")}
            className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
          >
            <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
              <History size={20} className="sm:hidden" />
              <History size={36} className="hidden sm:block" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Attendance</h4>
              <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">My History</p>
            </div>
            <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
              <ArrowRight size={20} />
            </div>
          </motion.div>
        )}

        {(user.role === "admin" || user.role === "supervisor") && (
          <motion.div 
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={async () => { await fetchAdminData(true); navigateTo("admin"); }}
            className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
          >
            <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
              <ShieldCheck size={20} className="sm:hidden" />
              <ShieldCheck size={36} className="hidden sm:block" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Admin Control</h4>
              <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Staff Metrics</p>
            </div>
            <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-purple-50 group-hover:text-purple-600 transition-all">
              <ArrowRight size={20} />
            </div>
          </motion.div>
        )}

        {user.role !== "driver" && (
          <>
            <motion.div 
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigateTo("alerts")}
              className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
            >
              <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all duration-300">
                <History size={20} className="sm:hidden" />
                <History size={36} className="hidden sm:block" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Alert History</h4>
                <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Audit Logs</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-red-50 group-hover:text-red-600 transition-all">
                <ArrowRight size={20} />
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => { await fetchMatrixData(); navigateTo("matrix"); }}
              className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
            >
              <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all duration-300">
                <LayoutDashboard size={20} className="sm:hidden" />
                <LayoutDashboard size={36} className="hidden sm:block" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Matrix View</h4>
                <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Live Ageing</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-amber-50 group-hover:text-amber-600 transition-all">
                <ArrowRight size={20} />
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => { await fetchMatrixData(); navigateTo("analytics"); }}
              className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
            >
              <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                <BarChart3 size={20} className="sm:hidden" />
                <BarChart3 size={36} className="hidden sm:block" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Analytics</h4>
                <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Trends</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                <ArrowRight size={20} />
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Logout Bottom */}
      <div className="px-8 mt-12">
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-3 text-slate-400 font-black py-6 hover:text-red-500 transition-colors uppercase tracking-widest text-xs"
        >
          <LogOut size={20} /> Terminate Session
        </motion.button>
      </div>
    </motion.div>
  );
};
