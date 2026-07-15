import { detectAlerts } from "../utils/alertLogic.js";
import { executeGasRequest } from "./gasService.js";
import axios from "axios";
import { getPickedItems, getTotalItems, getPickedSkuCount, getSkuCount, getPickerInfo, getDriverInfo, getOrderLifecycle } from "../typesV2.js";

// Memory caches to prevent continuous reads/writes of identical records
const processedOOSKeys = new Set<string>();
let isOOSCacheInitialized = false;

const existingAlertsCache = new Map<string, any>();
let isAlertsCacheInitialized = false;

// Cache for config and tokens
let cachedConfig: any = {};
let cachedTokensData: any[] = [];
let lastConfigTokenFetchTime = 0;
let lastWhatsappQueueCheckTime = 0;
let lastCleanupTime = 0;
let lastOOSArchiveTime = 0;

// WhatsApp dedup: track which alertKey+bucket combos already got a WhatsApp message
const whatsappSentCache = new Map<string, string>();
let isWaCacheInitialized = false;

const normalizeStoreId = (id: string | number | null | undefined): string => {
  if (id === null || id === undefined) return "";
  const s = String(id).trim().toLowerCase();
  if (/^0+[1-9]\d*$/.test(s)) {
    return s.replace(/^0+/, "");
  }
  return s;
};

const normalizeRole = (role: string | null | undefined): string => {
  return String(role || "").toLowerCase().trim();
};

const normalizeRegion = (region: string | null | undefined): string => {
  return String(region || "").toLowerCase().trim();
};

const isStoreMatch = (uStore: string, tStore: string): boolean => {
  const userStoreId = normalizeStoreId(uStore);
  const targetStoreId = normalizeStoreId(tStore);
  if (userStoreId === 'all' || userStoreId === 'all stores' || userStoreId === 'all_stores' || userStoreId === '') return true;
  if (targetStoreId === 'all' || targetStoreId === 'all stores' || targetStoreId === 'all_stores' || targetStoreId === '') return true;
  return userStoreId === targetStoreId;
};

const isRegionMatch = (uRegion: string, tRegion: string): boolean => {
  const userRegion = normalizeRegion(uRegion);
  const targetRegion = normalizeRegion(tRegion);
  if (userRegion === 'all' || userRegion === 'all regions' || userRegion === 'all_regions' || userRegion === '') return true;
  if (targetRegion === 'all' || targetRegion === 'all regions' || targetRegion === 'all_regions' || targetRegion === '') return true;
  return userRegion === targetRegion || userRegion.includes(targetRegion) || targetRegion.includes(userRegion);
};

