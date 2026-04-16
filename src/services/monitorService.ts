import axios from "axios";
import { detectAlerts } from "../utils/alertLogic";

let cachedConfig: any = null;
let lastConfigFetch = 0;
let tickCount = 0;

export async function runMonitorTick(db: any, messaging: any) {
  try {
    tickCount++;
    console.log(`[Monitor] Tick ${tickCount} started...`);
    
    // 0. Cleanup Old Alerts (Older than 24 hours) - Run only every 10 ticks (~30 mins)
    if (tickCount % 10 === 1) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const oldAlertsSnap = await db.collection('alerts').where('timestamp', '<', twentyFourHoursAgo).limit(100).get();
      if (!oldAlertsSnap.empty) {
        const batch = db.batch();
        oldAlertsSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
        console.log(`[Monitor] Cleaned up ${oldAlertsSnap.size} old alerts.`);
      }
    }
    
    // 1. Fetch System Config (Rules & Threshold) - Cache for 10 minutes
    const now = Date.now();
    if (!cachedConfig || now - lastConfigFetch > 600000) {
      console.log("[Monitor] Fetching system config...");
      const configDoc = await db.collection('system').doc('config').get();
      cachedConfig = configDoc.exists ? configDoc.data() : {};
      lastConfigFetch = now;
    }
    
    const escalationRules = (cachedConfig.escalationRules || []).filter((r: any) => r.isActive);
    const scheduledThreshold = cachedConfig.scheduledThreshold || 30;

    // 3. Fetch Matrix Data & Regions from GAS
    const baseUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbxUVldHO9dPY9uTfuCc-A_RZUhkyngPQvMDpMC31nrjZV-SXWH2ZzXWIyDh3HDD_Zom/exec");
    
    console.log("[Monitor] Fetching live matrix and admin data...");
    const [matrixRes, adminRes] = await Promise.all([
      axios.get(`${baseUrl}?action=getMatrixData&_t=${Date.now()}`),
      axios.get(`${baseUrl}?action=getAdminData&_t=${Date.now()}`)
    ]);

    const matrixRaw = matrixRes.data.status === "success" ? matrixRes.data.data : (matrixRes.data.data || matrixRes.data);
    const adminRaw = adminRes.data.status === "success" ? adminRes.data.data : (adminRes.data.data || adminRes.data);
    
    if (!matrixRaw || !adminRaw) {
      console.log("[Monitor] Failed to fetch essential data from GAS.");
      return;
    }

    const matrixData = {
      quick: matrixRaw.quick || [],
      schedule: matrixRaw.schedule || []
    };
    const regions = adminRaw.regions || [];

    // 4. Fetch Existing Alerts (to avoid duplicates) - Only last 1 hour
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const existingAlertsSnap = await db.collection('alerts')
      .where('timestamp', '>=', oneHourAgo)
      .get();
    const existingAlertIds = new Set<string>(existingAlertsSnap.docs.map((doc: any) => doc.id.toLowerCase().trim()));

    // 5. Detect New Alerts
    const storeToRegion: Record<string, string> = {};
    regions.forEach((r: any) => {
      storeToRegion[String(r.storeId).trim()] = String(r.region).trim();
    });

    const newAlerts = detectAlerts(matrixData, escalationRules as any, existingAlertIds, scheduledThreshold, storeToRegion);
    
    // 6. Auto-Escalation Logic (3-minute cooldown) - Always run this
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
        }
      }
    }

    if (newAlerts.length === 0) {
      console.log("[Monitor] No new alerts.");
    } else {
      // 7. Only fetch tokens if there are actually new alerts to send
      const tokensSnap = await db.collection('fcm_tokens').get();
      const allTokensData = tokensSnap.docs.map((doc: any) => ({ ...doc.data(), ref: doc.ref }));

      for (const alert of newAlerts) {
        console.log(`[Monitor] New Alert Detected: ${alert.alertKey}`);
        
        const now = new Date().toISOString();
        const triggerDate = new Date();
        triggerDate.setMinutes(triggerDate.getMinutes() + 1);
        const notificationTime = triggerDate.toISOString();

        const alertStoreId = String(alert.item.storeID || "").trim();
        const alertRegion = storeToRegion[alertStoreId] || "";

        // Write to Firestore
        await db.collection('alerts').doc(alert.alertKey).set({
          timestamp: now,
          orderId: alert.item.orderID || "",
          eventType: 'trigger',
          storeId: alertStoreId,
          userId: "SYSTEM",
          bucket: alert.bucket || "",
          notificationTime,
          storeStaffName: "",
          status: "Pending",
          escalation: "FALSE",
          managerName: "",
          managerStatus: "Pending",
          orderCreatedAt: alert.item.timestamp || now,
          statusTrigger: alert.statusTrigger || "",
          triggeredAt: now,
          updatedAt: new Date()
        });

        // Send FCM Push Notification with Filtering
        const validDocs = allTokensData.filter((data: any) => {
          if (!data.token) return false;

          const userRole = String(data.role || "").toLowerCase().trim();
          const userStoreId = String(data.storeId || "").trim();
          const userRegion = String(data.region || "").trim();

          // 1. Admin gets everything
          if (userRole === 'admin') return true;

          // 2. Supervisor gets alerts for their region
          if (userRole === 'supervisor') {
            return userRegion && alertRegion && userRegion === alertRegion;
          }

          // 3. Picker, Store, Manager get alerts for their specific store
          if (['picker', 'store', 'manager'].includes(userRole)) {
            return userStoreId === alertStoreId;
          }

          return false;
        });

        const tokens = validDocs.map((data: any) => data.token);

        if (tokens.length > 0) {
          const message = {
            notification: {
              title: `⚠️ ALERT: ${alert.statusTrigger}`,
              body: `Order ${alert.item.orderID} at Store ${alert.item.storeID} requires attention.`
            },
            data: {
              orderId: alert.item.orderID,
              type: "alert",
              alertId: alert.alertKey
            },
            tokens: tokens
          };

          const fcmResponse = await messaging.sendEachForMulticast(message);
          console.log(`[Monitor] FCM Sent: ${fcmResponse.successCount} success, ${fcmResponse.failureCount} failure`);

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
            console.log(`[Monitor] Cleaned up ${invalidTokenRefs.length} invalid FCM tokens.`);
          }
        }
      }
    }
    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}
