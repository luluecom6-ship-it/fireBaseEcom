import { useState, useCallback, useRef, useEffect } from 'react';
import { User, AlertLog, ActiveAlert } from '../types';
import { API_URL } from '../constants';
import { robustFetch, parseServerDate } from '../utils/api';

export function useAlerts(
  user: User | null,
  showToast: (msg: string, type?: 'success' | 'error') => void
) {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [minimizedAlerts, setMinimizedAlerts] = useState<string[]>([]);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [adminHiddenAlerts, setAdminHiddenAlerts] = useState<string[]>([]);
  const [isBuzzerMuted, setIsBuzzerMuted] = useState(false);
  
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const notifiedEscalationsRef = useRef<Set<string>>(new Set());
  const notifiedSystemRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAlertCountRef = useRef(0);

  useEffect(() => {
    // Preload buzzer sound
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.loop = false; // Just play once for notification
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    
    // If already granted, just return true
    if (Notification.permission === "granted") return true;
    
    // If denied, we can't request again without user going to settings
    if (Notification.permission === "denied") {
      console.warn("Notifications are blocked by the user.");
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, []);

  const showSystemNotification = useCallback((title: string, body: string, id: string) => {
    if (Notification.permission === "granted" && !notifiedSystemRef.current.has(id)) {
      notifiedSystemRef.current.add(id);
      
      // Play notification sound
      if (audioRef.current && !isBuzzerMuted) {
        audioRef.current.play().catch(e => console.warn("Audio play blocked:", e));
      }

      const options = {
        body,
        icon: '/favicon.ico',
        tag: id,
        requireInteraction: true,
        silent: false
      };

      // Use Service Worker if available for better background support
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    }
  }, [isBuzzerMuted]);

  const logAlertAction = useCallback(async (alert: Partial<AlertLog>, action: 'trigger' | 'acknowledge' | 'escalate') => {
    const actionKey = `${alert.orderId}|${alert.statusTrigger}|${action}`.toLowerCase().trim();
    if (pendingActionsRef.current.has(actionKey)) return;
    
    pendingActionsRef.current.add(actionKey);
    try {
      const params = new URLSearchParams();
      params.append('action', 'logalertv2');
      const now = new Date().toISOString();
      
      // Use existing timestamp for follow-up actions to keep them grouped
      params.append('timestamp', alert.timestamp || now);
      params.append('orderId', alert.orderId || "");
      params.append('eventType', action);
      params.append('storeId', alert.storeId || "");
      params.append('userId', user?.empId || "");
      params.append('bucket', alert.bucket || "");
      
      // notificationTime is when the buzzer should start (1 min after trigger)
      let notificationTime = alert.notificationTime || now;
      if (action === 'trigger') {
        const triggerDate = new Date(now);
        triggerDate.setMinutes(triggerDate.getMinutes() + 1); // Buzzer starts in 1 min
        notificationTime = triggerDate.toISOString();
      }
      params.append('notificationTime', notificationTime);
      
      if (action === 'acknowledge' && user?.role !== 'manager') {
        params.append('storeStaffName', user?.name || "");
        params.append('status', "Acknowledged");
      } else {
        params.append('storeStaffName', alert.storeStaffName || "");
        params.append('status', alert.status || "Pending");
      }

      params.append('escalation', (action === 'escalate' || alert.escalation === 'TRUE') ? "TRUE" : "FALSE");
      
      if (action === 'acknowledge' && user?.role === 'manager') {
        params.append('managerName', user?.name || "");
        params.append('managerStatus', "Accepted");
      } else {
        params.append('managerName', alert.managerName || "");
        params.append('managerStatus', alert.managerStatus || "Pending");
      }

      params.append('orderCreatedAt', alert.orderCreatedAt || "");
      params.append('statusTrigger', alert.statusTrigger || "");

      await robustFetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: params
      });
      
      setTimeout(() => {
        pendingActionsRef.current.delete(actionKey);
        fetchAlertLogs();
      }, 2000);
    } catch (e) {
      console.error("Failed to log alert action", e);
    }
  }, [user, API_URL]); // Removed fetchAlertLogs from dependencies to avoid circular ref, we call it inside setTimeout

  const fetchAlertLogs = useCallback(async () => {
    if (!user) return;
    try {
      const baseUrl = API_URL.trim();
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('action', 'getAlertLogs');
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const text = await res.text();
      
      let response;
      try {
        response = JSON.parse(text);
      } catch (e) {
        throw new Error("Invalid JSON response from server");
      }

      const result = response.status === "success" ? response.data : response;
      const logs = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);

      if (logs.length > 0 || response.status === "success") {
        const mappedData: AlertLog[] = logs.map((item: any) => {
          const orderId = item.orderId || "";
          const statusTrigger = item['Status Trigger'] || item.statusTrigger || "";
          
          return {
            id: `${orderId}|${statusTrigger}`.toLowerCase().trim(),
            timestamp: item.timestamp || "",
            orderId: orderId,
            eventType: item.eventType || "",
            storeId: item.storeId || "",
            userId: item.userId || "",
            notificationTime: item['Notification Time'] || item.notificationTime || "",
            storeStaffName: item['StoreStaff Name'] || item.storeStaffName || "",
            status: item.Status || item.status || "Pending",
            escalation: String(item.Escalation || item.escalation).toUpperCase() === "TRUE" ? "TRUE" : "FALSE",
            managerName: item['Manager Name'] || item.managerName || "",
            statusTrigger: statusTrigger,
            managerStatus: item['Manager Status'] || item.managerStatus || "Pending",
            orderCreatedAt: item['Order Created At'] || item.orderCreatedAt || item.timestamp || "",
            triggeredAt: item.timestamp || "",
            bucket: item.bucket || item['Bucket'] || ""
          };
        }).filter((log: AlertLog) => {
          // Filter by role and storeId
          const role = user.role.toLowerCase();
          if (role === 'admin' || role === 'supervisor') return true;
          
          // For picker, store, manager (and others), only show their store's alerts
          return String(log.storeId).trim().toLowerCase() === String(user.storeId).trim().toLowerCase();
        });
        
        const consolidated: Record<string, AlertLog> = {};
        const sortedLogs = [...mappedData].sort((a, b) => 
          parseServerDate(a.timestamp).getTime() - parseServerDate(b.timestamp).getTime()
        );

        sortedLogs.forEach(log => {
          if (!log.orderId || !log.statusTrigger) return;
          const key = log.id;
          if (!consolidated[key]) {
            consolidated[key] = { ...log };
          } else {
            if (log.status === "Acknowledged") {
              consolidated[key].status = "Acknowledged";
              consolidated[key].storeStaffName = log.storeStaffName;
            }
            if (log.escalation === "TRUE") {
              consolidated[key].escalation = "TRUE";
            }
            if (log.managerStatus === "Accepted") {
              consolidated[key].managerStatus = "Accepted";
              consolidated[key].managerName = log.managerName;
            }
            if (parseServerDate(log.timestamp).getTime() < parseServerDate(consolidated[key].timestamp).getTime()) {
              consolidated[key].timestamp = log.timestamp;
              consolidated[key].triggeredAt = log.timestamp;
            }
          }
        });

        const finalLogs = Object.values(consolidated);
        setAlertLogs(finalLogs);

        const active = finalLogs.filter((l: AlertLog) => {
          const triggeredTime = parseServerDate(l.timestamp).getTime();
          const now = new Date().getTime();
          const ageMins = isNaN(triggeredTime) ? 0 : (now - triggeredTime) / (1000 * 60);
          
          // Remove alerts older than 60 mins
          if (ageMins > 60) return false;
          
          // Remove acknowledged or accepted alerts
          if (l.status === "Acknowledged" || l.managerStatus === "Accepted") return false;
          
          return true;
        }).map((l: AlertLog) => {
          const triggeredTime = parseServerDate(l.timestamp).getTime();
          const now = new Date().getTime();
          const diffMins = isNaN(triggeredTime) ? 0 : (now - triggeredTime) / (1000 * 60);
          
          // 1 min sound alert if not acknowledged
          const buzzerStarted = diffMins >= 1 && diffMins < 2 && l.status !== "Acknowledged";
          
          // Auto-escalate to manager after 1 min if not acknowledged
          if (diffMins >= 1 && l.escalation !== "TRUE" && !notifiedEscalationsRef.current.has(l.id)) {
            notifiedEscalationsRef.current.add(l.id);
            // We'll trigger the escalation call here
            setTimeout(() => logAlertAction(l, 'escalate'), 0);
          }

          return {
            ...l,
            buzzerStarted,
            managerBuzzerStarted: diffMins >= 2 && diffMins < 3 && l.managerStatus !== "Accepted"
          };
        });

        // If we have more active alerts than before, or new alert IDs, clear minimized status
        const currentAlertIds = new Set(active.map(a => a.id));
        const hasNewAlerts = active.length > lastAlertCountRef.current || 
                           active.some(a => !notifiedSystemRef.current.has(a.id));
        
        if (hasNewAlerts && active.length > 0) {
          setMinimizedAlerts([]);
          setExpandedAlertId(null);
        }
        lastAlertCountRef.current = active.length;

        // Trigger system notifications for new active alerts
        active.forEach(alert => {
          if (!notifiedSystemRef.current.has(alert.id)) {
            showSystemNotification(
              `⚠️ ALERT: ${alert.statusTrigger}`,
              `Order ${alert.orderId} at Store ${alert.storeId} is in ${alert.bucket} bucket.`,
              alert.id
            );
          }
        });

        setActiveAlerts(active);
        setMinimizedAlerts(prev => prev.filter(id => active.some(a => a.id === id)));
      }
    } catch (e) {
      console.error("Failed to fetch alert logs", e);
    }
  }, [user, minimizedAlerts, logAlertAction]);

  const handleAlertAction = useCallback(async (alert: ActiveAlert, action: 'acknowledge' | 'escalate' | 'hide') => {
    if (action === 'hide') {
      if (user?.role === 'admin') {
        setAdminHiddenAlerts(prev => [...prev, alert.id]);
      } else {
        setMinimizedAlerts(prev => [...prev, alert.id]);
      }
      return;
    }
    
    await logAlertAction(alert, action);
    showToast(`Alert ${action === 'acknowledge' ? 'Acknowledged' : 'Escalated'}`, "success");
  }, [user, logAlertAction, showToast]);

  const testAlert = useCallback(() => {
    showSystemNotification(
      "🔔 TEST ALERT",
      "This is a test notification to verify background alerts are working.",
      "test-alert-" + Date.now()
    );
    showToast("Test alert triggered!", "success");
  }, [showSystemNotification, showToast]);

  useEffect(() => {
    if (user) {
      fetchAlertLogs();
      const interval = setInterval(fetchAlertLogs, 15000); // Poll every 15s
      return () => clearInterval(interval);
    }
  }, [user, fetchAlertLogs]);

  return { 
    activeAlerts, alertLogs, minimizedAlerts, setMinimizedAlerts, 
    expandedAlertId, setExpandedAlertId, adminHiddenAlerts, setAdminHiddenAlerts,
    isBuzzerMuted, setIsBuzzerMuted, fetchAlertLogs, handleAlertAction, logAlertAction, 
    notifiedEscalationsRef, requestNotificationPermission, testAlert
  };
}
