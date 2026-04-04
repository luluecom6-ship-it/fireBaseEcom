/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { 
  Camera, 
  Package, 
  UserCheck, 
  LogOut, 
  ShieldCheck, 
  Clock, 
  ChevronLeft, 
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  TrendingUp,
  Users,
  History,
  LayoutDashboard,
  Store,
  ScanLine
} from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { User, AttendanceRecord, OrderRecord, AdminData, MatrixData, MatrixItem } from "./types";

// --- CONFIGURATION ---
const API_URL = "https://script.google.com/macros/s/AKfycbxq26ohowEP2C4H1Z9CvevqAFiK2oG-viK75f7tGQPN6oucP0V8-rNNL3rRRBq0kMha/exec";

// --- UTILS ---
const fixImageUrl = (url: string) => {
  if (!url) return "";
  if (url.includes("drive.google.com")) {
    const id = url.split("id=")[1] || url.split("/d/")[1]?.split("/")[0];
    if (!id) return url;
    return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return url;
};

const getImages = (url: string): string[] => {
  if (!url) return [];
  return url.split("|||").filter(Boolean);
};

// --- MATRIX CONSTANTS ---
const AGE_BUCKETS = ["0-5Min", "5-10Min", "10-15Min", "15-20Min", "20-25Min", "25-30Min", "30-35Min", "35-40Min", "40-45Min", "45-50Min", "50-55Min", "55-60Min", "60Min+"];
const SLOTS = ["8:00 AM - 9:59 AM", "10:00 AM - 11:59 AM", "12:00 PM - 1:59 PM", "2:00 PM - 3:59 PM", "4:00 PM - 5:59 PM", "6:00 PM - 7:59 PM", "8:00 PM - 9:59 PM", "10:00 PM - 11:59 PM", "12:00 AM - 1:59 AM"];
const STATUSES = ["Created", "Picking with packing", "Picking with unassigned zone", "Parking", "Auditing", "Stored", "Going to Origin", "Transferring", "Going to destination", "In Route", "Delivering"];

// --- COMPONENTS ---

const RealTimeClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-end">
      <span className="text-2xl font-bold tracking-tighter tabular-nums">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
        {time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
    </div>
  );
};

const Loader = ({ loading, message = "Processing Live Data..." }: { loading: boolean; message?: string }) => (
  <AnimatePresence>
    {loading && (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[30000] flex flex-col items-center justify-center bg-white/60 backdrop-blur-md"
      >
        <div className="relative">
          <div className="h-24 w-24 rounded-full border-8 border-slate-100 border-t-blue-600 animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="text-blue-600 animate-pulse" size={32} />
          </div>
        </div>
        <p className="mt-6 text-slate-500 font-black uppercase tracking-[0.3em] text-xs animate-pulse">{message}</p>
      </motion.div>
    )}
  </AnimatePresence>
);

