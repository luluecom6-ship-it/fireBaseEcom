import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  LogOut, Clock, Package, Search, ShieldCheck, 
  History, LayoutDashboard, BarChart3, ArrowRight,
  AlertCircle, Zap, X, Download, RefreshCw,
  Volume2, VolumeX, CalendarDays, Users, Activity, PackageX
} from 'lucide-react';
import { User, AttendanceStatus, MatrixData } from '../types';
import { RealTimeClock } from '../components/layout/common/RealTimeClock';
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
  fetchMatrixData: (isManual?: boolean) => Promise<void>;
  isMatrixLoading: boolean;
  matrixData: MatrixData | null;
  setShowEarlyPunchOutConfirm: (show: boolean) => void;
  requestNotificationPermission: () => Promise<boolean>;
  testAlert: () => any;
  testBuzzer: () => void;
  isInstallable: boolean;
  showInstallPrompt: () => Promise<void>;
  soundAlertsEnabled: boolean;
  onToggleSound: () => void;
  onUpdateProfileImage?: (base64Image: string) => Promise<any>;
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
  matrixData,
  setShowEarlyPunchOutConfirm,
  requestNotificationPermission,
  testAlert,
  testBuzzer,
  isInstallable,
  showInstallPrompt,
  soundAlertsEnabled,
  onToggleSound,
  onUpdateProfileImage
}) => {
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
  const [isInIframe, setIsInIframe] = useState(false);
  const [showNotifHelp, setShowNotifHelp] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    
    const checkPermission = () => {
      if ("Notification" in window) {
        setNotifPermission(Notification.permission);
      }
    };
    
    window.addEventListener('focus', checkPermission);
    
    // Use Permissions API if available for modern event-based tracking
    let interval: any;
    if (navigator.permissions && (navigator as any).permissions.query) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then(status => {
        status.onchange = checkPermission;
      }).catch(() => {
        // Fallback for Safari/Legacy browsers (every 10s is plenty)
        interval = setInterval(checkPermission, 10000);
      });
    } else {
      interval = setInterval(checkPermission, 10000);
    }
    
    return () => {
      window.removeEventListener('focus', checkPermission);
      if (interval) clearInterval(interval);
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
        
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight truncate">
              Hello, {String(user?.name || "User").split(' ')[0]} 👋
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-blue-800 rounded text-[8px] font-black uppercase tracking-widest text-blue-200 shrink-0">
                  {user.role}
                </span>
                <span className="text-[9px] font-bold text-blue-200/40 shrink-0">{user.empId}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={onLogout}
                  className="text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <LogOut size={9} /> Logout
                </button>
                
                <div className="flex items-center gap-1.5 text-[9px] font-black text-blue-200/40 uppercase tracking-widest">
                  <RefreshCw size={9} className={cn(isMatrixLoading && "animate-spin")} />
                  {matrixData?.timestamp && !isNaN(new Date(matrixData.timestamp).getTime()) ? new Date(matrixData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---'}
                </div>

                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={onToggleSound}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all duration-300",
                    soundAlertsEnabled 
                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                      : "bg-white/5 border-white/10 text-white/40"
                  )}
                >
                  {soundAlertsEnabled ? <Volume2 size={10} className="animate-pulse" /> : <VolumeX size={10} />}
                  <span className="text-[8px] font-black tracking-tighter">{soundAlertsEnabled ? "BUZZER ON" : "BUZZER OFF"}</span>
                </motion.button>
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <RealTimeClock />
          </div>
        </div>

        {/* System Alert Status Buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-2 relative z-10">
          {notifPermission === "default" && (
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleEnableNotifications}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-all"
            >
              <AlertCircle size={10} /> Enable Alerts
            </motion.button>
          )}

          {notifPermission === "granted" && (
            <>
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={testAlert}
                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-all text-emerald-200"
              >
                <Zap size={10} /> Test Notif
              </motion.button>
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={testBuzzer}
                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-all text-amber-200"
              >
                <Zap size={10} /> Test Buzzer
              </motion.button>
            </>
          )}

          {notifPermission === "denied" && (
            <button 
              onClick={() => setShowNotifHelp(true)}
              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-red-400 transition-all cursor-pointer shadow-sm"
            >
              <X size={10} /> Alerts Blocked (Fix)
            </button>
          )}

          {isInIframe && notifPermission !== "granted" && (
             <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-amber-600 transition-colors"
            >
              Open in New Tab <ArrowRight size={10} />
            </a>
          )}

          {isInstallable && (
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={showInstallPrompt}
              className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest transition-all text-blue-200"
            >
              <Download size={10} /> Install App
            </motion.button>
          )}
        </div>
      </div>

        {/* Attendance Card */}
        <motion.div 
          layout
          className="mx-6 -mt-12 bg-white rounded-2xl p-4 sm:p-6 text-slate-800 shadow-2xl border border-blue-100 relative z-30"
        >
          {attendanceStatus.missingPunchOut && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3 text-amber-700">
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest">Previous shift missing punch out - Session Reset</p>
            </div>
          )}

          {!attendanceStatus.inTime ? (
            <div className="text-center py-1">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Clock size={20} />
              </div>
              <p className="text-slate-500 mb-3 font-bold text-xs">You haven't started your shift today</p>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => navigateTo("attendance")} 
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 p-3 font-black text-white shadow-lg shadow-emerald-200 text-sm"
              >
                <Clock size={18} /> Punch In Now
              </motion.button>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.2em] text-slate-400 font-black mb-0.5">Shift Duration</p>
                  <h3 className={cn(
                    "text-3xl sm:text-4xl font-black tracking-tighter tabular-nums transition-colors duration-500",
                    isShiftComplete ? "text-emerald-600" : "text-blue-900"
                  )}>
                    {hoursWorked}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.2em] mb-0.5">Login Time</p>
                  <p className="font-mono font-black text-slate-700 text-sm sm:text-base">
                    {parseServerDate(attendanceStatus.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1 mb-4">
                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Shift Progress</span>
                  <span className={cn(
                    "transition-colors duration-500",
                    isShiftComplete ? "text-emerald-600" : "text-blue-500"
                  )}>
                    {isShiftComplete ? "Target Met" : "In Progress"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${Math.min(((() => {
                        const hWorked = hoursWorked || "00:00";
                        const [h, m] = hWorked.split(":").map(Number);
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

      {/* Action Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 px-6 mt-4 relative z-20">
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

        {String(user.role || "").toLowerCase().trim() !== "admin" && String(user.role || "").toLowerCase().trim() !== "supervisor" && (
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

        {(String(user.role || "").toLowerCase().trim() === "admin" || String(user.role || "").toLowerCase().trim() === "supervisor") && (
          <motion.div 
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { fetchAdminData(true); navigateTo("admin"); }}
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

        {(["admin", "supervisor", "manager"].includes(String(user.role || "").toLowerCase().trim())) && (
          <motion.div 
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigateTo("attendance-v2")}
            className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-indigo-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group relative overflow-hidden"
          >
            {/* Live pulse dot */}
            <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
            <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
              <Activity size={20} className="sm:hidden" />
              <Activity size={36} className="hidden sm:block" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Workforce Intelligence</h4>
              <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Advanced Grid & Trends</p>
            </div>
            <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
              <ArrowRight size={20} />
            </div>
          </motion.div>
        )}

        {(["admin", "supervisor", "manager"].includes(String(user.role || "").toLowerCase().trim())) && (
          <motion.div 
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigateTo("roster")}
            className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-teal-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group relative overflow-hidden"
          >
            {/* Live pulse dot */}
            <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
            </span>
            <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-all duration-300">
              <CalendarDays size={20} className="sm:hidden" />
              <CalendarDays size={36} className="hidden sm:block" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Roster Planner</h4>
              <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Live Availability</p>
            </div>
            <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-teal-50 group-hover:text-teal-600 transition-all">
              <ArrowRight size={20} />
            </div>
          </motion.div>
        )}

        {String(user.role || "").toLowerCase().trim() !== "driver" && (
          <>
            <motion.div 
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigateTo("oos-history")}
              className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-red-50 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group"
            >
              <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all duration-300">
                <PackageX size={20} className="sm:hidden" />
                <PackageX size={36} className="hidden sm:block" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">OOS History</h4>
                <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Removed Items</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-red-50 group-hover:text-red-600 transition-all">
                <ArrowRight size={20} />
              </div>
            </motion.div>

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
              onClick={() => { navigateTo("matrix-v2"); }}
              className="bg-white p-3 sm:p-8 rounded-xl sm:rounded-[2.5rem] shadow-xl border border-blue-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-6 cursor-pointer group relative overflow-hidden"
            >
              <div className="h-10 w-10 sm:h-20 sm:w-20 rounded-xl sm:rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                <LayoutDashboard size={20} className="sm:hidden" />
                <LayoutDashboard size={36} className="hidden sm:block" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-black text-slate-800 text-[11px] sm:text-xl tracking-tight">Matrix V2</h4>
                <p className="text-slate-500 text-[8px] sm:text-sm font-bold mt-0.5">Quick Commerce</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                <ArrowRight size={20} />
              </div>
            </motion.div>

            {String(user.role || "").toLowerCase().trim() === "admin" && (
              <>
                <motion.div 
                  whileHover={{ y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { fetchMatrixData(); navigateTo("matrix"); }}
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
                  onClick={() => { fetchMatrixData(); navigateTo("analytics"); }}
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
          </>
        )}
      </div>

      {/* Notification Help Modal */}
      {showNotifHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500" />
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800">Alerts Blocked</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action Required</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNotifHelp(false)}
                className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <p className="text-sm font-bold text-slate-600 leading-relaxed">
                You have previously blocked notifications for this app. To receive order alerts, you must re-enable them manually in your browser settings.
              </p>
              
              {(() => {
                const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
                
                if (isPWA && isIOS) {
                  return (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">1</div>
                        <p className="text-xs font-bold text-slate-600">Open your iPhone's <strong className="text-slate-800">Settings</strong> app.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">2</div>
                        <p className="text-xs font-bold text-slate-600">Scroll down, find this App, and tap it.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">3</div>
                        <p className="text-xs font-bold text-slate-600">Tap <strong className="text-slate-800">Notifications</strong> and toggle <strong className="text-emerald-600">Allow</strong>.</p>
                      </div>
                    </div>
                  );
                }
                
                if (isPWA && !isIOS) {
                  return (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">1</div>
                        <p className="text-xs font-bold text-slate-600">Open your device's <strong className="text-slate-800">Settings</strong> app.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">2</div>
                        <p className="text-xs font-bold text-slate-600">Go to <strong className="text-slate-800">Apps</strong> &gt; <strong className="text-slate-800">This App</strong>.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">3</div>
                        <p className="text-xs font-bold text-slate-600">Tap <strong className="text-slate-800">Notifications</strong> and select <strong className="text-emerald-600">Allow</strong>.</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">1</div>
                      <p className="text-xs font-bold text-slate-600">Click the <strong className="text-slate-800">lock icon 🔒</strong> in your browser's address bar.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">2</div>
                      <p className="text-xs font-bold text-slate-600">Find <strong className="text-slate-800">Notifications</strong> and change it to <strong className="text-emerald-600">Allow</strong>.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 shrink-0 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-500">3</div>
                      <p className="text-xs font-bold text-slate-600">Refresh this page.</p>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} /> I Have Enabled Them
            </button>
          </motion.div>
        </div>
      )}

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
