import { detectAlerts } from "../utils/alertLogic.ts";
import { executeGasRequest } from "./gasService.ts";

export async function runMonitorTick(db: any, messaging: any) {
  try {
    console.log(`[Monitor] Tick started...`);
    
    // 1. Fetch System Config
    const configDoc = await db.collection('system').doc('config').get();
    const config = configDoc.exists ? configDoc.data() : {};
    
    const escalationRules = (config.escalationRules || []).filter((r: any) => r.isActive);
    const scheduledThreshold = config.scheduledThreshold || 30;
    const scheduledConfig = {
      pastSlot: config.scheduledPastSlot,
      runningSlot: config.scheduledRunningSlot
    };

    console.log(`[Monitor] Found ${escalationRules.length} active escalation rules.`);

    // 2. Fetch Matrix Data & Admin Data from GAS via common service
    const baseUrl = (process.env.GAS_API_URL || "").trim();
    if (!baseUrl) {
      throw new Error("[Monitor] GAS_API_URL environment variable is missing.");
    }
    
    console.log("[Monitor] Fetching data via gasService...");

    // Using executeGasRequest ensures these requests are queued and cached
    const [matrixRes, adminRes] = await Promise.all([
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getMatrixData` }, { cacheKey: `GET:${baseUrl}:action=getMatrixData` }),
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getAdminData` }, { cacheKey: `GET:${baseUrl}:action=getAdminData` })
    ]);

    const matrixRaw = matrixRes.data.status === "success" ? matrixRes.data.data : (matrixRes.data.data || matrixRes.data);
    const adminRaw = adminRes.data.status === "success" ? adminRes.data.data : (adminRes.data.data || adminRes.data);
    
    if (!matrixRaw || !adminRaw) {
      console.log("[Monitor] Essential data missing from GAS.");
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
      const sId = String(r.storeId || r.StoreID || "").trim();
      const reg = String(r.region || r.Region || "").trim();
      if (sId) storeToRegion[sId] = reg;
    });

    console.log(`[Monitor] Mapped ${Object.keys(storeToRegion).length} stores to regions.`);
    if (Object.keys(storeToRegion).length === 0 && regions.length > 0) {
      console.warn("[Monitor] WARNING: Regions found but storeToRegion mapping is empty. Check property names (storeId/region).", regions[0]);
    }

    const newAlerts = detectAlerts(matrixData, escalationRules as any, existingAlertIds, scheduledThreshold, storeToRegion, scheduledConfig);
    
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
              alertId: alert.alertKey,
              click_action: "/" // Hint for the service worker
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
