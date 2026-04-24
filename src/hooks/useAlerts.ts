import { useState, useCallback, useRef, useEffect } from 'react';
import { User, AlertLog, ActiveAlert } from '../types';
import { API_URL } from '../constants';
import { robustFetch, parseServerDate } from '../utils/api';
import { db, auth, requestForToken } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, getDoc, where } from 'firebase/firestore';

export function useAlerts(
  user: User | null,
  showToast: (msg: string, type?: 'success' | 'error') => void,
  isFirebaseAuthenticated: boolean
) {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [minimizedAlerts, setMinimizedAlerts] = useState<string[]>([]);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [adminHiddenAlerts, setAdminHiddenAlerts] = useState<string[]>([]);
  const [lastBroadcast, setLastBroadcast] = useState<{ id: string, title: string, body: string } | null>(null);
  
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    "Notification" in window ? Notification.permission : "default"
  );
  
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const notifiedEscalationsRef = useRef<Set<string>>(new Set());
  const notifiedSystemRef = useRef<Set<string>>(new Set());
  const lastAlertCountRef = useRef(0);
  const legacyLogsRef = useRef<AlertLog[]>([]);
  const firestoreLogsRef = useRef<AlertLog[]>([]);

  // Function to merge and filter logs
  const getMergedAndFilteredLogs = useCallback((fLogs: AlertLog[], lLogs: AlertLog[]) => {
    if (!user) return [];

    const mergedMap = new Map<string, AlertLog>();
    
    // Merge logic: Use orderId + statusTrigger as the unique key for an alert event
    // This correctly deduplicates alerts received from both Firestore and Legacy GAS logs.
    
    // Add legacy logs first
    lLogs.forEach(log => {
      const key = `${log.orderId}|${log.statusTrigger}`.toLowerCase().trim();
      mergedMap.set(key, log);
    });
    
    // Overwrite with Firestore logs (real-time truth)
    fLogs.forEach(log => {
      const key = `${log.orderId}|${log.statusTrigger}`.toLowerCase().trim();
      mergedMap.set(key, log);
    });

    const allLogs = Array.from(mergedMap.values());

    return allLogs.filter((log: AlertLog) => {
      const role = String(user.role || "").toLowerCase().trim();
      const userStoreId = String(user.storeId || "").trim().toLowerCase();
      const logStoreId = String(log.storeId || "").trim().toLowerCase();

      // Admin and Supervisor see everything. Manager only sees their store.
      const isPrivileged = role === 'admin' || role === 'supervisor';
      const isAllStore = userStoreId === 'all';
      const isStoreMatch = logStoreId === userStoreId;

      const shouldShow = isPrivileged || isAllStore || isStoreMatch;

      if (!shouldShow && Math.random() < 0.01) { // Log occasionally to avoid spam
        console.log(`[AlertFilter] Filtered out log ${log.orderId}. UserRole: ${role}, UserStore: ${userStoreId}, LogStore: ${logStoreId}`);
      }

      return shouldShow;
    });
  }, [user]);

  const lastHistoryFetchRef = useRef(0);

  // Fetch historical logs from Legacy API
  const fetchAlertHistory = useCallback(async () => {
    if (!user) return;
    
    // Throttling: Prevents hitting GAS more than once every 60 seconds for logs
    const now = Date.now();
    if (now - lastHistoryFetchRef.current < 60000) {
      console.log("[useAlerts] Skipping history fetch (throttled)");
      return;
    }
    lastHistoryFetchRef.current = now;

    try {
      let urlObj: URL;
      try {
        urlObj = new URL(API_URL.trim());
      } catch (e) {
        urlObj = new URL(API_URL.trim(), window.location.origin);
      }
      urlObj.searchParams.set('action', 'getalertlogs');
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const response = await res.json();
      let data = response.status === "success" ? response.data : response;
      
      if (data && !Array.isArray(data) && data.alerts) {
        data = data.alerts;
      }
      
      if (Array.isArray(data)) {
        const mapped: AlertLog[] = data.map((item: any) => {
          // Robust property mapping for different naming conventions
          const orderId = item.orderId || item.OrderID || item.order_id || "";
          const timestamp = item.timestamp || item.Timestamp || item.time || "";
          const storeId = String(item.storeId || item.StoreID || item.store_id || "");
          const eventType = item.eventType || item.EventType || item.event_type || "";
          const status = item.status || item.Status || "Pending";
          const escalation = String(item.escalation || item.Escalation || "FALSE").toUpperCase();
          const managerStatus = item.managerStatus || item.ManagerStatus || item.manager_status || "Pending";
          
          return {
            id: item.id || `${orderId}-${timestamp}`.toLowerCase().replace(/\s+/g, '-'),
            timestamp,
            orderId,
            eventType,
            storeId,
            userId: item.userId || item.UserID || item.user_id || "",
            notificationTime: item.notificationTime || item.NotificationTime || "",
            storeStaffName: item.storeStaffName || item.StoreStaffName || "",
            status,
            escalation,
            managerName: item.managerName || item.ManagerName || "",
            statusTrigger: item.statusTrigger || item.StatusTrigger || "",
            managerStatus,
            orderCreatedAt: item.orderCreatedAt || item.OrderCreatedAt || "",
            triggeredAt: item.triggeredAt || item.TriggeredAt || timestamp,
            bucket: item.bucket || item.Bucket || ""
          };
        });
        legacyLogsRef.current = mapped;
        const merged = getMergedAndFilteredLogs(firestoreLogsRef.current, mapped);
        setAlertLogs(merged);
      }
    } catch (e) {
      console.error("Failed to fetch legacy alert history", e);
    }
  }, [user, getMergedAndFilteredLogs]);

  // Expose refresh to window for manual trigger
  useEffect(() => {
    (window as any).refreshAlertHistory = fetchAlertHistory;
    return () => { delete (window as any).refreshAlertHistory; };
  }, [fetchAlertHistory]);

  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchAlertHistory();
    }
  }, [fetchAlertHistory]);

  // Check permission status using Permissions API change listener
  useEffect(() => {
    if (!("Notification" in window)) return;
    
    const checkPermission = () => {
      if (Notification.permission !== notifPermission) {
        setNotifPermission(Notification.permission);
      }
    };

    if (navigator.permissions && (navigator as any).permissions.query) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then(status => {
        status.onchange = checkPermission;
      }).catch(() => {
        // Fallback to polling if query fails (some browsers like Safari might not support it for notifications)
        const interval = setInterval(checkPermission, 10000);
        return () => clearInterval(interval);
      });
    } else {
      const interval = setInterval(checkPermission, 10000);
      return () => clearInterval(interval);
    }
  }, [notifPermission]);

  // FCM Token Registration
  useEffect(() => {
    if (!user || notifPermission !== "granted") return;

    const registerToken = async () => {
      try {
        const fbUser = auth.currentUser;
        if (!fbUser || !user) return;

        console.log("[useAlerts] Requesting FCM token...");
        const token = await requestForToken();
        if (token) {
          const tokenRef = doc(db, 'fcm_tokens', fbUser.uid);
          await setDoc(tokenRef, {
            token,
            userId: user.empId || fbUser.uid, // Defensive: use UID if empId is missing
            fbUid: fbUser.uid,
            role: String(user.role || "").toLowerCase().trim(),
            storeId: user.storeId || "ALL",
            region: user.region || "",
            updatedAt: serverTimestamp()
          }, { merge: true });
          console.log("FCM Token registered for Firebase UID:", fbUser.uid);
        }
      } catch (error) {
        console.error("Error registering FCM token:", error);
      }
    };

    registerToken();
  }, [user, notifPermission]);

  // Push Notification / Broadcast Listener (for online users)
  // ✅ FIX: This must run even if isFirebaseAuthenticated is false
  // because users logged in via username/password may not have a Firebase session
  // but still need to receive broadcasts.
  useEffect(() => {
    if (!user) return;

    // If we're not Firebase-authenticated, we can't listen to Firestore.
    // But we should still try — the custom token flow (Bug 2 fix) might succeed
    // asynchronously after this effect runs. We set up the listener anyway
    // and let Firestore reject it if auth fails.
    
    let unsubscribe: (() => void) | null = null;
    let retryTimeout: any = null;
    
    const startListener = () => {
      try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const q = query(
          collection(db, 'push_queue'),
          where('timestamp', '>=', twoHoursAgo)
        );
        unsubscribe = onSnapshot(q, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data();
              const userRole = String(user.role || "").toLowerCase().trim();
              
              // Normalize target roles to lowercase and trimmed strings
              const targetRoles = Array.isArray(data.targetRoles) 
                ? data.targetRoles.map((r: any) => String(r).toLowerCase().trim())
                : [];
              
              // If targetRoles is missing or empty, assume it's for everyone
              const isTarget = targetRoles.length === 0 || targetRoles.includes(userRole);
              
              // Check if it's a recent broadcast (within last 2 hours to handle clock skew)
              // Handle both Firestore Timestamp objects and regular timestamps
              let timestamp: number;
              if (data.timestamp && typeof data.timestamp.toMillis === 'function') {
                timestamp = data.timestamp.toMillis();
              } else if (data.timestamp && typeof data.timestamp.seconds === 'number') {
                timestamp = data.timestamp.seconds * 1000;
              } else {
                timestamp = Date.now();
              }
              const isRecent = Math.abs(Date.now() - timestamp) < (120 * 60 * 1000); 
              
              // Use session storage to avoid showing the same broadcast multiple times in one session
              const sessionKey = `broadcast_seen_${change.doc.id}`;
              const alreadySeen = sessionStorage.getItem(sessionKey);

              console.log(`[Broadcast] ID: ${change.doc.id}, UserRole: "${userRole}", TargetRoles: ${JSON.stringify(targetRoles)}, IsTarget: ${isTarget}, IsRecent: ${isRecent}, AlreadySeen: ${!!alreadySeen}`);

              if (isTarget && isRecent && !alreadySeen) {
                console.log(`[Broadcast] Displaying: ${data.title}`);
                showToast(`${data.title}: ${data.body}`, "success");
                setLastBroadcast({ id: change.doc.id, title: data.title, body: data.body });
                sessionStorage.setItem(sessionKey, "true");
              } else if (!isTarget) {
                console.log(`[Broadcast] Role mismatch. User is "${userRole}", Targets are: ${JSON.stringify(targetRoles)}`);
              }
            }
          });
        }, (error) => {
          console.error("Push queue listener error:", error);
          // If permission denied, retry after auth might complete
          if (error.code === 'permission-denied' && !isFirebaseAuthenticated) {
            console.log("[Broadcast] Auth not ready yet. Will retry in 10s...");
            retryTimeout = setTimeout(startListener, 10000);
          }
        });
      } catch (e) {
        console.error("[Broadcast] Failed to start listener:", e);
      }
    };

    startListener();

    return () => {
      if (unsubscribe) unsubscribe();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [user, isFirebaseAuthenticated, showToast]);

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
      
      if (!("Notification" in window)) return;

      if (Notification.permission === "granted") {
        try {
          // Attempt using service worker registration for better background reliability
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, {
                body,
                tag: id,
                icon: '/icon-192x192.png',
                vibrate: [200, 100, 200],
                data: { id }
              } as any);
            }).catch(() => {
              // Fallback to basic notification if SW fails or is unavailable
              new Notification(title, { body, tag: id });
            });
          } else {
            new Notification(title, { body, tag: id });
          }
        } catch (e) {
          console.error("[useAlerts] Notification failed:", e);
        }
      }
    }
  }, []);

  const logAlertAction = useCallback(async (alert: Partial<AlertLog>, action: 'trigger' | 'acknowledge' | 'escalate') => {
    const actionKey = `${alert.orderId}|${alert.statusTrigger}|${action}`.toLowerCase().trim();
    if (pendingActionsRef.current.has(actionKey)) return;
    
    pendingActionsRef.current.add(actionKey);
    try {
      const now = new Date().toISOString();
      const alertId = alert.id || `${alert.orderId}|${alert.statusTrigger}`.toLowerCase().trim();
      
      // Skip Firestore for test alerts
      if (alertId.startsWith('test-buzzer')) {
        setTimeout(() => pendingActionsRef.current.delete(actionKey), 2000);
        return;
      }

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
      params.append('id', alertId); // Ensure ID is sent for correct column mapping
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
    if (!user || !isFirebaseAuthenticated) return;

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const alertsRef = collection(db, 'alerts');
    const q = query(alertsRef, where('timestamp', '>=', sixHoursAgo));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreLogs: AlertLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        firestoreLogs.push({
          id: doc.id,
          timestamp: data.timestamp || "",
          orderId: data.orderId || "",
          eventType: data.eventType || "",
          storeId: String(data.storeId || ""),
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

      firestoreLogsRef.current = firestoreLogs;
      const merged = getMergedAndFilteredLogs(firestoreLogs, legacyLogsRef.current);
      setAlertLogs(merged);

      // Process active alerts for buzzer/notifications
      const active = merged.filter((l: AlertLog) => {
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
  }, [user, isFirebaseAuthenticated, showSystemNotification, handleFirestoreError]);

  const handleAlertAction = useCallback(async (alert: ActiveAlert, action: 'acknowledge' | 'escalate' | 'hide') => {
    if (action === 'hide') {
      if (user?.role === 'admin') {
        setAdminHiddenAlerts(prev => [...prev, alert.id]);
      } else {
        setMinimizedAlerts(prev => [...prev, alert.id]);
      }
      return;
    }
    
    // For acknowledge and escalate, we also want the alert to "go off" (minimize) immediately
    setMinimizedAlerts(prev => [...prev, alert.id]);
    setExpandedAlertId(null);
    
    await logAlertAction(alert, action);
    showToast(`Alert ${action === 'acknowledge' ? 'Acknowledged' : 'Escalated'}`, "success");
  }, [user, logAlertAction, showToast]);

  const testAlert = useCallback(async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      showToast("Notification permission denied or blocked.", "error");
      return;
    }
    
    showSystemNotification(
      "🔔 TEST ALERT",
      "This is a test notification to verify background alerts are working.",
      "test-alert-" + Date.now()
    );
    showToast("Test alert triggered!", "success");
  }, [requestNotificationPermission, showSystemNotification, showToast]);

  return { 
    activeAlerts, alertLogs, minimizedAlerts, setMinimizedAlerts, 
    expandedAlertId, setExpandedAlertId, adminHiddenAlerts, setAdminHiddenAlerts,
    handleAlertAction, logAlertAction, 
    notifiedEscalationsRef, requestNotificationPermission, testAlert,
    lastBroadcast, setLastBroadcast,
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
