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

    // 2. Fetch Matrix Data & Admin Data from GAS via common service
    const baseUrl = (process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbyj8wQ6A7bGSn28_NG-PEOqb2hCH8bZ3Cav6kYOvLgoTsq6aroyNCKi1Bf70S43x3DQ/exec");
    
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
      storeToRegion[String(r.storeId).trim()] = String(r.region).trim();
    });

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
    // ── 8. Process Admin Broadcast Queue (push_queue) ──────────────────────
    // Broadcasts written by the Admin page land in push_queue with
    // status='pending'. This block reads them, fans out FCM pushes to every
    // device token whose role matches targetRoles, then marks them 'sent'.
    // Without this, the in-app Firestore listener still shows the toast for
    // users who have the app open, but background/push notifications are
    // never delivered.
    try {
      const pendingBroadcastsSnap = await db
        .collection('push_queue')
        .where('status', '==', 'pending')
        .get();

      if (!pendingBroadcastsSnap.empty) {
        console.log(`[Monitor] Processing ${pendingBroadcastsSnap.size} pending broadcast(s)...`);

        // Fetch all FCM tokens once (reuse if already fetched above for alerts)
        const broadcastTokensSnap = await db.collection('fcm_tokens').get();

        for (const broadcastDoc of pendingBroadcastsSnap.docs) {
          const broadcast = broadcastDoc.data();
          const targetRoles: string[] = Array.isArray(broadcast.targetRoles)
            ? broadcast.targetRoles.map((r: any) => String(r).toLowerCase().trim())
            : [];

          // Filter tokens to only those whose role is in targetRoles
          // (empty targetRoles = send to everyone)
          const validDocs = broadcastTokensSnap.docs
            .map((d: any) => d.data())
            .filter((data: any) => {
              if (!data.token) return false;
              if (targetRoles.length === 0) return true;
              const userRole = String(data.role || '').toLowerCase().trim();
              return targetRoles.includes(userRole);
            });

          const tokens: string[] = validDocs.map((data: any) => data.token);

          if (tokens.length > 0) {
            const fcmMessage = {
              notification: {
                title: String(broadcast.title || '📢 SYSTEM BROADCAST'),
                body:  String(broadcast.body  || ''),
              },
              data: {
                type:        'broadcast',
                broadcastId: broadcastDoc.id,
                sender:      String(broadcast.sender || ''),
              },
              tokens,
            };

            try {
              const fcmResponse = await messaging.sendEachForMulticast(fcmMessage);
              console.log(
                `[Monitor] Broadcast "${broadcastDoc.id}" → ` +
                `${fcmResponse.successCount} success, ${fcmResponse.failureCount} failure`
              );

              // Clean up stale tokens
              const staleRefs: any[] = [];
              fcmResponse.responses.forEach((resp: any, idx: number) => {
                if (
                  !resp.success &&
                  resp.error?.code === 'messaging/registration-token-not-registered'
                ) {
                  staleRefs.push(broadcastTokensSnap.docs[idx].ref);
                }
              });
              if (staleRefs.length > 0) {
                const batch = db.batch();
                staleRefs.forEach((ref: any) => batch.delete(ref));
                await batch.commit();
                console.log(`[Monitor] Removed ${staleRefs.length} stale FCM token(s).`);
              }
            } catch (fcmErr) {
              console.error('[Monitor] Broadcast FCM send error:', fcmErr);
            }
          } else {
            console.log(`[Monitor] Broadcast "${broadcastDoc.id}" — no matching tokens for roles: ${JSON.stringify(targetRoles)}`);
          }

          // Mark broadcast as sent regardless of FCM outcome so we don't
          // retry infinitely on persistent errors.
          await broadcastDoc.ref.update({
            status:  'sent',
            sentAt:  new Date().toISOString(),
            tokenCount: tokens.length,
          });
        }
      }
    } catch (broadcastErr) {
      // Non-fatal: alert processing already succeeded; log and continue.
      console.error('[Monitor] Broadcast queue processing error:', broadcastErr);
    }

    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}
