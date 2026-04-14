import axios from "axios";
import { detectAlerts } from "../utils/alertLogic.js";

export async function runMonitorTick(db: any, messaging: any) {
  try {
    console.log("[Monitor] Tick started...");
    
    // 1. Fetch Escalation Rules
    const rulesSnap = await db.collection('escalation_rules').where('isActive', '==', true).get();
    const escalationRules = rulesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    // 2. Fetch System Config (Threshold)
    const configDoc = await db.collection('system_config').doc('general').get();
    const scheduledThreshold = configDoc.exists ? (configDoc.data()?.scheduledThreshold || 30) : 30;

    // 3. Fetch Matrix Data from GAS
    const gasUrl = "https://script.google.com/macros/s/AKfycbzgl5Bu2UWzgRu790imqg_5fOXFhjRdkIBqr-bKPaav0hcT00iCF0pvsM89G7ul4B6B/exec?action=getMatrixData";
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
      const tokens = tokensSnap.docs.map((doc: any) => doc.data().token).filter((t: any) => !!t);

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
      }
    }
    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}
