const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

admin.initializeApp();

// Correct Database ID as requested
const FIRESTORE_DB_ID = "ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48";
const db = getFirestore(admin.app(), FIRESTORE_DB_ID);
const messaging = admin.messaging();

// Correct GAS URL as requested
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbynf6n_5CXYyb4xXqwR-EoO_50BFgsiT98_JkRdftZDsDN7UQvgZoJCcuEN0Yr0vuIR/exec";

// --- Shared Logic ---

const PREP_STATUSES = [
  "PICKING", "PICKING WITH PACKING", "PICKING WITH UNASSIGNED ZONE",
  "STORING", "STORED", "PARKED", "AUDITING", "TRANSFERRING"
];

const DELIVERY_STATUSES = [
  "GOING TO ORIGIN", "GOING TO DESTINATION", "IN ROUTE", "DELIVERING"
];

const AGE_BUCKETS = [
  "0-5MIN", "5-10MIN", "10-15MIN", "15-20MIN", "20-25MIN", "25-30MIN",
  "30-35MIN", "35-40MIN", "40-45MIN", "45-50MIN", "50-55MIN", "55-60MIN", "60MIN+"
];

const getBucketIndex = (bucket) => {
  const normalized = (bucket || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  return AGE_BUCKETS.findIndex(b => b.toUpperCase().replace(/\s+/g, '').trim() === normalized);
};

const parseTime = (t) => {
  if (!t) return 0;
  const cleaned = t.trim().toUpperCase();
  const match = cleaned.match(/(\d+)(?::(\d+))?\s*(AM|PM)/);
  if (!match) return 0;
  let hrs = parseInt(match[1], 10);
  let mins = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];
  if (period === 'PM' && hrs !== 12) hrs += 12;
  if (period === 'AM' && hrs === 12) hrs = 0;
  return hrs * 60 + mins;
};

const parseSlot = (slot) => {
  if (!slot || !slot.includes('-')) return null;
  const [startStr, endStr] = slot.split('-').map(s => s.trim());
  return { start: parseTime(startStr), end: parseTime(endStr) };
};

function detectAlerts(matrixData, escalationRules, existingAlertIds, scheduledThreshold = 30, storeToRegion = {}, scheduledConfig = {}) {
  const results = [];
  const normalize = (s) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  const activeRules = escalationRules.filter(r => r.isActive);
  
  // ✅ FIX 4: Convert current UTC time to KSA Local Time (UTC+3) for comparison with KSA-based raw data
  const now = new Date();
  const nowMins = (now.getUTCHours() * 60 + now.getUTCMinutes() + 180) % 1440;

  if (activeRules.length > 0) {
    (matrixData.quick || []).forEach(item => {
      const status = normalize(item.status);
      const bucket = normalize(item.bucket);
      const itemBucketIndex = getBucketIndex(item.bucket);
      const itemStoreId = String(item.storeID || "").trim();
      const itemRegion = normalize(storeToRegion[itemStoreId] || "");

      const matchingRules = activeRules.filter(rule => {
        const ruleStatus = normalize(rule.status);
        const ruleBucketIndex = getBucketIndex(rule.bucket);
        const ruleRegion = normalize(rule.region || "All");

        const basicMatch = ruleStatus === status && itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
        if (!basicMatch) return false;

        if (ruleRegion === "ALL") return true;
        return ruleRegion === itemRegion;
      });
      if (matchingRules.length > 0) {
        const alertKey = `QUICK|${item.orderID}|${status}|${bucket}`.toLowerCase().trim();
        if (!existingAlertIds.has(alertKey)) {
          results.push({ 
            alertKey, 
            item, 
            statusTrigger: `${item.status} (${item.bucket})`, 
            bucket: item.bucket,
            type: 'QUICK'
          });
        }
      }
    });
  }

  (matrixData.schedule || []).forEach(item => {
    if (item.slot) {
      const dateMatch = item.slot.match(/([A-Za-z]{3}\s\d{1,2},\s\d{4})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          const today = new Date();
          // Adjust today to KSA for date comparison if needed, though day is usually same
          const isToday = d.getDate() === today.getDate() && 
                          d.getMonth() === today.getMonth() && 
                          d.getFullYear() === today.getFullYear();
          if (!isToday) return;
        }
      }
    }

    const slotInfo = parseSlot(item.slot);
    if (!slotInfo) return;
    const status = (item.status || "").toUpperCase().trim();
    const itemStoreId = String(item.storeID || "").trim();
    const itemRegion = normalize(storeToRegion[itemStoreId] || "");

    let shouldTrigger = false;
    let triggerType = null;

    if (nowMins >= slotInfo.end) {
      shouldTrigger = true;
      triggerType = 'PAST';
    } else if (nowMins >= slotInfo.start) {
      if (PREP_STATUSES.includes(status)) {
        shouldTrigger = true;
        triggerType = 'RUNNING';
      } else if (DELIVERY_STATUSES.includes(status) && nowMins >= slotInfo.end - scheduledThreshold) {
        shouldTrigger = true;
        triggerType = 'RUNNING';
      }
    }

    if (shouldTrigger && triggerType && scheduledConfig) {
      const config = triggerType === 'PAST' ? scheduledConfig.pastSlot : scheduledConfig.runningSlot;
      if (config) {
        if (config.isActive === false) shouldTrigger = false;
        if (shouldTrigger && config.regions && config.regions.length > 0) {
          const normalizedTargetRegions = config.regions.map(r => normalize(r));
          const matchesRegion = normalizedTargetRegions.includes('ALL') || normalizedTargetRegions.includes(itemRegion);
          if (!matchesRegion) shouldTrigger = false;
        }
      }
    }

    if (shouldTrigger) {
      const alertKey = `SCHED|${item.orderID}|${status}|${item.slot}`.toLowerCase().trim();
      if (!existingAlertIds.has(alertKey)) {
        results.push({ 
          alertKey, 
          item, 
          statusTrigger: `Still in '${item.status}' Stage - ${item.slot}`, 
          bucket: item.slot,
          type: 'SCHED'
        });
      }
    }
  });
  return results;
}

