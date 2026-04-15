import axios from "axios";
import { detectAlerts } from "../utils/alertLogic.js";

export async function runMonitorTick(db: any, messaging: any) {
  try {
    console.log("[Monitor] Tick started...");
    
    // 0. Cleanup Old Alerts (Older than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oldAlertsSnap = await db.collection('alerts').where('timestamp', '<', twentyFourHoursAgo).limit(100).get();
    if (!oldAlertsSnap.empty) {
      const batch = db.batch();
      oldAlertsSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`[Monitor] Cleaned up ${oldAlertsSnap.size} old alerts.`);
    }
    
    // 1. Fetch System Config (Rules & Threshold)
    const configDoc = await db.collection('system').doc('config').get();
    const configData = configDoc.exists ? configDoc.data() : {};
    
    const escalationRules = (configData.escalationRules || []).filter((r: any) => r.isActive);
    const scheduledThreshold = configData.scheduledThreshold || 30;

    // 3. Fetch Matrix Data from GAS
    const gasUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbwBGYyEjem9_3js7D4uDlFU85pgwZgJ1XFkkmN5cdKRB7utGUsdlf3_ybIHqknlWJzC/exec") + "?action=getMatrixData";
    const response = await axios.get(gasUrl);
    const matrixData = response.data.status === "success" ? response.data.data : response.data;

    if (!matrixData) {
      console.log("[Monitor] No matrix data received.");
      return;
    }

    // 4. Fetch Existing Alerts (to avoid duplicates)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const existingAlertsSnap = await db.collection('alerts')
      .where('timestamp', '>=', twoHoursAgo)
      .get();
    const existingAlertIds = new Set<string>(existingAlertsSnap.docs.map((doc: any) => doc.id.toLowerCase().trim()));

    // 5. Detect New Alerts
    const newAlerts = detectAlerts(matrixData, escalationRules as any, existingAlertIds, scheduledThreshold);
    
    // 6. Auto-Escalation Logic (3-minute cooldown)
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

    for (const alert of newAlerts) {
      console.log(`[Monitor] New Alert Detected: ${alert.alertKey}`);
      
      const now = new Date().toISOString();
      const triggerDate = new Date();
      triggerDate.setMinutes(triggerDate.getMinutes() + 1);
      const notificationTime = triggerDate.toISOString();

      // Write to Firestore
      await db.collection('alerts').doc(alert.alertKey).set({
        timestamp: now,
        orderId: alert.item.orderID || "",
        eventType: 'trigger',
        storeId: alert.item.storeID || "",
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
        updatedAt: new Date() // Use Date for simple cross-env compatibility
      });

      // Send FCM Push Notification
      const tokensSnap = await db.collection('fcm_tokens').get();
      const validDocs = tokensSnap.docs.filter((doc: any) => !!doc.data().token);
      const tokens = validDocs.map((doc: any) => doc.data().token);

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
        const invalidTokenDocs: any[] = [];
        fcmResponse.responses.forEach((resp: any, idx: number) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            invalidTokenDocs.push(validDocs[idx].ref);
          }
        });

        if (invalidTokenDocs.length > 0) {
          const batch = db.batch();
          invalidTokenDocs.forEach(ref => batch.delete(ref));
          await batch.commit();
          console.log(`[Monitor] Cleaned up ${invalidTokenDocs.length} invalid FCM tokens.`);
        }
      }
    }
    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}
