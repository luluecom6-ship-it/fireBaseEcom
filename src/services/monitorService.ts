import { detectAlerts } from "../utils/alertLogic";
import { executeGasRequest } from "./gasService";
import axios from "axios";

export async function runMonitorTick(db: any, messaging: any) {
  try {
    console.log(`[Monitor] Tick started...`);
    
    // 1. Fetch System Config & FCM Tokens
    console.log(`[Monitor DEBUG] Using Database ID: ${db.id || 'Unknown'}`);
    const configDoc = await db.collection('system').doc('config').get();
    const config = configDoc.exists ? configDoc.data() : {};
    
    const escalationRules = (config.escalationRules || []).filter((r: any) => r.isActive);
    const scheduledThreshold = config.scheduledThreshold || 30;
    const oosPushEnabled = config.oosPushEnabled !== false; // Default true
    const scheduledConfig = {
      pastSlot: config.scheduledPastSlot,
      runningSlot: config.scheduledRunningSlot
    };

    console.log(`[Monitor DEBUG] Config exists: ${configDoc.exists}, Rules count: ${escalationRules.length}`);

    // Fetch Tokens Early (to use in OOS, new alerts, and escalations)
    const tokensSnap = await db.collection('fcm_tokens').get();
    const allTokensData = tokensSnap.docs.map((doc: any) => ({ ...doc.data(), ref: doc.ref }));

    // Helper for sending notifications with role-based filtering
    const sendFilteredNotification = async (payload: { title: string, body: string, data: any, image?: string }, alertStoreId: string, alertRegion: string, isEscalation: boolean, isOOS?: boolean) => {
      const validDocs = allTokensData.filter((data: any) => {
        if (!data.token) return false;
        const userRole = String(data.role || "").toLowerCase().trim();
        const userStoreId = String(data.storeId || "").trim();
        const userRegion = String(data.region || "").trim();

        if (isOOS) {
          if (userRole === 'admin') return true;
          if (userRole === 'supervisor') return userRegion && alertRegion && userRegion === alertRegion;
          if (userRole === 'manager' || userRole === 'store') return userStoreId === alertStoreId;
          return false;
        }

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
        console.log(`[Monitor] FCM Sent (${isOOS ? 'OOS' : (isEscalation ? 'ESC' : 'INIT')}): ${fcmResponse.successCount} success, ${fcmResponse.failureCount} failure`);

        // Clean up invalid tokens
        const invalidTokenRefs: any[] = [];
        fcmResponse.responses.forEach((res: any, idx: number) => {
          if (!res.success && res.error && res.error.code === 'messaging/registration-token-not-registered') {
             invalidTokenRefs.push(validDocs[idx].ref);
          }
        });
        
        if (invalidTokenRefs.length > 0) {
           const tokenBatch = db.batch();
           invalidTokenRefs.forEach(ref => tokenBatch.delete(ref));
           await tokenBatch.commit();
        }
      }
    };


    // 2. Fetch Matrix Data & Admin Data from GAS via common service
    let baseUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
    // V2 GAS URL added
    const FALLBACK_V2_GAS_URL = "https://script.google.com/macros/s/AKfycbz6l6gUuVhoXde_zYZNNGchQLnvzZHE8_kkk2RcvQyk55tpitg2N8ZQHVo_DV7FO71Gzw/exec";
    const FALLBACK_V1_GAS_URL = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
    const v2Url = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || FALLBACK_V2_GAS_URL).trim();
    
    // Consistent fallback across all environments
    if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
      baseUrl = FALLBACK_V1_GAS_URL;
    }
    
    console.log(`[Monitor DEBUG] Using GAS URLs: V1=${baseUrl.substring(0, 50)}... | V2=${v2Url.substring(0, 50)}...`);
    
    console.log("[Monitor DEBUG] Fetching data via gasService...");

    // Using executeGasRequest ensures these requests are queued and cached
    const [matrixRes, adminRes, matrixV2Res] = await Promise.all([
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getMatrixData` }, { skipCache: true, cacheKey: `GET:${baseUrl}:action=getMatrixData` }),
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getAdminData` }, { skipCache: true, cacheKey: `GET:${baseUrl}:action=getAdminData` }),
      executeGasRequest({ method: 'GET', url: `${v2Url}` }, { skipCache: true, cacheKey: `GET:${v2Url}` })
    ]);

    const matrixRaw = matrixRes.data.status === "success" ? matrixRes.data.data : (matrixRes.data.data || matrixRes.data);
    const adminRaw = adminRes.data.status === "success" ? adminRes.data.data : (adminRes.data.data || adminRes.data);
    let v2ResData = matrixV2Res.data;
    if (typeof v2ResData === 'string' && (v2ResData.trim().startsWith('{') || v2ResData.trim().startsWith('['))) {
      try {
        v2ResData = JSON.parse(v2ResData);
        console.log("[Monitor DEBUG] Parsed V2 string data to JSON successfully.");
      } catch (e) {
        console.error("[Monitor DEBUG] Failed to parse V2 string as JSON:", e);
      }
    }

    let matrixV2Raw = v2ResData?.status === "success" ? v2ResData.data : (v2ResData?.data || v2ResData || []);
    
    // Check if it's an object with array property like useApiDataV2 does
    if (matrixV2Raw && typeof matrixV2Raw === 'object' && !Array.isArray(matrixV2Raw) && !matrixV2Raw.job_number) {
       matrixV2Raw = matrixV2Raw.data || matrixV2Raw.orders || matrixV2Raw.results || matrixV2Raw.rows || matrixV2Raw.items || matrixV2Raw;
    }

    // Normalize single object to array
    if (matrixV2Raw && !Array.isArray(matrixV2Raw) && typeof matrixV2Raw === 'object' && matrixV2Raw.job_number) {
      console.log("[Monitor DEBUG] Normalizing single V2 object to array");
      matrixV2Raw = [matrixV2Raw];
    }

    console.log(`[Monitor DEBUG] Raw V2 data type: ${typeof matrixV2Raw}, isArray: ${Array.isArray(matrixV2Raw)}`);
    if (typeof matrixV2Raw === 'string' && matrixV2Raw.includes('<!DOCTYPE html>')) {
      console.error("[Monitor DEBUG] V2 URL returned HTML instead of JSON. Check GAS permissions.");
    }

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

    const regions = adminRaw.regions || [];

    const matrixData = {
      quick: processItems(matrixRaw.quick || []),
      schedule: processItems(matrixRaw.schedule || [])
    };
    
    // 3. Process V2 Data and integrate into alerts
    if (Array.isArray(matrixV2Raw) && matrixV2Raw.length > 0) {
      console.log(`[Monitor DEBUG] Processing ${matrixV2Raw.length} V2 orders...`);
      
      // I need some utility functions for V2 processing. 
      // Instead of importing, I'll implement enough to match MatrixItem interface.
      const v2Quick: any[] = [];
      const v2Schedule: any[] = [];
      const now = Date.now();
      
      matrixV2Raw.forEach((order: any) => {
        const storeID = String(order.store_name || "").match(/^(\d{4})/) ? order.store_name.match(/^(\d{4})/)[1] : String(order.store_name || "").slice(0, 4);
        const status = (order.partial_status || "CREATED").toUpperCase();
        
        // Age calculation
        let ageMins = 0;
        if (order.created_at) {
          const created = new Date(order.created_at).getTime();
          if (!isNaN(created)) ageMins = Math.floor((now - created) / 60000);
        }
        
        // Bucket
        let bucket = "60+ MIN";
        if (ageMins < 5) bucket = "0-5 MIN";
        else if (ageMins < 10) bucket = "5-10 MIN";
        else if (ageMins < 15) bucket = "10-15 MIN";
        else if (ageMins < 20) bucket = "15-20 MIN";
        else if (ageMins < 30) bucket = "20-30 MIN";
        else if (ageMins < 40) bucket = "30-40 MIN";
        else if (ageMins < 50) bucket = "40-50 MIN";
        else if (ageMins < 60) bucket = "50-60 MIN";

        // Slot formulation for schedule
        const slot = `${order.slot_from || ""} - ${order.slot_to || ""}`.trim();

        const item = {
          status,
          storeID,
          orderID: order.job_number || "",
          slot,
          bucket,
          timestamp: order.created_at || ""
        };

        if (order.source === 'EXPRESS') {
          v2Quick.push(item);
        } else if (order.source === 'DEFAULT') {
          v2Schedule.push(item);
        }
      });
      
      console.log(`[Monitor DEBUG] V2 Processed: Quick=${v2Quick.length}, Sched=${v2Schedule.length}`);
      
      // Merge with V1 data
      // For now, we prefer V2 if it exists (it's often more current/detailed)
      const dedupItems = (v1: any[], v2: any[]) => {
        const map = new Map<string, any>();
        v1.forEach(item => { if (item.orderID) map.set(item.orderID, item); });
        v2.forEach(item => { if (item.orderID) map.set(item.orderID, item); }); // V2 overwrites V1
        return Array.from(map.values());
      };

      matrixData.quick = dedupItems(matrixData.quick, v2Quick);
      matrixData.schedule = dedupItems(matrixData.schedule, v2Schedule);
    }

    // --- OOS Detection (Items with status REMOVED) ---
    const matrixV2Array = Array.isArray(matrixV2Raw) ? matrixV2Raw : [];
    if (matrixV2Array.length > 0) {
      console.log(`[Monitor DEBUG] Scanning ${matrixV2Array.length} V2 orders for OOS items...`);
      let foundOOSCount = 0;
      for (const order of matrixV2Array) {
        if (!order.items || !Array.isArray(order.items)) continue;
        
        const orderId = order.job_number || "";
        const rawStoreName = String(order.store_name || "");
        const storeMatch = rawStoreName.match(/^(\d{4})/);
        const storeId = storeMatch ? storeMatch[1] : (rawStoreName.slice(0, 4) || "UNKNOWN");
        
        const slot = `${order.slot_from || ""} - ${order.slot_to || ""}`.trim();
        const updatedAtStr = new Date().toISOString();
        
        const removedItems = order.items.filter((item: any) => {
          const itemStatus = String(item.item_status || item.status || "").toUpperCase().trim();
          const isRemoved = itemStatus === "REMOVED";
          if (isRemoved && orderId === "Lulu-323901346074INP1") {
            console.log(`[Monitor DEBUG] Found REMOVED item in target order ${orderId}: SKU=${item.sku}, Name=${item.item_name}`);
          }
          return isRemoved;
        });
        
        if (removedItems.length > 0) {
          foundOOSCount += removedItems.length;
          console.log(`[Monitor DEBUG] Order ${orderId} has ${removedItems.length} OOS items.`);
        }
        
        for (const item of removedItems) {
          const sku = item.sku || "";
          if (!sku) continue;
          
          // Unique key for OOS entry
          const oosKey = `${orderId}_${sku}`.replace(/\//g, '_');
          
          const docSnap = await db.collection('oos_history').doc(oosKey).get();
          const isNewOOS = !docSnap.exists;

          await db.collection('oos_history').doc(oosKey).set({
            orderId,
            sku,
            itemName: item.item_name || "",
            storeId,
            quantity: item.quantity || 0,
            foundQty: item.found_qty || 0,
            location: item.location || "",
            slot,
            status: "REMOVED",
            timestamp: updatedAtStr,
            orderCreatedAt: order.created_at || "",
            photoUrl: item.photo_url || "",
            pickerName: item.picker_name || item.picked_by || item.user_name || "System Detected",
            updatedAt: new Date()
          }, { merge: true });

          // Send Push Notification if this is a newly detected OOS and pushes are enabled
          if (isNewOOS && oosPushEnabled) {
            // Find store's region if possible
            const storeRegionObj = regions.find((r: any) => 
               Array.isArray(r.stores) && r.stores.includes(storeId)
            );
            const storeRegion = storeRegionObj ? storeRegionObj.name : "";

            const getSmallThumbnailUrl = (url: string) => {
              if (!url) return "";
              const str = String(url);
              if (str.includes("drive.google.com")) {
                const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
                if (id) return `https://lh3.googleusercontent.com/d/${id}=s200`;
              }
              return str;
            };

            await sendFilteredNotification({
              title: `⚠️ OUT OF STOCK DETECTED`,
              body: `Item ${item.item_name} (SKU: ${sku}) marked returning OOS at Store ${storeId}.`,
              data: { orderId, type: "oos", storeId },
              ...(item.photo_url ? { image: getSmallThumbnailUrl(item.photo_url) } : {})
            }, storeId, storeRegion, false, true);
          }
        }
      }
    }

    console.log(`[Monitor DEBUG] Total Orders (V1+V2): Quick=${matrixData.quick.length}, Sched=${matrixData.schedule.length}, Regions Raw=${regions.length}`);

    // 4. Fetch Existing Alerts (to avoid duplicates) - Only last 1 hour
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const oneHourAgoISO = oneHourAgo.toISOString();
    
    // Cleanup: Delete alerts older than 1 hour
    const oldAlertsSnap = await db.collection('alerts')
      .where('timestamp', '<', oneHourAgoISO)
      .get();
    
    if (!oldAlertsSnap.empty) {
      console.log(`[Monitor DEBUG] Cleaning up ${oldAlertsSnap.size} old alerts...`);
      const batch = db.batch();
      oldAlertsSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }

    const lookbackISO = oneHourAgoISO;
    const existingAlertsSnap = await db.collection('alerts')
      .where('timestamp', '>=', lookbackISO)
      .get();

    const existingAlertsMap = new Map<string, any>();
    existingAlertsSnap.docs.forEach((doc: any) => {
      const d = doc.data();
      const key = (d.alertKey || doc.id).toLowerCase().trim();
      existingAlertsMap.set(key, d);
    });

    const existingAlertIds = new Set<string>(existingAlertsMap.keys());
    console.log(`[Monitor DEBUG] Dedup memory size: ${existingAlertIds.size} (1h lookback)`);

    // Function relocated.

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
          alertKey: alertId, // Using the ID which is the unique key
          slot: alert.item.slot || "",
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
            timeout: 30000
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
              timeout: 30000
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
    
    // Automatically archive old OOS records older than 24 hours to keep free tier clean
    await archiveOldOOS(db);
    
    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}

async function archiveOldOOS(db: any) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snap = await db.collection("oos_history")
       .where("updatedAt", "<", oneDayAgo)
       .limit(500)
       .get();
    if (snap.empty) return;
    
    console.log(`[Monitor] Found ${snap.size} old OOS records to archive.`);
    const docs = snap.docs;
    const archiveData = docs.map((d: any) => ({ ...d.data(), id: d.id }));
    
    let baseUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "https://script.google.com/macros/s/AKfycbz6l6gUuVhoXde_zYZNNGchQLnvzZHE8_kkk2RcvQyk55tpitg2N8ZQHVo_DV7FO71Gzw/exec").trim();
    
    try {
      await axios.post(baseUrl, 
        new URLSearchParams({
           action: "archiveOOS",
           data: JSON.stringify(archiveData)
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    } catch (err) {
       console.error("[Monitor] GAS archive network error, skipping delete this tick.");
       return; 
    }
    
    // If success (or at least no network throw), delete from firebase
    const batch = db.batch();
    docs.forEach((doc: any) => {
       batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`[Monitor] Successfully archived and deleted ${docs.length} old OOS records.`);
  } catch (error) {
     console.error("[Monitor] Error archiving old OOS:", error);
  }
}
