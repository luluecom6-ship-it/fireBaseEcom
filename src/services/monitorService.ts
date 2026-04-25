import { detectAlerts } from "../utils/alertLogic.js";
import { executeGasRequest } from "./gasService.js";
import axios from "axios";

export async function runMonitorTick(db: any, messaging: any) {
  try {
    console.log(`[Monitor] Tick started...`);
    
    // 1. Fetch System Config
    console.log(`[Monitor DEBUG] Using Database ID: ${db.id || 'Unknown'}`);
    const configDoc = await db.collection('system').doc('config').get();
    const config = configDoc.exists ? configDoc.data() : {};
    
    const escalationRules = (config.escalationRules || []).filter((r: any) => r.isActive);
    const scheduledThreshold = config.scheduledThreshold || 30;
    const scheduledConfig = {
      pastSlot: config.scheduledPastSlot,
      runningSlot: config.scheduledRunningSlot
    };

    console.log(`[Monitor DEBUG] Config exists: ${configDoc.exists}, Rules count: ${escalationRules.length}`);

    // 2. Fetch Matrix Data & Admin Data from GAS via common service
    let baseUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
    
    // Consistent fallback across all environments
    if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
      baseUrl = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
    }
    
    console.log(`[Monitor DEBUG] Using GAS URL: ${baseUrl.substring(0, 50)}...`);
    
    console.log("[Monitor DEBUG] Fetching data via gasService...");

    // Using executeGasRequest ensures these requests are queued and cached
    const [matrixRes, adminRes] = await Promise.all([
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getMatrixData` }, { cacheKey: `GET:${baseUrl}:action=getMatrixData` }),
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getAdminData` }, { cacheKey: `GET:${baseUrl}:action=getAdminData` })
    ]);

    const matrixRaw = matrixRes.data.status === "success" ? matrixRes.data.data : (matrixRes.data.data || matrixRes.data);
    const adminRaw = adminRes.data.status === "success" ? adminRes.data.data : (adminRes.data.data || adminRes.data);
    
    if (!matrixRaw || !adminRaw) {
      console.error("[Monitor DEBUG] GAS data missing or invalid.", { matrix: !!matrixRaw, admin: !!adminRaw });
      return;
    }

    const processItems = (items: any[]): any[] => {
      if (!Array.isArray(items)) return [];
      return items.map(item => {
        return {
          status: item.status || item.Status || "",
          storeID: item.storeID || item.storeId || item.StoreID || "",
          orderID: item.orderID || item.orderId || item.OrderID || "",
          slot: item.slot || item.Slot || "",
          bucket: item.bucket || item.Bucket || "",
          timestamp: item.timestamp || item.Timestamp || ""
        };
      });
    };

    const matrixData = {
      quick: processItems(matrixRaw.quick || []),
      schedule: processItems(matrixRaw.schedule || [])
    };
    const regions = adminRaw.regions || [];
    console.log(`[Monitor DEBUG] Orders: Quick=${matrixData.quick.length}, Sched=${matrixData.schedule.length}, Regions Raw=${regions.length}`);

    // 4. Fetch Existing Alerts (to avoid duplicates) - Only last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const twoHoursAgoISO = twoHoursAgo.toISOString();
    
    // Cleanup: Delete alerts older than 2 hours
    const oldAlertsSnap = await db.collection('alerts')
      .where('timestamp', '<', twoHoursAgoISO)
      .get();
    
    if (!oldAlertsSnap.empty) {
      console.log(`[Monitor DEBUG] Cleaning up ${oldAlertsSnap.size} old alerts...`);
      const batch = db.batch();
      oldAlertsSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }

    const existingAlertsSnap = await db.collection('alerts')
      .where('timestamp', '>=', twoHoursAgoISO)
      .get();
    const existingAlertsMap = new Map<string, any>(existingAlertsSnap.docs.map((doc: any) => [doc.id.toLowerCase().trim(), doc.data()]));
    const existingAlertIds = new Set<string>(existingAlertsMap.keys());
    console.log(`[Monitor DEBUG] Existing alerts found (2h lookback): ${existingAlertIds.size}`);

    // 5. Fetch Tokens Early (to use in both new alerts and escalations)
    const tokensSnap = await db.collection('fcm_tokens').get();
    const allTokensData = tokensSnap.docs.map((doc: any) => ({ ...doc.data(), ref: doc.ref }));

    // Helper for sending notifications with role-based filtering
    const sendFilteredNotification = async (payload: { title: string, body: string, data: any }, alertStoreId: string, alertRegion: string, isEscalation: boolean) => {
      const validDocs = allTokensData.filter((data: any) => {
        if (!data.token) return false;
        const userRole = String(data.role || "").toLowerCase().trim();
        const userStoreId = String(data.storeId || "").trim();
        const userRegion = String(data.region || "").trim();

        // Level 2 (Escalation): Manager, Supervisor, Admin
        if (isEscalation) {
          if (userRole === 'admin') return true;
          if (userRole === 'supervisor') return userRegion && alertRegion && userRegion === alertRegion;
          if (userRole === 'manager') return userStoreId === alertStoreId;
          return false;
        } 
        
        // Level 1 (Initial): Picker, Store
        if (['picker', 'store'].includes(userRole)) {
          return userStoreId === alertStoreId;
        }

        return false;
      });

      const tokens = validDocs.map((data: any) => data.token);
      if (tokens.length > 0) {
        const message = {
          notification: payload,
          data: payload.data,
          tokens: tokens
        };
        const fcmResponse = await messaging.sendEachForMulticast(message);
        console.log(`[Monitor] FCM Sent (${isEscalation ? 'ESC' : 'INIT'}): ${fcmResponse.successCount} success, ${fcmResponse.failureCount} failure`);

        // Clean up invalid tokens
        const invalidTokenRefs: any[] = [];
        fcmResponse.responses.forEach((resp: any, idx: number) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            invalidTokenRefs.push(validDocs[idx].ref);
          }
        });
        if (invalidTokenRefs.length > 0) {
          const batch = db.batch();
          invalidTokenRefs.forEach(ref => batch.delete(ref));
          await batch.commit();
        }
      }
    };

    // 6. Detect New Alerts
    const storeToRegion: Record<string, string> = {};
    regions.forEach((r: any) => {
      const sId = String(r.storeId || r.StoreID || "").trim();
      const reg = String(r.region || r.Region || "").trim();
      if (sId) storeToRegion[sId] = reg;
    });

    const activeAlertsDetected = detectAlerts(matrixData, escalationRules as any, existingAlertIds, scheduledThreshold, storeToRegion, scheduledConfig);
    console.log(`[Monitor DEBUG] Detection complete. Potential alerts: ${activeAlertsDetected.length}`);
    
    for (const alert of activeAlertsDetected) {
      const alertId = alert.alertKey;
      const existing = existingAlertsMap.get(alertId);
      
      const alertStoreId = String(alert.item.storeID || "").trim();
      const alertRegion = storeToRegion[alertStoreId] || "";
      const now = new Date().toISOString();

      let shouldWrite = false;
      let isReTrigger = false;

      if (!existing) {
        shouldWrite = true;
      } else {
        // If it exists, only update (re-trigger) if bucket changed
        if (existing.bucket !== alert.bucket) {
          shouldWrite = true;
          isReTrigger = true;
          console.log(`[Monitor] Bucket changed for ${alertId}: ${existing.bucket} -> ${alert.bucket}. Re-triggering...`);
        }
      }

      if (shouldWrite) {
        await db.collection('alerts').doc(alertId).set({
          timestamp: now,
          orderId: alert.item.orderID || "",
          eventType: 'trigger',
          storeId: alertStoreId,
          region: alertRegion,
          userId: "SYSTEM",
          bucket: alert.bucket || "",
          notificationTime: now,
          status: "Pending", // Reset to Pending to re-buzz
          escalation: "FALSE",
          statusTrigger: alert.statusTrigger || "",
          triggeredAt: now,
          updatedAt: new Date()
        }, { merge: true });

        // Sync to GAS Legacy Logs
        try {
          const syncParams = new URLSearchParams();
          syncParams.append('action', 'logalertv2');
          syncParams.append('id', alertId); 
          syncParams.append('timestamp', now);
          syncParams.append('orderId', alert.item.orderID || "");
          syncParams.append('eventType', 'trigger');
          syncParams.append('storeId', alertStoreId);
          syncParams.append('userId', "SYSTEM");
          syncParams.append('bucket', alert.bucket || "");
          syncParams.append('notificationTime', now);
          syncParams.append('storeStaffName', "");
          syncParams.append('status', "Pending");
          syncParams.append('escalation', "FALSE");
          syncParams.append('managerName', "");
          syncParams.append('managerStatus', "Pending");
          syncParams.append('orderCreatedAt', alert.item.timestamp || "");
          syncParams.append('statusTrigger', alert.statusTrigger || "");

          await axios.post(baseUrl, syncParams.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
          });
        } catch (syncErr: any) {
          console.error(`[Monitor] GAS alert sync failed for ${alertId}:`, syncErr.message);
        }

        // Notify Level 1 (Pickers/Store)
        await sendFilteredNotification({
          title: `${isReTrigger ? '🔄 UPDATED' : '⚠️ NEW'}: ${alert.statusTrigger}`,
          body: `Order ${alert.item.orderID} at Store ${alert.item.storeID} is in ${alert.bucket} stage.`,
          data: { orderId: alert.item.orderID, type: "alert", alertId: alert.alertKey }
        }, alertStoreId, alertRegion, false);
      }
    }

    // 7. Auto-Escalation Logic (3-minute cooldown)
    const nowTime = Date.now();
    for (const doc of existingAlertsSnap.docs) {
      const data = doc.data();
      if (data.status === "Pending" && data.escalation !== "TRUE") {
        const triggeredAt = data.triggeredAt ? new Date(data.triggeredAt).getTime() : 0;
        const ageMins = (nowTime - triggeredAt) / (1000 * 60);
        
        if (ageMins >= 3) {
          console.log(`[Monitor] Auto-escalating alert: ${doc.id}`);
          await doc.ref.update({
            escalation: "TRUE",
            updatedAt: new Date()
          });
          
          // Sync escalation to GAS Legacy Logs
          try {
            const syncParams = new URLSearchParams();
            syncParams.append('action', 'logalertv2');
            syncParams.append('id', doc.id);
            syncParams.append('timestamp', new Date().toISOString());
            syncParams.append('orderId', data.orderId || "");
            syncParams.append('eventType', 'escalate');
            syncParams.append('storeId', data.storeId || "");
            syncParams.append('userId', "SYSTEM_AUTO");
            syncParams.append('bucket', data.bucket || "");
            syncParams.append('notificationTime', data.notificationTime || "");
            syncParams.append('storeStaffName', data.storeStaffName || "");
            syncParams.append('status', data.status || "Pending");
            syncParams.append('escalation', "TRUE");
            syncParams.append('managerName', data.managerName || "");
            syncParams.append('managerStatus', data.managerStatus || "Pending");
            syncParams.append('orderCreatedAt', data.orderCreatedAt || "");
            syncParams.append('statusTrigger', data.statusTrigger || "");

            console.log(`[Monitor] Syncing escalation to GAS: ${doc.id}`);
            await axios.post(baseUrl, syncParams.toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 10000
            });
          } catch (syncErr: any) {
            console.error(`[Monitor] GAS escalation sync failed for ${doc.id}:`, syncErr.message);
          }

          // Notify Level 2 (Manager/Supervisor/Admin)
          await sendFilteredNotification({
            title: `🔥 ESCALATED: ${data.statusTrigger}`,
            body: `CRITICAL: Order ${data.orderId} at Store ${data.storeId} is still pending after 3 mins!`,
            data: { orderId: data.orderId, type: "alert", alertId: doc.id }
          }, data.storeId, data.region, true);
        }
      }
    }
    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}