const MatrixTable = ({ title, headers, data, keyField, themeColor, onCellClick }: { title: string, headers: string[], data: MatrixItem[], keyField: keyof MatrixItem, themeColor: string, onCellClick: (stat: string, key: string, orders: MatrixItem[]) => void }) => {
  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden mb-10">
      <div className={cn("p-6 text-white font-black text-lg flex items-center justify-between", themeColor)}>
        {title}
        <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest">{data.length} Orders</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 text-left font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 min-w-[150px]">Status</th>
              {headers.map(h => (
                <th key={h} className="p-4 text-center font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 min-w-[80px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATUSES.map(stat => (
              <tr key={stat} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="p-4 text-left font-black text-slate-700 border-r border-slate-100 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">{stat}</td>
                {headers.map(h => {
                  const matches = data.filter(d => d.status.toLowerCase() === stat.toLowerCase() && d[keyField] === h);
                  const count = matches.length;
                  const hasData = count > 0;
                  const cellBg = hasData ? (themeColor.includes('red') ? 'bg-red-50' : 'bg-emerald-50') : '';
                  const textColor = hasData ? (themeColor.includes('red') ? 'text-red-700' : 'text-emerald-700') : 'text-slate-200';
                  
                  return (
                    <td 
                      key={h} 
                      className={cn("p-4 text-center font-black border-r border-slate-100 transition-all", cellBg, textColor, hasData && "cursor-pointer active:scale-95 hover:brightness-95")}
                      onClick={() => {
                        if (hasData) {
                          onCellClick(stat, h, matches);
                        }
                      }}
                      title={matches.map(m => `${m.orderID} (${m.storeID})`).join('\n')}
                    >
                      {hasData ? count : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function App() {
  // Navigation & Auth
  const [page, setPage] = useState<"login" | "dashboard" | "upload" | "attendance" | "admin" | "search" | "matrix">("login");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // Functional States
  const [orderId, setOrderId] = useState("");
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [attendanceStatus, setAttendanceStatus] = useState<{ inTime: string | null, outTime: string | null }>({ inTime: null, outTime: null });
  const [hoursWorked, setHoursWorked] = useState("00:00");
  const [isShiftComplete, setIsShiftComplete] = useState(false);

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OrderRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Admin States
  const [adminData, setAdminData] = useState<AdminData>({ users: [], attendance: [], orders: [] });
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDailyOrdersModal, setShowDailyOrdersModal] = useState(false);
  const [adminStoreFilter, setAdminStoreFilter] = useState("All");
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);

  const [duplicateOrder, setDuplicateOrder] = useState<OrderRecord | null>(null);
  const [duplicateErrorId, setDuplicateErrorId] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<OrderRecord | null>(null);
  const [maxImages, setMaxImages] = useState(1);
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);
  const [matrixDetail, setMatrixDetail] = useState<{ title: string, stat: string, key: string, orders: MatrixItem[] } | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const startScanner = useCallback(() => {
    setIsScanning(true);
    // We'll use a small delay to ensure the DOM element is ready
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          setOrderId(decodedText);
          scanner.clear();
          setIsScanning(false);
          showToast("Barcode Scanned Successfully", "success");
        },
        (error) => {
          // console.warn(`Code scan error = ${error}`);
        }
      );
    }, 100);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- LOGIC: Attendance Timer ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    
    const calculate = () => {
      if (!attendanceStatus.inTime) {
        setHoursWorked("00:00");
        setIsShiftComplete(false);
        return;
      }

      const startTime = new Date(attendanceStatus.inTime).getTime();
      const endTime = attendanceStatus.outTime 
        ? new Date(attendanceStatus.outTime).getTime() 
        : new Date().getTime();

      const diffMs = endTime - startTime;
      if (diffMs < 0) {
        setHoursWorked("00:00");
        setIsShiftComplete(false);
        return;
      }

      const diffHrs = diffMs / (1000 * 60 * 60);
      const hrs = Math.floor(diffHrs);
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      setHoursWorked(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
      setIsShiftComplete(diffHrs >= 10);
    };

    calculate();

    if (attendanceStatus.inTime && !attendanceStatus.outTime) {
      interval = setInterval(calculate, 60000); // Update every minute
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [attendanceStatus]);

  // --- ACTIONS ---
  const navigateTo = (target: typeof page) => {
    setImagePreviews([]);
    setOrderId("");
    setDuplicateOrder(null);
    setPage(target);
  };

  const fetchStatus = async (empId: string) => {
    try {
      const res = await fetch(`${API_URL}?action=getTodayAttendance&empId=${empId}`);
      const data: AttendanceRecord[] = await res.json();
      
      if (data.length === 0) {
        setAttendanceStatus({ inTime: null, outTime: null });
        return;
      }

      // Sort by timestamp descending to get latest first
      const sorted = [...data].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const latestIn = sorted.find(r => r.type === "In");
      if (!latestIn) {
        setAttendanceStatus({ inTime: null, outTime: null });
        return;
      }

      // Find if there's an "Out" that happened AFTER the latest "In"
      const latestOut = sorted.find(r => 
        r.type === "Out" && 
        new Date(r.timestamp).getTime() > new Date(latestIn.timestamp).getTime()
      );

      setAttendanceStatus({ 
        inTime: latestIn.timestamp,
        outTime: latestOut ? latestOut.timestamp : null
      });
    } catch (e) { 
      console.error(e); 
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear Session
    localStorage.removeItem("lulu_user");
    localStorage.removeItem("lulu_login_time");

    // Navigation & Auth
    setUser(null);
    setPage("login");
    setLoading(false);

    // Functional States
    setOrderId("");
    setImagePreviews([]);
    setAttendanceStatus({ inTime: null, outTime: null });
    setHoursWorked("00:00");
    setIsShiftComplete(false);

    // Search States
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);

    // Admin States
    setAdminData({ users: [], attendance: [], orders: [] });
    setFilterDate(new Date().toISOString().split("T")[0]);
    setSelectedUser(null);
    setShowDailyOrdersModal(false);
    setAdminStoreFilter("All");
    setFullImage(null);
    setImageScale(1);

    setDuplicateOrder(null);
    setSuccessOrder(null);
  };

  // --- LOGIC: Session Persistence ---
  useEffect(() => {
    const savedUser = localStorage.getItem("lulu_user");
    const loginTime = localStorage.getItem("lulu_login_time");

    if (savedUser && loginTime) {
      const now = new Date().getTime();
      const loginTimestamp = parseInt(loginTime);
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (now - loginTimestamp > twentyFourHours) {
        handleLogout();
      } else {
        const u = JSON.parse(savedUser);
        setUser(u);
        fetchStatus(u.empId);
        setPage("dashboard");
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const u = formData.get("username");
    const p = formData.get("password");

    try {
      const res = await fetch(`${API_URL}?action=login&username=${encodeURIComponent(String(u))}&password=${encodeURIComponent(String(p))}`);
      const data = await res.json();
      if (data.status === "success") {
        setUser(data);
        localStorage.setItem("lulu_user", JSON.stringify(data));
        localStorage.setItem("lulu_login_time", new Date().getTime().toString());
        await fetchStatus(data.empId);
        setPage("dashboard");
      } else {
        alert("Invalid Credentials");
      }
    } catch (err) {
      alert("Connection Error. Please check your internet.");
    } finally {
      setLoading(false);
    }
  };

  const compressImage = (base64: string, maxWidth = 800, quality = 0.5): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Use white background for JPEGs to avoid black transparency
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(base64);
        }
      };
      img.onerror = () => resolve(base64);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (page === "upload" && imagePreviews.length >= maxImages) {
      alert(`Maximum ${maxImages} image(s) allowed. Please remove an image first or increase the limit in Admin settings.`);
      return;
    }
    
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = ev.target?.result as string;
      try {
        const compressed = await compressImage(result);
        if (page === "attendance") {
          setImagePreviews([compressed]);
        } else {
          setImagePreviews(prev => [...prev, compressed]);
        }
      } catch (err) {
        console.error("Compression failed", err);
        if (page === "attendance") {
          setImagePreviews([result]);
        } else {
          setImagePreviews(prev => [...prev, result]);
        }
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => setLoading(false);
    reader.readAsDataURL(file);
  };

  const validateOrderId = (id: string) => {
    // Valid formats: 319917802565, Lulu-319917802565INP1, 319917802565INP1
    const regex = /^(Lulu-)?\d{12}(INP1)?$/i;
    return regex.test(id.trim());
  };

  const submitOrder = async () => {
    if (!orderId || imagePreviews.length === 0 || !user) {
      console.error("Submission blocked: Missing data", { orderId, imageCount: imagePreviews.length, user: !!user });
      return alert("Missing ID or Image");
    }
    
    if (!validateOrderId(orderId)) {
      return alert("Invalid Order ID format. Please use correct format (e.g., 319917802565, Lulu-319917802565INP1, or 319917802565INP1)");
    }

    if (!navigator.onLine) {
      return alert("No internet connection. Please check your network and try again.");
    }

    setLoading(true);
    setDuplicateOrder(null);
    setDuplicateErrorId(null);
    
    try {
      console.log("Starting upload for Order:", orderId);
      
      const params = new URLSearchParams();
      params.append("action", "uploadOrder");
      params.append("orderId", orderId.trim());
      params.append("storeId", user.storeId);
      params.append("pickerName", user.name);
      params.append("uploadedBy", user.name);
      params.append("image", imagePreviews.join("|||"));

      console.log("Payload size:", params.toString().length, "chars");

      // We use a simple fetch without explicit headers to let the browser
      // handle the Content-Type and avoid CORS preflight issues.
      const res = await fetch(API_URL, {
        method: "POST",
        body: params,
        mode: 'cors',
        redirect: 'follow'
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const text = await res.text();
      console.log("Server response received:", text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.warn("Response is not JSON, attempting to infer status from text");
        if (text.toLowerCase().includes("error") || text.toLowerCase().includes("failed")) {
          throw new Error(text);
        }
        data = { status: "success" };
      }

      if (data.status === "duplicate") {
        const existing = data.existing || {};
        const dupObj = {
          orderId: String(existing.orderId || orderId.trim()),
          storeId: String(existing.storeId || "Unknown"),
          pickerName: String(existing.picker || existing.pickerName || existing.picker_name || "Unknown"),
          uploadedBy: String(existing.uploadedBy || existing.uploaded_by || "Unknown"),
          imageUrl: String(existing.imageUrl || existing.image || existing.image_url || ""),
          timestamp: String(existing.timestamp || new Date().toISOString())
        };
        setDuplicateOrder(dupObj);
        setDuplicateErrorId(orderId.trim());
      } else if (data.status === "success" || data.status === "ok") {
        console.log("Upload successful");
        setSuccessOrder({
          orderId: orderId.trim(),
          storeId: user.storeId,
          pickerName: user.name,
          uploadedBy: user.name,
          imageUrl: imagePreviews.join("|||"),
          imageUrls: imagePreviews,
          timestamp: new Date().toISOString()
        });
        setOrderId("");
        setImagePreviews([]);
      } else {
        throw new Error(data.message || data.error || "Server returned an error status");
      }
    } catch (e) { 
      console.error("Upload error:", e);
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      
      if (errorMessage.includes("Failed to fetch")) {
        alert("Upload failed: Connection Error. This is usually caused by network restrictions or a large payload. I've optimized the image size, but if this persists, try uploading one image at a time.");
      } else {
        alert(`Upload failed: ${errorMessage}`); 
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDive = async (order: OrderRecord) => {
    setSearchQuery(order.orderId);
    setDuplicateOrder(null);
    setSuccessOrder(null);
    navigateTo("search");
    
    // Trigger search
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`${API_URL}?action=getAdminData`);
      const data: AdminData = await res.json();
      const query = order.orderId.toLowerCase();
      let filtered = data.orders.filter(o => String(o.orderId).toLowerCase().includes(query));
      
      // Driver RBAC: Only see own uploads
      if (user?.role === "driver") {
        filtered = filtered.filter(o => o.uploadedBy === user.name);
      }
      
      setSearchResults(filtered);
    } catch (e) {
      console.error("Deep dive search error:", e);
    } finally {
      setIsSearching(false);
    }
  };
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      // Fetch fresh data for search
      const res = await fetch(`${API_URL}?action=getAdminData`);
      const data: AdminData = await res.json();
      
      const query = searchQuery.trim().toLowerCase();
      
      // Flexible search: check if query is contained in orderId
      let filtered = data.orders.filter(order => {
        const orderId = String(order.orderId).toLowerCase();
        return orderId.includes(query);
      });

      // Driver RBAC: Only see own uploads
      if (user?.role === "driver") {
        filtered = filtered.filter(o => o.uploadedBy === user.name);
      }
      
      setSearchResults(filtered);
    } catch (e) {
      console.error("Search error:", e);
      alert("Search failed. Please ensure you have a stable connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const submitAttendance = async () => {
    if (!user || imagePreviews.length === 0) return;
    setLoading(true);
    const type = (attendanceStatus.inTime && !attendanceStatus.outTime) ? "Out" : "In";
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          action: "attendance",
          empId: user.empId,
          name: user.name,
          storeId: user.storeId,
          type,
          image: imagePreviews[0]
        })
      });
      await fetchStatus(user.empId);
      navigateTo("dashboard");
    } catch (e) { 
      alert("Punch failed"); 
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?action=getAdminData`);
      const data = await res.json();
      setAdminData(data);
    } catch (e) { 
      alert("Admin sync failed"); 
    } finally {
      setLoading(false);
    }
  };

  const fetchMatrixData = async () => {
    console.log("--- Matrix Sync Started ---");
    setIsMatrixLoading(true);
    try {
      // Use robust URL construction to prevent "Invalid Action" errors
      const baseUrl = API_URL.trim();
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('action', 'getMatrixData');
      // Add a cache-buster to ensure we get fresh data
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const finalUrl = urlObj.toString();
      console.log("Fetching from robust URL:", finalUrl);
      
      const res = await fetch(finalUrl);
      const text = await res.text();
      console.log("Raw Response from Server:", text);

      // Check if the response is actually JSON before parsing
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const data = JSON.parse(text);
        if (data.status === "success") {
          console.log("Matrix Data Parsed Successfully:", data.data);
          setMatrixData(data.data);
        } else {
          console.error("Server returned error status:", data);
        }
      } else {
        // This handles the "Invalid Action" plain text response
        console.error("Server returned non-JSON response. This usually means the 'getMatrixData' action is not recognized or not deployed in your Apps Script.");
        console.log("Server Message:", text);
      }
    } catch (e) {
      console.error("Matrix sync failed with exception:", e);
    } finally {
      setIsMatrixLoading(false);
      console.log("--- Matrix Sync Finished ---");
    }
  };

  const handleResetAttendance = async (empId: string) => {
    if (!window.confirm("Are you sure you want to reset today's attendance for this user? This will remove both In and Out records for today.")) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?action=resetAttendance&empId=${empId}&date=${filterDate}`);
      const data = await res.json();
      if (data.status === "success") {
        alert("Attendance Reset Successfully");
        await fetchAdminData();
        setSelectedUser(null);
      } else {
        alert("Reset failed: " + (data.message || "Unknown error"));
      }
    } catch (e) {
      alert("Connection Error");
    } finally {
      setLoading(false);
    }
  };

  const Header = ({ title, showBack }: { title: string; showBack?: boolean }) => (
    <div className="sticky top-0 z-40 flex items-center justify-between bg-blue-900 p-4 text-white shadow-lg backdrop-blur-md bg-opacity-90">
      <div className="flex items-center gap-3">
        {showBack && (
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => navigateTo("dashboard")} 
            className="p-2 hover:bg-blue-800 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </motion.button>
        )}
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>
      <div className="flex flex-col items-end">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Station</div>
        <div className="text-sm font-bold">{user?.storeId || "N/A"}</div>
      </div>
    </div>
  );

  // --- PAGES ---

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100">
      <Loader loading={loading} />
      
      <AnimatePresence mode="wait">
        {page === "login" && (
          <motion.div 
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex min-h-screen items-center justify-center p-6"
          >
            <div className="w-full max-w-md rounded-[2.5rem] bg-white p-10 shadow-2xl border border-slate-100">
              <div className="mb-10 text-center">
                <motion.div 
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-2xl shadow-blue-200"
                >
                  <Package size={40} />
                </motion.div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Warehouse Pro</h2>
                <p className="text-slate-500 font-medium mt-2">Enterprise Logistics Management</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-4">Username</label>
                  <input 
                    name="username" 
                    required 
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium" 
                    placeholder="Enter your ID" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-4">Password</label>
                  <input 
                    name="password" 
                    type="password" 
                    required 
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium" 
                    placeholder="••••••••" 
                  />
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit" 
                  className="w-full rounded-2xl bg-blue-600 p-5 font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 mt-4 flex items-center justify-center gap-2"
                >
                  Access System <ArrowRight size={20} />
                </motion.button>
              </form>
              <p className="mt-8 text-center text-xs text-slate-400 font-medium">
                Authorized Personnel Only • v2.4.0
              </p>
            </div>
          </motion.div>
        )}

        {page === "dashboard" && user && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pb-24"
          >
            <div className="bg-blue-900 pb-28 pt-10 px-8 text-white rounded-b-[3rem] shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-800 rounded-full -mr-32 -mt-32 opacity-20 blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-600 rounded-full -ml-24 -mb-24 opacity-20 blur-3xl"></div>
              
              <div className="flex items-start justify-between mb-10 relative z-10">
                <div>
                  <h2 className="text-3xl font-black tracking-tight">Hello, {user.name.split(' ')[0]} 👋</h2>
                  <p className="text-blue-200 font-bold text-sm mt-1 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-800 rounded-md text-[10px] uppercase tracking-widest">{user.role}</span>
                    {user.empId}
                  </p>
                </div>
                <RealTimeClock />
              </div>

              {/* Attendance Card */}
              <motion.div 
                layout
                className="bg-white rounded-[2rem] p-8 text-slate-800 shadow-2xl border border-blue-100 relative z-10"
              >
                {!attendanceStatus.inTime ? (
                  <div className="text-center py-4">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Clock size={32} />
                    </div>
                    <p className="text-slate-500 mb-6 font-bold">You haven't started your shift today</p>
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => navigateTo("attendance")} 
                      className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 p-5 font-black text-white shadow-xl shadow-emerald-200 text-lg"
                    >
                      <Clock size={24} /> Punch In Now
                    </motion.button>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black mb-1">Shift Duration</p>
                        <h3 className={cn(
                          "text-5xl font-black tracking-tighter tabular-nums transition-colors duration-500",
                          isShiftComplete ? "text-emerald-600" : "text-blue-900"
                        )}>
                          {hoursWorked}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">Login Time</p>
                        <p className="font-mono font-black text-slate-700 text-lg">
                          {new Date(attendanceStatus.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="space-y-2 mb-8">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">Shift Progress</span>
                        <span className={cn(
                          "transition-colors duration-500",
                          isShiftComplete ? "text-emerald-600" : "text-blue-500"
                        )}>
                          {isShiftComplete ? "Target Met" : "In Progress"}
                        </span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 shadow-inner">
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
                      <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200 text-center text-slate-500 font-black uppercase tracking-widest text-sm">
                          Shift Ended at {new Date(attendanceStatus.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => navigateTo("attendance")} 
                          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-600 p-5 font-black text-white shadow-xl shadow-indigo-200 text-lg"
                        >
                          <Clock size={24} /> Start New Shift
                        </motion.button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (!isShiftComplete) {
                              if (!window.confirm("Inform Supervisor for early departure. Do you want to continue?")) return;
                            }
                            navigateTo("attendance");
                          }}
                          className={cn(
                            "flex w-full items-center justify-center gap-3 rounded-2xl p-5 font-black text-white transition-all shadow-2xl text-lg",
                            isShiftComplete ? "bg-blue-600 shadow-blue-200" : "bg-amber-500 shadow-amber-200"
                          )}
                        >
                          <LogOut size={24} /> {isShiftComplete ? "Attendance & Logout" : "Early Logout Request"}
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

              {/* Main Actions */}
            <div className="px-8 -mt-14 space-y-5 relative z-20">
              <motion.div 
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigateTo("upload")}
                className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex items-center gap-6 cursor-pointer group"
              >
                <div className="h-20 w-20 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                  <Package size={36} />
                </div>
                <div className="flex-1">
                  <h4 className="font-black text-slate-800 text-xl tracking-tight">Upload Order</h4>
                  <p className="text-slate-500 text-sm font-bold mt-1">Scan ID & capture receipt</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                  <ArrowRight size={20} />
                </div>
              </motion.div>

              <motion.div 
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setSearchQuery(""); setSearchResults([]); navigateTo("search"); }}
                className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex items-center gap-6 cursor-pointer group"
              >
                <div className="h-20 w-20 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                  <Search size={36} />
                </div>
                <div className="flex-1">
                  <h4 className="font-black text-slate-800 text-xl tracking-tight">Search Orders</h4>
                  <p className="text-slate-500 text-sm font-bold mt-1">Find order details & images</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all">
                  <ArrowRight size={20} />
                </div>
              </motion.div>

              {(user.role === "admin" || user.role === "supervisor") && (
                <motion.div 
                  whileHover={{ y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => { await fetchAdminData(); navigateTo("admin"); }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex items-center gap-6 cursor-pointer group"
                >
                  <div className="h-20 w-20 rounded-3xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
                    <ShieldCheck size={36} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-slate-800 text-xl tracking-tight">Admin Control</h4>
                    <p className="text-slate-500 text-sm font-bold mt-1">Live logs & staff metrics</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-purple-50 group-hover:text-purple-600 transition-all">
                    <ArrowRight size={20} />
                  </div>
                </motion.div>
              )}

              {user.role !== "driver" && (
                <motion.div 
                  whileHover={{ y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => { await fetchMatrixData(); navigateTo("matrix"); }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex items-center gap-6 cursor-pointer group"
                >
                  <div className="h-20 w-20 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all duration-300">
                    <LayoutDashboard size={36} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-slate-800 text-xl tracking-tight">Matrix Dashboard</h4>
                    <p className="text-slate-500 text-sm font-bold mt-1">Live order matrix & ageing</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-amber-50 group-hover:text-amber-600 transition-all">
                    <ArrowRight size={20} />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Logout Bottom */}
            <div className="px-8 mt-12">
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-3 text-slate-400 font-black py-6 hover:text-red-500 transition-colors uppercase tracking-widest text-xs"
              >
                <LogOut size={20} /> Terminate Session
              </motion.button>
            </div>
          </motion.div>
        )}

        {(page === "upload" || page === "attendance") && (
          <motion.div 
            key="action"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="min-h-screen bg-slate-50/50 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]"
          >
            <Header 
              title={
                page === "upload" 
                  ? "Order Processing" 
                  : (attendanceStatus.inTime && !attendanceStatus.outTime ? "Punch Out Verification" : "Punch In Verification")
              } 
              showBack 
            />
            <div className="p-8 max-w-2xl mx-auto">
              <div className="mb-10 space-y-8">
                {page === "upload" && (
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Order Identifier</label>
                    <div className="relative group">
                      <Search className="absolute left-5 top-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={24} />
                      <input 
                        value={orderId}
                        onChange={(e) => {
                          setOrderId(e.target.value);
                          if (duplicateErrorId && e.target.value.trim() !== duplicateErrorId) {
                            setDuplicateErrorId(null);
                          }
                        }}
                        className={cn(
                          "w-full rounded-[1.5rem] border-2 p-5 pl-14 pr-16 outline-none transition-all font-black text-lg tracking-tight",
                          duplicateErrorId === orderId.trim() 
                            ? "border-red-500 bg-red-50 focus:border-red-600" 
                            : (orderId ? (validateOrderId(orderId) ? "border-emerald-200 bg-emerald-50/30 focus:border-emerald-500" : "border-red-200 bg-red-50/30 focus:border-red-500") : "border-slate-100 bg-slate-50 focus:border-blue-500 focus:bg-white")
                        )}
                        placeholder="Scan or type Order ID"
                      />
                      <button 
                        onClick={startScanner}
                        className="absolute right-4 top-4 h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
                      >
                        <ScanLine size={20} />
                      </button>
                    </div>

                    {isScanning && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[2rem] border-2 border-slate-100 overflow-hidden shadow-xl"
                      >
                        <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ScanLine size={18} className="animate-pulse" />
                            <span className="text-xs font-black uppercase tracking-widest">Scanner Active</span>
                          </div>
                          <button 
                            onClick={() => setIsScanning(false)}
                            className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                          >
                            <X size={18} />
                          </button>
                        </div>
                        <div id="reader" className="w-full"></div>
                        <div className="p-4 bg-slate-50 text-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Point camera at the barcode</p>
                        </div>
                      </motion.div>
                    )}
                    {duplicateErrorId === orderId.trim() && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <AlertCircle className="text-red-500" size={20} />
                          <p className="text-xs font-black text-red-700 uppercase tracking-widest">Duplicate ID Found</p>
                        </div>
                        <button 
                          onClick={() => duplicateOrder && handleDeepDive(duplicateOrder)}
                          className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg shadow-sm border border-blue-100"
                        >
                          View Details
                        </button>
                      </motion.div>
                    )}
                    {orderId && !validateOrderId(orderId) && (
                      <motion.p 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[10px] text-red-500 font-bold uppercase tracking-widest ml-4"
                      >
                        ❌ Invalid Format. Use: 319917802565, Lulu-319917802565INP1, or 319917802565INP1
                      </motion.p>
                    )}
                    {orderId && validateOrderId(orderId) && (
                      <motion.p 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest ml-4"
                      >
                        ✅ Correct Format
                      </motion.p>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 ml-2">
                    {page === "upload" ? "Visual Evidence" : "Biometric Selfie"}
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {imagePreviews.map((img, index) => (
                      <motion.div 
                        key={index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative overflow-hidden rounded-[2rem] border-4 border-slate-50 shadow-lg group aspect-video"
                      >
                        <img src={img} className="w-full h-full object-cover" alt={`Preview ${index + 1}`} />
                        <button 
                          onClick={() => setImagePreviews(prev => prev.filter((_, i) => i !== index))}
                          className="absolute top-3 right-3 h-10 w-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-90 z-10"
                        >
                          <X size={20} />
                        </button>
                        <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-[10px] font-black text-white uppercase tracking-widest">
                          Image {index + 1}
                        </div>
                      </motion.div>
                    ))}

                    {(page === "attendance" ? imagePreviews.length === 0 : imagePreviews.length < maxImages) && (
                      <motion.label 
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className={cn(
                          "flex flex-col items-center justify-center rounded-[2rem] border-4 border-dashed border-slate-100 bg-slate-50 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all group aspect-video",
                          imagePreviews.length > 0 ? "h-full" : "w-full"
                        )}
                      >
                        <div className="h-16 w-16 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-all mb-3">
                          <Camera size={32} />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-slate-500 font-black text-[10px] uppercase tracking-widest">
                            {imagePreviews.length > 0 ? "Add Another" : "Initialize Camera"}
                          </span>
                          {page === "upload" && (
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                              {imagePreviews.length} / {maxImages} Images
                            </span>
                          )}
                        </div>
                        <input type="file" accept="image/*" capture={page === "attendance" ? "user" : "environment"} onChange={handleFileUpload} className="hidden" />
                      </motion.label>
                    )}
                  </div>
                </div>
              </div>

              <motion.button 
                id="finalize-order-button"
                whileTap={{ scale: 0.95 }}
                disabled={loading || imagePreviews.length === 0 || (page === "upload" && !orderId)}
                onClick={page === "upload" ? submitOrder : submitAttendance}
                className={cn(
                  "w-full rounded-[1.5rem] p-6 font-black text-white shadow-2xl transition-all text-xl flex items-center justify-center gap-3",
                  (imagePreviews.length === 0 || (page === "upload" && !orderId)) 
                    ? "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed" 
                    : "bg-blue-600 shadow-blue-200 hover:bg-blue-700 active:bg-blue-800 ring-4 ring-blue-500/10"
                )}
              >
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" size={24} />
                    Processing...
                  </>
                ) : (
                  <>
                    {page === "upload" 
                      ? "Finalize Order" 
                      : (attendanceStatus.inTime && !attendanceStatus.outTime ? "Confirm Punch Out" : "Confirm Punch In")
                    }
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {page === "search" && (
          <motion.div 
            key="search"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="min-h-screen bg-slate-50 pb-10"
          >
            <Header title="Order Search" showBack />
            <div className="p-6 max-w-2xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Search Order ID</label>
                <div className="flex gap-3">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-5 top-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={24} />
                    <input 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full rounded-[1.5rem] border-2 border-slate-100 bg-slate-50 p-5 pl-14 pr-14 outline-none focus:border-blue-500 focus:bg-white transition-all font-black text-lg tracking-tight"
                      placeholder="Enter Order ID..."
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                        className="absolute right-5 top-5 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={24} />
                      </button>
                    )}
                  </div>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="bg-blue-600 text-white px-6 rounded-[1.5rem] font-black shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    {isSearching ? <RefreshCw className="animate-spin" /> : "Search"}
                  </motion.button>
                </div>
              </div>

              <div className="space-y-4">
                {searchResults.length > 0 ? (
                  searchResults.map((order, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-white rounded-[2rem] overflow-hidden shadow-lg border border-slate-100"
                    >
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                          {getImages(order.imageUrl).map((img, idx) => (
                            <div 
                              key={idx} 
                              className={cn(
                                "relative group overflow-hidden rounded-xl bg-slate-100",
                                getImages(order.imageUrl).length === 1 ? "col-span-2 aspect-video" : "aspect-square"
                              )}
                            >
                              <img 
                                src={fixImageUrl(img)} 
                                className="w-full h-full object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-110" 
                                alt={`Order ${idx + 1}`} 
                                onClick={() => { setFullImage(fixImageUrl(img)); setImageScale(1); }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none">
                                <Search className="text-white" size={20} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-6 pt-0 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</p>
                            <h4 className="text-xl font-black text-slate-800 tracking-tight">{order.orderId}</h4>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Store</p>
                            <p className="font-bold text-blue-600">{order.storeId}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User Name</p>
                            <p className="font-bold text-slate-700">{order.pickerName || order.uploadedBy || "Unknown"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Timestamp</p>
                            <p className="font-bold text-slate-700">{new Date(order.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : searchQuery && !isSearching && (
                  <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                      <Search size={32} />
                    </div>
                    <p className="text-slate-400 font-bold">No orders found for this ID</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {page === "matrix" && (
          <motion.div 
            key="matrix"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="min-h-screen bg-slate-50/50"
          >
            <Header title="Matrix Intelligence" showBack />
            <div className="p-8 max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Live Order Matrix</h2>
                  <p className="text-slate-500 font-bold mt-1">Real-time ageing & store-wise distribution</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <Clock size={20} className="text-blue-600" />
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Updated</p>
                      <p className="text-sm font-black text-slate-700">{matrixData?.timestamp ? new Date(matrixData.timestamp).toLocaleTimeString() : 'Never'}</p>
                    </div>
                  </div>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={fetchMatrixData}
                    disabled={isMatrixLoading}
                    className="h-14 w-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all disabled:bg-slate-300"
                  >
                    <RefreshCw size={24} className={cn(isMatrixLoading && "animate-spin")} />
                  </motion.button>
                </div>
              </div>

              {!matrixData && !isMatrixLoading ? (
                <div className="bg-white p-20 rounded-[3rem] shadow-xl border border-slate-100 text-center">
                  <div className="h-24 w-24 rounded-[2rem] bg-slate-50 text-slate-200 flex items-center justify-center mx-auto mb-6">
                    <LayoutDashboard size={48} />
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">No Matrix Data Available</h3>
                  <p className="text-slate-400 font-bold mt-2 max-w-md mx-auto">Run the bookmarklet on the source system to sync live data to this dashboard.</p>
                  <button 
                    onClick={fetchMatrixData}
                    className="mt-8 px-8 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all"
                  >
                    Try Refreshing
                  </button>
                </div>
              ) : isMatrixLoading && !matrixData ? (
                <div className="flex flex-col items-center justify-center py-40">
                  <div className="h-16 w-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Synchronizing Matrix...</p>
                </div>
              ) : (
                <div className="space-y-12">
                  {/* Quick Commerce Section */}
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-10 w-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-100">
                        <TrendingUp size={20} />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Quick Commerce</h3>
                    </div>
                    
                    <MatrixTable 
                      title="Hourly Ageing View" 
                      headers={AGE_BUCKETS} 
                      data={matrixData?.quick || []} 
                      keyField="bucket" 
                      themeColor="bg-red-600" 
                      onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Quick Commerce Ageing', stat, key, orders })}
                    />
                    
                    <MatrixTable 
                      title="Store Distribution View" 
                      headers={([...new Set(matrixData?.quick.map(d => d.storeID) || [])] as string[]).sort()} 
                      data={matrixData?.quick || []} 
                      keyField="storeID" 
                      themeColor="bg-red-500" 
                      onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Quick Commerce Store', stat, key, orders })}
                    />
                  </div>

                  {/* Schedule Section */}
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                        <Clock size={20} />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Schedule Commerce</h3>
                    </div>
                    
                    <MatrixTable 
                      title="Delivery Slot View" 
                      headers={SLOTS} 
                      data={matrixData?.schedule || []} 
                      keyField="slot" 
                      themeColor="bg-emerald-600" 
                      onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Schedule Commerce Slot', stat, key, orders })}
                    />
                    
                    <MatrixTable 
                      title="Store Distribution View" 
                      headers={([...new Set(matrixData?.schedule.map(d => d.storeID) || [])] as string[]).sort()} 
                      data={matrixData?.schedule || []} 
                      keyField="storeID" 
                      themeColor="bg-emerald-500" 
                      onCellClick={(stat, key, orders) => setMatrixDetail({ title: 'Schedule Commerce Store', stat, key, orders })}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {page === "admin" && (user.role === "admin" || user.role === "supervisor") && (
          <motion.div 
            key="admin"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen bg-slate-50 pb-20"
          >
            <Header title="Admin Intelligence" showBack />
            
            <div className="p-6 max-w-4xl mx-auto space-y-6">
              {/* Controls Row */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="text-blue-600" size={20} />
                    <input 
                      type="date" 
                      value={filterDate} 
                      onChange={(e) => setFilterDate(e.target.value)} 
                      className="font-black text-slate-700 outline-none bg-transparent"
                    />
                  </div>
                  <motion.button 
                    whileTap={{ rotate: 180 }}
                    onClick={fetchAdminData}
                    className="p-2 hover:bg-slate-50 rounded-full text-blue-600"
                  >
                    <RefreshCw size={20} />
                  </motion.button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { id: "orders", label: "Daily Orders", val: adminData.orders.filter(o => o.timestamp.includes(filterDate)).length, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
                  { id: "active", label: "Active Staff", val: adminData.attendance.filter(a => a.type === "In" && a.timestamp.includes(filterDate)).length, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { id: "total", label: "Total Staff", val: adminData.users.length, icon: UserCheck, color: "text-purple-600", bg: "bg-purple-50" },
                  { id: "efficiency", label: "Efficiency", val: "94%", icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
                ].map((m, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => m.id === "orders" && setShowDailyOrdersModal(true)}
                    className={cn(
                      "bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100",
                      m.id === "orders" && "cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
                    )}
                  >
                    <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center mb-4", m.bg, m.color)}>
                      <m.icon size={24} />
                    </div>
                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{m.label}</p>
                    <p className="text-3xl font-black text-slate-800 tracking-tighter mt-1">{m.val}</p>
                  </motion.div>
                ))}
              </div>

              {/* System Settings */}
              {user.role === "admin" && (
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-black text-slate-800 flex items-center gap-3">
                      <ShieldCheck size={20} className="text-blue-600" />
                      System Configuration
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Images Per Order</p>
                          <p className="text-xs font-bold text-slate-600 mt-1">Currently set to {maxImages} {maxImages === 1 ? 'image' : 'images'}</p>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black">
                          {maxImages}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map(num => (
                          <button
                            key={num}
                            onClick={() => setMaxImages(num)}
                            className={cn(
                              "flex-1 py-2 rounded-xl font-black text-xs transition-all",
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
                  </div>
                </div>
              )}

              {/* Staff Table */}
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="font-black text-slate-800 flex items-center gap-3">
                    <Users size={20} className="text-blue-600" />
                    Operational Staff
                  </h4>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest">Live Status</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {adminData.users.map((u, i) => {
                    const inRecord = adminData.attendance.find(a => a.empId === u.empId && a.type === "In" && a.timestamp.includes(filterDate));
                    const outRecord = [...adminData.attendance].reverse().find(a => a.empId === u.empId && a.type === "Out" && a.timestamp.includes(filterDate));
                    
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

                    const formatTime = (ts: string) => new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

                    return (
                      <motion.div 
                        key={u.empId} 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => setSelectedUser(u)} 
                        className="p-6 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black">
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 tracking-tight">{u.name}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">{u.storeId} • {u.empId}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 sm:gap-8">
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Login</p>
                              <p className="text-[10px] font-bold text-slate-700 leading-none mt-1">{inRecord ? formatTime(inRecord.timestamp) : "--:--"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Logout</p>
                              <p className="text-[10px] font-bold text-slate-700 leading-none mt-1">{outRecord ? formatTime(outRecord.timestamp) : "--:--"}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end min-w-[60px] border-l border-slate-100 pl-4">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                            <p className={cn(
                              "text-xs font-black tracking-tight mt-1 leading-none",
                              outRecord ? "text-blue-600" : (inRecord ? "text-emerald-600" : "text-slate-300")
                            )}>{duration}</p>
                            {inRecord && !outRecord && isToday && (
                              <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest animate-pulse mt-1">Active</span>
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6"
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-md rounded-[3rem] bg-white p-8 shadow-2xl relative"
                  >
                    <button onClick={() => setSelectedUser(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <X size={24} />
                    </button>
                    
                    <div className="mb-8">
                      <h3 className="text-2xl font-black tracking-tight">{selectedUser.name}</h3>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Staff Profile Details</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-8">
                      {["In", "Out"].map(type => {
                        const record = adminData.attendance.find(a => a.empId === selectedUser.empId && a.type === type && a.timestamp.includes(filterDate));
                        return (
                          <div key={type} className="space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">{type} Verification</p>
                            {record ? (
                              <motion.div 
                                whileHover={{ scale: 1.05 }}
                                onClick={() => setFullImage(fixImageUrl(record.imageUrl))}
                                className="relative aspect-square overflow-hidden rounded-3xl border-4 border-slate-50 shadow-lg cursor-zoom-in"
                              >
                                <img src={fixImageUrl(record.imageUrl)} className="w-full h-full object-cover" alt={type} />
                                <div className="absolute bottom-0 inset-x-0 bg-black/50 p-2 text-[10px] text-white font-black text-center backdrop-blur-sm">
                                  {new Date(record.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                </div>
                              </motion.div>
                            ) : (
                              <div className="aspect-square flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 text-slate-300">
                                <AlertCircle size={24} className="mb-2" />
                                <span className="text-[10px] font-black uppercase tracking-widest">No Log</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-4">
                      {(() => {
                        const inRec = adminData.attendance.find(a => a.empId === selectedUser.empId && a.type === "In" && a.timestamp.includes(filterDate));
                        const outRec = [...adminData.attendance].reverse().find(a => a.empId === selectedUser.empId && a.type === "Out" && a.timestamp.includes(filterDate));
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
                          <div className="p-4 bg-blue-50 rounded-2xl flex items-center justify-between border border-blue-100">
                            <div className="flex items-center gap-3">
                              <Clock className="text-blue-600" size={18} />
                              <span className="text-[10px] font-black uppercase tracking-widest text-blue-900">Work Duration</span>
                            </div>
                            <span className="font-black text-blue-700">{dur}</span>
                          </div>
                        );
                      })()}

                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Orders Today</span>
                        <span className="font-black text-blue-600">{adminData.orders.filter(o => o.pickerName === selectedUser.name && o.timestamp.includes(filterDate)).length}</span>
                      </div>

                      {adminData.attendance.some(a => a.empId === selectedUser.empId && a.timestamp.includes(filterDate)) && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleResetAttendance(selectedUser.empId)}
                          className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100"
                        >
                          <RefreshCw size={16} /> Reset Today's Attendance
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {showDailyOrdersModal && (
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
                    className="w-full max-w-2xl h-[80vh] rounded-[3rem] bg-white flex flex-col shadow-2xl relative overflow-hidden"
                  >
                    <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">Daily Orders</h3>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">
                          {new Date(filterDate).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <select 
                          value={adminStoreFilter}
                          onChange={(e) => setAdminStoreFilter(e.target.value)}
                          className="bg-slate-50 border-none rounded-xl px-4 py-2 font-black text-xs uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="All">All Stores</option>
                          {Array.from(new Set(adminData.orders.map(o => String(o.storeId)))).sort().map(store => (
                            <option key={store} value={store}>{store}</option>
                          ))}
                        </select>
                        <button onClick={() => setShowDailyOrdersModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                          <X size={24} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-4">
                      {adminData.orders
                        .filter(o => o.timestamp.includes(filterDate))
                        .filter(o => adminStoreFilter === "All" || String(o.storeId) === adminStoreFilter)
                        .length > 0 ? (
                        adminData.orders
                          .filter(o => o.timestamp.includes(filterDate))
                          .filter(o => adminStoreFilter === "All" || String(o.storeId) === adminStoreFilter)
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map((order, i) => (
                            <motion.div 
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="bg-slate-50 rounded-2xl p-4 flex items-center gap-4 border border-slate-100"
                            >
                              <div className="flex gap-2 overflow-x-auto pb-1 max-w-[150px] scrollbar-hide">
                                {getImages(order.imageUrl).map((img, idx) => (
                                  <div 
                                    key={idx}
                                    onClick={() => setFullImage(fixImageUrl(img))}
                                    className="h-12 w-12 rounded-lg overflow-hidden cursor-zoom-in flex-shrink-0 border border-white shadow-sm bg-slate-100"
                                  >
                                    <img src={fixImageUrl(img)} className="w-full h-full object-cover" alt="Order" />
                                  </div>
                                ))}
                                {getImages(order.imageUrl).length === 0 && (
                                  <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                                    <Package size={20} />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                  <p className="font-black text-slate-800 truncate tracking-tight">{order.orderId}</p>
                                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-widest">{order.storeId}</span>
                                </div>
                                <div className="mt-1 flex flex-col gap-0.5">
                                  <p className="text-xs text-slate-600 font-bold flex items-center gap-1">
                                    <UserCheck size={12} className="text-slate-400" />
                                    {order.pickerName || (order as any).picker || "Unknown"}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(order.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                          <Package size={48} className="opacity-20" />
                          <p className="font-black uppercase tracking-widest text-xs">No orders found</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Modals */}
      <AnimatePresence>
        {fullImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] bg-slate-950/98 flex flex-col items-center justify-center"
            onClick={() => { setFullImage(null); setImageScale(1); }}
          >
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50 bg-gradient-to-b from-black/50 to-transparent" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-4">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setImageScale(prev => Math.max(0.5, prev - 0.25))}
                  className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                >
                  <RefreshCw size={20} className="-scale-x-100" />
                </motion.button>
                <span className="text-white font-black text-sm tracking-widest w-16 text-center">
                  {Math.round(imageScale * 100)}%
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setImageScale(prev => Math.min(3, prev + 0.25))}
                  className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                >
                  <RefreshCw size={20} />
                </motion.button>
              </div>
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={() => { setFullImage(null); setImageScale(1); }}
                className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
              >
                <X size={24} />
              </motion.button>
            </div>

            <div className="w-full h-full overflow-auto flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
              <motion.div
                drag
                dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
                style={{ scale: imageScale }}
                className="relative cursor-grab active:cursor-grabbing"
              >
                <img 
                  src={fullImage} 
                  className="max-w-none rounded-lg shadow-2xl pointer-events-none" 
                  style={{ maxHeight: '85vh' }}
                  alt="Full View" 
                />
              </motion.div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white/60 text-[10px] font-black uppercase tracking-widest pointer-events-none">
              Drag to pan • Use controls to zoom
            </div>
          </motion.div>
        )}

        {duplicateOrder && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] flex items-center justify-center bg-blue-900/40 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="bg-red-500 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle size={28} />
                  <h3 className="text-xl font-black tracking-tight">Duplicate Order Found</h3>
                </div>
                <button onClick={() => setDuplicateOrder(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Existing Order Images</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {getImages(duplicateOrder.imageUrl).map((img, idx) => (
                        <div 
                          key={idx} 
                          className="aspect-video h-32 rounded-2xl overflow-hidden border-4 border-slate-50 shadow-inner flex-shrink-0 cursor-zoom-in"
                          onClick={() => setFullImage(fixImageUrl(img))}
                        >
                          <img src={fixImageUrl(img)} className="w-full h-full object-cover" alt="Existing" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Your Uploaded Images</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {imagePreviews.map((img, idx) => (
                        <div key={idx} className="aspect-video h-32 rounded-2xl overflow-hidden border-4 border-blue-50 shadow-inner flex-shrink-0">
                          <img src={img} className="w-full h-full object-cover" alt="New" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</p>
                      <p className="text-lg font-black text-slate-800">{duplicateOrder.orderId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Store</p>
                      <p className="font-bold text-blue-600">{duplicateOrder.storeId}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Original Picker</p>
                      <p className="font-bold text-slate-700">{duplicateOrder.pickerName}</p>
                    </div>
                    <div className="text-right p-4 bg-slate-50 rounded-2xl">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Timestamp</p>
                      <p className="font-bold text-slate-700 text-[10px]">{new Date(duplicateOrder.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDeepDive(duplicateOrder)}
                    className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <Search size={20} />
                    View in Search Results
                  </motion.button>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDuplicateOrder(null)}
                    className="w-full bg-slate-100 text-slate-600 p-5 rounded-2xl font-black uppercase tracking-widest text-sm"
                  >
                    Acknowledge & Close
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {successOrder && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] flex items-center justify-center bg-green-900/40 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="bg-green-500 p-6 text-white flex flex-col items-center gap-4">
                <div className="h-20 w-20 bg-white/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={48} />
                </div>
                <h3 className="text-2xl font-black tracking-tight">Upload Successful!</h3>
              </div>
              
              <div className="p-8 space-y-6 text-center">
                <p className="text-slate-600 font-medium">
                  Order <span className="font-black text-slate-900">{successOrder.orderId}</span> has been successfully recorded.
                </p>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center">
                  {getImages(successOrder.imageUrl).map((img, idx) => (
                    <div key={idx} className="aspect-video h-20 rounded-xl overflow-hidden border-2 border-green-100 flex-shrink-0">
                      <img src={fixImageUrl(img)} className="w-full h-full object-cover" alt="Success" />
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDeepDive(successOrder)}
                    className="w-full bg-green-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2"
                  >
                    <Search size={20} />
                    Deep Dive Details
                  </motion.button>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSuccessOrder(null);
                      navigateTo("dashboard");
                    }}
                    className="w-full bg-slate-100 text-slate-600 p-5 rounded-2xl font-black uppercase tracking-widest text-sm"
                  >
                    Back to Dashboard
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {matrixDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6"
            onClick={() => setMatrixDetail(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-800 p-6 text-white flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{matrixDetail.title}</p>
                  <h3 className="text-xl font-black tracking-tight">{matrixDetail.stat} • {matrixDetail.key}</h3>
                </div>
                <button onClick={() => setMatrixDetail(null)} className="h-10 w-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8">
                <div className="max-h-[40vh] overflow-y-auto pr-2 mb-8 space-y-3 custom-scrollbar">
                  {matrixDetail.orders.map((order, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-colors">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</p>
                        <p className="font-black text-slate-800">{order.orderID}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Store</p>
                        <p className="font-bold text-blue-600">{order.storeID}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const ids = matrixDetail.orders.map(o => o.orderID).join('\n');
                      navigator.clipboard.writeText(ids);
                      showToast(`Copied ${matrixDetail.orders.length} Order IDs`);
                      setMatrixDetail(null);
                    }}
                    className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <Package size={20} />
                    Copy All Order IDs
                  </motion.button>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMatrixDetail(null)}
                    className="w-full bg-slate-100 text-slate-600 p-5 rounded-2xl font-black uppercase tracking-widest text-sm"
                  >
                    Close
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-10 left-1/2 z-[30000] px-8 py-4 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
          >
            {toast.type === 'success' && <CheckCircle2 className="text-emerald-400" size={20} />}
            {toast.type === 'error' && <AlertCircle className="text-red-400" size={20} />}
            <span className="font-black text-sm tracking-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
