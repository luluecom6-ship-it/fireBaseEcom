import { useState, useEffect, useCallback } from 'react';
import { User, AttendanceStatus } from '../types';
import { API_URL } from '../constants';
import { robustFetch, parseServerDate } from '../utils/api';

export function useAttendance(
  user: User | null,
  showToast: (msg: string, type?: 'success' | 'error') => void,
  setLoading: (loading: boolean) => void
) {
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({ inTime: null, outTime: null });
  const [hoursWorked, setHoursWorked] = useState("00:00");
  const [isShiftComplete, setIsShiftComplete] = useState(false);

  const fetchStatus = useCallback(async (empId: string) => {
    try {
      const baseUrl = API_URL.trim();
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('action', 'getTodayAttendance');
      urlObj.searchParams.set('empId', empId);
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const response = await res.json();
      
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
      
      setAttendanceStatus({
        inTime: firstIn.timestamp,
        outTime: isCurrentlyOut ? latestRecord.timestamp : null
      });
    } catch (e) {
      console.error("Failed to fetch attendance status", e);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchStatus(user.empId);
    }
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
    const type = (attendanceStatus.inTime && !attendanceStatus.outTime) ? "Out" : "In";
    try {
      const params = new URLSearchParams();
      params.append("action", "attendance");
      params.append("empId", user.empId);
      params.append("name", user.name);
      params.append("storeId", user.storeId);
      params.append("type", type);
      params.append("image", image);

      await robustFetch(API_URL, {
        method: "POST",
        mode: 'no-cors',
        body: params
      });
      
      await fetchStatus(user.empId);
      showToast(`Punch ${type} Successful`, "success");
    } catch (e) { 
      console.error("Attendance error:", e);
      showToast("Punch failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [user, attendanceStatus, fetchStatus, showToast, setLoading]);

  return { attendanceStatus, hoursWorked, isShiftComplete, handleAttendanceSubmit, fetchStatus };
}
