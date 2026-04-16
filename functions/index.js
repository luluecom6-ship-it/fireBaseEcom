const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

admin.initializeApp();

const db = getFirestore(admin.app(), "ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48");
const messaging = admin.messaging();

// --- Shared Logic (Self-contained for deployment) ---

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
  // Match HH:MM AM/PM or HH AM/PM, potentially preceded by a date
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

function detectAlerts(matrixData, escalationRules, existingAlertIds, scheduledThreshold = 30, storeToRegion = {}) {
  const results = [];
  const normalize = (s) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  const activeRules = escalationRules.filter(r => r.isActive);
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (activeRules.length > 0) {
    (matrixData.quick || []).forEach(item => {
      const status = normalize(item.status);
      const bucket = normalize(item.bucket);
      const itemBucketIndex = getBucketIndex(item.bucket);
      const itemStoreId = String(item.storeID || "").trim();
      const itemRegion = storeToRegion[itemStoreId] || "";

      const matchingRules = activeRules.filter(rule => {
        const ruleStatus = normalize(rule.status);
        const ruleBucketIndex = getBucketIndex(rule.bucket);
        const ruleRegion = (rule.region || "All").trim();

        const basicMatch = ruleStatus === status && itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
        if (!basicMatch) return false;

        if (ruleRegion === "All") return true;
        return ruleRegion === itemRegion;
      });
      if (matchingRules.length > 0) {
        const alertKey = `QUICK|${item.orderID}|${status}|${bucket}`.toLowerCase().trim();
        if (!existingAlertIds.has(alertKey)) {
          results.push({ alertKey, item, statusTrigger: `${item.status} (${item.bucket})`, bucket: item.bucket });
        }
      }
    });
  }

  (matrixData.schedule || []).forEach(item => {
    // Check if slot contains a date and if it's today
    if (item.slot) {
      const dateMatch = item.slot.match(/([A-Za-z]{3}\s\d{1,2},\s\d{4})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          const today = new Date();
          const isToday = d.getDate() === today.getDate() && 
                          d.getMonth() === today.getMonth() && 
                          d.getFullYear() === today.getFullYear();
          if (!isToday) return; // Skip if not today
        }
      }
    }

    const slotInfo = parseSlot(item.slot);
    if (!slotInfo) return;
    const status = (item.status || "").toUpperCase().trim();
    let shouldTrigger = false;
    if (nowMins >= slotInfo.end) {
      shouldTrigger = true;
    } else if (nowMins >= slotInfo.start) {
      if (PREP_STATUSES.includes(status)) {
        shouldTrigger = true;
      } else if (DELIVERY_STATUSES.includes(status) && nowMins >= slotInfo.end - scheduledThreshold) {
        shouldTrigger = true;
      }
    }
    if (shouldTrigger) {
      const alertKey = `SCHED|${item.orderID}|${status}|${item.slot}`.toLowerCase().trim();
      if (!existingAlertIds.has(alertKey)) {
        results.push({ alertKey, item, statusTrigger: `Still in '${item.status}' Stage - ${item.slot}`, bucket: item.slot });
      }
    }
  });
  return results;
}

// --- Scheduled Function ---

let cachedConfig = null;
let lastConfigFetch = 0;

// exports.systemSupervisor = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
//   try {
//     console.log("[Monitor] Scheduled tick started (5m interval)...");
//     ...
//   } catch (error) {
//     console.error("[Monitor] Error:", error);
//     return null;
//   }
// });
