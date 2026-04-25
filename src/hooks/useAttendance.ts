import { useState, useEffect, useCallback, useRef } from 'react';
import { User, AttendanceStatus } from '../types';
import { API_URL } from '../constants';
import { robustFetch, parseServerDate } from '../utils/api';
import { compressImage } from '../utils/imageUtils';

export function useAttendance(
  user: User | null,
  showToast: (msg: string, type?: 'success' | 'error') => void,
  setLoading: (loading: boolean) => void
) {
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({ 
    inTime: null, 
    outTime: null,
    missingPunchOut: false
  });
  const [hoursWorked, setHoursWorked] = useState("00:00");
  const [isShiftComplete, setIsShiftComplete] = useState(false);
  const lastFetchedEmpId = useRef<string | null>(null);

  const fetchStatus = useCallback(async (empId: string) => {
    if (!empId) return;
    try {
      const baseUrl = API_URL.trim();
      let urlObj: URL;
      try {
        urlObj = new URL(baseUrl);
      } catch (e) {
        urlObj = new URL(baseUrl, window.location.origin);
      }
      urlObj.searchParams.set('action', 'getTodayAttendance');
      urlObj.searchParams.set('empId', empId);
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const text = await res.text();
      const trimmed = text.trim();
      const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
      const isHtml = trimmed.toLowerCase().includes('<!doctype') || trimmed.toLowerCase().includes('<html');

      if (!isJson) {
        if (!isHtml) {
          console.error("[useAttendance] Failed to parse JSON:", text.substring(0, 100));
        }
        return;
      }
      
      const response = JSON.parse(text);
      
      const data = response.status === "success" ? response.data : response;
      
      if (!Array.isArray(data) || data.length === 0) {
        setAttendanceStatus({ inTime: null, outTime: null });
        return;
      }

      // Client-side filter to ensure we only show records for THIS employee
      const userRecords = data.filter(r => 
        String(r.empId || r.EmpId || r.emp_id || "").trim() === String(empId).trim()
      );

      if (userRecords.length === 0) {
        setAttendanceStatus({ inTime: null, outTime: null });
        return;
      }

      // Sort ascending to find the FIRST "In" of the day
      const sortedAsc = [...userRecords].sort((a, b) => 
        parseServerDate(a.timestamp).getTime() - parseServerDate(b.timestamp).getTime()
      );

      const firstIn = sortedAsc.find(r => r.type === "In");
      if (!firstIn) {
        setAttendanceStatus({ inTime: null, outTime: null });
        return;
      }

      // To check if currently out, look at the LATEST record
      const latestRecord = sortedAsc[sortedAsc.length - 1];
      const isCurrentlyOut = latestRecord.type === "Out";
      
      const inTime = firstIn.timestamp;
      const outTime = isCurrentlyOut ? latestRecord.timestamp : null;

      // Session Reset Logic: Reset if shift is too long (missed punch out)
      if (!isCurrentlyOut) {
        const inDate = parseServerDate(inTime);
        const now = new Date();
        const diffMs = now.getTime() - inDate.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);
        
        const isDifferentDay = inDate.toDateString() !== now.toDateString();
        
        // Thresholds: 20 hours total, OR 12 hours if it's a different day.
        // This handles night shifts (e.g. 10pm to 6am = 8 hours, isDifferentDay=true, diffHrs=8 < 12 => OK)
        if (diffHrs >= 20 || (isDifferentDay && diffHrs >= 12)) {
          setAttendanceStatus({
            inTime: null,
            outTime: null,
            missingPunchOut: true
          });
          return;
        }
      }
      
      setAttendanceStatus({
        inTime,
        outTime,
        missingPunchOut: false
      });
    } catch (e) {
      console.error("Failed to fetch attendance status", e);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setAttendanceStatus({ inTime: null, outTime: null, missingPunchOut: false });
      setHoursWorked("00:00");
      setIsShiftComplete(false);
      lastFetchedEmpId.current = null;
      return;
    }

    if (user.empId !== lastFetchedEmpId.current) {
      setAttendanceStatus({ inTime: null, outTime: null, missingPunchOut: false });
      setHoursWorked("00:00");
      setIsShiftComplete(false);
      lastFetchedEmpId.current = user.empId;
      fetchStatus(user.empId);
    }

    // Periodically sync status every 5 minutes while logged in to detect day boundaries/resets
    const syncInterval = setInterval(() => {
      if (user?.empId) fetchStatus(user.empId);
    }, 300000);

    return () => clearInterval(syncInterval);
  }, [user, fetchStatus]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    
    const calculate = () => {
      if (!attendanceStatus.inTime) {
        setHoursWorked("00:00");
        setIsShiftComplete(false);
        return;
      }

      const startTime = parseServerDate(attendanceStatus.inTime).getTime();
      const endTime = attendanceStatus.outTime 
        ? parseServerDate(attendanceStatus.outTime).getTime() 
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
      interval = setInterval(calculate, 60000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [attendanceStatus]);

  const handleAttendanceSubmit = useCallback(async (image: string) => {
    if (!user || !image) return;
    setLoading(true);
    const type = (attendanceStatus.inTime && !attendanceStatus.outTime && !attendanceStatus.missingPunchOut) ? "Out" : "In";
    try {
      // Compress selfie to save storage
      const compressedImage = await compressImage(image, 800, 0.5);

      const params = new URLSearchParams();
      params.append("action", "attendance");
      params.append("empId", user.empId);
      params.append("name", user.name);
      params.append("storeId", user.storeId);
      params.append("type", type);
      params.append("image", compressedImage);

      await robustFetch(API_URL, {
        method: "POST",
        body: params
      });
      
      // Optimistic Update: Set the local status immediately to prevent "You haven't started" message
      // while the backend catches up.
      const now = new Date().toISOString();
      if (type === "In") {
        setAttendanceStatus(prev => ({
          ...prev,
          inTime: now,
          outTime: null,
          missingPunchOut: false
        }));
      } else {
        setAttendanceStatus(prev => ({
          ...prev,
          outTime: now
        }));
      }
      
      await fetchStatus(user.empId);
      showToast(`Punch ${type} Successful`, "success");
      return true;
    } catch (e) { 
      console.error("Attendance error:", e);
      showToast("Punch failed. Please try again.", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, attendanceStatus, fetchStatus, showToast, setLoading]);

  return { attendanceStatus, hoursWorked, isShiftComplete, handleAttendanceSubmit, fetchStatus };
}
