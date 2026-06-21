import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { PackageX, Clock, RefreshCw, Search, Box, Bell, MapPin, MessageCircle, CheckCircle2, Send } from 'lucide-react';
import { OOSRecord, User } from '../types';
import { parseServerDate } from '../utils/api';
// cn is in lib/utils
import { cn } from '../lib/utils';

interface OOSHistoryProps {
  oosItems: OOSRecord[];
  onViewImage: (url: string | null) => void;
  navigateTo: (page: any) => void;
  user: User | null;
  loading: boolean;
  onRefresh: () => void;
  adminData?: any;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const OOSHistory: React.FC<OOSHistoryProps> = ({
  oosItems,
  onViewImage,
  navigateTo,
  user,
  loading,
  onRefresh,
  adminData,
  showToast
}) => {
  // Helper to get local date in YYYY-MM-DD format
  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [filterDate, setFilterDate] = useState<string>(
    getLocalDateString(new Date())
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStore, setFilterStore] = useState<string>("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const role = String(user?.role || "").toLowerCase().trim();
  const supervisorRegion = user && role === 'supervisor' ? (user.region || "").trim() : "";

  useEffect(() => {
    if (role === 'supervisor' && supervisorRegion) {
      setFilterRegion(supervisorRegion);
    }
  }, [role, supervisorRegion]);

  const isAdminOrSuper = ['admin', 'operator', 'supervisor'].includes(user?.role?.toLowerCase() || "");
  const isAdminOrOp = ['admin', 'operator'].includes(user?.role?.toLowerCase() || "");

  const handleScanAndSend = async () => {
    if (!user || !isAdminOrOp) return;
    try {
      setIsScanning(true);
      const res = await fetch("/api/admin/whatsapp/scan-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterRole: user.role.toLowerCase() })
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        const msg = `WA Scan Complete: ${data.sent} sent, ${data.skipped} skipped, ${data.failed} failed (${data.total} total)`;
        showToast ? showToast(msg, data.sent > 0 ? 'success' : 'info') : alert(msg);
        onRefresh();
      } else {
        const errMsg = "Scan failed: " + (data.error || "Unknown error");
        showToast ? showToast(errMsg, 'error') : alert(errMsg);
      }
    } catch (e: any) {
      const errMsg = "Scan error: " + e.message;
      showToast ? showToast(errMsg, 'error') : alert(errMsg);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSendPush = async (item: OOSRecord) => {
    if (!user || (!isAdminOrSuper)) return;
    try {
      setPushingId(item.id);
      
      // Strip potentially massive base64 payloads to avoid Vercel 4.5MB request limits
      const safeItem = { ...item };
      if (safeItem.photoUrl && safeItem.photoUrl.startsWith("data:")) {
        safeItem.photoUrl = ""; // Strip base64 payloads but keep drive URLs
      }

      const res = await fetch("/api/admin/send-oos-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: safeItem, requesterRole: user.role.toLowerCase() })
      });
      let data;
      const textResponse = await res.text();
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        console.error("Non-JSON Server Output:", textResponse);
        throw new Error(`Server returned a non-JSON response (${res.status}): ${textResponse.substring(0, 100)}`);
      }
      
      if (res.ok && data.status === "success") {
        const msg = data.successCount ? `Push sent successfully to ${data.successCount} users.` : "No appropriate devices found.";
        showToast ? showToast(msg, data.successCount ? 'success' : 'info') : alert(msg);
      } else {
        const errMsg = "Failed to send push: " + (data.error || "Unknown error");
        showToast ? showToast(errMsg, 'error') : alert(errMsg);
      }
    } catch (e: any) {
      const errMsg = "Error sending push: " + e.message;
      showToast ? showToast(errMsg, 'error') : alert(errMsg);
    } finally {
      setPushingId(null);
    }
  };

  // Build storeToRegion map from adminData if provided
  const storeToRegion: Record<string, string> = {};
  if (adminData && Array.isArray(adminData.regions)) {
    adminData.regions.forEach((r: any) => {
       const sid = String(r.storeId || r.StoreID || "").trim();
       const reg = String(r.region || r.Region || "").trim();
       if (sid) storeToRegion[sid] = reg;
    });
  }

  // Build unique and sorted list of regions dynamically from adminData
  const regionsList = useMemo(() => {
    const s = new Set<string>();
    if (adminData && Array.isArray(adminData.regions)) {
      adminData.regions.forEach((r: any) => {
        const reg = String(r.region || r.Region || "").trim();
        if (reg) s.add(reg);
      });
    }
    return Array.from(s).sort();
  }, [adminData]);

  // Unique stores should also only be shown to supervisors if they belong to their region, or filtered by selected region
  let uniqueStores = Array.from(new Set(oosItems.map(item => String(item.storeId || "").toUpperCase()))).filter(Boolean);
  if (role === 'supervisor' && supervisorRegion) {
     uniqueStores = uniqueStores.filter(store => {
         const sr = storeToRegion[store] || "";
         return sr.toLowerCase() === supervisorRegion.toLowerCase();
     });
  } else if (filterRegion !== "all") {
     uniqueStores = uniqueStores.filter(store => {
         const sr = storeToRegion[store] || "";
         return sr.toLowerCase() === filterRegion.toLowerCase();
     });
  }
  uniqueStores = uniqueStores.sort();

  const filteredItems = oosItems.filter(item => {
    // 1. Date Filter
    if (!item.timestamp) return false;
    const d = parseServerDate(item.timestamp);
    const itemDateStr = getLocalDateString(d);
    
    const matchesDate = filterDate === "all" || filterDate === "" || itemDateStr === filterDate;
    if (!matchesDate) return false;

    // 2. Search Filter
    const searchLower = searchTerm.toLowerCase().trim();
    const matchesSearch = !searchLower || 
      (item.orderId || "").toLowerCase().includes(searchLower) ||
      (item.sku || "").toLowerCase().includes(searchLower) ||
      (item.itemName || "").toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;

    // 3. Region Filter
    if (filterRegion !== "all") {
      const itemRegion = storeToRegion[String(item.storeId || "").trim()] || "";
      if (itemRegion.toLowerCase() !== filterRegion.toLowerCase()) {
        return false;
      }
    }

    // 4. Dropdown Store Filter
    if (filterStore !== "all" && String(item.storeId || "").toUpperCase() !== filterStore) {
      return false;
    }

    // 5. Role/Store Restriction
    if (user && role !== 'admin' && role !== 'operator') {
      const itemStoreId = String(item.storeId || "").toLowerCase().trim();
      
      if (role === 'supervisor') {
        const itemRegion = storeToRegion[String(item.storeId || "").trim()] || "";
        if (itemRegion.toLowerCase() !== supervisorRegion.toLowerCase()) return false;
      } else {
        // managers, pickers, drivers, etc
        const userStoreId = String(user.storeId || "").toLowerCase().trim();
        if (userStoreId !== 'all') {
          return itemStoreId === userStoreId;
        }
      }
    }
    return true;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="text-center md:text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <PackageX className="text-red-500" size={32} />
              OOS History
            </h2>
            <p className="text-slate-500 font-bold text-xs sm:text-sm mt-1 uppercase tracking-wider">
              Removed Items tracking for {filterDate}
            </p>
          </div>

          {/* Admin Scan & Send Button */}
          {isAdminOrOp && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleScanAndSend}
              disabled={isScanning}
              className={cn(
                "px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm border shrink-0",
                isScanning
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-green-600 text-white border-green-700 hover:bg-green-700"
              )}
            >
              <Send size={14} className={isScanning ? "animate-pulse" : ""} />
              {isScanning ? "Scanning..." : "Scan & Send WA"}
            </motion.button>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="flex-1 w-full bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
              <Search className="text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search Order / SKU / Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full font-bold text-slate-700 outline-none bg-transparent text-sm placeholder:text-slate-300"
              />
            </div>

            {/* Region Filter */}
            {(role === 'admin' || role === 'operator' || role === 'supervisor') && (
              <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                <MapPin className="text-pink-600" size={18} />
                <select
                  value={filterRegion}
                  onChange={(e) => {
                    setFilterRegion(e.target.value);
                    setFilterStore("all");
                  }}
                  disabled={role === 'supervisor' && !!supervisorRegion}
                  className="font-black text-slate-700 outline-none bg-transparent text-sm cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <option value="all">All Regions</option>
                  {regionsList.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Store Filter */}
            {(role === 'admin' || role === 'operator' || role === 'supervisor') && (
              <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                <Box className="text-purple-600" size={18} />
                <select
                  value={filterStore}
                  onChange={(e) => setFilterStore(e.target.value)}
                  className="font-black text-slate-700 outline-none bg-transparent text-sm cursor-pointer"
                >
                  <option value="all">All Stores</option>
                  {uniqueStores.map(store => (
                    <option key={store} value={store}>Store {store}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Filter */}
            <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
              <Clock className="text-blue-600" size={18} />
              <input 
                type="date" 
                value={filterDate} 
                onChange={(e) => setFilterDate(e.target.value)} 
                className="font-black text-slate-700 outline-none bg-transparent text-sm cursor-pointer"
              />
            </div>

            {/* Refresh Button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onRefresh}
              disabled={loading}
              className="h-12 w-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-blue-600 disabled:opacity-50"
            >
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </motion.button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
           <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Hits</span>
              <span className="text-2xl font-black text-slate-800">{filteredItems.length}</span>
           </div>
           <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Orders Impacted</span>
              <span className="text-2xl font-black text-slate-800">
                {new Set(filteredItems.map(i => i.orderId)).size}
              </span>
           </div>
           <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">WA Sent</span>
              <span className="text-2xl font-black text-green-600">
                {filteredItems.filter(i => (i as any).whatsappSent).length}
              </span>
           </div>
           <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">WA Pending</span>
              <span className="text-2xl font-black text-orange-500">
                {filteredItems.filter(i => !(i as any).whatsappSent).length}
              </span>
           </div>
        </div>

        {/* Table Content */}
        <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">User / Picker</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Details</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Store</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Slot</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</th>
                  <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">WA</th>
                  {isAdminOrSuper && (
                    <th className="p-4 sm:p-6 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrSuper ? 11 : 10} className="p-12 sm:p-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                         <Box className="text-slate-200" size={48} />
                         <span className="text-slate-400 font-bold tracking-tight">No removed items found for the selected criteria</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 sm:p-6">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 block whitespace-nowrap">
                          {parseServerDate(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="p-4 sm:p-6">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-[10px] font-black uppercase overflow-hidden shrink-0">
                            <span className="truncate max-w-[20px]">{String((item as any).pickerName || "S")[0]}</span>
                          </div>
                          <span className="text-[10px] sm:text-xs font-bold text-slate-600 break-words line-clamp-2 w-20">
                            {(item as any).pickerName || "System Detected"}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                          {item.photoUrl ? (
                            <img 
                              src={item.photoUrl} 
                              alt="sku" 
                              referrerPolicy="no-referrer"
                              onClick={() => onViewImage(item.photoUrl)}
                              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-slate-100 cursor-zoom-in"
                            />
                          ) : (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                               <PackageX className="text-slate-300" size={16} />
                            </div>
                          )}
                          <div>
                            <div className="font-black text-slate-800 text-xs sm:text-sm line-clamp-1">{item.itemName}</div>
                            <div className="text-[10px] font-bold text-slate-400 tracking-wider">SKU: {item.sku}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 sm:p-6">
                        <span className="font-black text-blue-600 text-[10px] sm:text-sm tracking-tight">{item.orderId}</span>
                      </td>
                      <td className="p-4 sm:p-6 text-[10px] sm:text-xs font-bold text-slate-500 uppercase">{item.storeId}</td>
                      <td className="p-4 sm:p-6">
                        <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-md text-[9px] font-black tracking-widest">
                          {item.location || "--"}
                        </span>
                      </td>
                      <td className="p-4 sm:p-6 text-[10px] font-bold text-slate-400 max-w-[150px] truncate">{item.slot}</td>
                      <td className="p-4 sm:p-6">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] sm:text-sm font-black text-slate-800">{item.foundQty}</span>
                          <span className="text-[9px] font-bold text-slate-400">/ {item.quantity}</span>
                        </div>
                      </td>
                      <td className="p-4 sm:p-6 text-center">
                        {(item as any).whatsappSent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded-lg text-[9px] font-black uppercase tracking-widest" title={`Sent${(item as any).whatsappSentAt ? ' at ' + new Date((item as any).whatsappSentAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}`}>
                            <CheckCircle2 size={12} />
                            Sent
                          </span>
                        ) : (item as any).whatsappError ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-500 rounded-lg text-[9px] font-black uppercase tracking-widest" title={(item as any).whatsappError}>
                            <MessageCircle size={12} />
                            Error
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-widest">
                            <MessageCircle size={12} />
                            Pending
                          </span>
                        )}
                      </td>
                      {isAdminOrSuper && (
                        <td className="p-4 sm:p-6 text-right">
                          <button
                            onClick={() => handleSendPush(item)}
                            disabled={pushingId === item.id}
                            title="Send Push Notification"
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center transition-all inline-flex ml-auto",
                              pushingId === item.id 
                                ? "bg-slate-100 text-slate-400" 
                                : "bg-purple-100 text-purple-600 hover:bg-purple-600 hover:text-white"
                            )}
                          >
                            <Bell size={14} className={pushingId === item.id ? "animate-pulse" : ""} />
                          </button>
                        </td>
                      )}
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
