import { useState, useCallback, useRef, useEffect } from 'react';
import { User, AlertLog, ActiveAlert } from '../types';
import { API_URL } from '../constants';
import { robustFetch, parseServerDate } from '../utils/api';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
  const lastAlertCountRef = useRef(0);

  const handleFirestoreError = useCallback((error: any, operationType: string, path: string) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid,
        isAnonymous: auth.currentUser?.isAnonymous,
      }
    };
    console.error('Firestore Error Detail:', JSON.stringify(errInfo));
    if (showToast) showToast(`Firestore Error (${operationType}): ${error.message}`, "error");
  }, [showToast]);

  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, []);

  const showSystemNotification = useCallback((title: string, body: string, id: string) => {
    if (!notifiedSystemRef.current.has(id)) {
      notifiedSystemRef.current.add(id);
      // Sound is handled by AlertOverlay's mathematical buzzer
    }
  }, []);

  const logAlertAction = useCallback(async (alert: Partial<AlertLog>, action: 'trigger' | 'acknowledge' | 'escalate') => {
    const actionKey = `${alert.orderId}|${alert.statusTrigger}|${action}`.toLowerCase().trim();
    if (pendingActionsRef.current.has(actionKey)) return;
    
    pendingActionsRef.current.add(actionKey);
    try {
      const now = new Date().toISOString();
      const alertId = alert.id || `${alert.orderId}|${alert.statusTrigger}`.toLowerCase().trim();
      const alertRef = doc(db, 'alerts', alertId);

      if (action === 'trigger') {
        const triggerDate = new Date(now);
        triggerDate.setMinutes(triggerDate.getMinutes() + 1);
        const notificationTime = triggerDate.toISOString();

        await setDoc(alertRef, {
          timestamp: now,
          orderId: alert.orderId || "",
          eventType: 'trigger',
          storeId: alert.storeId || "",
          userId: user?.empId || "",
          bucket: alert.bucket || "",
          notificationTime,
          storeStaffName: "",
          status: "Pending",
          escalation: "FALSE",
          managerName: "",
          managerStatus: "Pending",
          orderCreatedAt: alert.orderCreatedAt || now,
          statusTrigger: alert.statusTrigger || "",
          triggeredAt: now,
          updatedAt: serverTimestamp()
        });
      } else if (action === 'acknowledge') {
        if (user?.role === 'manager') {
          await updateDoc(alertRef, {
            managerName: user.name,
            managerStatus: "Accepted",
            updatedAt: serverTimestamp()
          });
        } else {
          await updateDoc(alertRef, {
            storeStaffName: user?.name || "Staff",
            status: "Acknowledged",
            updatedAt: serverTimestamp()
          });
        }
      } else if (action === 'escalate') {
        await updateDoc(alertRef, {
          escalation: "TRUE",
          updatedAt: serverTimestamp()
        });
      }

      // Legacy logging
      const params = new URLSearchParams();
      params.append('action', 'logalertv2');
      params.append('timestamp', alert.timestamp || now);
      params.append('orderId', alert.orderId || "");
      params.append('eventType', action);
      params.append('storeId', alert.storeId || "");
      params.append('userId', user?.empId || "");
      params.append('bucket', alert.bucket || "");
      params.append('notificationTime', alert.notificationTime || now);
      params.append('storeStaffName', user?.role !== 'manager' && action === 'acknowledge' ? user?.name || "" : alert.storeStaffName || "");
      params.append('status', action === 'acknowledge' && user?.role !== 'manager' ? "Acknowledged" : alert.status || "Pending");
      params.append('escalation', action === 'escalate' ? "TRUE" : alert.escalation || "FALSE");
      params.append('managerName', action === 'acknowledge' && user?.role === 'manager' ? user?.name || "" : alert.managerName || "");
      params.append('managerStatus', action === 'acknowledge' && user?.role === 'manager' ? "Accepted" : alert.managerStatus || "Pending");
      params.append('orderCreatedAt', alert.orderCreatedAt || "");
      params.append('statusTrigger', alert.statusTrigger || "");

      await robustFetch(API_URL, { method: 'POST', mode: 'no-cors', body: params });
      setTimeout(() => pendingActionsRef.current.delete(actionKey), 2000);
    } catch (error) {
      handleFirestoreError(error, 'write', `alerts/${alert.id || 'new'}`);
    }
  }, [user, API_URL, handleFirestoreError]);

  // Firestore Real-time Sync for Alerts
  useEffect(() => {
    if (!user) return;

    const alertsRef = collection(db, 'alerts');
    const unsubscribe = onSnapshot(query(alertsRef), (snapshot) => {
      const logs: AlertLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        logs.push({
          id: doc.id,
          timestamp: data.timestamp || "",
          orderId: data.orderId || "",
          eventType: data.eventType || "",
          storeId: data.storeId || "",
          userId: data.userId || "",
          notificationTime: data.notificationTime || "",
          storeStaffName: data.storeStaffName || "",
          status: data.status || "Pending",
          escalation: data.escalation || "FALSE",
          managerName: data.managerName || "",
          statusTrigger: data.statusTrigger || "",
          managerStatus: data.managerStatus || "Pending",
          orderCreatedAt: data.orderCreatedAt || "",
          triggeredAt: data.triggeredAt || "",
          bucket: data.bucket || ""
        });
      });

      const filteredLogs = logs.filter((log: AlertLog) => {
        const role = user.role.toLowerCase();
        if (role === 'admin' || role === 'supervisor') return true;
        return String(log.storeId).trim().toLowerCase() === String(user.storeId).trim().toLowerCase();
      });

      setAlertLogs(filteredLogs);

      const active = filteredLogs.filter((l: AlertLog) => {
        if (l.status === "Acknowledged" || l.managerStatus === "Accepted") return false;
        const triggeredTime = parseServerDate(l.timestamp).getTime();
        const now = new Date().getTime();
        const ageMins = isNaN(triggeredTime) ? 0 : (now - triggeredTime) / (1000 * 60);
        return ageMins <= 60;
      }).map((l: AlertLog) => {
        const triggeredTime = parseServerDate(l.timestamp).getTime();
        const now = new Date().getTime();
        const diffMins = isNaN(triggeredTime) ? 0 : (now - triggeredTime) / (1000 * 60);
        const buzzerStarted = l.status !== "Acknowledged";
        
        if (diffMins >= 1 && l.escalation !== "TRUE" && !notifiedEscalationsRef.current.has(l.id)) {
          notifiedEscalationsRef.current.add(l.id);
          setTimeout(() => logAlertAction(l, 'escalate'), 0);
        }

        return {
          ...l,
          buzzerStarted,
          managerBuzzerStarted: diffMins >= 2 && l.managerStatus !== "Accepted"
        };
      });

      const hasNewAlerts = active.length > lastAlertCountRef.current || 
                         active.some(a => !notifiedSystemRef.current.has(a.id));
      
      if (hasNewAlerts && active.length > 0) {
        setMinimizedAlerts([]);
        setExpandedAlertId(null);
      }
      lastAlertCountRef.current = active.length;

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
    }, (error) => {
      handleFirestoreError(error, 'list', 'alerts');
    });

    return () => unsubscribe();
  }, [user, logAlertAction, showSystemNotification, handleFirestoreError]);

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

  return { 
    activeAlerts, alertLogs, minimizedAlerts, setMinimizedAlerts, 
    expandedAlertId, setExpandedAlertId, adminHiddenAlerts, setAdminHiddenAlerts,
    isBuzzerMuted, setIsBuzzerMuted, handleAlertAction, logAlertAction, 
    notifiedEscalationsRef, requestNotificationPermission, testAlert,
    testBuzzer: () => {
      const testId = "test-buzzer-" + Date.now();
      const testAlert: ActiveAlert = {
        id: testId,
        orderId: "TEST-9999",
        timestamp: new Date().toISOString(),
        eventType: "trigger",
        storeId: user?.storeId || "TEST",
        userId: user?.empId || "TEST",
        notificationTime: new Date().toISOString(),
        storeStaffName: user?.name || "Test User",
        status: "Pending",
        escalation: "FALSE",
        managerName: "",
        statusTrigger: "TEST BUZZER",
        managerStatus: "Pending",
        orderCreatedAt: new Date().toISOString(),
        triggeredAt: new Date().toISOString(),
        bucket: "0-5 MIN",
        buzzerStarted: true,
        managerBuzzerStarted: false
      };
      setActiveAlerts(prev => [testAlert, ...prev]);
      setExpandedAlertId(testId);
      setMinimizedAlerts([]);
      showToast("Test buzzer triggered!", "success");
    }
  };
}
