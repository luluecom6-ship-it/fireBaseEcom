import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, RefreshCw, Package, Users, UserCheck, TrendingUp, 
  ShieldCheck, AlertTriangle, History, Save, X, AlertCircle, Send
} from 'lucide-react';
import { 
  User, AdminData, EscalationRule, OrderRecord 
} from '../types';
import { Header } from '../components/layout/Header';
import { STATUSES, AGE_BUCKETS } from '../constants';
import { fixImageUrl, getImages } from '../utils/formatters';
import { cn } from '../lib/utils';
import { useSystemConfig } from '../hooks/useSystemConfig';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AdminProps {
  user: User;
  adminData: AdminData;
  onRefetch: (manual?: boolean) => Promise<void>;
  onResetAttendance: (empId: string, date: string) => Promise<void>;
  onViewImage: (url: string | null) => void;
  navigateTo: (page: any) => void;
  escalationRules: EscalationRule[];
  setEscalationRules: React.Dispatch<React.SetStateAction<EscalationRule[]>>;
  maxImages: number;
  setMaxImages: (num: number) => void;
  onSaveConfig: () => Promise<void>;
  isSavingConfig: boolean;
  systemSoundEnabled: boolean;
  setSystemSoundEnabled: (val: boolean) => void;
  setSoundAlertsEnabled: (val: boolean, targetUserId?: string) => void;
  staffStatus: any[];
  scheduledThreshold: number;
  setScheduledThreshold: (num: number) => void;
  scheduledPastSlotActive: boolean;
  setScheduledPastSlotActive: (val: boolean) => void;
  scheduledRunningSlotActive: boolean;
  setScheduledRunningSlotActive: (val: boolean) => void;
  scheduledPastSlotRegions: string[];
  setScheduledPastSlotRegions: (val: string[]) => void;
  scheduledRunningSlotRegions: string[];
  setScheduledRunningSlotRegions: (val: string[]) => void;
  onGoogleLogin: () => void;
  onEmailLogin: (email: string, pass: string) => Promise<void>;
  isFirebaseAuthenticated: boolean;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  isAdminLoading: boolean;
}