export async function runMonitorTick(db: any, messaging: any) {
  try {
    console.log(`[Monitor] Tick started...`);
    
    if (!isOOSCacheInitialized) {
      console.log(`[Monitor] Initializing OOS memory cache from Firebase (recent 24h only)...`);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const oosSnap = await db.collection("oos_history")
        .where("updatedAt", ">=", oneDayAgo)
        .select()
        .get(); // select() only gets document IDs to save bandwidth
      oosSnap.docs.forEach((d: any) => processedOOSKeys.add(d.id));
      isOOSCacheInitialized = true;
      console.log(`[Monitor] Loaded ${processedOOSKeys.size} recent OOS keys into memory.`);
    }
    
    // Refresh config and tokens every 10 minutes (saves massive quota limit)
    const nowTime = Date.now();
    if (nowTime - lastConfigTokenFetchTime > 10 * 60 * 1000) {
      console.log(`[Monitor DEBUG] Refreshing config and fcm_tokens from Firebase...`);
      const configDoc = await db.collection('system').doc('config').get();
      cachedConfig = configDoc.exists ? configDoc.data() : {};
      
      const tokensSnap = await db.collection('fcm_tokens').get();
      cachedTokensData = tokensSnap.docs.map((doc: any) => ({ ...doc.data(), ref: doc.ref }));
      
      lastConfigTokenFetchTime = nowTime;
    }
    
    const config = cachedConfig;
    const allTokensData = cachedTokensData;
    
    // Push notification rules (FCM) - used for detectAlerts() and Firebase alert writes
    const escalationRules = (config.escalationRules || []).filter((r: any) => r.isActive);
    // WhatsApp rules - handled separately, NOT fed into detectAlerts()
    const waEscalationRules = (config.whatsappEscalationRules || []).filter((r: any) => r.isActive);
    const scheduledThreshold = config.scheduledThreshold || 30;
    const oosPushEnabled = config.oosPushEnabled !== false; // Default true
    const scheduledConfig = {
      pastSlot: config.scheduledPastSlot,
      runningSlot: config.scheduledRunningSlot
    };

    console.log(`[Monitor DEBUG] Config: pushRules=${escalationRules.length}, whatsappRules=${waEscalationRules.length}`);

    // Helper for sending notifications with role-based filtering
    const sendFilteredNotification = async (payload: { title: string, body: string, data: any, icon?: string, image?: string }, alertStoreId: string, alertRegion: string, isEscalation: boolean, isOOS?: boolean) => {
      const validDocs = allTokensData.filter((data: any) => {
        if (!data.token) return false;
        const userRole = normalizeRole(data.role);
        const userStoreId = normalizeStoreId(data.storeId);
        const userRegion = normalizeRegion(data.region);

        const targetStoreId = normalizeStoreId(alertStoreId);
        const targetRegion = normalizeRegion(alertRegion);

        if (isOOS) {
          if (userRole === 'admin') return true;
          if (userRole === 'supervisor') {
            return isRegionMatch(data.region, alertRegion);
          }
          if (['manager', 'store', 'picker', 'driver', 'staff', 'operator'].includes(userRole)) {
            return isStoreMatch(data.storeId, alertStoreId);
          }
          return false;
        }

        // Level 2 (Escalation): Manager, Supervisor, Admin
        if (isEscalation) {
          if (userRole === 'admin') return true;
          if (userRole === 'supervisor') {
            return isRegionMatch(data.region, alertRegion);
          }
          if (userRole === 'manager') {
            return isStoreMatch(data.storeId, alertStoreId);
          }
          return false;
        } 
        
        // Level 1 (Initial): Picker, Store
        if (['picker', 'store', 'staff', 'operator'].includes(userRole)) {
          return isStoreMatch(data.storeId, alertStoreId);
        }

        return false;
      });

      const tokens = validDocs.map((data: any) => data.token);
      if (tokens.length > 0) {
        let message: any;
        if (isOOS) {
          message = {
            notification: {
              title: payload.title,
              body: payload.body,
              image: payload.image || ""
            },
            webpush: {
              notification: {
                icon: payload.icon || 'https://placehold.co/192x192.png?text=OOS',
                image: payload.image || 'https://placehold.co/192x192.png?text=OOS'
              }
            },
            data: {
              orderId: String(payload.data?.orderId || ""),
              type: String(payload.data?.type || ""),
              storeId: String(payload.data?.storeId || ""),
              icon: String(payload.icon || ""),
              image: String(payload.image || "")
            },
            tokens: tokens
          };
        } else {
          message = {
            notification: {
              title: payload.title,
              body: payload.body,
              image: payload.image || ""
            },
            data: {
              orderId: String(payload.data?.orderId || ""),
              type: String(payload.data?.type || "alert"),
              alertId: String(payload.data?.alertId || "")
            },
            tokens: tokens
          };
        }

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
    const FALLBACK_V2_GAS_URL = "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec";
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
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getMatrixData` }, { skipCache: true, cacheKey: `GET:${baseUrl}:action=getMatrixData` })
        .catch((err: any) => {
          console.error(`[Monitor] matrixRes query failed:`, err.message);
          return { status: 200, data: { status: "success", data: [] } };
        }),
      executeGasRequest({ method: 'GET', url: `${baseUrl}?action=getAdminData` }, { skipCache: true, cacheKey: `GET:${baseUrl}:action=getAdminData` })
        .catch((err: any) => {
          console.error(`[Monitor] adminRes query failed:`, err.message);
          return { status: 200, data: { status: "success", data: { regions: [], users: [], attendance: [], orders: [] } } };
        }),
      executeGasRequest({ method: 'GET', url: `${v2Url}${v2Url.includes('?') ? '&' : '?'}action=getMatrixDataV2` }, { skipCache: true, cacheKey: `GET:${v2Url}:action=getMatrixDataV2` })
        .catch((err: any) => {
          console.error(`[Monitor] matrixV2Res query failed:`, err.message);
          return { status: 200, data: { status: "success", data: [] } };
        })
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

    const storeToRegion: Record<string, string> = {};
    regions.forEach((r: any) => {
      const sId = String(r.storeId || r.StoreID || "").trim();
      const reg = String(r.region || r.Region || "").trim();
      if (sId) storeToRegion[sId] = reg;
    });

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
        const rawStore = String(order.store_name || "");
        const sMatch = rawStore.match(/\b(\d{4})\b/);
        const storeID = sMatch ? sMatch[1] : (rawStore.slice(0, 4) || "UNKNOWN");
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
        const storeMatch = rawStoreName.match(/\b(\d{4})\b/);
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
          
          // If we already saw this specific OOS instance, skip entirely to save Firebase quota
          if (processedOOSKeys.has(oosKey)) {
            continue;
          }

          // Double check database to prevent duplicates from overlapping server instances/triggers
          const oosDocRef = db.collection('oos_history').doc(oosKey);
          const oosDocSnap = await oosDocRef.get();
          if (oosDocSnap.exists) {
            processedOOSKeys.add(oosKey);
            continue;
          }
          
          await db.collection('oos_history').doc(oosKey).set({
            orderId,
            sku,
            itemName: item.item_name || "",
            storeId,
            storeName: rawStoreName,
            quantity: item.quantity || 0,
            foundQty: item.found_qty || 0,
            location: item.location || "",
            slot,
            status: "REMOVED",
            timestamp: updatedAtStr,
            orderCreatedAt: order.created_at || "",
            photoUrl: item.photo_url || "",
            pickerName: item.picker_name || item.picked_by || item.user_name || "System Detected",
            whatsappSent: false,
            updatedAt: new Date()
          });

          // Send Push Notification if this is a newly detected OOS and pushes are enabled
          if (oosPushEnabled) {
              // Find store's region if possible
              const storeRegion = storeToRegion[storeId] || "";

              const oosPushRegions = config.oosPushRegions || ['All'];
              const isRegionAllowed = oosPushRegions.includes('All') || (storeRegion && oosPushRegions.some((cr: string) => cr.toLowerCase() === storeRegion.toLowerCase()));

              if (isRegionAllowed) {

              const getSmallThumbnailUrl = (url: string) => {
                if (!url) return "";
                const str = String(url);
                if (str.includes("drive.google.com")) {
                  const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
                  if (id) return `https://lh3.googleusercontent.com/d/${id}=s200`;
                }
                return str;
              };

              const getLargeImageUrl = (url: string) => {
                if (!url) return "";
                const str = String(url);
                if (str.includes("drive.google.com")) {
                  const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
                  if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
                }
                return str;
              };

              await sendFilteredNotification({
                title: `⚠️ OUT OF STOCK DETECTED`,
                body: `Item ${item.item_name} (SKU: ${sku}) at Store ${storeId}.`,
                icon: getSmallThumbnailUrl(item.photo_url),
                image: getLargeImageUrl(item.photo_url),
                data: { orderId, type: "oos", storeId }
              }, storeId, storeRegion, false, true);
              }
            }
          
          // Register in memory so we don't query/write again this session
          processedOOSKeys.add(oosKey);
        }
      }
    }

    console.log(`[Monitor DEBUG] Total Orders (V1+V2): Quick=${matrixData.quick.length}, Sched=${matrixData.schedule.length}, Regions Raw=${regions.length}`);

    // 4. Fetch Existing Alerts (to avoid duplicates) - Only last 1 hour
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const oneHourAgoISO = oneHourAgo.toISOString();
    
    // Cleanup: Delete alerts older than 1 hour (Run every 6 hours to save quota)
    if (nowTime - lastCleanupTime > 6 * 60 * 60 * 1000) {
      lastCleanupTime = nowTime;
      const oldAlertsSnap = await db.collection('alerts')
        .where('timestamp', '<', oneHourAgoISO)
        .limit(200)
        .get();
      
      if (!oldAlertsSnap.empty) {
        console.log(`[Monitor DEBUG] Cleaning up ${oldAlertsSnap.size} old alerts from Firebase...`);
        const batch = db.batch();
        oldAlertsSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
      }
    }

    if (!isAlertsCacheInitialized) {
      const existingAlertsSnap = await db.collection('alerts')
        .where('timestamp', '>=', oneHourAgoISO)
        .get();

      existingAlertsSnap.docs.forEach((doc: any) => {
        const d = doc.data();
        const key = (d.alertKey || doc.id).toLowerCase().trim();
        existingAlertsCache.set(key, d);
      });
      isAlertsCacheInitialized = true;
      console.log(`[Monitor DEBUG] Initialized alerts cache with size: ${existingAlertsCache.size}`);
    }

    if (!isWaCacheInitialized) {
      const existingWaSnap = await db.collection('whatsapp_logs')
        .where('timestamp', '>=', oneHourAgoISO)
        .get();

      existingWaSnap.docs.forEach((doc: any) => {
        const d = doc.data();
        whatsappSentCache.set(doc.id, d.timestamp);
      });
      isWaCacheInitialized = true;
      console.log(`[Monitor DEBUG] Initialized WhatsApp cache with size: ${whatsappSentCache.size}`);
    }

    // Cleanup memory trace of old alerts
    for (const [k, v] of existingAlertsCache.entries()) {
      if (v.timestamp && v.timestamp < oneHourAgoISO) {
        existingAlertsCache.delete(k);
      }
    }

    // Cleanup memory trace of old WhatsApp logs
    for (const [k, ts] of whatsappSentCache.entries()) {
      if (ts && ts < oneHourAgoISO) {
        whatsappSentCache.delete(k);
      }
    }

    const existingAlertIds = new Set<string>(existingAlertsCache.keys());
    console.log(`[Monitor DEBUG] Dedup memory size: ${existingAlertIds.size} (1h lookback)`);

    // Function relocated.

    // 6. Detect New Alerts

    const activeAlertsDetected = detectAlerts(matrixData, escalationRules as any, existingAlertIds, scheduledThreshold, storeToRegion, scheduledConfig);
    console.log(`[Monitor DEBUG] Detection complete. Potential alerts: ${activeAlertsDetected.length}`);
    
    for (const alert of activeAlertsDetected) {
      const alertId = alert.alertKey;
      const existing = existingAlertsCache.get(alertId);
      
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
      }      if (shouldWrite) {
        const alertData = {
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
        };

        await db.collection('alerts').doc(alertId).set(alertData, { merge: true });
        existingAlertsCache.set(alertId, alertData);

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

    // ============================================================
    // WHATSAPP DISPATCH (Independent from Push Notifications)
    // Iterates over quick commerce orders directly, NOT tied to detectAlerts()
    // ============================================================
    if (waEscalationRules.length > 0) {
      try {
        const waConfig = config;
        const {
          whatsappApiUrl,
          whatsappApiKey,
          whatsappInstanceName,
          whatsappFulfillmentMappings = [],
          whatsappLastMileMappings = [],
          whatsappGlobalGroupJid = ""
        } = waConfig;

        if (whatsappApiUrl && whatsappApiKey) {
          const normStatus = (s: string) => String(s || "").toUpperCase().replace(/[\s_]+/g, '').trim();
          const getBucketStart = (b: string) => {
            const norm = String(b || "").replace(/\s*MIN\s*/gi, "").trim();
            const m = norm.match(/(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          };

          console.log(`[WhatsApp] Processing ${(matrixData.quick || []).length} quick commerce orders against ${waEscalationRules.length} rules`);
          console.log(`[WhatsApp] Rules: ${waEscalationRules.map((r: any) => `${r.status}|${r.bucket}|${r.escalationLevel}|${r.region}|${r.storeId}`).join(' | ')}`);

          for (const qcOrder of (matrixData.quick || [])) {
            const statusStr = normStatus(qcOrder.status);
            const orderStoreId = String(qcOrder.storeID || "").trim();
            const orderRegion = storeToRegion[orderStoreId] || "";
            const orderBucketStart = getBucketStart(qcOrder.bucket);
            const waDedupeKey = `WA|${qcOrder.orderID}|${statusStr}|${qcOrder.bucket}`;

            // Find ALL matching WhatsApp escalation rules, then pick the one with highest bucket
            // This ensures Level 2/3/Global rules (higher buckets) are preferred over Level 1
            const allMatchingRules = waEscalationRules.filter((r: any) => {
              const rBucketStart = getBucketStart(r.bucket);
              const statusMatch = normStatus(r.status) === statusStr;
              const bucketMatch = orderBucketStart >= rBucketStart;
              const regionMatch = (r.region === "All" || r.region === orderRegion);
              const storeMatch = (r.storeId === "All" || String(r.storeId).trim() === orderStoreId);
              return r.isActive && statusMatch && bucketMatch && regionMatch && storeMatch;
            });

            // Sort by bucket start descending — highest bucket (most specific) first
            allMatchingRules.sort((a: any, b: any) => getBucketStart(b.bucket) - getBucketStart(a.bucket));
            const matchedRule = allMatchingRules[0] || null;

            if (!matchedRule) continue;

            // --- 10-Minute Cooldown Logic for GOING TO DESTINATION ---
            if (statusStr === 'GOINGTODESTINATION') {
              let previousAlertSent = false;
              for (const key of whatsappSentCache.keys()) {
                if (key.startsWith(`WA|${qcOrder.orderID}|TRANSFERRING|`) || 
                    key.startsWith(`WA|${qcOrder.orderID}|GOINGTOORIGIN|`)) {
                  previousAlertSent = true;
                  break;
                }
              }

              if (previousAlertSent) {
                const fullV2Order = matrixV2Array.find((o: any) => o.job_number === qcOrder.orderID);
                if (fullV2Order) {
                  const lifecycle = getOrderLifecycle(fullV2Order);
                  if (lifecycle.goingToDestinationStart) {
                    const elapsedMins = (Date.now() - new Date(lifecycle.goingToDestinationStart).getTime()) / 60000;
                    if (elapsedMins < 10) {
                      console.log(`[WhatsApp] ⏳ Cooldown: ${qcOrder.orderID} in GOING TO DESTINATION for ${elapsedMins.toFixed(1)}m. Suppressing until 10m.`);
                      continue;
                    }
                  }
                }
              }
            }

            // Dedup includes escalation level so each level fires independently
            const levelDedupeKey = `${waDedupeKey}|${matchedRule.escalationLevel || 'Level 1'}`;
            if (whatsappSentCache.has(levelDedupeKey)) continue;

            const isFulfillment = ['CREATED', 'PICKING', 'PICKINGWITHPACKING', 'PICKINGWITHUNASSIGNEDZONE', 'STORING', 'STORED'].includes(statusStr);
            const isLastMile = ['TRANSFERRING', 'GOINGTOORIGIN', 'INROUTE', 'GOINGTODESTINATION', 'DELIVERING'].includes(statusStr);
            
            let mappingsToUse = isFulfillment ? whatsappFulfillmentMappings : (isLastMile ? whatsappLastMileMappings : []);
            
            if (mappingsToUse.length === 0) {
              console.log(`[WhatsApp] ❌ No ${isFulfillment ? 'fulfillment' : 'last mile'} mappings for order ${qcOrder.orderID}`);
              continue;
            }

            const mapping = mappingsToUse.find((m: any) => String(m.storeId || "").trim() === orderStoreId);
            if (!mapping || !mapping.groupJid) {
              console.log(`[WhatsApp] ❌ No store mapping for store '${orderStoreId}' (order ${qcOrder.orderID})`);
              continue;
            }

            const instanceToUse = mapping.instanceName || whatsappInstanceName;
            if (!instanceToUse) continue;

            const targetJids = new Set<string>();
            const targetLevel = matchedRule.escalationLevel || "Level 1";

            targetJids.add(mapping.groupJid);
            if (["Level 2", "Level 3", "Global"].includes(targetLevel) && mapping.inchargeJid) {
              targetJids.add(mapping.inchargeJid);
            }
            if (["Level 3", "Global"].includes(targetLevel) && mapping.managerJid) {
              targetJids.add(mapping.managerJid);
            }
            if (targetLevel === "Global" && whatsappGlobalGroupJid) {
              targetJids.add(whatsappGlobalGroupJid);
            }

            // Format message
            let emoji = "😔";
            if (targetLevel === "Level 2") emoji = "⚠️";
            if (targetLevel === "Level 3") emoji = "🔥";
            if (targetLevel === "Global") emoji = "🚨";
            
            const fullV2Order = matrixV2Array.find((o: any) => o.job_number === qcOrder.orderID);
            const pickerInfo = fullV2Order ? getPickerInfo(fullV2Order) : null;
            const driverInfo = fullV2Order ? getDriverInfo(fullV2Order) : null;
            const storeName = fullV2Order?.store_name || `Store ${orderStoreId}`;
            
            // Use human-readable status for the message
            const displayStatus = String(qcOrder.status || "").replace(/_/g, ' ').toUpperCase();
            
            // Determine if this is a last-mile status (show driver) or fulfillment (show picker)
            const isLastMileStatus = ['TRANSFERRING', 'GOINGTOORIGIN', 'INROUTE', 'GOINGTODESTINATION', 'DELIVERING'].includes(statusStr);
            
            let messageText = `*${emoji} Alert: Quick Commerce Delay in ${displayStatus} [${qcOrder.bucket}]*\n\n`;
            
            // Status-specific action message
            const actionMessages: Record<string, string> = {
              'CREATED': 'Order created however picking not yet started.',
              'PICKING': 'Order is still in picking status. Kindly complete the picking on priority.',
              'PICKINGWITHPACKING': 'Order is still in picking status. Kindly complete the picking on priority.',
              'PICKINGWITHUNASSIGNEDZONE': 'Order is still in picking status. Kindly complete the picking on priority.',
              'STORED': 'Order is still not handed over to Driver/Rider. Please handover immediately.',
              'STORING': 'Order is still not handed over to Driver/Rider. Please handover immediately.',
              'TRANSFERRING': 'Driver still not collected the Order - Please check and push him.',
              'GOINGTOORIGIN': 'Driver still not reached the Store - Please check and push him.',
              'GOINGTODESTINATION': 'Driver still did not delivered the Order to customer. Please check and push for on time delivery',
              'INROUTE': 'Driver is still in Route. Please follow up with him to deliver the order on time.',
              'DELIVERING': 'Order still showing in delivering - Please check with the driver whether order delivered to customer or not. If delivered ask him to update in the app.',
            };
            const actionMsg = actionMessages[statusStr] || '';
            if (actionMsg) {
              messageText += `_${actionMsg}_\n\n`;
            }
            
            messageText += `*Order:* ${qcOrder.orderID}\n`;
            messageText += `*Store Name:* ${storeName}\n`;
            if (isLastMileStatus) {
              messageText += `*Driver Name:* ${driverInfo?.name || 'N/A'}\n`;
              if (driverInfo?.fleet) messageText += `*Fleet:* ${driverInfo.fleet}\n`;
            } else {
              messageText += `*Picker Name:* ${pickerInfo?.name || 'N/A'}\n`;
            }
            if (fullV2Order) {
              messageText += `*Picked SKUs:* ${getPickedSkuCount(fullV2Order)} / ${getSkuCount(fullV2Order)}\n`;
              messageText += `*Picked Items:* ${getPickedItems(fullV2Order)} / ${getTotalItems(fullV2Order)}\n`;
            }
            if (targetLevel === "Global") {
              messageText += `\n*ESCALATION LEVEL:* GLOBAL`;
            }

            const url = `${whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${instanceToUse}`;
            
            for (const jid of targetJids) {
              if (!jid) continue;
              try {
                const waRes = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: whatsappApiKey },
                  body: JSON.stringify({
                    number: jid,
                    options: { delay: 0, presence: "composing", linkPreview: false },
                    text: messageText,
                  }),
                });
                const waResText = await waRes.text();
                console.log(`[WhatsApp] Sent to ${jid}: HTTP ${waRes.status} - ${waResText.slice(0, 80)}`);
              } catch (sendErr: any) {
                console.error(`[WhatsApp] Failed to send to ${jid}:`, sendErr.message);
              }
            }
            console.log(`[WhatsApp] ✅ ${displayStatus} [${qcOrder.bucket}] (${targetLevel}) → ${targetJids.size} recipients for ${qcOrder.orderID}`);
            const ts = new Date().toISOString();
            whatsappSentCache.set(levelDedupeKey, ts);
            // Persist to Firebase to survive Vercel cold starts
            db.collection('whatsapp_logs').doc(levelDedupeKey.replace(/[\/\.]/g, '_')).set({ timestamp: ts }).catch((e: any) => console.error("[WhatsApp] Failed to save dedupe key:", e.message));
          }
        } else {
          console.log(`[WhatsApp] ❌ Missing whatsappApiUrl or whatsappApiKey`);
        }
      } catch (whatsappErr) {
        console.error(`[WhatsApp] Error in dispatch:`, whatsappErr);
      }
    }

    // 7. Auto-Escalation Logic (3-minute cooldown)
    // Only runs when push notification rules are configured
    if (escalationRules.length === 0) {
      // No push rules configured - clear any stale alerts from cache
      if (existingAlertsCache.size > 0) {
        console.log(`[Monitor] No push rules configured. Clearing ${existingAlertsCache.size} stale alerts from cache.`);
        existingAlertsCache.clear();
      }
    } else {
    const currentEscalationTime = Date.now();
    for (const [alertId, data] of existingAlertsCache.entries()) {
      if (data.status === "Pending" && data.escalation !== "TRUE") {
        const triggeredAt = data.triggeredAt ? new Date(data.triggeredAt).getTime() : 0;
        const ageMins = (currentEscalationTime - triggeredAt) / (1000 * 60);
        
        if (ageMins >= 3) {
          console.log(`[Monitor] Auto-escalating alert: ${alertId}`);
          
          const updateData = {
            escalation: "TRUE",
            updatedAt: new Date()
          };
          await db.collection('alerts').doc(alertId).update(updateData);
          
          // Update memory cache
          data.escalation = "TRUE";
          data.updatedAt = updateData.updatedAt;
          existingAlertsCache.set(alertId, data);
          
          // Sync escalation to GAS Legacy Logs
          try {
            const syncParams = new URLSearchParams();
            syncParams.append('action', 'logalertv2');
            syncParams.append('id', alertId);
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

            console.log(`[Monitor] Syncing escalation to GAS: ${alertId}`);
            await axios.post(baseUrl, syncParams.toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 30000
            });
          } catch (syncErr: any) {
            console.error(`[Monitor] GAS escalation sync failed for ${alertId}:`, syncErr.message);
          }

          // Notify Level 2 (Manager/Supervisor/Admin)
          await sendFilteredNotification({
            title: `🔥 ESCALATED: ${data.statusTrigger}`,
            body: `CRITICAL: Order ${data.orderId} at Store ${data.storeId} is still pending after 3 mins!`,
            data: { orderId: data.orderId, type: "alert", alertId: alertId }
          }, data.storeId, data.region, true);
        }
      }
    }
    } // end else (escalationRules.length > 0)
    
    // 8. Automated WhatsApp OOS Queue Processor
    try {
      if (config.whatsappOosEnabled && config.whatsappApiUrl && config.whatsappInstanceName && config.whatsappApiKey) {
        // Only check the queue every 5 minutes instead of every 60 seconds to save thousands of Firebase reads
        if (nowTime - lastWhatsappQueueCheckTime > 5 * 60 * 1000) {
          lastWhatsappQueueCheckTime = nowTime;
          
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          // Fetch OOS items from today that haven't been sent
          // Using == false is 2x cheaper than != true in Firestore
          const oosSnap = await db.collection("oos_history")
            .where("updatedAt", ">=", todayStart)
            .where("whatsappSent", "==", false)
            .get();

          const mappings = config.whatsappAutoOosMappings || [];

        for (const docSnap of oosSnap.docs) {
          const oosData = docSnap.data();
          
          // Double-check: skip if already sent (race condition guard)
          if (oosData.whatsappSent === true) {
            processedOOSKeys.add(`wa_${docSnap.id}`);
            continue;
          }

          // Skip if already processed in-memory during this server session
          if (processedOOSKeys.has(`wa_${docSnap.id}`)) continue;
          processedOOSKeys.add(`wa_${docSnap.id}`);

          const storeRegion = storeToRegion[oosData.storeId] || "";
          const normRegion = String(storeRegion).trim().toLowerCase();

          // Check Region Toggle
          const whatsappOosRegions = config.whatsappOosRegions || ['All'];
          const isRegionAllowed = whatsappOosRegions.includes('All') || (storeRegion && whatsappOosRegions.some((cr: string) => cr.toLowerCase() === storeRegion.toLowerCase()));
          
          if (!isRegionAllowed) {
            await docSnap.ref.update({ whatsappSent: true, whatsappError: 'Region disabled in Admin toggle' });
            continue;
          }

          let mapping = null;
          // Find automated mapping that exactly matches the region (or Global)
          mapping = mappings.find((m: any) => 
            String(m.region).trim().toLowerCase() === normRegion || ["global", "all", ""].includes(String(m.region).trim().toLowerCase())
          );

          if (mapping && mapping.groupJid) {
            const instanceToUse = mapping.instanceName || config.whatsappInstanceName;
            if (instanceToUse) {
              // PRE-MARK as sent BEFORE calling the API to prevent race conditions
              await docSnap.ref.update({ whatsappSent: true, whatsappSentAt: new Date().toISOString() });

              const storeDisplayName = oosData.storeName ? oosData.storeName : oosData.storeId;
              const waMessage = `*Out of Stock Alert!*\nStore: ${oosData.storeId}\nOrder No: ${oosData.orderId || "N/A"}\nSKU: ${oosData.sku}\nItem Name: ${oosData.itemName}\nLocation: ${oosData.location || "N/A"}\nStore Name: ${storeDisplayName}`;

              let url = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${instanceToUse}`;
              let bodyParams: any = {
                number: mapping.groupJid,
                options: { delay: 0, presence: "composing", linkPreview: false },
                text: waMessage,
              };

              if (oosData.photoUrl) {
                const getLargeImageUrl = (u: string) => {
                  if (!u) return "";
                  const str = String(u);
                  if (str.includes("drive.google.com")) {
                    const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
                    if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
                  }
                  return str;
                };

                url = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendMedia/${instanceToUse}`;
                bodyParams = {
                  number: mapping.groupJid,
                  options: { delay: 0, presence: "composing", linkPreview: false },
                  mediatype: "image",
                  mimetype: "image/jpeg",
                  caption: waMessage,
                  media: getLargeImageUrl(oosData.photoUrl),
                };
              }

              try {
                const waRes = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: config.whatsappApiKey },
                  body: JSON.stringify(bodyParams),
                });

                if (waRes.ok) {
                  console.log(`[WhatsApp Auto] Sent OOS alert for SKU ${oosData.sku}`);
                } else {
                  const errText = await waRes.text();
                  console.error(`[WhatsApp Auto] Failed to send for SKU ${oosData.sku}: ${errText}`);
                  await docSnap.ref.update({ whatsappError: `API ${waRes.status}: ${errText.slice(0, 100)}` });
                }
              } catch (sendErr: any) {
                console.error(`[WhatsApp Auto] Send error for SKU ${oosData.sku}:`, sendErr.message);
                await docSnap.ref.update({ whatsappError: sendErr.message?.slice(0, 100) });
              }
            } else {
              // Fix poison pill: mark as sent even if instance is missing
              await docSnap.ref.update({ whatsappSent: true, whatsappError: 'No WhatsApp instance configured' });
            }
          } else {
             await docSnap.ref.update({ whatsappSent: true, whatsappError: 'No mapping found for store/region' });
          }
        }
        } // Closing brace for the time check
      }
    } catch (err) {
      console.error("[Monitor] WhatsApp Auto error:", err);
    }
    
    // 9. Archive old OOS records (> 24 hours)
    if (nowTime - lastOOSArchiveTime > 6 * 60 * 60 * 1000) {
      lastOOSArchiveTime = nowTime;
      await archiveOldOOS(db);
    }
    
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
    
    let baseUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec").trim();
    
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
