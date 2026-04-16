import { useState, useCallback } from 'react';
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
      urlObj.searchParams.set('_t', Date.now().toString());
      
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
        setAdminData({
          users: data.users || [],
          attendance: data.attendance || [],
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

  return { adminData, setAdminData, fetchAdminData, handleResetAttendance };
}