// --- Scheduled Function ---

exports.systemSupervisor = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
  try {
    console.log("[Monitor] Scheduled tick started (5m interval)...");
    
    // 1. Fetch Config
    const configSnap = await db.collection('system').doc('config').get();
    const config = configSnap.exists ? configSnap.data() : {};
    const rules = (config.escalationRules || []).filter(r => r.isActive);
    
    // 2. Fetch Data from GAS
    const [mRes, aRes] = await Promise.all([
      axios.get(`${GAS_API_URL}?action=getMatrixData`),
      axios.get(`${GAS_API_URL}?action=getAdminData`)
    ]);

    const matrixRaw = mRes.data.status === "success" ? mRes.data.data : mRes.data;
    const adminRaw = aRes.data.status === "success" ? aRes.data.data : aRes.data;

    if (!matrixRaw || !adminRaw) {
      console.warn("[Monitor] Data missing from GAS.");
      return null;
    }

    // 3. Process Regions
    const storeToRegion = {};
    (adminRaw.regions || []).forEach(r => {
      const sId = String(r.storeId || r.StoreID || "").trim();
      const reg = String(r.region || r.Region || "").trim();
      if (sId) storeToRegion[sId] = reg;
    });

    // 4. Existing Alerts (to avoid dupes)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const alertSnap = await db.collection('alerts').where('timestamp', '>=', oneHourAgo).get();
    const existingIds = new Set(alertSnap.docs.map(doc => doc.id.toLowerCase().trim()));

    // 5. Detect
    const newAlerts = detectAlerts(
      { quick: matrixRaw.quick || [], schedule: matrixRaw.schedule || [] },
      rules,
      existingIds,
      config.scheduledThreshold || 30,
      storeToRegion,
      { pastSlot: config.scheduledPastSlot, runningSlot: config.scheduledRunningSlot }
    );

    // 6. Save & Notify
    for (const alert of newAlerts) {
      const alertId = alert.alertKey;
      const now = new Date().toISOString();
      
      await db.collection('alerts').doc(alertId).set({
        timestamp: now,
        orderId: alert.item.orderID || "",
        eventType: 'trigger',
        storeId: String(alert.item.storeID || "").trim(),
        userId: "SYSTEM_SCHEDULED",
        bucket: alert.bucket || "",
        status: "Pending",
        escalation: "FALSE",
        managerStatus: "Pending",
        orderCreatedAt: alert.item.timestamp || now,
        statusTrigger: alert.statusTrigger || "",
        triggeredAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[Monitor] Triggered: ${alertId}`);
    }

    return null;
  } catch (error) {
    console.error("[Monitor] Fatal Error:", error);
    return null;
  }
});