export const Admin: React.FC<AdminProps> = ({
  user,
  adminData,
  onRefetch,
  onResetAttendance,
  onViewImage,
  navigateTo,
  escalationRules,
  setEscalationRules,
  maxImages,
  setMaxImages,
  onSaveConfig,
  isSavingConfig,
  scheduledThreshold,
  setScheduledThreshold,
  scheduledPastSlotActive,
  setScheduledPastSlotActive,
  scheduledRunningSlotActive,
  setScheduledRunningSlotActive,
  scheduledPastSlotRegions,
  setScheduledPastSlotRegions,
  scheduledRunningSlotRegions,
  setScheduledRunningSlotRegions,
  onGoogleLogin,
  onEmailLogin,
  isFirebaseAuthenticated,
  showToast,
  isAdminLoading,
  systemSoundEnabled,
  setSystemSoundEnabled,
  setSoundAlertsEnabled,
  staffStatus
}) => {
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [filterDate, setFilterDate] = useState(getTodayStr());
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [adminStoreFilter, setAdminStoreFilter] = useState("All");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDailyOrdersModal, setShowDailyOrdersModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [targetRoles, setTargetRoles] = useState<string[]>(['picker', 'supervisor', 'manager', 'store']);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");

  const storeToRegion = React.useMemo(() => {
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

  const availableRegions = React.useMemo(() => {
    const regions = new Set<string>();
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

  const hasFetched = React.useRef(false);

  // Initial fetch on mount
  React.useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      onRefetch();
    }
  }, [onRefetch]);

  // If supervisor, lock to their region
  React.useEffect(() => {
    if (user.role === 'supervisor' && user.region) {
      setSelectedRegion(user.region);
    }
  }, [user]);

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim() || !isFirebaseAuthenticated || targetRoles.length === 0) return;
    setIsBroadcasting(true);
    try {
      const notificationId = `broadcast-${Date.now()}`;
      await setDoc(doc(db, 'push_queue', notificationId), {
        title: "📢 SYSTEM BROADCAST",
        body: broadcastMessage,
        targetRoles: targetRoles,
        timestamp: serverTimestamp(),
        status: 'pending',
        sender: user.name
      });
      showToast("Broadcast sent successfully!", "success");
      setBroadcastMessage("");
    } catch (error) {
      console.error("Error sending broadcast:", error);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const filteredOrders = React.useMemo(() => {
    return adminData.orders
      .filter(o => String(o.timestamp || "").includes(filterDate))
      .filter(o => selectedRegion === "All" || storeToRegion[String(o.storeId)] === selectedRegion);
  }, [adminData.orders, filterDate, selectedRegion, storeToRegion]);

  const filteredAttendance = React.useMemo(() => {
    return adminData.attendance
      .filter(a => String(a.timestamp || "").includes(filterDate))
      .filter(a => {
        // Try to find user in Excel list first, then Firestore list
        const u = adminData.users.find(usr => String(usr.empId).trim() === String(a.empId).trim());
        const fsUser = staffStatus.find(s => String(s.empId).trim() === String(a.empId).trim());
        
        const region = (u?.region || fsUser?.region || storeToRegion[String(u?.storeId || fsUser?.storeId || "")]) || "All";
        return selectedRegion === "All" || String(region).trim() === selectedRegion;
      });
  }, [adminData.attendance, adminData.users, staffStatus, filterDate, selectedRegion, storeToRegion]);

  const activeStaff = filteredAttendance.filter(a => a.type === "In" && !adminData.users.find(u => String(u.empId).trim() === String(a.empId).trim() && String(u.role).toLowerCase() === 'admin')).length;

  const operationalStaffList = React.useMemo(() => {
    // Combine Excel users, Firestore users, and Active Logs to ensure absolute visibility
    const excelUsers = adminData.users.filter(u => String(u.role || "").toLowerCase() !== 'admin');
    const fsUsers = staffStatus.filter(s => String(s.role || "").toLowerCase() !== 'admin');
    
    // Merge them by empId
    const allUniqueUsers = [...excelUsers];
    
    // Add Firestore users if they aren't in Excel
    fsUsers.forEach(fsu => {
      const uId = String(fsu.empId || "").trim();
      if (uId && !allUniqueUsers.find(au => String(au.empId || "").trim() === uId)) {
        allUniqueUsers.push(fsu as any);
      }
    });

    // CRITICAL: Add anyone who has an attendance log today but isn't in Excel or Firestore
    filteredAttendance.forEach(log => {
      const uId = String(log.empId || "").trim();
      if (uId && !allUniqueUsers.find(au => String(au.empId || "").trim() === uId)) {
        allUniqueUsers.push({
          empId: uId,
          name: log.name,
          storeId: log.storeId,
          role: 'staff',
          region: storeToRegion[String(log.storeId)] || 'All'
        } as any);
      }
    });

    // Apply regional filter to the final merged list
    const filteredList = allUniqueUsers.filter(u => {
      const region = u.region || storeToRegion[String(u.storeId)];
      return selectedRegion === "All" || region === selectedRegion;
    });

    // Sort to put people with activity today at THE TOP
    return filteredList.sort((a, b) => {
      const aHasLog = filteredAttendance.some(log => String(log.empId).trim() === String(a.empId).trim());
      const bHasLog = filteredAttendance.some(log => String(log.empId).trim() === String(b.empId).trim());
      if (aHasLog && !bHasLog) return -1;
      if (!aHasLog && bHasLog) return 1;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [adminData.users, staffStatus, filteredAttendance, selectedRegion, storeToRegion]);

  return (
    <motion.div 
      key="admin"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      {/* Top Loading Bar */}
      <AnimatePresence>
        {isAdminLoading && (
          <motion.div 
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-[64px] left-0 right-0 h-1 bg-blue-600 origin-left z-50"
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">System Admin</h2>
            <p className="text-slate-500 font-bold text-xs mt-1">Manage escalation rules and system settings</p>
            
            <div className="mt-3 flex items-center justify-center sm:justify-start">
              <div className="bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
                <ShieldCheck size={14} className="text-blue-600" />
                <select 
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  disabled={user.role === 'supervisor'}
                  className="bg-transparent border-none font-black text-[10px] uppercase tracking-widest text-slate-600 outline-none cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="All">All Regions</option>
                  {availableRegions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
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
              whileTap={{ rotate: 180 }}
              onClick={() => onRefetch(true)}
              className="h-11 w-11 sm:h-14 sm:w-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-blue-600"
            >
              <RefreshCw size={20} />
            </motion.button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { id: "orders", label: "Daily Orders", val: filteredOrders.length, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
            { id: "active", label: "Active Staff", val: activeStaff, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
            { id: "total", label: "Total Staff", val: adminData.users.filter(u => u.role !== 'admin' && (selectedRegion === "All" || u.region === selectedRegion || storeToRegion[String(u.storeId)] === selectedRegion)).length, icon: UserCheck, color: "text-purple-600", bg: "bg-purple-50" },
            { id: "efficiency", label: "Efficiency", val: "94%", icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
          ].map((m, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => m.id === "orders" && setShowDailyOrdersModal(true)}
              className={cn(
                "bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-100",
                m.id === "orders" && "cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
              )}
            >
              <div className={cn("h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4", m.bg, m.color)}>
                <m.icon size={20} className="sm:hidden" />
                <m.icon size={24} className="hidden sm:block" />
              </div>
              <p className="text-[8px] sm:text-[10px] uppercase font-black text-slate-400 tracking-widest">{m.label}</p>
              <p className="text-xl sm:text-3xl font-black text-slate-800 tracking-tighter mt-1">{m.val}</p>
            </motion.div>
          ))}
        </div>

        {/* Firebase Auth Warning */}
        {String(user.role || "").toLowerCase().trim() === 'admin' && !isFirebaseAuthenticated && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="text-amber-900 font-black text-xs uppercase tracking-widest">Firebase Authentication Required</p>
                <p className="text-amber-700 text-[10px] sm:text-xs font-bold mt-1">
                  To save system configurations or send broadcasts, you must be signed in with an authorized Firebase account.
                </p>
                
                <div className="mt-4 flex flex-wrap gap-3">
                  <button 
                    onClick={onGoogleLogin}
                    className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-3 w-3" referrerPolicy="no-referrer" />
                    Link Google Admin
                  </button>
                  
                  <button 
                    onClick={() => setShowEmailLogin(!showEmailLogin)}
                    className="px-4 py-2.5 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-200"
                  >
                    <ShieldCheck size={14} />
                    {showEmailLogin ? "Cancel Email Login" : "Staff Email Login"}
                  </button>
                </div>

                <AnimatePresence>
                  {showEmailLogin && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 pt-6 border-t border-amber-200 space-y-4 overflow-hidden"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-amber-800 ml-1">Admin Email</label>
                          <input 
                            type="email"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                            className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-500"
                            placeholder="e.g. admin@lulumea.com"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-amber-800 ml-1">Password</label>
                          <input 
                            type="password"
                            value={adminPass}
                            onChange={(e) => setAdminPass(e.target.value)}
                            className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-500"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => onEmailLogin(adminEmail, adminPass)}
                        disabled={!adminEmail || !adminPass}
                        className="w-full sm:w-auto px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                      >
                        Verify Admin Credentials
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* System Settings */}
        {String(user.role || "").toLowerCase().trim() === "admin" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
                  <ShieldCheck size={18} className="text-blue-600 sm:hidden" />
                  <ShieldCheck size={20} className="text-blue-600 hidden sm:block" />
                  System Configuration
                </h4>
              </div>
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div>
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Images Per Order</p>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-600 mt-1">Currently set to {maxImages}</p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm sm:text-base">
                    {maxImages}
                  </div>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(num => (
                    <button
                      key={num}
                      onClick={() => setMaxImages(num)}
                      className={cn(
                        "flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs transition-all",
                        maxImages === num 
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                          : "bg-white text-slate-400 border border-slate-200 hover:border-blue-300"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100 mt-4">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div>
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Scheduled Alert Threshold</p>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-600 mt-1">Alert {scheduledThreshold} mins prior to slot end</p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-sm sm:text-base">
                    {scheduledThreshold}
                  </div>
                </div>
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map(num => (
                    <button
                      key={num}
                      onClick={() => setScheduledThreshold(num)}
                      className={cn(
                        "flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs transition-all",
                        scheduledThreshold === num 
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
                          : "bg-white text-slate-400 border border-slate-200 hover:border-emerald-300"
                      )}
                    >
                      {num}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
                  <Send size={18} className="text-emerald-600 sm:hidden" />
                  <Send size={20} className="text-emerald-600 hidden sm:block" />
                  Broadcast Notification
                </h4>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 mb-1">
                  {['picker', 'supervisor', 'manager', 'store', 'driver', 'admin', 'user'].map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setTargetRoles(prev => 
                          prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
                        );
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border",
                        targetRoles.includes(role) 
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" 
                          : "bg-white text-slate-400 border-slate-200 hover:border-emerald-300"
                      )}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                <textarea 
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Type message to selected roles..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 min-h-[80px] resize-none"
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleBroadcast}
                  disabled={isBroadcasting || !broadcastMessage.trim() || !isFirebaseAuthenticated || targetRoles.length === 0}
                  className={cn(
                    "w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    (isBroadcasting || !broadcastMessage.trim() || !isFirebaseAuthenticated || targetRoles.length === 0)
                      ? "bg-slate-100 text-slate-400"
                      : "bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"
                  )}
                >
                  {isBroadcasting ? "Sending..." : "Send Broadcast"} <Send size={14} />
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {/* Escalation Matrix Configuration */}
        {String(user.role || "").toLowerCase().trim() === 'admin' && (
          <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 sm:p-6 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
                <AlertTriangle size={18} className="text-red-600 sm:hidden" />
                <AlertTriangle size={20} className="text-red-600 hidden sm:block" />
                Escalation Matrix
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => navigateTo("alerts")}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 text-slate-700 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center gap-1.5 sm:gap-2"
                >
                  <History size={12} sm:size={14} /> History
                </button>
                <button 
                  onClick={onSaveConfig}
                  disabled={isSavingConfig || !isFirebaseAuthenticated}
                  className={cn(
                    "px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 sm:gap-2",
                    (isSavingConfig || !isFirebaseAuthenticated) ? "bg-slate-100 text-slate-400" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200"
                  )}
                >
                  <Save size={12} sm:size={14} /> {isSavingConfig ? "Syncing..." : "Save"}
                </button>
                <button 
                  onClick={() => {
                    const newRule: EscalationRule = {
                      id: Math.random().toString(36).substr(2, 9),
                      status: STATUSES[0],
                      bucket: AGE_BUCKETS[0],
                      region: 'All',
                      escalationUser: 'New Supervisor',
                      isActive: true
                    };
                    setEscalationRules([...escalationRules, newRule]);
                  }}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                >
                  Add Rule
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="p-3 sm:p-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Region</th>
                    <th className="p-3 sm:p-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="p-3 sm:p-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Bucket</th>
                    <th className="p-3 sm:p-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Escalation To</th>
                    <th className="p-3 sm:p-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Active</th>
                    <th className="p-3 sm:p-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {escalationRules
                    .filter(rule => selectedRegion === "All" || rule.region === "All" || rule.region === selectedRegion)
                    .map(rule => (
                    <tr key={rule.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-3 sm:p-4">
                        <select 
                          value={rule.region || "All"}
                          onChange={(e) => setEscalationRules(prev => prev.map(r => r.id === rule.id ? { ...r, region: e.target.value } : r))}
                          className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        >
                          <option value="All">All Regions</option>
                          {availableRegions.map(reg => <option key={reg} value={reg}>{reg}</option>)}
                        </select>
                      </td>
                      <td className="p-3 sm:p-4">
                        <select 
                          value={rule.status}
                          onChange={(e) => setEscalationRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: e.target.value } : r))}
                          className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="p-3 sm:p-4">
                        <select 
                          value={rule.bucket}
                          onChange={(e) => setEscalationRules(prev => prev.map(r => r.id === rule.id ? { ...r, bucket: e.target.value } : r))}
                          className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        >
                          {AGE_BUCKETS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className="p-3 sm:p-4">
                        <input 
                          type="text"
                          value={rule.escalationUser}
                          onChange={(e) => setEscalationRules(prev => prev.map(r => r.id === rule.id ? { ...r, escalationUser: e.target.value } : r))}
                          className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="p-3 sm:p-4 text-center">
                        <button 
                          onClick={() => setEscalationRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))}
                          className={cn(
                            "h-5 w-8 sm:h-6 sm:w-10 rounded-full relative transition-all",
                            rule.isActive ? "bg-emerald-500" : "bg-slate-200"
                          )}
                        >
                          <div className={cn("absolute top-0.5 sm:top-1 h-3.5 w-3.5 sm:h-4 sm:w-4 bg-white rounded-full transition-all", rule.isActive ? "right-0.5 sm:right-1" : "left-0.5 sm:left-1")}></div>
                        </button>
                      </td>
                      <td className="p-3 sm:p-4 text-center">
                        <button 
                          onClick={() => setEscalationRules(prev => prev.filter(r => r.id !== rule.id))}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <X size={16} sm:size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scheduled Alerts Configuration */}
        {String(user.role || "").toLowerCase().trim() === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 sm:p-6 bg-indigo-50/50 border-b border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
                  <Clock size={18} className="text-indigo-600 sm:hidden" />
                  <Clock size={20} className="text-indigo-600 hidden sm:block" />
                  Scheduled Alerts Config
                </h4>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                <thead>
                  <tr className="bg-slate-50/30 border-b border-slate-100">
                    <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Alert Condition</th>
                    <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest px-8">Region Selection</th>
                    <th className="p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {/* Past Slot Condition */}
                  <tr className="hover:bg-indigo-50/10 transition-colors">
                    <td className="p-4">
                      <p className="text-xs font-black text-slate-700">Past Slot (Missed Delivery)</p>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">Alerts when currentTime {'>'}= slotEnd</p>
                    </td>
                    <td className="p-4 px-8">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setScheduledPastSlotRegions(['All'])}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                            scheduledPastSlotRegions.includes('All') 
                              ? "bg-indigo-600 text-white border-indigo-600" 
                              : "bg-white text-slate-400 border-slate-100"
                          )}
                        >
                          All Regions
                        </button>
                        {availableRegions.map(reg => (
                          <button
                            key={reg}
                            onClick={() => {
                              if (scheduledPastSlotRegions.includes('All')) {
                                setScheduledPastSlotRegions([reg]);
                              } else if (scheduledPastSlotRegions.includes(reg)) {
                                const next = scheduledPastSlotRegions.filter(r => r !== reg);
                                setScheduledPastSlotRegions(next.length === 0 ? ['All'] : next);
                              } else {
                                setScheduledPastSlotRegions([...scheduledPastSlotRegions, reg]);
                              }
                            }}
                            className={cn(
                              "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                              scheduledPastSlotRegions.includes(reg) && !scheduledPastSlotRegions.includes('All')
                                ? "bg-indigo-600 text-white border-indigo-600" 
                                : "bg-white text-slate-400 border-slate-100"
                            )}
                          >
                            {reg}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setScheduledPastSlotActive(!scheduledPastSlotActive)}
                        className={cn(
                          "h-6 w-10 rounded-full relative transition-all mx-auto",
                          scheduledPastSlotActive ? "bg-indigo-500" : "bg-slate-200"
                        )}
                      >
                        <div className={cn("absolute top-1 h-4 w-4 bg-white rounded-full transition-all", scheduledPastSlotActive ? "right-1" : "left-1")}></div>
                      </button>
                    </td>
                  </tr>

                  {/* Running Slot Condition */}
                  <tr className="hover:bg-indigo-50/10 transition-colors">
                    <td className="p-4">
                      <p className="text-xs font-black text-slate-700">Running Slot (In Progress)</p>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">Alerts for Prep or Near-End Delivery stages</p>
                    </td>
                    <td className="p-4 px-8">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setScheduledRunningSlotRegions(['All'])}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                            scheduledRunningSlotRegions.includes('All') 
                              ? "bg-indigo-600 text-white border-indigo-600" 
                              : "bg-white text-slate-400 border-slate-100"
                          )}
                        >
                          All Regions
                        </button>
                        {availableRegions.map(reg => (
                          <button
                            key={reg}
                            onClick={() => {
                              if (scheduledRunningSlotRegions.includes('All')) {
                                setScheduledRunningSlotRegions([reg]);
                              } else if (scheduledRunningSlotRegions.includes(reg)) {
                                const next = scheduledRunningSlotRegions.filter(r => r !== reg);
                                setScheduledRunningSlotRegions(next.length === 0 ? ['All'] : next);
                              } else {
                                setScheduledRunningSlotRegions([...scheduledRunningSlotRegions, reg]);
                              }
                            }}
                            className={cn(
                              "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                              scheduledRunningSlotRegions.includes(reg) && !scheduledRunningSlotRegions.includes('All')
                                ? "bg-indigo-600 text-white border-indigo-600" 
                                : "bg-white text-slate-400 border-slate-100"
                            )}
                          >
                            {reg}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setScheduledRunningSlotActive(!scheduledRunningSlotActive)}
                        className={cn(
                          "h-6 w-10 rounded-full relative transition-all mx-auto",
                          scheduledRunningSlotActive ? "bg-indigo-500" : "bg-slate-200"
                        )}
                      >
                        <div className={cn("absolute top-1 h-4 w-4 bg-white rounded-full transition-all", scheduledRunningSlotActive ? "right-1" : "left-1")}></div>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Sound Control Session Toggle */}
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Global Buzzer System</p>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Toggle audible buzzers for the ENTIRE system</p>
              </div>
              <button 
                onClick={() => setSystemSoundEnabled(!systemSoundEnabled)}
                className={cn(
                  "h-6 w-10 sm:h-7 sm:w-12 rounded-full relative transition-all",
                  systemSoundEnabled ? "bg-indigo-600" : "bg-slate-300"
                )}
              >
                <div className={cn(
                  "absolute top-1 h-4 w-4 sm:h-5 sm:w-5 bg-white rounded-full transition-all shadow-sm",
                  systemSoundEnabled ? "right-1" : "left-1"
                )}></div>
              </button>
            </div>
          </div>

          {/* Staff Presence Column */}
          <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 sm:p-6 bg-emerald-50/50 border-b border-emerald-100 flex items-center justify-between">
              <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
                <Users size={18} className="text-emerald-600 sm:hidden" />
                <Users size={20} className="text-emerald-600 hidden sm:block" />
                Staff Presence
              </h4>
              <div className="flex gap-2">
                {['Active', 'Inactive', 'Offline'].map(status => (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      status === 'Active' ? "bg-emerald-500" : (status === 'Inactive' ? "bg-amber-500" : "bg-slate-300")
                    )}></div>
                    <span className="text-[8px] font-black uppercase text-slate-400 hidden sm:inline">{status}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                  <tr className="border-b border-slate-100">
                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Store</th>
                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Buzzer</th>
                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffStatus.map((staff, i) => (
                    <tr key={staff.empId || i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3">
                        <p className="font-black text-slate-800 text-[11px] truncate max-w-[100px]">{staff.name}</p>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{staff.role}</p>
                      </td>
                      <td className="p-3 font-bold text-slate-600 text-[10px]">{staff.storeId}</td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => setSoundAlertsEnabled(staff.soundAlertsEnabled !== false ? false : true, staff.empId)}
                          className={cn(
                            "h-5 w-8 rounded-full relative transition-all mx-auto shadow-inner",
                            staff.soundAlertsEnabled !== false ? "bg-emerald-500 shadow-emerald-500/20" : "bg-slate-300 shadow-slate-300/20"
                          )}
                        >
                          <div className={cn("absolute top-0.5 h-4 w-4 bg-white rounded-full transition-all shadow-sm", staff.soundAlertsEnabled !== false ? "right-0.5" : "left-0.5")}></div>
                        </button>
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest block text-center",
                          staff.presenceStatus === 'Active' ? "bg-emerald-100 text-emerald-600" : 
                          (staff.presenceStatus === 'Inactive' ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400")
                        )}>
                          {staff.presenceStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {staffStatus.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">No staff data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Remote Admin Control (Batch Toggle) */}
            <div className="p-4 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white tracking-widest">Remote Buzzer Override</p>
                <p className="text-[9px] font-bold text-slate-400 mt-1">Force update sound state for ALL visible members</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    staffStatus.forEach(s => setSoundAlertsEnabled(false, s.empId));
                    showToast("All Buzzers Disabled Remotely", "info");
                  }}
                  className="flex-1 sm:flex-none px-4 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-900/40"
                >
                  Mute All
                </button>
                <button 
                  onClick={() => {
                    staffStatus.forEach(s => setSoundAlertsEnabled(true, s.empId));
                    showToast("All Buzzers Enabled Remotely", "success");
                  }}
                  className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/40"
                >
                  Unmute All
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Staff Table */}
        <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 sm:p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
            <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
              <Users size={18} className="text-blue-600 sm:hidden" />
              <Users size={20} className="text-blue-600 hidden sm:block" />
              Operational Staff
            </h4>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-[8px] font-black text-slate-400 uppercase tracking-widest">{operationalStaffList.length} Total</span>
              <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-100 text-blue-700 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest">Live Status</span>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {operationalStaffList.map((u, i) => {
              const uId = String(u.empId).trim();
              // Backend is New to Old, so reverse it to find the FIRST In
              const inRecord = [...adminData.attendance].reverse().find(a => String(a.empId).trim() === uId && a.type === "In" && String(a.timestamp || "").includes(filterDate));
              // Backend is New to Old, so first match is LATEST Out
              const outRecord = adminData.attendance.find(a => String(a.empId).trim() === uId && a.type === "Out" && String(a.timestamp || "").includes(filterDate));
              
              const isToday = filterDate === new Date().toISOString().split("T")[0];
              let duration = "--";
              if (inRecord) {
                const start = new Date(inRecord.timestamp).getTime();
                let end = outRecord ? new Date(outRecord.timestamp).getTime() : (isToday ? new Date().getTime() : null);
                
                if (end) {
                  const diffMs = end - start;
                  if (diffMs > 0) {
                    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    duration = `${hrs}h ${mins}m`;
                  } else {
                    duration = "0h 0m";
                  }
                }
              }

              const formatTime = (ts: string) => {
                try {
                  return new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                } catch (e) {
                  return "--:--";
                }
              };

              return (
                <motion.div 
                  key={`${u.empId}-${i}`} 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelectedUser(u as any)} 
                  className="p-4 sm:p-6 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-sm sm:text-base">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 tracking-tight text-sm sm:text-base">{u.name}</p>
                      <p className="text-[9px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        {u.storeId} • {u.empId} {u.region && `• ${u.region}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 sm:gap-8">
                    <div className="hidden sm:flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Login</p>
                        <p className="text-[10px] font-bold text-slate-700 leading-none mt-1">{inRecord ? formatTime(inRecord.timestamp) : "--:--"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Logout</p>
                        <p className="text-[10px] font-bold text-slate-700 leading-none mt-1">{outRecord ? formatTime(outRecord.timestamp) : "--:--"}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end min-w-[50px] sm:min-w-[60px] sm:border-l border-slate-100 sm:pl-4">
                      <p className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                      <p className={cn(
                        "text-[10px] sm:text-xs font-black tracking-tight mt-1 leading-none",
                        outRecord ? "text-blue-600" : (inRecord ? "text-emerald-600" : "text-slate-300")
                      )}>{duration}</p>
                      {inRecord && !outRecord && isToday && (
                        <span className="text-[6px] sm:text-[7px] font-black text-emerald-500 uppercase tracking-widest animate-pulse mt-1">Active</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div 
            key="selected-user-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 sm:p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md rounded-[2rem] sm:rounded-[3rem] bg-white p-6 sm:p-8 shadow-2xl relative"
            >
              <button onClick={() => setSelectedUser(null)} className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} sm:size={24} />
              </button>
              
              <div className="mb-6 sm:mb-8">
                <h3 className="text-xl sm:text-2xl font-black tracking-tight">{selectedUser.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs">Staff Profile Details</p>
                  {selectedUser.region && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase tracking-widest border border-indigo-100">
                      {selectedUser.region}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                {["In", "Out"].map(type => {
                  const uId = String(selectedUser.empId).trim();
                  // For "In", we want the first one of the day (Oldest) -> Reverse the New-to-Old list
                  // For "Out", we want the latest one of the day (Newest) -> Standard search on New-to-Old list
                  const record = type === "In" 
                    ? [...adminData.attendance].reverse().find(a => String(a.empId).trim() === uId && a.type === type && String(a.timestamp || "").includes(filterDate))
                    : adminData.attendance.find(a => String(a.empId).trim() === uId && a.type === type && String(a.timestamp || "").includes(filterDate));
                  
                  return (
                    <div key={type} className="space-y-2 sm:space-y-3">
                      <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">{type} Verification</p>
                      {record ? (
                        <motion.div 
                          whileHover={{ scale: 1.05 }}
                          onClick={() => onViewImage(fixImageUrl(record.imageUrl))}
                          className="relative aspect-square overflow-hidden rounded-2xl sm:rounded-3xl border-4 border-slate-50 shadow-lg cursor-zoom-in"
                        >
                          <img src={fixImageUrl(record.imageUrl)} className="w-full h-full object-cover" alt={type} referrerPolicy="no-referrer" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/50 p-1.5 sm:p-2 text-[8px] sm:text-[10px] text-white font-black text-center backdrop-blur-sm">
                            {new Date(record.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                          </div>
                        </motion.div>
                      ) : (
                        <div className="aspect-square flex flex-col items-center justify-center bg-slate-50 rounded-2xl sm:rounded-3xl border-2 border-dashed border-slate-100 text-slate-300">
                          <AlertCircle size={20} sm:size={24} className="mb-1 sm:mb-2" />
                          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest">No Log</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 sm:space-y-4">
                {(() => {
                  const uId = String(selectedUser.empId).trim();
                  const inRec = [...adminData.attendance].reverse().find(a => String(a.empId).trim() === uId && a.type === "In" && String(a.timestamp || "").includes(filterDate));
                  const outRec = adminData.attendance.find(a => String(a.empId).trim() === uId && a.type === "Out" && String(a.timestamp || "").includes(filterDate));
                  const isToday = filterDate === new Date().toISOString().split("T")[0];
                  let dur = "--";
                  if (inRec) {
                    const start = new Date(inRec.timestamp).getTime();
                    let end = outRec ? new Date(outRec.timestamp).getTime() : (isToday ? new Date().getTime() : null);
                    if (end) {
                      const diff = end - start;
                      if (diff > 0) {
                        const hrs = Math.floor(diff / (1000 * 60 * 60));
                        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        dur = `${hrs}h ${mins}m`;
                      } else {
                        dur = "0h 0m";
                      }
                    }
                  }
                  return (
                    <div className="p-3 sm:p-4 bg-blue-50 rounded-xl sm:rounded-2xl flex items-center justify-between border border-blue-100">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Clock className="text-blue-600" size={16} sm:size={18} />
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-900">Work Duration</span>
                      </div>
                      <span className="font-black text-blue-700 text-sm sm:text-base">{dur}</span>
                    </div>
                  );
                })()}

                <div className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl flex items-center justify-between">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Orders Today</span>
                  <span className="font-black text-blue-600 text-sm sm:text-base">{adminData.orders.filter(o => (o.pickerName === selectedUser.name || (o as any).uploadedBy === selectedUser.empId) && String(o.timestamp || "").includes(filterDate)).length}</span>
                </div>

                {adminData.attendance.some(a => String(a.empId).trim() === String(selectedUser.empId).trim() && String(a.timestamp || "").includes(filterDate)) && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onResetAttendance(selectedUser.empId, filterDate)}
                    className="w-full flex items-center justify-center gap-2 p-3 sm:p-4 bg-red-50 text-red-600 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100"
                  >
                    <RefreshCw size={14} sm:size={16} /> Reset Attendance
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDailyOrdersModal && (
          <motion.div 
            key="daily-orders-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 sm:p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-2xl h-[80vh] rounded-[2rem] sm:rounded-[3rem] bg-white flex flex-col shadow-2xl relative overflow-hidden"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight">Daily Orders</h3>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1">
                    {new Date(filterDate).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                  <select 
                    value={adminStoreFilter}
                    onChange={(e) => setAdminStoreFilter(e.target.value)}
                    className="bg-slate-50 border-none rounded-lg sm:rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 font-black text-[9px] sm:text-xs uppercase tracking-widest text-slate-600 outline-none"
                  >
                    <option value="All">All Stores</option>
                    {Array.from(new Set(adminData.orders
                      .filter(o => selectedRegion === "All" || storeToRegion[String(o.storeId)] === selectedRegion)
                      .map(o => String(o.storeId)))).sort().map(store => (
                      <option key={store} value={store}>{store}</option>
                    ))}
                  </select>
                  <button onClick={() => setShowDailyOrdersModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X size={20} sm:size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-3 sm:space-y-4">
                {filteredOrders
                  .filter(o => adminStoreFilter === "All" || String(o.storeId) === adminStoreFilter)
                  .length > 0 ? (
                  filteredOrders
                    .filter(o => adminStoreFilter === "All" || String(o.storeId) === adminStoreFilter)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((order, i) => (
                      <motion.div 
                        key={`${order.orderId}-${order.timestamp}-${i}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-slate-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 border border-slate-100"
                      >
                        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 max-w-[100px] sm:max-w-[150px] scrollbar-hide">
                          {getImages(order.imageUrl).map((img, idx) => (
                            <div 
                              key={idx}
                              onClick={() => onViewImage(fixImageUrl(img))}
                              className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg overflow-hidden cursor-zoom-in flex-shrink-0 border border-white shadow-sm bg-slate-100"
                            >
                              <img src={fixImageUrl(img)} className="w-full h-full object-cover" alt="Order" referrerPolicy="no-referrer" />
                            </div>
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <p className="font-black text-slate-800 truncate tracking-tight text-xs sm:text-sm">{order.orderId}</p>
                            <span className="text-[8px] sm:text-[10px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase tracking-widest">{order.storeId}</span>
                          </div>
                          <div className="mt-1 flex flex-col gap-0.5">
                            <p className="text-[10px] sm:text-xs text-slate-600 font-bold flex items-center gap-1">
                              <UserCheck size={10} className="text-slate-400" />
                              {order.pickerName || (order as any).picker || "Unknown"}
                            </p>
                            <p className="text-[8px] sm:text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock size={8} />
                              {new Date(order.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                    <Package size={48} className="opacity-20" />
                    <p className="font-black uppercase tracking-widest text-[10px] sm:text-xs">No orders found</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
