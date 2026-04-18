import { useState, useCallback, useRef } from 'react';
import { User, AdminData } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

export function useAdmin(
  user: User | null,
  showToast: (msg: string, type?: 'success' | 'error') => void,
  setLoading: (loading: boolean) => void
) {
  const [adminData, setAdminData] = useState<AdminData>({ 
    users: [], 
    attendance: [], 
    orders: [],
    regions: []
  });

  const fetchAdminData = useCallback(async (isManual = false) => {
    const role = String(user?.role || "").toLowerCase().trim();
    if (!user || (role !== 'admin' && role !== 'supervisor' && role !== 'manager' && role !== 'store')) return;
    
    if (!API_URL) {
      console.error("Admin sync failed: API_URL is not configured.");
      if (isManual) showToast("API Configuration Missing", "error");
      return;
    }

    if (isManual) setLoading(true);
    
    try {
      const baseUrl = API_URL.trim();
      let urlObj: URL;
      try {
        urlObj = new URL(baseUrl);
      } catch (urlErr) {
        urlObj = new URL(baseUrl, window.location.origin);
      }
      urlObj.searchParams.set('action', 'getAdminData');
      urlObj.searchParams.set('role', user.role || "");
      urlObj.searchParams.set('region', user.region || "");
      if (isManual) {
        urlObj.searchParams.set('cache', 'skip');
      }
      
      const res = await robustFetch(urlObj.toString());
      const text = await res.text();
      let response;
      try {
        response = JSON.parse(text);
      } catch (parseErr) {
        console.error("Admin sync failed: Response was not JSON", text.substring(0, 100));
        if (isManual) showToast("Server Error: Invalid data format", "error");
        return;
      }
      const data = response.status === "success" ? response.data : response;
      
      if (data && (data.users || data.attendance || data.orders || data.regions)) {
        // Normalize Users
        const rawUsers = Array.isArray(data.users) ? data.users : [];
        const normalizedUsers = rawUsers.map((u: any) => ({
          ...u,
          empId: String(u.empId || u.EmpId || u.emp_id || u.EMPID || "").trim(),
          name: String(u.name || u.Name || u.NAME || u.username || "").trim(),
          storeId: String(u.storeId || u.storeID || u.StoreID || u.store_id || "").trim(),
          role: String(u.role || u.Role || "user").toLowerCase().trim() as any,
          region: String(u.region || u.Region || "").trim()
        }));

        // Normalize Attendance
        const rawAttendance = Array.isArray(data.attendance) ? data.attendance : [];
        const normalizedAttendance = rawAttendance.map((a: any) => ({
          ...a,
          empId: String(a.empId || a.EmpId || a.emp_id || a.EMPID || "").trim(),
          name: String(a.name || a.Name || a.NAME || "").trim(),
          storeId: String(a.storeId || a.storeID || a.StoreID || a.store_id || "").trim(),
          type: (String(a.type || a.Type || "In").includes("In") ? "In" : "Out") as 'In' | 'Out',
          timestamp: a.timestamp || a.Date || a.Time || a.dateTime || ""
        }));

        setAdminData({
          users: normalizedUsers,
          attendance: normalizedAttendance,
          orders: data.orders || [],
          regions: data.regions || []
        });
        if (isManual) showToast("Admin Data Synced", "success");
      } else {
        if (isManual) showToast(response?.message || "No data found", "error");
      }
    } catch (e) {
      console.error("Admin sync failed", e);
      if (isManual) showToast("Connection Error", "error");
    } finally {
      if (isManual) setLoading(false);
    }
  }, [user, showToast, setLoading]);

  const isFetchingRegions = useRef(false);

  const fetchRegions = useCallback(async () => {
    if (!user || !API_URL || isFetchingRegions.current) return;
    
    // Prevent excessive calls within a short window (5 minutes)
    const now = Date.now();
    const lastFetch = (window as any)._lastRegionsFetch || 0;
    if (now - lastFetch < 300000 && adminData.regions.length > 0) {
      return;
    }

    isFetchingRegions.current = true;
    try {
      (window as any)._lastRegionsFetch = now;
      const res = await robustFetch(`${API_URL}?action=getRegions`);
      const response = await res.json();
      if (response.status === "success" && Array.isArray(response.data)) {
        setAdminData(prev => ({
          ...prev,
          regions: response.data
        }));
        console.log("[useAdmin] Regions loaded successfully");
      }
    } catch (e) {
      console.error("[useAdmin] Failed to fetch regions", e);
    } finally {
      isFetchingRegions.current = false;
    }
  }, [user, API_URL, adminData.regions.length]);

  const handleResetAttendance = useCallback(async (empId: string, filterDate: string) => {
    setLoading(true);
    try {
      const res = await robustFetch(`${API_URL}?action=resetAttendance&empId=${empId}&date=${filterDate}`);
      const data = await res.json();
      if (data.status === "success") {
        await fetchAdminData();
        showToast("Attendance Reset Successful", "success");
      } else {
        showToast(data.message || "Unknown error", "error");
      }
    } catch (e) {
      showToast("Connection Error", "error");
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, showToast, setLoading]);

  return { adminData, setAdminData, fetchAdminData, fetchRegions, handleResetAttendance };
}
