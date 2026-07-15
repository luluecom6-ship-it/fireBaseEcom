"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_axios3 = __toESM(require("axios"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_firebase_admin = __toESM(require("firebase-admin"), 1);
var import_firestore = require("firebase-admin/firestore");
var import_fs = __toESM(require("fs"), 1);

// src/services/gasService.ts
var import_axios = __toESM(require("axios"), 1);
var gasCache = /* @__PURE__ */ new Map();
var LOGS_TTL = 3e4;
var CACHE_TTL = 12e4;
var REGIONS_TTL = 36e5;
var activeRequests = 0;
var MAX_CONCURRENT = 40;
var backoffMultiplier = 1;
var gasQueue = [];
var inFlightRequests = /* @__PURE__ */ new Map();
async function processGasQueue() {
  if (gasQueue.length === 0 || activeRequests >= MAX_CONCURRENT) return;
  const item = gasQueue.shift();
  if (!item) return;
  if (Date.now() - item.startTime > 3e5) {
    item.reject(new Error("Request timed out in queue"));
    processGasQueue();
    return;
  }
  activeRequests++;
  const { config, resolve, reject } = item;
  try {
    let action = "unknown";
    try {
      const urlObj = new URL(config.url);
      action = urlObj.searchParams.get("action") || "no-action";
    } catch (e) {
    }
    console.log(`[GAS Queue] Executing [${config.method}] ${action} (${activeRequests}/${MAX_CONCURRENT}) QSize: ${gasQueue.length}`);
    const response = await (0, import_axios.default)({
      ...config,
      timeout: 45e3
      // 45s timeout to avoid keeping connection slots occupied indefinitely
    });
    const dataStr = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    if (dataStr.includes("Rate exceeded")) {
      console.warn("[GAS Queue] Rate limit detected at GAS level, increasing backoff.");
      backoffMultiplier = Math.min(backoffMultiplier * 1.5, 5);
    } else {
      backoffMultiplier = Math.max(1, backoffMultiplier * 0.9);
    }
    resolve(response);
  } catch (err) {
    console.error(`[GAS Queue] Request failed: ${err.message} [URL: ${config.url.substring(0, 70)}...]`);
    reject(err);
  } finally {
    activeRequests--;
    const delay = Math.floor(500 * backoffMultiplier);
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    processGasQueue();
  }
}
async function executeGasRequest(config, options = {}) {
  const { skipCache = false, cacheKey } = options;
  if (!skipCache && cacheKey) {
    const cached = gasCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return { data: cached.data, headers: cached.headers, status: cached.status, fromCache: true };
    }
  }
  const method = config.method || "GET";
  const urlObj = new URL(config.url);
  const action = urlObj.searchParams.get("action") || "default";
  const coalescingKey = `${method}:${action}:${JSON.stringify(config.data || "")}`;
  if (method === "GET" && inFlightRequests.has(coalescingKey)) {
    console.log(`[GAS Queue] Coalescing request for action=${action}`);
    return inFlightRequests.get(coalescingKey);
  }
  const requestPromise = new Promise((resolve, reject) => {
    gasQueue.push({ config, resolve, reject, skipCache, startTime: Date.now() });
    processGasQueue();
  }).then((response) => {
    if (!skipCache && cacheKey && response.status === 200) {
      const dataStr = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      if (!dataStr.includes("error") && !dataStr.includes("Rate exceeded")) {
        const urlLower = config.url.toLowerCase();
        let ttl = CACHE_TTL;
        if (urlLower.includes("action=getregions")) {
          ttl = REGIONS_TTL;
        } else if (urlLower.includes("action=getalertlogs")) {
          ttl = LOGS_TTL;
        }
        gasCache.set(cacheKey, {
          data: response.data,
          headers: response.headers,
          status: response.status,
          expiry: Date.now() + ttl
        });
      }
    }
    return response;
  }).finally(() => {
    inFlightRequests.delete(coalescingKey);
  });
  if (method === "GET") {
    inFlightRequests.set(coalescingKey, requestPromise);
  }
  return requestPromise;
}

// src/constants.ts
var getApiUrl = () => {
  return "/api/proxy-gas";
};
var detectedUrl = getApiUrl();
console.log(`[Constants] API_URL: ${detectedUrl ? detectedUrl.substring(0, 40) + "..." : "NONE"}`);
var API_URL = (detectedUrl || "").trim();
var STATUSES = [
  "CREATED",
  "PICKING",
  "PICKING WITH PACKING",
  "PICKING WITH UNASSIGNED ZONE",
  "STORING",
  "STORED",
  "PARKED",
  "AUDITING",
  "TRANSFERRING",
  "GOING TO ORIGIN",
  "GOING TO DESTINATION",
  "IN ROUTE",
  "DELIVERING"
];
var AGE_BUCKETS = [
  "0-5MIN",
  "5-10MIN",
  "10-15MIN",
  "15-20MIN",
  "20-25MIN",
  "25-30MIN",
  "30-35MIN",
  "35-40MIN",
  "40-45MIN",
  "45-50MIN",
  "50-55MIN",
  "55-60MIN",
  "60MIN+"
];
var QUICK_STATUSES = [...STATUSES];
var SCHEDULE_STATUSES = [...STATUSES];

// src/utils/alertLogic.ts
var PREP_STATUSES = [
  "PICKING",
  "PICKING WITH PACKING",
  "PICKING WITH UNASSIGNED ZONE",
  "STORING",
  "STORED",
  "PARKED",
  "AUDITING"
];
var DELIVERY_STATUSES = [
  "TRANSFERRING",
  "GOING TO ORIGIN",
  "GOING TO DESTINATION",
  "IN ROUTE",
  "DELIVERING"
];
var getBucketIndex = (bucket) => {
  if (!bucket) return -1;
  const normalized = bucket.toString().toUpperCase().replace(/\s+/g, "").trim();
  const exactIndex = AGE_BUCKETS.findIndex((b) => b.toUpperCase().replace(/\s+/g, "").trim() === normalized);
  if (exactIndex !== -1) return exactIndex;
  const numericMatch = normalized.match(/(\d+)/);
  if (numericMatch) {
    const mins = parseInt(numericMatch[1], 10);
    return AGE_BUCKETS.findIndex((b) => {
      const bNorm = b.toUpperCase().replace(/\s+/g, "");
      if (bNorm.includes("+")) {
        const plusVal = parseInt(bNorm.replace("MIN+", ""), 10);
        return mins >= plusVal;
      }
      const parts = bNorm.replace("MIN", "").split("-");
      if (parts.length === 2) {
        const end = parseInt(parts[1], 10);
        return mins <= end && mins > parseInt(parts[0], 10);
      }
      return false;
    });
  }
  return -1;
};
var getLocalInfo = (region) => {
  const utcNow = /* @__PURE__ */ new Date();
  const r = (region || "").toUpperCase().trim();
  let offsetMinutes = 180;
  const OFFSETS = {
    "DUBAI": 240,
    // UTC+4
    "UAE": 240,
    "DXB": 240,
    "SHARJAH": 240,
    "ABUDHABI": 240,
    "AUH": 240,
    "KSA": 180,
    // UTC+3
    "SAUDI": 180,
    "RIYADH": 180,
    "RUH": 180,
    "JEDDAH": 180,
    "JED": 180,
    "QATAR": 180,
    "DOHA": 180,
    "DOH": 180,
    "KUWAIT": 180,
    "KWI": 180,
    "BAHRAIN": 180,
    "BAH": 180,
    "OMAN": 240,
    // UTC+4
    "MUSCAT": 240,
    "MCT": 240,
    "JORDAN": 180,
    // UTC+3
    "AMM": 180,
    "EGYPT": 120,
    // UTC+2
    "CAIRO": 120,
    "CAI": 120,
    "INDIA": 330,
    // UTC+5:30
    "MUMBAI": 330,
    "DELHI": 330,
    "BENGALURU": 330,
    "CHENNAI": 330,
    "HYDERABAD": 330,
    "MALAYSIA": 480,
    // UTC+8
    "INDONESIA": 420
    // UTC+7 (WIB)
  };
  for (const [key, offset] of Object.entries(OFFSETS)) {
    if (r.indexOf(key) !== -1) {
      offsetMinutes = offset;
      break;
    }
  }
  const localTimeLong = utcNow.getTime() + offsetMinutes * 6e4;
  const localDate = new Date(localTimeLong);
  return {
    nowMins: localDate.getUTCHours() * 60 + localDate.getUTCMinutes(),
    dateStr: localDate.getUTCFullYear() + "-" + String(localDate.getUTCMonth() + 1).padStart(2, "0") + "-" + String(localDate.getUTCDate()).padStart(2, "0"),
    offsetMins: offsetMinutes,
    rawLocalDate: localDate
  };
};
var parseTime = (t, offsetMins = 0) => {
  if (!t) return 0;
  const cleaned = t.trim().toUpperCase();
  if (cleaned.includes("T") || cleaned.includes("-") || cleaned.includes(":") && cleaned.length > 8) {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + offsetMins;
      return (totalMins + 1440) % 1440;
    }
  }
  const ampmMatch = cleaned.match(/(\d+)(?::(\d+))?\s*(AM|PM)/);
  if (ampmMatch) {
    let hrs = parseInt(ampmMatch[1], 10);
    let mins = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3];
    if (period === "PM" && hrs !== 12) hrs += 12;
    if (period === "AM" && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
  }
  const h24Match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (h24Match) {
    const hrs = parseInt(h24Match[1], 10);
    const mins = h24Match[2] ? parseInt(h24Match[2], 10) : 0;
    if (hrs >= 0 && hrs < 24) {
      return hrs * 60 + mins;
    }
  }
  return 0;
};
var formatTimeDisplay = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
};
var formatSlotDisplay = (slot, offsetMins = 0) => {
  if (!slot) return "";
  if (!slot.includes("-")) return slot;
  const parts = slot.split(" - ");
  if (parts.length !== 2) return slot;
  const startMins = parseTime(parts[0], offsetMins);
  const endMins = parseTime(parts[1], offsetMins);
  if (startMins === 0 && endMins === 0 && !parts[0].includes("00:00")) return slot;
  return `${formatTimeDisplay(startMins)} - ${formatTimeDisplay(endMins)}`;
};
var parseSlot = (slot, offsetMins = 0) => {
  if (!slot || !slot.includes("-")) return null;
  const [startStr, endStr] = slot.split("-").map((s) => s.trim());
  return {
    start: parseTime(startStr, offsetMins),
    end: parseTime(endStr, offsetMins)
  };
};
function detectAlerts(matrixData, escalationRules, existingAlertIds, scheduledThreshold = 30, storeToRegion = {}, scheduledConfig) {
  const results = [];
  const utcNow = /* @__PURE__ */ new Date();
  const normalize = (s) => (s || "").toString().toUpperCase().replace(/[\s_]+/g, "").trim();
  const activeRules = escalationRules.filter((r) => r.isActive);
  if (activeRules.length > 0) {
    (matrixData.quick || []).forEach((item, idx) => {
      const status = normalize(item.status);
      const bucket = normalize(item.bucket);
      const itemBucketIndex = getBucketIndex(item.bucket);
      const itemStoreId = String(item.storeID || "").trim().toUpperCase();
      const itemRegion = normalize(storeToRegion[itemStoreId] || "KSA");
      if (idx < 5) {
        console.log(`[AlertLogic DEBUG] Checking Quick Order ${item.orderID}: Status=${status}, Bucket=${bucket} (Idx ${itemBucketIndex}), Region=${itemRegion}`);
      }
      const matchingRules = activeRules.filter((rule, rIdx) => {
        const ruleStatus = normalize(rule.status);
        const ruleBucketIndex = getBucketIndex(rule.bucket);
        const ruleRegion = normalize(rule.region || "All");
        const statusMatch = ruleStatus === status;
        const bucketMatch = itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
        const regionMatch = ruleRegion === "ALL" || ruleRegion === itemRegion;
        if (idx < 5 && statusMatch) {
          console.log(`  - Rule ${rIdx}: Status=${ruleStatus}, BucketIdx=${ruleBucketIndex}, Region=${ruleRegion} -> Match: Status=${statusMatch}, Bucket=${bucketMatch}, Region=${regionMatch}`);
        }
        return statusMatch && bucketMatch && regionMatch;
      });
      if (matchingRules.length > 0) {
        const alertKey = `QUICK|${item.orderID}|${status}`.toLowerCase().trim();
        if (!existingAlertIds.has(alertKey)) {
          results.push({
            alertKey,
            item,
            statusTrigger: `${item.status} (${item.bucket})`,
            bucket: item.bucket,
            type: "QUICK"
          });
        }
      }
    });
  }
  const schedule = matrixData.schedule || [];
  schedule.forEach((item, idx) => {
    const itemStoreId = String(item.storeID || "").trim().toUpperCase();
    const itemRegion = normalize(storeToRegion[itemStoreId] || "KSA");
    const localInfo = getLocalInfo("KSA");
    const nowMins = localInfo.nowMins;
    const offsetMins = localInfo.offsetMins;
    const status = (item.status || "").toUpperCase().trim();
    const activeThreshold = scheduledThreshold || 30;
    const isTargetOrder = item.orderID === "Lulu-323797157187INP1" || item.orderID === "Lulu-323927258518INP1";
    if (isTargetOrder) {
      console.log(`[AlertLogic TARGET] ${item.orderID}: Status=${status}, Slot=${item.slot}, Region=${itemRegion}, nowMins=${nowMins}, threshold=${activeThreshold}`);
    }
    if (item.slot) {
      const dateMatch = item.slot.match(/([A-Za-z]{3}\s\d{1,2},\s\d{4})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          const slotDateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
          if (slotDateStr !== localInfo.dateStr) {
            if (isTargetOrder) console.log(`[AlertLogic TARGET] Skipping: Date mismatch (${slotDateStr} vs ${localInfo.dateStr})`);
            return;
          }
        }
      }
    }
    const slotInfo = parseSlot(item.slot, offsetMins);
    if (!slotInfo || slotInfo.start === 0 && slotInfo.end === 0) {
      if (isTargetOrder) console.log(`[AlertLogic TARGET] Skipping: Invalid slot parsing.`);
      return;
    }
    let shouldTrigger = false;
    let triggerType = null;
    if (nowMins >= slotInfo.end) {
      shouldTrigger = true;
      triggerType = "PAST";
    } else if (nowMins >= slotInfo.start - activeThreshold) {
      if (PREP_STATUSES.includes(status)) {
        shouldTrigger = true;
        triggerType = "RUNNING";
      } else if (DELIVERY_STATUSES.includes(status) && nowMins >= slotInfo.end - activeThreshold) {
        shouldTrigger = true;
        triggerType = "RUNNING";
      }
    }
    if (isTargetOrder) {
      console.log(`[AlertLogic TARGET] Trigger Check: Start=${slotInfo.start}, End=${slotInfo.end}, Threshold=${activeThreshold} -> Result=${shouldTrigger} (${triggerType})`);
    }
    if (shouldTrigger && triggerType && scheduledConfig) {
      const config = triggerType === "PAST" ? scheduledConfig.pastSlot : scheduledConfig.runningSlot;
      if (config) {
        if (config.isActive === false) shouldTrigger = false;
        if (shouldTrigger && config.regions && config.regions.length > 0) {
          const normalizedTargetRegions = config.regions.map((r) => normalize(r));
          const matchesRegion = normalizedTargetRegions.includes("ALL") || normalizedTargetRegions.includes(itemRegion);
          if (!matchesRegion) shouldTrigger = false;
        }
      }
    }
    if (shouldTrigger) {
      const displaySlot = formatSlotDisplay(item.slot, offsetMins);
      const alertKey = `SCHED|${item.orderID}|${status}|${normalize(item.slot)}`.toLowerCase().trim();
      if (!existingAlertIds.has(alertKey)) {
        if (isTargetOrder) console.log(`[AlertLogic TARGET] ADDING ALERT!`);
        results.push({
          alertKey,
          item,
          statusTrigger: `Stage: ${item.status || status} - ${displaySlot}`,
          bucket: displaySlot,
          type: "SCHED"
        });
      }
    }
  });
  return results;
}

// src/services/monitorService.ts
var import_axios2 = __toESM(require("axios"), 1);

// src/typesV2.ts
var getTotalItems = (order) => {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
};
var getPickedItems = (order) => {
  return order.items.reduce((sum, item) => sum + item.found_qty, 0);
};
var getSkuCount = (order) => {
  return order.items.length;
};
var getPickedSkuCount = (order) => {
  return order.items.filter((item) => item.item_status === "ADDED").length;
};
var getPickerInfo = (order) => {
  const pickingTask = order.tasks.find((t) => t.task_type === "PICKING_AND_STORAGE");
  if (pickingTask && pickingTask.contact_name) {
    return {
      name: pickingTask.contact_name,
      phone: pickingTask.contact_phone,
      fleet: pickingTask.fleet_name
    };
  }
  return null;
};
var getDriverInfo = (order) => {
  const deliveryTask = order.tasks.find((t) => t.task_type === "DELIVERY_WITH_STORAGE");
  if (deliveryTask && deliveryTask.contact_name) {
    return {
      name: deliveryTask.contact_name,
      phone: deliveryTask.contact_phone,
      fleet: deliveryTask.fleet_name
    };
  }
  return null;
};
var getOrderLifecycle = (order) => {
  const lifecycle = {
    orderCreatedAt: order.created_at || null,
    pickStart: null,
    pickEnd: null,
    storingStart: null,
    storingEnd: null,
    goingToOriginStart: null,
    goingToOriginEnd: null,
    transferToDeliveryStart: null,
    transferToDeliveryEnd: null,
    goingToDestinationStart: null,
    goingToDestinationEnd: null,
    deliveringStart: null,
    deliveringEnd: null,
    deliveredStart: null,
    deliveredEnd: null
  };
  let transferringStepStart = null;
  for (const task of order.tasks) {
    for (const step of task.steps) {
      switch (step.step_type) {
        case "PICKING_WITH_PACKING":
          if (!lifecycle.pickStart && step.actual_start) {
            lifecycle.pickStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.pickEnd = step.actual_end;
          }
          break;
        case "PICKING":
          if (!lifecycle.pickStart && step.actual_start) {
            lifecycle.pickStart = step.actual_start;
          }
          if (!lifecycle.pickEnd && step.actual_end) {
            lifecycle.pickEnd = step.actual_end;
          }
          break;
        case "STORING":
          if (!lifecycle.storingStart && step.actual_start) {
            lifecycle.storingStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.storingEnd = step.actual_end;
          }
          break;
        case "GOING_TO_ORIGIN":
          if (!lifecycle.goingToOriginStart && step.actual_start) {
            lifecycle.goingToOriginStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.goingToOriginEnd = step.actual_end;
          }
          break;
        case "TRANSFERRING_TO_DELIVERY_FROM_STORAGE":
          if (!lifecycle.transferToDeliveryStart && step.actual_start) {
            lifecycle.transferToDeliveryStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.transferToDeliveryEnd = step.actual_end;
          }
          break;
        case "TRANSFERRING_FROM_STORAGE_TO_DELIVERY":
          if (task.task_type === "DELIVERY_WITH_STORAGE") {
            if (!lifecycle.transferToDeliveryStart && step.actual_start) {
              lifecycle.transferToDeliveryStart = step.actual_start;
            }
            if (step.actual_end) {
              lifecycle.transferToDeliveryEnd = step.actual_end;
            }
          }
          if (order.source === "EXPRESS" && step.actual_start) {
            transferringStepStart = step.actual_start;
          }
          break;
        case "GOING_TO_DESTINATION":
          if (!lifecycle.goingToDestinationStart && step.actual_start) {
            lifecycle.goingToDestinationStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.goingToDestinationEnd = step.actual_end;
          }
          break;
        case "DELIVERING":
          if (!lifecycle.deliveringStart && step.actual_start) {
            lifecycle.deliveringStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.deliveringEnd = step.actual_end;
          }
          break;
        case "DELIVERED":
          if (!lifecycle.deliveredStart && step.actual_start) {
            lifecycle.deliveredStart = step.actual_start;
          }
          if (step.actual_end) {
            lifecycle.deliveredEnd = step.actual_end;
          }
          break;
      }
    }
  }
  if (order.source === "EXPRESS" && !lifecycle.goingToDestinationStart && transferringStepStart) {
    lifecycle.goingToDestinationStart = transferringStepStart;
  }
  return lifecycle;
};

// src/services/monitorService.ts
var processedOOSKeys = /* @__PURE__ */ new Set();
var isOOSCacheInitialized = false;
var existingAlertsCache = /* @__PURE__ */ new Map();
var isAlertsCacheInitialized = false;
var cachedConfig = {};
var cachedTokensData = [];
var lastConfigTokenFetchTime = 0;
var lastWhatsappQueueCheckTime = 0;
var lastCleanupTime = 0;
var lastOOSArchiveTime = 0;
var whatsappSentCache = /* @__PURE__ */ new Map();
var isWaCacheInitialized = false;
var normalizeStoreId = (id) => {
  if (id === null || id === void 0) return "";
  const s = String(id).trim().toLowerCase();
  if (/^0+[1-9]\d*$/.test(s)) {
    return s.replace(/^0+/, "");
  }
  return s;
};
var normalizeRole = (role) => {
  return String(role || "").toLowerCase().trim();
};
var normalizeRegion = (region) => {
  return String(region || "").toLowerCase().trim();
};
var isStoreMatch = (uStore, tStore) => {
  const userStoreId = normalizeStoreId(uStore);
  const targetStoreId = normalizeStoreId(tStore);
  if (userStoreId === "all" || userStoreId === "all stores" || userStoreId === "all_stores" || userStoreId === "") return true;
  if (targetStoreId === "all" || targetStoreId === "all stores" || targetStoreId === "all_stores" || targetStoreId === "") return true;
  return userStoreId === targetStoreId;
};
var isRegionMatch = (uRegion, tRegion) => {
  const userRegion = normalizeRegion(uRegion);
  const targetRegion = normalizeRegion(tRegion);
  if (userRegion === "all" || userRegion === "all regions" || userRegion === "all_regions" || userRegion === "") return true;
  if (targetRegion === "all" || targetRegion === "all regions" || targetRegion === "all_regions" || targetRegion === "") return true;
  return userRegion === targetRegion || userRegion.includes(targetRegion) || targetRegion.includes(userRegion);
};
async function runMonitorTick(db, messaging) {
  try {
    console.log(`[Monitor] Tick started...`);
    if (!isOOSCacheInitialized) {
      console.log(`[Monitor] Initializing OOS memory cache from Firebase (recent 24h only)...`);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
      const oosSnap = await db.collection("oos_history").where("updatedAt", ">=", oneDayAgo).select().get();
      oosSnap.docs.forEach((d) => processedOOSKeys.add(d.id));
      isOOSCacheInitialized = true;
      console.log(`[Monitor] Loaded ${processedOOSKeys.size} recent OOS keys into memory.`);
    }
    const nowTime = Date.now();
    if (nowTime - lastConfigTokenFetchTime > 10 * 60 * 1e3) {
      console.log(`[Monitor DEBUG] Refreshing config and fcm_tokens from Firebase...`);
      const configDoc = await db.collection("system").doc("config").get();
      cachedConfig = configDoc.exists ? configDoc.data() : {};
      const tokensSnap = await db.collection("fcm_tokens").get();
      cachedTokensData = tokensSnap.docs.map((doc) => ({ ...doc.data(), ref: doc.ref }));
      lastConfigTokenFetchTime = nowTime;
    }
    const config = cachedConfig;
    const allTokensData = cachedTokensData;
    const escalationRules = (config.escalationRules || []).filter((r) => r.isActive);
    const waEscalationRules = (config.whatsappEscalationRules || []).filter((r) => r.isActive);
    const scheduledThreshold = config.scheduledThreshold || 30;
    const oosPushEnabled = config.oosPushEnabled !== false;
    const scheduledConfig = {
      pastSlot: config.scheduledPastSlot,
      runningSlot: config.scheduledRunningSlot
    };
    console.log(`[Monitor DEBUG] Config: pushRules=${escalationRules.length}, whatsappRules=${waEscalationRules.length}`);
    const sendFilteredNotification = async (payload, alertStoreId, alertRegion, isEscalation, isOOS) => {
      const validDocs = allTokensData.filter((data) => {
        if (!data.token) return false;
        const userRole = normalizeRole(data.role);
        const userStoreId = normalizeStoreId(data.storeId);
        const userRegion = normalizeRegion(data.region);
        const targetStoreId = normalizeStoreId(alertStoreId);
        const targetRegion = normalizeRegion(alertRegion);
        if (isOOS) {
          if (userRole === "admin") return true;
          if (userRole === "supervisor") {
            return isRegionMatch(data.region, alertRegion);
          }
          if (["manager", "store", "picker", "driver", "staff", "operator"].includes(userRole)) {
            return isStoreMatch(data.storeId, alertStoreId);
          }
          return false;
        }
        if (isEscalation) {
          if (userRole === "admin") return true;
          if (userRole === "supervisor") {
            return isRegionMatch(data.region, alertRegion);
          }
          if (userRole === "manager") {
            return isStoreMatch(data.storeId, alertStoreId);
          }
          return false;
        }
        if (["picker", "store", "staff", "operator"].includes(userRole)) {
          return isStoreMatch(data.storeId, alertStoreId);
        }
        return false;
      });
      const tokens = validDocs.map((data) => data.token);
      if (tokens.length > 0) {
        let message;
        if (isOOS) {
          message = {
            notification: {
              title: payload.title,
              body: payload.body,
              image: payload.image || ""
            },
            webpush: {
              notification: {
                icon: payload.icon || "https://placehold.co/192x192.png?text=OOS",
                image: payload.image || "https://placehold.co/192x192.png?text=OOS"
              }
            },
            data: {
              orderId: String(payload.data?.orderId || ""),
              type: String(payload.data?.type || ""),
              storeId: String(payload.data?.storeId || ""),
              icon: String(payload.icon || ""),
              image: String(payload.image || "")
            },
            tokens
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
            tokens
          };
        }
        const fcmResponse = await messaging.sendEachForMulticast(message);
        console.log(`[Monitor] FCM Sent (${isOOS ? "OOS" : isEscalation ? "ESC" : "INIT"}): ${fcmResponse.successCount} success, ${fcmResponse.failureCount} failure`);
        const invalidTokenRefs = [];
        fcmResponse.responses.forEach((res, idx) => {
          if (!res.success && res.error && res.error.code === "messaging/registration-token-not-registered") {
            invalidTokenRefs.push(validDocs[idx].ref);
          }
        });
        if (invalidTokenRefs.length > 0) {
          const tokenBatch = db.batch();
          invalidTokenRefs.forEach((ref) => tokenBatch.delete(ref));
          await tokenBatch.commit();
        }
      }
    };
    let baseUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
    const FALLBACK_V2_GAS_URL = "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec";
    const FALLBACK_V1_GAS_URL = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
    const v2Url = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || FALLBACK_V2_GAS_URL).trim();
    if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
      baseUrl = FALLBACK_V1_GAS_URL;
    }
    console.log(`[Monitor DEBUG] Using GAS URLs: V1=${baseUrl.substring(0, 50)}... | V2=${v2Url.substring(0, 50)}...`);
    console.log("[Monitor DEBUG] Fetching data via gasService...");
    const [matrixRes, adminRes, matrixV2Res] = await Promise.all([
      executeGasRequest({ method: "GET", url: `${baseUrl}?action=getMatrixData` }, { skipCache: true, cacheKey: `GET:${baseUrl}:action=getMatrixData` }).catch((err) => {
        console.error(`[Monitor] matrixRes query failed:`, err.message);
        return { status: 200, data: { status: "success", data: [] } };
      }),
      executeGasRequest({ method: "GET", url: `${baseUrl}?action=getAdminData` }, { skipCache: true, cacheKey: `GET:${baseUrl}:action=getAdminData` }).catch((err) => {
        console.error(`[Monitor] adminRes query failed:`, err.message);
        return { status: 200, data: { status: "success", data: { regions: [], users: [], attendance: [], orders: [] } } };
      }),
      executeGasRequest({ method: "GET", url: `${v2Url}${v2Url.includes("?") ? "&" : "?"}action=getMatrixDataV2` }, { skipCache: true, cacheKey: `GET:${v2Url}:action=getMatrixDataV2` }).catch((err) => {
        console.error(`[Monitor] matrixV2Res query failed:`, err.message);
        return { status: 200, data: { status: "success", data: [] } };
      })
    ]);
    const matrixRaw = matrixRes.data.status === "success" ? matrixRes.data.data : matrixRes.data.data || matrixRes.data;
    const adminRaw = adminRes.data.status === "success" ? adminRes.data.data : adminRes.data.data || adminRes.data;
    let v2ResData = matrixV2Res.data;
    if (typeof v2ResData === "string" && (v2ResData.trim().startsWith("{") || v2ResData.trim().startsWith("["))) {
      try {
        v2ResData = JSON.parse(v2ResData);
        console.log("[Monitor DEBUG] Parsed V2 string data to JSON successfully.");
      } catch (e) {
        console.error("[Monitor DEBUG] Failed to parse V2 string as JSON:", e);
      }
    }
    let matrixV2Raw = v2ResData?.status === "success" ? v2ResData.data : v2ResData?.data || v2ResData || [];
    if (matrixV2Raw && typeof matrixV2Raw === "object" && !Array.isArray(matrixV2Raw) && !matrixV2Raw.job_number) {
      matrixV2Raw = matrixV2Raw.data || matrixV2Raw.orders || matrixV2Raw.results || matrixV2Raw.rows || matrixV2Raw.items || matrixV2Raw;
    }
    if (matrixV2Raw && !Array.isArray(matrixV2Raw) && typeof matrixV2Raw === "object" && matrixV2Raw.job_number) {
      console.log("[Monitor DEBUG] Normalizing single V2 object to array");
      matrixV2Raw = [matrixV2Raw];
    }
    console.log(`[Monitor DEBUG] Raw V2 data type: ${typeof matrixV2Raw}, isArray: ${Array.isArray(matrixV2Raw)}`);
    if (typeof matrixV2Raw === "string" && matrixV2Raw.includes("<!DOCTYPE html>")) {
      console.error("[Monitor DEBUG] V2 URL returned HTML instead of JSON. Check GAS permissions.");
    }
    if (!matrixRaw || !adminRaw) {
      console.error("[Monitor DEBUG] GAS data missing or invalid.", { matrix: !!matrixRaw, admin: !!adminRaw });
      return;
    }
    const processItems = (items) => {
      if (!Array.isArray(items)) return [];
      return items.map((item) => {
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
    const storeToRegion = {};
    regions.forEach((r) => {
      const sId = String(r.storeId || r.StoreID || "").trim();
      const reg = String(r.region || r.Region || "").trim();
      if (sId) storeToRegion[sId] = reg;
    });
    const matrixData = {
      quick: processItems(matrixRaw.quick || []),
      schedule: processItems(matrixRaw.schedule || [])
    };
    if (Array.isArray(matrixV2Raw) && matrixV2Raw.length > 0) {
      console.log(`[Monitor DEBUG] Processing ${matrixV2Raw.length} V2 orders...`);
      const v2Quick = [];
      const v2Schedule = [];
      const now = Date.now();
      matrixV2Raw.forEach((order) => {
        const rawStore = String(order.store_name || "");
        const sMatch = rawStore.match(/\b(\d{4})\b/);
        const storeID = sMatch ? sMatch[1] : rawStore.slice(0, 4) || "UNKNOWN";
        const status = (order.partial_status || "CREATED").toUpperCase();
        let ageMins = 0;
        if (order.created_at) {
          const created = new Date(order.created_at).getTime();
          if (!isNaN(created)) ageMins = Math.floor((now - created) / 6e4);
        }
        let bucket = "60+ MIN";
        if (ageMins < 5) bucket = "0-5 MIN";
        else if (ageMins < 10) bucket = "5-10 MIN";
        else if (ageMins < 15) bucket = "10-15 MIN";
        else if (ageMins < 20) bucket = "15-20 MIN";
        else if (ageMins < 30) bucket = "20-30 MIN";
        else if (ageMins < 40) bucket = "30-40 MIN";
        else if (ageMins < 50) bucket = "40-50 MIN";
        else if (ageMins < 60) bucket = "50-60 MIN";
        const slot = `${order.slot_from || ""} - ${order.slot_to || ""}`.trim();
        const item = {
          status,
          storeID,
          orderID: order.job_number || "",
          slot,
          bucket,
          timestamp: order.created_at || ""
        };
        if (order.source === "EXPRESS") {
          v2Quick.push(item);
        } else if (order.source === "DEFAULT") {
          v2Schedule.push(item);
        }
      });
      console.log(`[Monitor DEBUG] V2 Processed: Quick=${v2Quick.length}, Sched=${v2Schedule.length}`);
      const dedupItems = (v1, v2) => {
        const map = /* @__PURE__ */ new Map();
        v1.forEach((item) => {
          if (item.orderID) map.set(item.orderID, item);
        });
        v2.forEach((item) => {
          if (item.orderID) map.set(item.orderID, item);
        });
        return Array.from(map.values());
      };
      matrixData.quick = dedupItems(matrixData.quick, v2Quick);
      matrixData.schedule = dedupItems(matrixData.schedule, v2Schedule);
    }
    const matrixV2Array = Array.isArray(matrixV2Raw) ? matrixV2Raw : [];
    if (matrixV2Array.length > 0) {
      console.log(`[Monitor DEBUG] Scanning ${matrixV2Array.length} V2 orders for OOS items...`);
      let foundOOSCount = 0;
      for (const order of matrixV2Array) {
        if (!order.items || !Array.isArray(order.items)) continue;
        const orderId = order.job_number || "";
        const rawStoreName = String(order.store_name || "");
        const storeMatch = rawStoreName.match(/\b(\d{4})\b/);
        const storeId = storeMatch ? storeMatch[1] : rawStoreName.slice(0, 4) || "UNKNOWN";
        const slot = `${order.slot_from || ""} - ${order.slot_to || ""}`.trim();
        const updatedAtStr = (/* @__PURE__ */ new Date()).toISOString();
        const removedItems = order.items.filter((item) => {
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
          const oosKey = `${orderId}_${sku}`.replace(/\//g, "_");
          if (processedOOSKeys.has(oosKey)) {
            continue;
          }
          const oosDocRef = db.collection("oos_history").doc(oosKey);
          const oosDocSnap = await oosDocRef.get();
          if (oosDocSnap.exists) {
            processedOOSKeys.add(oosKey);
            continue;
          }
          await db.collection("oos_history").doc(oosKey).set({
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
            updatedAt: /* @__PURE__ */ new Date()
          });
          if (oosPushEnabled) {
            const storeRegion = storeToRegion[storeId] || "";
            const oosPushRegions = config.oosPushRegions || ["All"];
            const isRegionAllowed = oosPushRegions.includes("All") || storeRegion && oosPushRegions.some((cr) => cr.toLowerCase() === storeRegion.toLowerCase());
            if (isRegionAllowed) {
              const getSmallThumbnailUrl = (url) => {
                if (!url) return "";
                const str = String(url);
                if (str.includes("drive.google.com")) {
                  const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
                  if (id) return `https://lh3.googleusercontent.com/d/${id}=s200`;
                }
                return str;
              };
              const getLargeImageUrl = (url) => {
                if (!url) return "";
                const str = String(url);
                if (str.includes("drive.google.com")) {
                  const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
                  if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
                }
                return str;
              };
              await sendFilteredNotification({
                title: `\u26A0\uFE0F OUT OF STOCK DETECTED`,
                body: `Item ${item.item_name} (SKU: ${sku}) at Store ${storeId}.`,
                icon: getSmallThumbnailUrl(item.photo_url),
                image: getLargeImageUrl(item.photo_url),
                data: { orderId, type: "oos", storeId }
              }, storeId, storeRegion, false, true);
            }
          }
          processedOOSKeys.add(oosKey);
        }
      }
    }
    console.log(`[Monitor DEBUG] Total Orders (V1+V2): Quick=${matrixData.quick.length}, Sched=${matrixData.schedule.length}, Regions Raw=${regions.length}`);
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1e3);
    const oneHourAgoISO = oneHourAgo.toISOString();
    if (nowTime - lastCleanupTime > 6 * 60 * 60 * 1e3) {
      lastCleanupTime = nowTime;
      const oldAlertsSnap = await db.collection("alerts").where("timestamp", "<", oneHourAgoISO).limit(200).get();
      if (!oldAlertsSnap.empty) {
        console.log(`[Monitor DEBUG] Cleaning up ${oldAlertsSnap.size} old alerts from Firebase...`);
        const batch = db.batch();
        oldAlertsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }
    if (!isAlertsCacheInitialized) {
      const existingAlertsSnap = await db.collection("alerts").where("timestamp", ">=", oneHourAgoISO).get();
      existingAlertsSnap.docs.forEach((doc) => {
        const d = doc.data();
        const key = (d.alertKey || doc.id).toLowerCase().trim();
        existingAlertsCache.set(key, d);
      });
      isAlertsCacheInitialized = true;
      console.log(`[Monitor DEBUG] Initialized alerts cache with size: ${existingAlertsCache.size}`);
    }
    if (!isWaCacheInitialized) {
      const existingWaSnap = await db.collection("whatsapp_logs").where("timestamp", ">=", oneHourAgoISO).get();
      existingWaSnap.docs.forEach((doc) => {
        const d = doc.data();
        whatsappSentCache.set(doc.id, d.timestamp);
      });
      isWaCacheInitialized = true;
      console.log(`[Monitor DEBUG] Initialized WhatsApp cache with size: ${whatsappSentCache.size}`);
    }
    for (const [k, v] of existingAlertsCache.entries()) {
      if (v.timestamp && v.timestamp < oneHourAgoISO) {
        existingAlertsCache.delete(k);
      }
    }
    for (const [k, ts] of whatsappSentCache.entries()) {
      if (ts && ts < oneHourAgoISO) {
        whatsappSentCache.delete(k);
      }
    }
    const existingAlertIds = new Set(existingAlertsCache.keys());
    console.log(`[Monitor DEBUG] Dedup memory size: ${existingAlertIds.size} (1h lookback)`);
    const activeAlertsDetected = detectAlerts(matrixData, escalationRules, existingAlertIds, scheduledThreshold, storeToRegion, scheduledConfig);
    console.log(`[Monitor DEBUG] Detection complete. Potential alerts: ${activeAlertsDetected.length}`);
    for (const alert of activeAlertsDetected) {
      const alertId = alert.alertKey;
      const existing = existingAlertsCache.get(alertId);
      const alertStoreId = String(alert.item.storeID || "").trim();
      const alertRegion = storeToRegion[alertStoreId] || "";
      const now = (/* @__PURE__ */ new Date()).toISOString();
      let shouldWrite = false;
      let isReTrigger = false;
      if (!existing) {
        shouldWrite = true;
      } else {
        if (existing.bucket !== alert.bucket) {
          shouldWrite = true;
          isReTrigger = true;
          console.log(`[Monitor] Bucket changed for ${alertId}: ${existing.bucket} -> ${alert.bucket}. Re-triggering...`);
        }
      }
      if (shouldWrite) {
        const alertData = {
          timestamp: now,
          orderId: alert.item.orderID || "",
          eventType: "trigger",
          storeId: alertStoreId,
          region: alertRegion,
          userId: "SYSTEM",
          bucket: alert.bucket || "",
          alertKey: alertId,
          // Using the ID which is the unique key
          slot: alert.item.slot || "",
          notificationTime: now,
          status: "Pending",
          // Reset to Pending to re-buzz
          escalation: "FALSE",
          statusTrigger: alert.statusTrigger || "",
          triggeredAt: now,
          updatedAt: /* @__PURE__ */ new Date()
        };
        await db.collection("alerts").doc(alertId).set(alertData, { merge: true });
        existingAlertsCache.set(alertId, alertData);
        try {
          const syncParams = new URLSearchParams();
          syncParams.append("action", "logalertv2");
          syncParams.append("id", alertId);
          syncParams.append("timestamp", now);
          syncParams.append("orderId", alert.item.orderID || "");
          syncParams.append("eventType", "trigger");
          syncParams.append("storeId", alertStoreId);
          syncParams.append("userId", "SYSTEM");
          syncParams.append("bucket", alert.bucket || "");
          syncParams.append("notificationTime", now);
          syncParams.append("storeStaffName", "");
          syncParams.append("status", "Pending");
          syncParams.append("escalation", "FALSE");
          syncParams.append("managerName", "");
          syncParams.append("managerStatus", "Pending");
          syncParams.append("orderCreatedAt", alert.item.timestamp || "");
          syncParams.append("statusTrigger", alert.statusTrigger || "");
          await import_axios2.default.post(baseUrl, syncParams.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 3e4
          });
        } catch (syncErr) {
          console.error(`[Monitor] GAS alert sync failed for ${alertId}:`, syncErr.message);
        }
        await sendFilteredNotification({
          title: `${isReTrigger ? "\u{1F504} UPDATED" : "\u26A0\uFE0F NEW"}: ${alert.statusTrigger}`,
          body: `Order ${alert.item.orderID} at Store ${alert.item.storeID} is in ${alert.bucket} stage.`,
          data: { orderId: alert.item.orderID, type: "alert", alertId: alert.alertKey }
        }, alertStoreId, alertRegion, false);
      }
    }
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
          const normStatus = (s) => String(s || "").toUpperCase().replace(/[\s_]+/g, "").trim();
          const getBucketStart = (b) => {
            const norm = String(b || "").replace(/\s*MIN\s*/gi, "").trim();
            const m = norm.match(/(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          };
          console.log(`[WhatsApp] Processing ${(matrixData.quick || []).length} quick commerce orders against ${waEscalationRules.length} rules`);
          console.log(`[WhatsApp] Rules: ${waEscalationRules.map((r) => `${r.status}|${r.bucket}|${r.escalationLevel}|${r.region}|${r.storeId}`).join(" | ")}`);
          for (const qcOrder of matrixData.quick || []) {
            const statusStr = normStatus(qcOrder.status);
            const orderStoreId = String(qcOrder.storeID || "").trim();
            const orderRegion = storeToRegion[orderStoreId] || "";
            const orderBucketStart = getBucketStart(qcOrder.bucket);
            const waDedupeKey = `WA|${qcOrder.orderID}|${statusStr}|${qcOrder.bucket}`;
            const allMatchingRules = waEscalationRules.filter((r) => {
              const rBucketStart = getBucketStart(r.bucket);
              const statusMatch = normStatus(r.status) === statusStr;
              const bucketMatch = orderBucketStart >= rBucketStart;
              const regionMatch = r.region === "All" || r.region === orderRegion;
              const storeMatch = r.storeId === "All" || String(r.storeId).trim() === orderStoreId;
              return r.isActive && statusMatch && bucketMatch && regionMatch && storeMatch;
            });
            allMatchingRules.sort((a, b) => getBucketStart(b.bucket) - getBucketStart(a.bucket));
            const matchedRule = allMatchingRules[0] || null;
            if (!matchedRule) continue;
            if (statusStr === "GOINGTODESTINATION") {
              let previousAlertSent = false;
              for (const key of whatsappSentCache.keys()) {
                if (key.startsWith(`WA|${qcOrder.orderID}|TRANSFERRING|`) || key.startsWith(`WA|${qcOrder.orderID}|GOINGTOORIGIN|`)) {
                  previousAlertSent = true;
                  break;
                }
              }
              if (previousAlertSent) {
                const fullV2Order2 = matrixV2Array.find((o) => o.job_number === qcOrder.orderID);
                if (fullV2Order2) {
                  const lifecycle = getOrderLifecycle(fullV2Order2);
                  if (lifecycle.goingToDestinationStart) {
                    const elapsedMins = (Date.now() - new Date(lifecycle.goingToDestinationStart).getTime()) / 6e4;
                    if (elapsedMins < 10) {
                      console.log(`[WhatsApp] \u23F3 Cooldown: ${qcOrder.orderID} in GOING TO DESTINATION for ${elapsedMins.toFixed(1)}m. Suppressing until 10m.`);
                      continue;
                    }
                  }
                }
              }
            }
            const levelDedupeKey = `${waDedupeKey}|${matchedRule.escalationLevel || "Level 1"}`;
            if (whatsappSentCache.has(levelDedupeKey)) continue;
            const isFulfillment = ["CREATED", "PICKING", "PICKINGWITHPACKING", "PICKINGWITHUNASSIGNEDZONE", "STORING", "STORED"].includes(statusStr);
            const isLastMile = ["TRANSFERRING", "GOINGTOORIGIN", "INROUTE", "GOINGTODESTINATION", "DELIVERING"].includes(statusStr);
            let mappingsToUse = isFulfillment ? whatsappFulfillmentMappings : isLastMile ? whatsappLastMileMappings : [];
            if (mappingsToUse.length === 0) {
              console.log(`[WhatsApp] \u274C No ${isFulfillment ? "fulfillment" : "last mile"} mappings for order ${qcOrder.orderID}`);
              continue;
            }
            const mapping = mappingsToUse.find((m) => String(m.storeId || "").trim() === orderStoreId);
            if (!mapping || !mapping.groupJid) {
              console.log(`[WhatsApp] \u274C No store mapping for store '${orderStoreId}' (order ${qcOrder.orderID})`);
              continue;
            }
            const instanceToUse = mapping.instanceName || whatsappInstanceName;
            if (!instanceToUse) continue;
            const targetJids = /* @__PURE__ */ new Set();
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
            let emoji = "\u{1F614}";
            if (targetLevel === "Level 2") emoji = "\u26A0\uFE0F";
            if (targetLevel === "Level 3") emoji = "\u{1F525}";
            if (targetLevel === "Global") emoji = "\u{1F6A8}";
            const fullV2Order = matrixV2Array.find((o) => o.job_number === qcOrder.orderID);
            const pickerInfo = fullV2Order ? getPickerInfo(fullV2Order) : null;
            const driverInfo = fullV2Order ? getDriverInfo(fullV2Order) : null;
            const storeName = fullV2Order?.store_name || `Store ${orderStoreId}`;
            const displayStatus = String(qcOrder.status || "").replace(/_/g, " ").toUpperCase();
            const isLastMileStatus = ["TRANSFERRING", "GOINGTOORIGIN", "INROUTE", "GOINGTODESTINATION", "DELIVERING"].includes(statusStr);
            let messageText = `*${emoji} Alert: Quick Commerce Delay in ${displayStatus} [${qcOrder.bucket}]*

`;
            const actionMessages = {
              "CREATED": "Order created however picking not yet started.",
              "PICKING": "Order is still in picking status. Kindly complete the picking on priority.",
              "PICKINGWITHPACKING": "Order is still in picking status. Kindly complete the picking on priority.",
              "PICKINGWITHUNASSIGNEDZONE": "Order is still in picking status. Kindly complete the picking on priority.",
              "STORED": "Order is still not handed over to Driver/Rider. Please handover immediately.",
              "STORING": "Order is still not handed over to Driver/Rider. Please handover immediately.",
              "TRANSFERRING": "Driver still not collected the Order - Please check and push him.",
              "GOINGTOORIGIN": "Driver still not reached the Store - Please check and push him.",
              "GOINGTODESTINATION": "Driver still did not delivered the Order to customer. Please check and push for on time delivery",
              "INROUTE": "Driver is still in Route. Please follow up with him to deliver the order on time.",
              "DELIVERING": "Order still showing in delivering - Please check with the driver whether order delivered to customer or not. If delivered ask him to update in the app."
            };
            const actionMsg = actionMessages[statusStr] || "";
            if (actionMsg) {
              messageText += `_${actionMsg}_

`;
            }
            messageText += `*Order:* ${qcOrder.orderID}
`;
            messageText += `*Store Name:* ${storeName}
`;
            if (isLastMileStatus) {
              messageText += `*Driver Name:* ${driverInfo?.name || "N/A"}
`;
              if (driverInfo?.fleet) messageText += `*Fleet:* ${driverInfo.fleet}
`;
            } else {
              messageText += `*Picker Name:* ${pickerInfo?.name || "N/A"}
`;
            }
            if (fullV2Order) {
              messageText += `*Picked SKUs:* ${getPickedSkuCount(fullV2Order)} / ${getSkuCount(fullV2Order)}
`;
              messageText += `*Picked Items:* ${getPickedItems(fullV2Order)} / ${getTotalItems(fullV2Order)}
`;
            }
            if (targetLevel === "Global") {
              messageText += `
*ESCALATION LEVEL:* GLOBAL`;
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
                    text: messageText
                  })
                });
                const waResText = await waRes.text();
                console.log(`[WhatsApp] Sent to ${jid}: HTTP ${waRes.status} - ${waResText.slice(0, 80)}`);
              } catch (sendErr) {
                console.error(`[WhatsApp] Failed to send to ${jid}:`, sendErr.message);
              }
            }
            console.log(`[WhatsApp] \u2705 ${displayStatus} [${qcOrder.bucket}] (${targetLevel}) \u2192 ${targetJids.size} recipients for ${qcOrder.orderID}`);
            const ts = (/* @__PURE__ */ new Date()).toISOString();
            whatsappSentCache.set(levelDedupeKey, ts);
            db.collection("whatsapp_logs").doc(levelDedupeKey.replace(/[\/\.]/g, "_")).set({ timestamp: ts }).catch((e) => console.error("[WhatsApp] Failed to save dedupe key:", e.message));
          }
        } else {
          console.log(`[WhatsApp] \u274C Missing whatsappApiUrl or whatsappApiKey`);
        }
      } catch (whatsappErr) {
        console.error(`[WhatsApp] Error in dispatch:`, whatsappErr);
      }
    }
    if (escalationRules.length === 0) {
      if (existingAlertsCache.size > 0) {
        console.log(`[Monitor] No push rules configured. Clearing ${existingAlertsCache.size} stale alerts from cache.`);
        existingAlertsCache.clear();
      }
    } else {
      const currentEscalationTime = Date.now();
      for (const [alertId, data] of existingAlertsCache.entries()) {
        if (data.status === "Pending" && data.escalation !== "TRUE") {
          const triggeredAt = data.triggeredAt ? new Date(data.triggeredAt).getTime() : 0;
          const ageMins = (currentEscalationTime - triggeredAt) / (1e3 * 60);
          if (ageMins >= 3) {
            console.log(`[Monitor] Auto-escalating alert: ${alertId}`);
            const updateData = {
              escalation: "TRUE",
              updatedAt: /* @__PURE__ */ new Date()
            };
            await db.collection("alerts").doc(alertId).update(updateData);
            data.escalation = "TRUE";
            data.updatedAt = updateData.updatedAt;
            existingAlertsCache.set(alertId, data);
            try {
              const syncParams = new URLSearchParams();
              syncParams.append("action", "logalertv2");
              syncParams.append("id", alertId);
              syncParams.append("timestamp", (/* @__PURE__ */ new Date()).toISOString());
              syncParams.append("orderId", data.orderId || "");
              syncParams.append("eventType", "escalate");
              syncParams.append("storeId", data.storeId || "");
              syncParams.append("userId", "SYSTEM_AUTO");
              syncParams.append("bucket", data.bucket || "");
              syncParams.append("notificationTime", data.notificationTime || "");
              syncParams.append("storeStaffName", data.storeStaffName || "");
              syncParams.append("status", data.status || "Pending");
              syncParams.append("escalation", "TRUE");
              syncParams.append("managerName", data.managerName || "");
              syncParams.append("managerStatus", data.managerStatus || "Pending");
              syncParams.append("orderCreatedAt", data.orderCreatedAt || "");
              syncParams.append("statusTrigger", data.statusTrigger || "");
              console.log(`[Monitor] Syncing escalation to GAS: ${alertId}`);
              await import_axios2.default.post(baseUrl, syncParams.toString(), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 3e4
              });
            } catch (syncErr) {
              console.error(`[Monitor] GAS escalation sync failed for ${alertId}:`, syncErr.message);
            }
            await sendFilteredNotification({
              title: `\u{1F525} ESCALATED: ${data.statusTrigger}`,
              body: `CRITICAL: Order ${data.orderId} at Store ${data.storeId} is still pending after 3 mins!`,
              data: { orderId: data.orderId, type: "alert", alertId }
            }, data.storeId, data.region, true);
          }
        }
      }
    }
    try {
      if (config.whatsappOosEnabled && config.whatsappApiUrl && config.whatsappInstanceName && config.whatsappApiKey) {
        if (nowTime - lastWhatsappQueueCheckTime > 5 * 60 * 1e3) {
          lastWhatsappQueueCheckTime = nowTime;
          const todayStart = /* @__PURE__ */ new Date();
          todayStart.setHours(0, 0, 0, 0);
          const oosSnap = await db.collection("oos_history").where("updatedAt", ">=", todayStart).where("whatsappSent", "==", false).get();
          const mappings = config.whatsappAutoOosMappings || [];
          for (const docSnap of oosSnap.docs) {
            const oosData = docSnap.data();
            if (oosData.whatsappSent === true) {
              processedOOSKeys.add(`wa_${docSnap.id}`);
              continue;
            }
            if (processedOOSKeys.has(`wa_${docSnap.id}`)) continue;
            processedOOSKeys.add(`wa_${docSnap.id}`);
            const storeRegion = storeToRegion[oosData.storeId] || "";
            const normRegion = String(storeRegion).trim().toLowerCase();
            const whatsappOosRegions = config.whatsappOosRegions || ["All"];
            const isRegionAllowed = whatsappOosRegions.includes("All") || storeRegion && whatsappOosRegions.some((cr) => cr.toLowerCase() === storeRegion.toLowerCase());
            if (!isRegionAllowed) {
              await docSnap.ref.update({ whatsappSent: true, whatsappError: "Region disabled in Admin toggle" });
              continue;
            }
            let mapping = null;
            mapping = mappings.find(
              (m) => String(m.region).trim().toLowerCase() === normRegion || ["global", "all", ""].includes(String(m.region).trim().toLowerCase())
            );
            if (mapping && mapping.groupJid) {
              const instanceToUse = mapping.instanceName || config.whatsappInstanceName;
              if (instanceToUse) {
                await docSnap.ref.update({ whatsappSent: true, whatsappSentAt: (/* @__PURE__ */ new Date()).toISOString() });
                const storeDisplayName = oosData.storeName ? oosData.storeName : oosData.storeId;
                const waMessage = `*Out of Stock Alert!*
Store: ${oosData.storeId}
Order No: ${oosData.orderId || "N/A"}
SKU: ${oosData.sku}
Item Name: ${oosData.itemName}
Location: ${oosData.location || "N/A"}
Store Name: ${storeDisplayName}`;
                let url = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${instanceToUse}`;
                let bodyParams = {
                  number: mapping.groupJid,
                  options: { delay: 0, presence: "composing", linkPreview: false },
                  text: waMessage
                };
                if (oosData.photoUrl) {
                  const getLargeImageUrl = (u) => {
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
                    media: getLargeImageUrl(oosData.photoUrl)
                  };
                }
                try {
                  const waRes = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: config.whatsappApiKey },
                    body: JSON.stringify(bodyParams)
                  });
                  if (waRes.ok) {
                    console.log(`[WhatsApp Auto] Sent OOS alert for SKU ${oosData.sku}`);
                  } else {
                    const errText = await waRes.text();
                    console.error(`[WhatsApp Auto] Failed to send for SKU ${oosData.sku}: ${errText}`);
                    await docSnap.ref.update({ whatsappError: `API ${waRes.status}: ${errText.slice(0, 100)}` });
                  }
                } catch (sendErr) {
                  console.error(`[WhatsApp Auto] Send error for SKU ${oosData.sku}:`, sendErr.message);
                  await docSnap.ref.update({ whatsappError: sendErr.message?.slice(0, 100) });
                }
              } else {
                await docSnap.ref.update({ whatsappSent: true, whatsappError: "No WhatsApp instance configured" });
              }
            } else {
              await docSnap.ref.update({ whatsappSent: true, whatsappError: "No mapping found for store/region" });
            }
          }
        }
      }
    } catch (err) {
      console.error("[Monitor] WhatsApp Auto error:", err);
    }
    if (nowTime - lastOOSArchiveTime > 6 * 60 * 60 * 1e3) {
      lastOOSArchiveTime = nowTime;
      await archiveOldOOS(db);
    }
    console.log("[Monitor] Tick completed.");
  } catch (error) {
    console.error("[Monitor] Error in tick:", error);
    throw error;
  }
}
async function archiveOldOOS(db) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const snap = await db.collection("oos_history").where("updatedAt", "<", oneDayAgo).limit(500).get();
    if (snap.empty) return;
    console.log(`[Monitor] Found ${snap.size} old OOS records to archive.`);
    const docs = snap.docs;
    const archiveData = docs.map((d) => ({ ...d.data(), id: d.id }));
    let baseUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec").trim();
    try {
      await import_axios2.default.post(
        baseUrl,
        new URLSearchParams({
          action: "archiveOOS",
          data: JSON.stringify(archiveData)
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
    } catch (err) {
      console.error("[Monitor] GAS archive network error, skipping delete this tick.");
      return;
    }
    const batch = db.batch();
    docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`[Monitor] Successfully archived and deleted ${docs.length} old OOS records.`);
  } catch (error) {
    console.error("[Monitor] Error archiving old OOS:", error);
  }
}

// server.ts
import_dotenv.default.config();
var FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || "ai-studio-589cf723-ab60-4b6f-a2cd-f84f8c8c1b48";
var oosHistoryCache = null;
var oosHistoryCacheTime = 0;
var OOS_HISTORY_CACHE_TTL = 30 * 1e3;
var apiConfigCache = null;
var apiConfigCacheTime = 0;
var API_CONFIG_CACHE_TTL = 2 * 60 * 1e3;
async function getCachedConfig(db) {
  if (apiConfigCache && Date.now() - apiConfigCacheTime < API_CONFIG_CACHE_TTL) {
    return apiConfigCache;
  }
  const snap = await db.collection("system").doc("config").get();
  apiConfigCache = snap.data() || {};
  apiConfigCacheTime = Date.now();
  return apiConfigCache;
}
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server] Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Server] Uncaught Exception:", error);
});
var firebaseConfig = {};
try {
  const configPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
  if (import_fs.default.existsSync(configPath)) {
    firebaseConfig = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
  }
} catch (e) {
  console.error("Failed to load firebase-applet-config.json:", e);
}
async function startServer() {
  if (!import_firebase_admin.default.apps.length) {
    try {
      const saVar = process.env.FIREBASE_SERVICE_ACCOUNT;
      let config = null;
      if (saVar) {
        console.log("[Server] Using FIREBASE_SERVICE_ACCOUNT string");
        let raw = String(saVar).trim();
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          raw = raw.substring(firstBrace, lastBrace + 1);
        }
        try {
          config = JSON.parse(raw);
        } catch (e) {
          if (raw.startsWith('"') && raw.endsWith('"')) {
            const unquoted = JSON.parse(raw);
            config = typeof unquoted === "string" ? JSON.parse(unquoted) : unquoted;
          }
        }
      } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
        console.log(
          "[Server] Reconstructing Service Account from individual components"
        );
        config = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(
            /\\n/g,
            "\n"
          )
        };
      }
      if (config) {
        import_firebase_admin.default.initializeApp({
          credential: import_firebase_admin.default.credential.cert(config),
          databaseURL: `https://${config.projectId || config.project_id}.firebaseio.com`
        });
        console.log("Firebase Admin initialized successfully.");
      } else {
        console.error(
          "CRITICAL: No Firebase Service Account configuration found."
        );
      }
    } catch (err) {
      console.error(
        "CRITICAL: FIREBASE_SERVICE_ACCOUNT initialization failed.",
        err
      );
    }
  }
  const db = import_firebase_admin.default.apps.length ? (0, import_firestore.getFirestore)(import_firebase_admin.default.app(), FIRESTORE_DB_ID) : null;
  const messaging = import_firebase_admin.default.apps.length ? import_firebase_admin.default.messaging() : null;
  const normalizeStoreId2 = (id) => {
    if (id === null || id === void 0) return "";
    const s = String(id).trim().toLowerCase();
    if (/^0+[1-9]\d*$/.test(s)) {
      return s.replace(/^0+/, "");
    }
    return s;
  };
  const normalizeRole2 = (role) => {
    return String(role || "").toLowerCase().trim();
  };
  const normalizeRegion2 = (region) => {
    return String(region || "").toLowerCase().trim();
  };
  const isStoreMatch2 = (uStore, tStore) => {
    const userStoreId = normalizeStoreId2(uStore);
    const targetStoreId = normalizeStoreId2(tStore);
    if (userStoreId === "all" || userStoreId === "all stores" || userStoreId === "all_stores" || userStoreId === "")
      return true;
    if (targetStoreId === "all" || targetStoreId === "all stores" || targetStoreId === "all_stores" || targetStoreId === "")
      return true;
    return userStoreId === targetStoreId;
  };
  const isRegionMatch2 = (uRegion, tRegion) => {
    const userRegion = normalizeRegion2(uRegion);
    const targetRegion = normalizeRegion2(tRegion);
    if (userRegion === "all" || userRegion === "all regions" || userRegion === "all_regions" || userRegion === "")
      return true;
    if (targetRegion === "all" || targetRegion === "all regions" || targetRegion === "all_regions" || targetRegion === "")
      return true;
    return userRegion === targetRegion || userRegion.includes(targetRegion) || targetRegion.includes(userRegion);
  };
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use((0, import_cors.default)());
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/admin/test-oos-push", async (req, res) => {
    try {
      if (!db || !messaging)
        return res.status(500).json({ error: "Missing Firebase features" });
      const tokensSnap = await db.collection("fcm_tokens").where("role", "in", ["admin", "supervisor", "operator", "manager"]).get();
      const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (tokens.length === 0)
        return res.json({ status: "success", successCount: 0 });
      const payload = {
        title: `\u{1F9EA} TEST OUT OF STOCK DETECTED`,
        body: `Test Item Strawberry (SKU: 99999) at Store TEST.`,
        icon: "https://placehold.co/100x100.png?text=OOS+ICON",
        image: "https://placehold.co/600x400.png?text=OOS+TEST+IMAGE",
        data: {
          orderId: "test-order-123",
          type: "oos",
          storeId: "TEST",
          icon: "https://placehold.co/100x100.png?text=OOS+ICON",
          image: "https://placehold.co/600x400.png?text=OOS+TEST+IMAGE"
        }
      };
      const MAX_TOKENS = 500;
      let successCount = 0;
      for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
        const tokenBatch = tokens.slice(i, i + MAX_TOKENS);
        const message = {
          notification: {
            title: payload.title,
            body: payload.body,
            image: payload.image
          },
          webpush: {
            notification: {
              icon: payload.data.icon || "https://placehold.co/192x192.png?text=OOS",
              image: payload.data.image || "https://placehold.co/192x192.png?text=OOS"
            }
          },
          data: {
            orderId: String(payload.data.orderId || ""),
            type: String(payload.data.type || ""),
            storeId: String(payload.data.storeId || ""),
            icon: String(payload.data.icon || ""),
            image: String(payload.data.image || "")
          },
          tokens: tokenBatch
        };
        let response;
        try {
          console.log("[FCM] Sending batch:", tokenBatch.length);
          response = await messaging.sendEachForMulticast(message);
          console.log("[FCM] Success:", response.successCount);
          console.log("[FCM] Failure:", response.failureCount);
          if (response.failureCount > 0) {
            const badTokens = [];
            response.responses.forEach((r, idx) => {
              if (!r.success) {
                console.error("[FCM TOKEN ERROR]", tokenBatch[idx], r.error);
                const errCode = r.error?.code;
                if (errCode === "messaging/registration-token-not-registered" || errCode === "messaging/invalid-registration-token") {
                  badTokens.push(tokenBatch[idx]);
                }
              }
            });
            if (badTokens.length > 0) {
              console.log(
                "[FCM CleanUp] Cleaning up invalid tokens:",
                badTokens.length
              );
              for (const token of badTokens) {
                try {
                  const snap = await db.collection("fcm_tokens").where("token", "==", token).get();
                  if (!snap.empty) {
                    const cleanupBatch = db.batch();
                    snap.docs.forEach((doc) => {
                      console.log(
                        `[FCM CleanUp] Deleting unregistered token: ${doc.id}`
                      );
                      cleanupBatch.delete(doc.ref);
                    });
                    await cleanupBatch.commit();
                  }
                } catch (cleanupErr) {
                  console.error("[FCM CleanUp ERROR]", cleanupErr);
                }
              }
            }
          }
        } catch (fcmErr) {
          console.error("[FCM FATAL ERROR]", fcmErr);
          return res.status(500).json({
            status: "error",
            error: fcmErr.message || "FCM send failed"
          });
        }
        successCount += response.successCount;
      }
      res.json({ status: "success", successCount });
    } catch (e) {
      console.error("[test-oos-push] Error:", e);
      res.status(500).json({ status: "error", error: e.message });
    }
  });
  app.post("/api/admin/broadcast-push", async (req, res) => {
    try {
      if (!db || !messaging)
        return res.status(500).json({ error: "Missing Firebase features" });
      const { message, targetRoles } = req.body || {};
      if (!message) return res.status(400).json({ error: "Missing message" });
      const roles = Array.isArray(targetRoles) ? targetRoles.map((r) => String(r).toLowerCase().trim()) : [];
      let tokensSnap;
      if (roles.length > 0) {
        tokensSnap = await db.collection("fcm_tokens").where("role", "in", roles).get();
      } else {
        tokensSnap = await db.collection("fcm_tokens").get();
      }
      const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (tokens.length === 0)
        return res.json({ status: "success", successCount: 0 });
      const payload = {
        notification: {
          title: `\u{1F4E2} SYSTEM BROADCAST`,
          body: message,
          image: ""
        },
        data: {
          type: "broadcast"
        },
        tokens
      };
      const fcmResponse = await messaging.sendEachForMulticast(payload);
      res.json({ status: "success", successCount: fcmResponse.successCount });
    } catch (e) {
      console.error("[broadcast-push] Error:", e);
      res.status(500).json({ status: "error", error: e.message });
    }
  });
  app.post("/api/admin/whatsapp/test", async (req, res) => {
    try {
      if (!db)
        return res.status(500).json({ error: "Missing Firebase features" });
      const { number } = req.body;
      if (!number)
        return res.status(400).json({ error: "Phone number or Group JID is required" });
      const sysData = await getCachedConfig(db);
      if (!sysData.whatsappApiUrl || !sysData.whatsappInstanceName || !sysData.whatsappApiKey) {
        return res.status(400).json({ error: "WhatsApp integration is not fully configured" });
      }
      const url = `${sysData.whatsappApiUrl.replace(/\/$/, "")}/message/sendMedia/${sysData.whatsappInstanceName}`;
      const captionText = `Hello! This is a test message from your Firebase E-commerce Admin panel. \u{1F680}

*Order:* TEST-001
*Item:* Sample Product Name
*SKU:* SMPL-999
*Store ID:* STORE-01

If you are seeing this image and text, your Evolution API connection is working perfectly!`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: sysData.whatsappApiKey
        },
        body: JSON.stringify({
          number,
          options: { delay: 0, presence: "composing" },
          mediatype: "image",
          mimetype: "image/jpeg",
          caption: captionText,
          media: "https://bf1af2.cdn.akinoncloud.com/products/2024/09/11/56757/ef474c50-bdaf-4331-951f-6982163edb64.jpg"
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[WhatsApp Test Error]", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/admin/whatsapp/groups", async (req, res) => {
    try {
      if (!db)
        return res.status(500).json({ error: "Missing Firebase features" });
      const sysData = await getCachedConfig(db);
      const instanceName = req.query.instanceName || sysData.whatsappInstanceName;
      if (!sysData.whatsappApiUrl || !instanceName || !sysData.whatsappApiKey) {
        return res.status(400).json({ error: "WhatsApp integration is not fully configured (Instance Name missing)" });
      }
      const url = `${sysData.whatsappApiUrl.replace(/\/$/, "")}/group/fetchAllGroups/${instanceName}?getParticipants=false`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          apikey: sysData.whatsappApiKey
        }
      });
      if (!response.ok) {
        throw new Error(
          `Evolution API returned ${response.status}: ${await response.text()}`
        );
      }
      const data = await response.json();
      res.json({ status: "success", groups: data });
    } catch (e) {
      console.error("[WhatsApp] Proxy error fetching groups:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/whatsapp/manual-item-push", async (req, res) => {
    try {
      if (!db)
        return res.status(500).json({ error: "Missing Firebase features" });
      const { order, item, requesterId, requesterRole } = req.body;
      if (!item || !order || !["admin", "supervisor", "operator"].includes(requesterRole)) {
        return res.status(403).json({ error: "Unauthorized or missing data" });
      }
      const sysData = await getCachedConfig(db);
      if (!sysData.whatsappApiUrl || !sysData.whatsappApiKey) {
        return res.status(400).json({ error: "WhatsApp integration is not fully configured" });
      }
      const mappings = sysData.whatsappManualStoreMappings || [];
      let rawStoreId = item.storeId || item.store_id || order.store_id || order.storeId || "";
      if (!rawStoreId && order.store_name) {
        const match = String(order.store_name).match(/^(\d+)/);
        rawStoreId = match ? match[1] : "";
      }
      const normStore = String(rawStoreId).trim();
      console.log(`[WhatsApp Debug] Manual Push: Resolved storeId="${normStore}" from item.storeId="${item.storeId}", order.store_id="${order.store_id}", order.store_name="${order.store_name}"`);
      let mapping = mappings.find((m) => String(m.storeId || "").trim() === normStore);
      if (!mapping) {
        console.log(`[WhatsApp Debug] Manual Push Failed. Store="${normStore}", Available Mappings:`, JSON.stringify(mappings));
        return res.status(400).json({
          error: "Please connect with admin to create your whatsapp account and assign an instance"
        });
      }
      if (!mapping.groupJid) {
        return res.status(400).json({
          error: "Please connect with admin to create your whatsapp account and assign an instance (Group JID missing)"
        });
      }
      const instanceToUse = mapping.instanceName || sysData.whatsappInstanceName;
      if (!instanceToUse) {
        return res.status(400).json({ error: "No WhatsApp instance name configured" });
      }
      const getLargeImageUrl = (url2) => {
        if (!url2) return "";
        const str = String(url2);
        if (str.includes("drive.google.com")) {
          const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
          if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
        }
        return str;
      };
      const photoUrl = getLargeImageUrl(
        item.photo_url || item.image_url || item.ImageUrl || item.image || item.photoUrl
      );
      const captionText = `*Hello Team! Following Item is not able to trace / find it. Kindly arrange at the earliest else will be mark it as OOS if there is no response*

*Order:* ${order.job_number || item.orderId || "N/A"}
*Item:* ${item.item_name || item.itemName}
*SKU:* ${item.sku}
*Store id:* ${normStore}
*Store Name:* ${order.store_name || ""}`;
      let url = `${sysData.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${instanceToUse}`;
      let bodyParams = {
        number: mapping.groupJid,
        options: { delay: 0, presence: "composing", linkPreview: false },
        text: captionText
      };
      if (photoUrl) {
        url = `${sysData.whatsappApiUrl.replace(/\/$/, "")}/message/sendMedia/${instanceToUse}`;
        bodyParams = {
          number: mapping.groupJid,
          options: { delay: 0, presence: "composing" },
          mediatype: "image",
          mimetype: "image/jpeg",
          caption: captionText,
          media: photoUrl
        };
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: sysData.whatsappApiKey
        },
        body: JSON.stringify(bodyParams)
      });
      if (!response.ok) {
        throw new Error(
          `Evolution API returned ${response.status}: ${await response.text()}`
        );
      }
      res.json({ status: "success" });
    } catch (e) {
      console.error("[WhatsApp] Proxy error sending manual push:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/whatsapp/scan-and-send", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "Missing Firebase" });
      const { requesterRole } = req.body;
      if (!["admin", "operator"].includes(requesterRole)) {
        return res.status(403).json({ error: "Admin/Operator only" });
      }
      const config = await getCachedConfig(db);
      if (!config.whatsappApiUrl || !config.whatsappApiKey || !config.whatsappInstanceName) {
        return res.status(400).json({ error: "WhatsApp integration not fully configured" });
      }
      const storeToRegion = {};
      try {
        const adminSnap = await db.collection("app_config").doc("admin_control").get();
        if (adminSnap.exists) {
          const adminData = adminSnap.data() || {};
          const regions = adminData.regions || [];
          for (const r of regions) {
            if (Array.isArray(r.stores)) {
              for (const sid of r.stores) {
                storeToRegion[String(sid).trim()] = r.name || "";
              }
            }
          }
        }
      } catch (_) {
      }
      const todayStart = /* @__PURE__ */ new Date();
      todayStart.setHours(0, 0, 0, 0);
      const oosSnap = await db.collection("oos_history").where("updatedAt", ">=", todayStart).get();
      const mappings = config.whatsappAutoOosMappings || [];
      const whatsappOosRegions = config.whatsappOosRegions || ["All"];
      let sent = 0;
      let skipped = 0;
      let failed = 0;
      for (const docSnap of oosSnap.docs) {
        const oosData = docSnap.data();
        if (oosData.whatsappSent) {
          skipped++;
          continue;
        }
        const storeRegion = storeToRegion[oosData.storeId] || "";
        const normRegion = String(storeRegion).trim().toLowerCase();
        const isRegionAllowed = whatsappOosRegions.includes("All") || storeRegion && whatsappOosRegions.some((cr) => cr.toLowerCase() === storeRegion.toLowerCase());
        if (!isRegionAllowed) {
          await docSnap.ref.update({ whatsappSent: true, whatsappError: "Region disabled" });
          skipped++;
          continue;
        }
        const mapping = mappings.find(
          (m) => String(m.region).trim().toLowerCase() === normRegion || ["global", "all", ""].includes(String(m.region).trim().toLowerCase())
        );
        if (!mapping || !mapping.groupJid) {
          await docSnap.ref.update({ whatsappSent: true, whatsappError: "No regional mapping found" });
          skipped++;
          continue;
        }
        const instanceToUse = mapping.instanceName || config.whatsappInstanceName;
        const captionText = `\u{1F6A8} *OOS Alert*

*Order:* ${oosData.orderId || "N/A"}
*Item:* ${oosData.itemName || "N/A"}
*SKU:* ${oosData.sku || "N/A"}
*Store:* ${oosData.storeId || "N/A"}
*Location:* ${oosData.location || "--"}
*Qty:* ${oosData.foundQty || 0}/${oosData.quantity || 0}`;
        try {
          let url = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${instanceToUse}`;
          let bodyParams = {
            number: mapping.groupJid,
            options: { delay: 0, presence: "composing", linkPreview: false },
            text: captionText
          };
          if (oosData.photoUrl) {
            url = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendMedia/${instanceToUse}`;
            bodyParams = {
              number: mapping.groupJid,
              options: { delay: 0, presence: "composing" },
              mediatype: "image",
              mimetype: "image/jpeg",
              caption: captionText,
              media: oosData.photoUrl
            };
          }
          const waRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: config.whatsappApiKey },
            body: JSON.stringify(bodyParams)
          });
          if (waRes.ok) {
            await docSnap.ref.update({ whatsappSent: true, whatsappSentAt: (/* @__PURE__ */ new Date()).toISOString() });
            sent++;
          } else {
            const errText = await waRes.text();
            await docSnap.ref.update({ whatsappSent: true, whatsappError: `API ${waRes.status}: ${errText.slice(0, 100)}` });
            failed++;
          }
        } catch (sendErr) {
          await docSnap.ref.update({ whatsappSent: true, whatsappError: sendErr.message?.slice(0, 100) });
          failed++;
        }
      }
      res.json({ status: "success", sent, skipped, failed, total: oosSnap.docs.length });
    } catch (e) {
      console.error("[WhatsApp] Scan-and-send error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/admin/send-oos-push", async (req, res) => {
    try {
      if (!db || !messaging)
        return res.status(500).json({ error: "Missing Firebase features" });
      const { item, requesterRole } = req.body;
      if (!item || requesterRole !== "admin" && requesterRole !== "operator" && requesterRole !== "supervisor") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      let alertRegion = "";
      try {
        const adminSnap = await db.collection("app_config").doc("admin_control").get();
        if (adminSnap.exists) {
          const adminData = adminSnap.data() || {};
          const regions = adminData.regions || [];
          const storeRegionObj = regions.find(
            (r) => Array.isArray(r.stores) && r.stores.includes(item.storeId)
          );
          if (storeRegionObj && storeRegionObj.name) {
            alertRegion = storeRegionObj.name;
          } else {
            const storeRegionMapping = regions.find(
              (r) => String(r.storeId || r.StoreID || "").trim() === String(item.storeId).trim()
            );
            if (storeRegionMapping && (storeRegionMapping.region || storeRegionMapping.Region)) {
              alertRegion = storeRegionMapping.region || storeRegionMapping.Region;
            }
          }
        }
      } catch (e) {
        console.warn("Could not fetch admin_control for region mapping", e);
      }
      const alertStoreId = String(item.storeId || "").trim();
      const tokensSnap = await db.collection("fcm_tokens").get();
      const allTokensData = tokensSnap.docs.map((doc) => doc.data());
      const tokens = allTokensData.filter((data) => {
        if (!data.token) return false;
        const userRole = normalizeRole2(data.role);
        const userStoreId = normalizeStoreId2(data.storeId);
        const userRegion = normalizeRegion2(data.region);
        const targetStoreId = normalizeStoreId2(alertStoreId);
        const targetRegion = normalizeRegion2(alertRegion);
        if (userRole === "admin") return true;
        if (userRole === "supervisor") {
          return isRegionMatch2(data.region, alertRegion);
        }
        if ([
          "manager",
          "store",
          "picker",
          "driver",
          "staff",
          "operator"
        ].includes(userRole)) {
          return isStoreMatch2(data.storeId, alertStoreId);
        }
        return false;
      }).map((data) => data.token);
      if (tokens.length === 0)
        return res.json({ status: "success", successCount: 0 });
      const getSmallThumbnailUrl = (url) => {
        if (!url) return "";
        const str = String(url);
        if (str.includes("drive.google.com")) {
          const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
          if (id) return `https://lh3.googleusercontent.com/d/${id}=s200`;
        }
        return str;
      };
      const getLargeImageUrl = (url) => {
        if (!url) return "";
        const str = String(url);
        if (str.includes("drive.google.com")) {
          const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
          if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
        }
        return str;
      };
      const payload = {
        title: `\u26A0\uFE0F OUT OF STOCK DETECTED`,
        body: `Item ${item.itemName} (SKU: ${item.sku}) at Store ${item.storeId}.`,
        icon: getSmallThumbnailUrl(item.photoUrl),
        image: getLargeImageUrl(item.photoUrl),
        data: {
          orderId: String(item.orderId || ""),
          type: "oos",
          storeId: String(item.storeId || ""),
          icon: getSmallThumbnailUrl(item.photoUrl),
          image: getLargeImageUrl(item.photoUrl)
        }
      };
      const MAX_TOKENS = 500;
      let successCount = 0;
      try {
        const sysData = await getCachedConfig(db);
        if (Object.keys(sysData).length > 0) {
          if (sysData.whatsappOosEnabled && sysData.whatsappApiUrl && sysData.whatsappInstanceName && sysData.whatsappApiKey) {
            const mappings = sysData.whatsappAutoOosMappings || [];
            const normRegion = String(alertRegion || "").trim().toLowerCase();
            const mapping = mappings.find(
              (m) => String(m.region).trim().toLowerCase() === normRegion || ["global", "all", ""].includes(String(m.region).trim().toLowerCase())
            );
            if (mapping && mapping.groupJid) {
              const instanceToUse = mapping.instanceName || sysData.whatsappInstanceName;
              if (instanceToUse) {
                const storeDisplayName = item.storeName ? item.storeName : item.storeId;
                const waMessage = `*Out of Stock Alert!*
Store: ${item.storeId}
Order No: ${item.orderId || "N/A"}
SKU: ${item.sku}
Item Name: ${item.itemName}
Store Name: ${storeDisplayName}`;
                let url = `${sysData.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${instanceToUse}`;
                let bodyParams = {
                  number: mapping.groupJid,
                  options: {
                    delay: 0,
                    presence: "composing",
                    linkPreview: false
                  },
                  text: waMessage
                };
                if (payload.image) {
                  url = `${sysData.whatsappApiUrl.replace(/\/$/, "")}/message/sendMedia/${instanceToUse}`;
                  bodyParams = {
                    number: mapping.groupJid,
                    options: {
                      delay: 0,
                      presence: "composing",
                      linkPreview: false
                    },
                    mediatype: "image",
                    mimetype: "image/jpeg",
                    caption: waMessage,
                    media: payload.image
                  };
                }
                await fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: sysData.whatsappApiKey
                  },
                  body: JSON.stringify(bodyParams)
                }).catch(
                  (e) => console.error("[WhatsApp] Error calling Evolution API:", e)
                );
              }
            }
          }
        }
      } catch (waErr) {
        console.error("[WhatsApp] Internal Error:", waErr);
      }
      for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
        const tokenBatch = tokens.slice(i, i + MAX_TOKENS);
        const message = {
          notification: {
            title: payload.title,
            body: payload.body,
            image: payload.image
          },
          webpush: {
            notification: {
              icon: payload.data.icon || "https://placehold.co/192x192.png?text=OOS",
              image: payload.data.image || "https://placehold.co/192x192.png?text=OOS"
            }
          },
          data: {
            orderId: String(payload.data.orderId || ""),
            type: String(payload.data.type || ""),
            storeId: String(payload.data.storeId || ""),
            icon: String(payload.data.icon || ""),
            image: String(payload.data.image || "")
          },
          tokens: tokenBatch
        };
        let response;
        try {
          console.log("[FCM] Sending batch:", tokenBatch.length);
          response = await messaging.sendEachForMulticast(message);
          console.log("[FCM] Success:", response.successCount);
          console.log("[FCM] Failure:", response.failureCount);
          if (response.failureCount > 0) {
            const badTokens = [];
            response.responses.forEach((r, idx) => {
              if (!r.success) {
                console.error("[FCM TOKEN ERROR]", tokenBatch[idx], r.error);
                const errCode = r.error?.code;
                if (errCode === "messaging/registration-token-not-registered" || errCode === "messaging/invalid-registration-token") {
                  badTokens.push(tokenBatch[idx]);
                }
              }
            });
            if (badTokens.length > 0) {
              console.log(
                "[FCM CleanUp] Cleaning up invalid tokens:",
                badTokens.length
              );
              for (const token of badTokens) {
                try {
                  const snap = await db.collection("fcm_tokens").where("token", "==", token).get();
                  if (!snap.empty) {
                    const cleanupBatch = db.batch();
                    snap.docs.forEach((doc) => {
                      console.log(
                        `[FCM CleanUp] Deleting unregistered token: ${doc.id}`
                      );
                      cleanupBatch.delete(doc.ref);
                    });
                    await cleanupBatch.commit();
                  }
                } catch (cleanupErr) {
                  console.error("[FCM CleanUp ERROR]", cleanupErr);
                }
              }
            }
          }
        } catch (fcmErr) {
          console.error("[FCM FATAL ERROR]", fcmErr);
          return res.status(500).json({
            status: "error",
            error: fcmErr.message || "FCM send failed"
          });
        }
        successCount += response.successCount;
      }
      res.json({ status: "success", successCount });
    } catch (e) {
      console.error("[send-oos-push] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
  app.get("/api/oos-history", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "No DB" });
      const limitParam = parseInt(req.query.limit || "500", 10);
      if (oosHistoryCache && Date.now() - oosHistoryCacheTime < OOS_HISTORY_CACHE_TTL) {
        return res.json(oosHistoryCache);
      }
      const snap = await db.collection("oos_history").limit(limitParam).get();
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      const result = { status: "success", data: items };
      oosHistoryCache = result;
      oosHistoryCacheTime = Date.now();
      res.json(result);
    } catch (e) {
      console.error("[oos-history] Error:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });
  app.get("/api/oos-trigger", async (req, res) => {
    try {
      if (!db || !messaging)
        return res.status(500).json({ error: "Missing Firebase features" });
      await runMonitorTick(db, messaging);
      res.json({ status: "Tick completed" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.stack || e.message });
    }
  });
  app.get("/api/monitor", async (req, res) => {
    try {
      if (!db || !messaging)
        return res.status(500).json({ status: "error", message: "Firebase features missing" });
      const monKey = req.headers["x-monitor-key"] || req.query.key;
      console.log(
        `[Monitor Trigger] Hitting monitor manually from Vercel/GAS. Key: ${!!monKey}`
      );
      await runMonitorTick(db, messaging);
      res.json({
        status: "success",
        message: "Monitor tick completed successfully"
      });
    } catch (e) {
      console.error("[api/monitor] Error:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });
  app.get("/api/test-whatsapp-alert", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "No DB" });
      const sysConfig = await getCachedConfig(db);
      const {
        whatsappApiUrl,
        whatsappApiKey,
        whatsappInstanceName,
        whatsappFulfillmentMappings = [],
        whatsappLastMileMappings = [],
        whatsappEscalationRules = [],
        whatsappGlobalGroupJid = ""
      } = sysConfig;
      const debugInfo = {
        hasApiUrl: !!whatsappApiUrl,
        hasApiKey: !!whatsappApiKey,
        hasInstanceName: !!whatsappInstanceName,
        fulfillmentMappingsCount: whatsappFulfillmentMappings.length,
        lastMileMappingsCount: whatsappLastMileMappings.length,
        escalationRulesCount: whatsappEscalationRules.length,
        activeRules: whatsappEscalationRules.filter((r) => r.isActive),
        globalGroupJid: whatsappGlobalGroupJid,
        fulfillmentMappings: whatsappFulfillmentMappings.map((m) => ({ storeId: m.storeId, hasGroupJid: !!m.groupJid, groupJid: m.groupJid?.slice(0, 15) + "..." })),
        lastMileMappings: whatsappLastMileMappings.map((m) => ({ storeId: m.storeId, hasGroupJid: !!m.groupJid }))
      };
      if (!whatsappApiUrl || !whatsappApiKey) {
        return res.json({ status: "error", message: "Missing whatsappApiUrl or whatsappApiKey in config", debug: debugInfo });
      }
      let testJid = "";
      let testInstance = whatsappInstanceName;
      if (whatsappFulfillmentMappings.length > 0 && whatsappFulfillmentMappings[0].groupJid) {
        testJid = whatsappFulfillmentMappings[0].groupJid;
        testInstance = whatsappFulfillmentMappings[0].instanceName || whatsappInstanceName;
      } else if (whatsappLastMileMappings.length > 0 && whatsappLastMileMappings[0].groupJid) {
        testJid = whatsappLastMileMappings[0].groupJid;
        testInstance = whatsappLastMileMappings[0].instanceName || whatsappInstanceName;
      } else if (whatsappGlobalGroupJid) {
        testJid = whatsappGlobalGroupJid;
      }
      if (!testJid) {
        return res.json({ status: "error", message: "No group JID found in any mapping to test with", debug: debugInfo });
      }
      if (!testInstance) {
        return res.json({ status: "error", message: "No instance name configured", debug: debugInfo });
      }
      const url = `${whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${testInstance}`;
      const bodyParams = {
        number: testJid,
        options: { delay: 0, presence: "composing", linkPreview: false },
        text: `*\u{1F9EA} TEST: WhatsApp Escalation Matrix*

This is a test message from the Ecom Dashboard.
Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}

If you see this, WhatsApp dispatch is working!`
      };
      console.log(`[TEST WhatsApp] Sending to JID: ${testJid} via instance: ${testInstance}`);
      console.log(`[TEST WhatsApp] URL: ${url}`);
      const waRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: whatsappApiKey
        },
        body: JSON.stringify(bodyParams)
      });
      const responseText = await waRes.text();
      console.log(`[TEST WhatsApp] Response status: ${waRes.status}, body: ${responseText}`);
      debugInfo.testResult = {
        url,
        targetJid: testJid,
        instance: testInstance,
        httpStatus: waRes.status,
        response: responseText.slice(0, 500),
        ok: waRes.ok
      };
      res.json({ status: waRes.ok ? "success" : "failed", debug: debugInfo });
    } catch (e) {
      console.error("[TEST WhatsApp] Error:", e);
      res.status(500).json({ status: "error", error: e.message, stack: e.stack?.slice(0, 300) });
    }
  });
  app.post("/api/admin/archive-logs", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "No DB" });
      const fortyEightHoursAgo = new Date(
        Date.now() - 48 * 60 * 60 * 1e3
      ).toISOString();
      const logsToArchive = [];
      const oosSnap = await db.collection("oos_history").where("timestamp", "<", fortyEightHoursAgo).get();
      const oosBatch = db.batch();
      oosSnap.docs.forEach((doc) => {
        logsToArchive.push({ type: "oos", id: doc.id, ...doc.data() });
        oosBatch.delete(doc.ref);
      });
      const alertsSnap = await db.collection("alerts").where("triggeredAt", "<", fortyEightHoursAgo).get();
      const alertsBatch = db.batch();
      alertsSnap.docs.forEach((doc) => {
        logsToArchive.push({ type: "alert", id: doc.id, ...doc.data() });
        alertsBatch.delete(doc.ref);
      });
      if (logsToArchive.length === 0) {
        return res.json({
          status: "success",
          archivedCount: 0,
          message: "No logs older than 48 hours found."
        });
      }
      const V2_FALLBACK = "https://script.google.com/macros/s/AKfycbxGr0rRSmIuutAd80GfkVO4lYZ-ObJ4WY9hr-xfLim1Is_t1gUBKStJ7nb7LoepIEA_IA/exec";
      const rawUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || V2_FALLBACK).trim();
      const syncParams = new URLSearchParams();
      syncParams.append("action", "archiveOldLogs");
      syncParams.append("payload", JSON.stringify(logsToArchive));
      await import_axios3.default.post(rawUrl, syncParams.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 6e4
      });
      if (!oosSnap.empty) await oosBatch.commit();
      if (!alertsSnap.empty) await alertsBatch.commit();
      res.json({ status: "success", archivedCount: logsToArchive.length });
    } catch (e) {
      console.error("[archive-logs] Error:", e);
      res.status(500).json({ status: "error", error: e.message });
    }
  });
  app.get("/api/bot/live-orders", async (req, res) => {
    try {
      const monKey = req.headers["x-monitor-key"] || req.query.key;
      if (monKey !== process.env.MONITOR_SECRET && monKey !== process.env.VITE_MONITOR_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const V2_FALLBACK = "https://script.google.com/macros/s/AKfycbxGr0rRSmIuutAd80GfkVO4lYZ-ObJ4WY9hr-xfLim1Is_t1gUBKStJ7nb7LoepIEA_IA/exec";
      const v2Url = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || V2_FALLBACK).trim();
      console.log("[Bot/live-orders] Fetching Matrix V2 from GAS...");
      const gasResp = await import_axios3.default.get(`${v2Url}${v2Url.includes("?") ? "&" : "?"}action=getMatrixDataV2`, {
        timeout: 25e3,
        headers: { "Accept": "application/json" }
      });
      let raw = gasResp.data;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch (_) {
        }
      }
      if (typeof raw === "string" && raw.includes("<!DOCTYPE")) {
        return res.status(502).json({ error: "GAS returned HTML \u2014 check GAS permissions" });
      }
      let orders = raw?.data || raw?.orders || raw || [];
      if (!Array.isArray(orders)) orders = [];
      const getAgeMins = (order) => {
        const ts = order.created_at || order.createdAt || order.timestamp || order.orderTime;
        if (!ts) return 0;
        return Math.floor((Date.now() - new Date(ts).getTime()) / 6e4);
      };
      const getBucket = (mins) => {
        const buckets = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
        for (let i = 0; i < buckets.length; i++) {
          if (mins < buckets[i]) return i === 0 ? `0-${buckets[i]}MIN` : `${buckets[i - 1]}-${buckets[i]}MIN`;
        }
        return "60MIN+";
      };
      const normalizeStatus = (s) => {
        const map = {
          CREATED: "Created",
          PICKING: "Picking",
          PICKINGWITHPACKING: "Picking with Packing",
          STORING: "Storing",
          STORED: "Stored",
          GOINGTOORIGIN: "Going to Origin",
          TRANSFERRING: "Transferring",
          GOINGTODESTINATION: "Going to Destination",
          DELIVERING: "Delivering",
          DELIVERED: "Delivered",
          CANCELLED: "Cancelled"
        };
        return map[String(s || "").toUpperCase().replace(/\s+/g, "")] || s || "Unknown";
      };
      const enriched = orders.map((o) => {
        const ageMins = getAgeMins(o);
        const driver = o.driver_name || o.driverName || o.driver || "";
        const picker = o.picker_name || o.pickerName || o.picker || "";
        const status = normalizeStatus(o.status || o.order_status || "");
        const store = o.store_id || o.storeId || o.store || "";
        const storeName = o.store_name || o.storeName || store;
        const region = o.region || o.area || "";
        const totalItems = o.total_items ?? o.totalItems ?? o.sku_count ?? null;
        const pickedItems = o.picked_items ?? o.pickedItems ?? null;
        return {
          orderId: o.job_number || o.orderID || o.order_id || o.id || "",
          store,
          storeName,
          region,
          status,
          ageMins,
          ageBucket: getBucket(ageMins),
          driver: driver || null,
          picker: picker || null,
          totalItems,
          pickedItems,
          isCritical: ageMins >= 40
        };
      }).filter((o) => o.orderId);
      const statusGroups = {};
      enriched.forEach((o) => {
        statusGroups[o.status] = (statusGroups[o.status] || 0) + 1;
      });
      const critical = enriched.filter((o) => o.isCritical);
      const byStore = {};
      enriched.forEach((o) => {
        byStore[o.store] = (byStore[o.store] || 0) + 1;
      });
      const result = {
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        totalOrders: enriched.length,
        criticalCount: critical.length,
        statusBreakdown: statusGroups,
        storeBreakdown: byStore,
        criticalOrders: critical,
        allOrders: enriched
      };
      console.log(`[Bot/live-orders] Returning ${enriched.length} orders (${critical.length} critical)`);
      res.json(result);
    } catch (e) {
      console.error("[Bot/live-orders] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
  async function generateBotResponse(question, config, reqApiKey, reqModel) {
    const model = reqModel || config.aiBotModel || "gemini-2.0-flash";
    const apiKey = reqApiKey || config.aiBotApiKey || "";
    const systemInstructions = config.aiBotSystemInstructions || "You are an operations assistant. Answer questions strictly based on the live order data provided. Do not fabricate or guess any order details. If information is not in the data, say so clearly.";
    if (!apiKey) {
      throw new Error("No AI API key configured. Please set it in Admin \u2192 Settings \u2192 AI Chatbot Configuration.");
    }
    const V2_FALLBACK = "https://script.google.com/macros/s/AKfycbxGr0rRSmIuutAd80GfkVO4lYZ-ObJ4WY9hr-xfLim1Is_t1gUBKStJ7nb7LoepIEA_IA/exec";
    const v2Url = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || V2_FALLBACK).trim();
    let liveOrderContext = "Live order data: unavailable at this time.";
    try {
      const gasResp = await import_axios3.default.get(`${v2Url}${v2Url.includes("?") ? "&" : "?"}action=getMatrixDataV2`, {
        timeout: 2e4,
        headers: { "Accept": "application/json" }
      });
      let raw = gasResp.data;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch (_) {
        }
      }
      let orders = raw?.data || raw?.orders || raw || [];
      if (!Array.isArray(orders)) orders = [];
      const getAgeMins = (o) => {
        const ts = o.created_at || o.createdAt || o.timestamp || o.orderTime;
        return ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 6e4) : 0;
      };
      const getBucket = (mins) => {
        const b = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
        for (let i = 0; i < b.length; i++) {
          if (mins < b[i]) return i === 0 ? `0-${b[i]}MIN` : `${b[i - 1]}-${b[i]}MIN`;
        }
        return "60MIN+";
      };
      const enriched = orders.map((o) => ({
        orderId: o.job_number || o.orderID || o.order_id || "",
        store: `${o.store_id || o.storeId || ""} ${o.store_name || o.storeName || ""}`.trim(),
        region: o.region || o.area || "",
        status: o.status || o.order_status || "Unknown",
        ageMins: getAgeMins(o),
        ageBucket: getBucket(getAgeMins(o)),
        driver: o.driver_name || o.driverName || o.driver || "Unassigned",
        picker: o.picker_name || o.pickerName || o.picker || "Unassigned",
        totalItems: o.total_items ?? o.totalItems ?? "?",
        pickedItems: o.picked_items ?? o.pickedItems ?? "?"
      })).filter((o) => o.orderId);
      const critical = enriched.filter((o) => o.ageMins >= 40);
      const statusMap = {};
      enriched.forEach((o) => {
        statusMap[o.status] = (statusMap[o.status] || 0) + 1;
      });
      liveOrderContext = `
LIVE ORDER SNAPSHOT (fetched at ${(/* @__PURE__ */ new Date()).toISOString()})
Total Orders: ${enriched.length}
Critical Orders (40+ min): ${critical.length}
Status Breakdown: ${JSON.stringify(statusMap)}

${critical.length > 0 ? `\u26A0\uFE0F CRITICAL ORDERS:
${critical.map((o) => `  - ${o.orderId} | Store: ${o.store} | Region: ${o.region} | Status: ${o.status} | Age: ${o.ageMins} min (${o.ageBucket}) | Driver: ${o.driver} | Picker: ${o.picker} | Items: ${o.pickedItems}/${o.totalItems}`).join("\n")}` : "No critical orders at this time."}

ALL ORDERS (${enriched.length} total):
${enriched.map((o) => `  ${o.orderId} | ${o.store} | ${o.status} | ${o.ageMins}min | Driver: ${o.driver} | Picker: ${o.picker}`).join("\n")}
`.trim();
    } catch (gasErr) {
      console.error("[Bot/chat] GAS fetch failed:", gasErr.message);
      liveOrderContext = "Live order data: GAS fetch failed \u2014 " + gasErr.message;
    }
    const fullSystemPrompt = `${systemInstructions}

${liveOrderContext}`;
    const callAI = async (targetModel, targetApiKey) => {
      const isGemini = targetModel.toLowerCase().startsWith("gemini");
      if (isGemini) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${targetApiKey}`;
        const geminiPayload = {
          contents: [{ role: "user", parts: [{ text: `${fullSystemPrompt}

User Question: ${question}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
        };
        const geminiResp = await import_axios3.default.post(geminiUrl, geminiPayload, { headers: { "Content-Type": "application/json" }, timeout: 3e4 });
        const text = geminiResp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";
        return { answer: text, model: targetModel, provider: "gemini" };
      } else {
        const openaiResp = await import_axios3.default.post("https://api.openai.com/v1/chat/completions", {
          model: targetModel,
          messages: [
            { role: "system", content: fullSystemPrompt },
            { role: "user", content: question }
          ],
          temperature: 0.2,
          max_tokens: 1024
        }, {
          headers: { "Authorization": `Bearer ${targetApiKey}`, "Content-Type": "application/json" },
          timeout: 3e4
        });
        const text = openaiResp.data?.choices?.[0]?.message?.content || "No response from OpenAI.";
        return { answer: text, model: targetModel, provider: "openai" };
      }
    };
    let result;
    try {
      result = await callAI(model, apiKey);
      console.log(`[Bot/chat] Answered via ${result.provider} (${result.model})`);
    } catch (primaryErr) {
      console.warn(`[Bot/chat] Primary model (${model}) failed:`, primaryErr.message);
      const fallbackModel = config.aiBotFallbackModel;
      const fallbackApiKey = config.aiBotFallbackApiKey;
      if (fallbackModel && fallbackApiKey) {
        console.log(`[Bot/chat] Falling back to secondary model (${fallbackModel})...`);
        try {
          result = await callAI(fallbackModel, fallbackApiKey);
          result.provider = result.provider + " (Fallback)";
          console.log(`[Bot/chat] Fallback successful via ${result.provider}`);
        } catch (fallbackErr) {
          console.error(`[Bot/chat] Fallback model also failed:`, fallbackErr.message);
          throw fallbackErr;
        }
      } else {
        throw primaryErr;
      }
    }
    return result;
  }
  app.post("/api/bot/chat", async (req, res) => {
    try {
      const { question, model, apiKey } = req.body || {};
      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "question is required" });
      }
      const config = await getCachedConfig(db);
      const result = await generateBotResponse(question, config, apiKey, model);
      res.json(result);
    } catch (e) {
      const detail = e.response?.data?.error?.message || e.response?.data?.message || e.message;
      console.error("[Bot/chat] Error:", detail);
      res.status(500).json({ error: detail });
    }
  });
  app.post("/api/whatsapp/webhook", async (req, res) => {
    res.status(200).send("OK");
    try {
      const payload = req.body;
      if (!payload || payload.event !== "messages.upsert") return;
      const msgData = payload.data?.messages?.[0] || payload.data?.message || payload.data;
      if (!msgData) return;
      const isFromMe = msgData.key?.fromMe;
      if (isFromMe) return;
      const remoteJid = msgData.key?.remoteJid;
      if (!remoteJid) return;
      const messageObj = msgData.message || {};
      const text = messageObj.conversation || messageObj.extendedTextMessage?.text || "";
      if (!text || typeof text !== "string") return;
      const config = await getCachedConfig(db);
      if (!config.aiBotWhatsappEnabled) return;
      if (!config.aiBotWhatsappGroupJid) return;
      if (remoteJid !== config.aiBotWhatsappGroupJid) return;
      console.log(`[Bot/Webhook] Received question in configured group (${remoteJid}): "${text}"`);
      const aiResult = await generateBotResponse(text, config);
      if (!config.whatsappApiUrl || !config.whatsappInstanceName || !config.whatsappApiKey) {
        console.error("[Bot/Webhook] Missing Evolution API credentials to send reply.");
        return;
      }
      const replyUrl = `${config.whatsappApiUrl.replace(/\/$/, "")}/message/sendText/${config.whatsappInstanceName}`;
      const replyPayload = {
        number: remoteJid,
        options: {
          delay: 1200,
          presence: "composing"
        },
        textMessage: {
          text: aiResult.answer
        }
      };
      console.log(`[Bot/Webhook] Sending AI reply to WhatsApp...`);
      await import_axios3.default.post(replyUrl, replyPayload, {
        headers: {
          "apikey": config.whatsappApiKey,
          "Content-Type": "application/json"
        },
        timeout: 15e3
      });
      console.log(`[Bot/Webhook] Reply sent successfully.`);
    } catch (e) {
      console.error("[Bot/Webhook] Error processing incoming message:", e.message);
    }
  });
  app.all("/api/proxy-gas", async (req, res) => {
    const start = Date.now();
    const action = req.query.action || "unknown";
    try {
      console.log(`[Proxy] >>> START ${req.method} action=${action}`);
      const V2_FALLBACK = "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec";
      const V1_FALLBACK = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
      let rawUrl = (typeof req.query.gasUrl === "string" ? req.query.gasUrl : "").trim();
      if (!rawUrl || rawUrl === "undefined" || !rawUrl.startsWith("http")) {
        if (action === "getMatrixDataV2" || req.headers["x-use-v2-gas"] === "true") {
          rawUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || V2_FALLBACK).trim();
        } else {
          rawUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || V1_FALLBACK).trim();
        }
      }
      if (!rawUrl || rawUrl === "undefined" || !rawUrl.startsWith("http")) {
        rawUrl = V1_FALLBACK;
      }
      let urlObj;
      try {
        urlObj = new URL(rawUrl);
      } catch (e) {
        return res.status(400).json({ status: "error", message: "Invalid GAS URL configuration" });
      }
      console.log(`[Proxy] Incoming request: ${req.method} action=${action}`);
      const cacheKey = req.method + ":" + rawUrl + ":" + JSON.stringify(
        Object.keys(req.query).sort().reduce((acc, k) => {
          if (k !== "_t" && k !== "gasUrl") acc[k] = req.query[k];
          return acc;
        }, {})
      );
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== "gasUrl") urlObj.searchParams.set(key, String(value));
      }
      const config = {
        method: req.method,
        url: urlObj.toString(),
        timeout: 45e3,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*"
        },
        validateStatus: () => true,
        maxRedirects: 15
      };
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (req.headers["content-type"]?.includes(
          "application/x-www-form-urlencoded"
        )) {
          const params = new URLSearchParams();
          for (const key in req.body) params.append(key, req.body[key]);
          config.data = params.toString();
          config.headers["Content-Type"] = "application/x-www-form-urlencoded";
        } else {
          config.data = req.body;
          config.headers["Content-Type"] = req.headers["content-type"] || "application/json";
        }
      }
      const skipCache = req.method !== "GET" || req.query.cache === "skip" || req.query._skipCache === "true";
      const response = await executeGasRequest(config, { skipCache, cacheKey });
      if (res.headersSent) {
        console.warn(
          `[Proxy] Response already sent for action=${action}, skipping send.`
        );
        return;
      }
      const contentType = response.headers?.["content-type"] || "application/json";
      res.setHeader("Content-Type", contentType);
      const responseSize = response.data ? typeof response.data === "string" ? response.data.length : JSON.stringify(response.data).length : 0;
      const mem = process.memoryUsage();
      console.log(
        `[Proxy] Response action=${action} size=${(responseSize / 1024).toFixed(1)}KB | Mem: RSS=${(mem.rss / 1024 / 1024).toFixed(1)}MB`
      );
      if (typeof response.data === "string") {
        const isHtml = response.data.includes("<!DOCTYPE html>") || response.data.includes("<html");
        const isError = response.data.includes("goog-script-error") || response.data.includes("Rate exceeded");
        if (isError || isHtml && !response.data.includes("JSON")) {
          console.error(
            `[Proxy] Detected INVALID Response from GAS for action=${action}: ${isHtml ? "HTML" : "Error Page"}`
          );
          const isRate = response.data.includes("Rate exceeded");
          return res.status(isRate ? 429 : 502).json({
            status: "error",
            message: isRate ? "Rate limit reached" : isHtml ? "GAS returned HTML (Login or Deployment issue?)" : "GAS Error",
            debug: response.data.substring(0, 100)
          });
        }
      }
      res.status(response.status).send(response.data);
      console.log(
        `[Proxy] <<< END ${req.method} action=${action} in ${Date.now() - start}ms`
      );
    } catch (error) {
      console.error(
        `[Proxy] FATAL Error for ${req.query.action}:`,
        error.message
      );
      if (!res.headersSent) {
        res.status(500).json({ status: "error", error: error.message });
      }
    }
  });
  app.post("/api/auth/token", async (req, res) => {
    try {
      const { empId, user } = req.body;
      if (!empId || !import_firebase_admin.default.apps.length)
        return res.status(400).json({ error: "Auth missing" });
      const userId = String(empId).trim();
      if (user && db) {
        try {
          const normalizedUser = { ...user };
          if (normalizedUser.role)
            normalizedUser.role = String(normalizedUser.role).toLowerCase();
          await db.collection("users").doc(userId).set(
            {
              ...normalizedUser,
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            },
            { merge: true }
          );
          console.log(`[Server] Profile synced for ${userId}`);
        } catch (dbErr) {
          console.warn(
            `[Server] Non-blocking profile sync failed for ${userId}:`,
            dbErr
          );
        }
      }
      const customToken = await import_firebase_admin.default.auth().createCustomToken(userId);
      res.json({ token: customToken });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  const mapUsernameToEmail = (username) => `${username.toLowerCase().trim()}@lulu.com`;
  const syncUserToGas = async (user, action) => {
    try {
      let baseUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
      if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
        baseUrl = "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec";
      }
      const params = new URLSearchParams();
      params.append("action", "syncUser");
      params.append("syncAction", action);
      params.append("username", user.username || "");
      params.append("empId", user.empId || "");
      params.append("name", user.name || "");
      params.append("role", user.role || "");
      params.append("storeId", user.storeId || "");
      params.append("region", user.region || "");
      params.append("status", user.status || "Active");
      params.append("updatedAt", user.updatedAt || (/* @__PURE__ */ new Date()).toISOString());
      params.append(
        "shiftStart",
        user.shiftStart !== void 0 ? String(user.shiftStart) : "6"
      );
      params.append(
        "shiftHours",
        user.shiftHours !== void 0 ? String(user.shiftHours) : "8"
      );
      params.append("weekOffDay", user.weekOffDay || "");
      if (user.profileImage) {
        if (user.profileImage.length < 5e4) {
          params.append("profileImage", user.profileImage);
        } else {
          console.log(
            `[Sync] Skipping large image sync for ${user.username} (${user.profileImage.length} chars)`
          );
          params.append("profileImage", "IMAGE_TOO_LARGE_IN_SHEET");
        }
      }
      if (user.password) params.append("password", user.password);
      console.log(
        `[Sync] Triggering GAS sync for ${user.username} (${action})...`
      );
      await import_axios3.default.post(baseUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 3e4
        // 30 second timeout
      });
      console.log(`[Sync] GAS sync completed for ${user.username}`);
    } catch (e) {
      console.error(`[Sync] GAS sync failed for ${user.username}:`, e.message);
    }
  };
  app.post("/api/admin/users/upsert", async (req, res) => {
    try {
      const { user: userData, password, requesterId } = req.body;
      if (!userData || !userData.username || !userData.empId) {
        return res.status(400).json({ error: "Missing required user fields" });
      }
      if (!requesterId)
        return res.status(401).json({ error: "Requester ID required" });
      if (db) {
        const rId = String(requesterId).trim();
        let isAdmin = rId === "SYSTEM_MIGRATION";
        let currentRole = isAdmin ? "admin" : "Unknown";
        if (!isAdmin) {
          const adminDoc = await db.collection("users").doc(rId).get();
          const adminData = adminDoc.data();
          const role = String(adminData?.role || "").toLowerCase().trim();
          isAdmin = adminDoc.exists && (role === "admin" || role === "operator");
          currentRole = adminData?.role || "Unknown";
        }
        console.log(
          `[Admin Check] Requester: ${rId}, isAdmin: ${isAdmin}, Role: ${currentRole}`
        );
        if (!isAdmin) {
          console.warn(
            `[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`
          );
          return res.status(403).json({
            error: `Access denied: Admin role required. Your role is ${currentRole}`
          });
        }
      }
      const email = mapUsernameToEmail(userData.username);
      const uid = String(userData.empId).trim();
      try {
        const existingEmailUser = await import_firebase_admin.default.auth().getUserByEmail(email);
        if (existingEmailUser && existingEmailUser.uid !== uid) {
          console.log(
            `[Admin] Email ${email} in use by UID ${existingEmailUser.uid}. Deleting conflict.`
          );
          await import_firebase_admin.default.auth().deleteUser(existingEmailUser.uid);
        }
      } catch (e) {
      }
      let authUser;
      try {
        authUser = await import_firebase_admin.default.auth().getUser(uid);
      } catch (e) {
      }
      if (authUser) {
        await import_firebase_admin.default.auth().updateUser(uid, {
          email,
          displayName: userData.name,
          ...password ? { password } : {}
        });
        console.log(`[Admin] Updated Auth for ${uid}`);
      } else {
        await import_firebase_admin.default.auth().createUser({
          uid,
          email,
          password: password || "Lulu@123",
          // Default if missing
          displayName: userData.name,
          emailVerified: true
        });
        console.log(`[Admin] Created Auth for ${uid}`);
      }
      if (db) {
        await db.collection("users").doc(uid).set(
          {
            ...userData,
            role: String(userData.role || "picker").toLowerCase(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          { merge: true }
        );
      }
      syncUserToGas({ ...userData, password }, "upsert");
      res.json({ status: "success", message: "User upserted successfully" });
    } catch (error) {
      console.error("[Admin] Upsert error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/admin/users/delete", async (req, res) => {
    try {
      const { empId, username, requesterId } = req.body;
      if (!empId) return res.status(400).json({ error: "empId required" });
      if (!requesterId)
        return res.status(401).json({ error: "Requester ID required for security check" });
      if (db) {
        const rId = String(requesterId).trim();
        let isAdmin = rId === "SYSTEM_MIGRATION";
        let currentRole = isAdmin ? "admin" : "Unknown";
        if (!isAdmin) {
          const adminDoc = await db.collection("users").doc(rId).get();
          const adminData = adminDoc.data();
          const role = String(adminData?.role || "").toLowerCase().trim();
          isAdmin = adminDoc.exists && (role === "admin" || role === "operator");
          currentRole = adminData?.role || "Unknown";
        }
        if (!isAdmin) {
          console.warn(
            `[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`
          );
          return res.status(403).json({
            error: `Access denied: Only administrators and operators can delete users. Your role is ${currentRole}`
          });
        }
      }
      const uid = String(empId).trim();
      console.log(`[Admin] Deleting user ${uid} (requested by ${requesterId})`);
      try {
        await import_firebase_admin.default.auth().deleteUser(uid);
      } catch (e) {
        if (e.code === "auth/user-not-found") {
          console.warn(`[Admin] User ${uid} not found in Auth during deletion`);
        } else {
          throw e;
        }
      }
      if (db) {
        await db.collection("users").doc(uid).delete();
      }
      syncUserToGas({ empId: uid, username }, "delete");
      res.json({ status: "success", message: "User deleted successfully" });
    } catch (error) {
      console.error("[Admin] Deletion error:", error);
      res.status(500).json({ error: error.message || "Failed to delete user" });
    }
  });
  app.post("/api/admin/users/reset-password", async (req, res) => {
    try {
      const { empId, newPassword, requesterId } = req.body;
      if (!empId || !newPassword)
        return res.status(400).json({ error: "empId and newPassword required" });
      if (!requesterId)
        return res.status(401).json({ error: "Requester ID required" });
      if (db) {
        const rId = String(requesterId).trim();
        let isAdmin = rId === "SYSTEM_MIGRATION";
        let currentRole = isAdmin ? "admin" : "Unknown";
        if (!isAdmin) {
          const adminDoc = await db.collection("users").doc(rId).get();
          const adminData = adminDoc.data();
          const role = String(adminData?.role || "").toLowerCase().trim();
          isAdmin = adminDoc.exists && (role === "admin" || role === "operator");
          currentRole = adminData?.role || "Unknown";
        }
        if (!isAdmin) {
          console.warn(
            `[Admin Check] Access denied for ${rId}. Role found: ${currentRole}`
          );
          return res.status(403).json({
            error: `Access denied: Admin/Operator role required. Your role is ${currentRole}`
          });
        }
      }
      await import_firebase_admin.default.auth().updateUser(String(empId).trim(), {
        password: newPassword
      });
      if (db) {
        const snap = await db.collection("users").doc(String(empId).trim()).get();
        if (snap.exists) {
          await syncUserToGas(
            { ...snap.data(), password: newPassword },
            "upsert"
          );
        }
      }
      res.json({ status: "success", message: "Password reset successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/admin/migrate-users", async (req, res) => {
    try {
      let baseUrl = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
      if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) {
        baseUrl = "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec";
      }
      const gasRes = await import_axios3.default.get(
        `${baseUrl}?action=getAdminData&role=admin`
      );
      const users = gasRes.data.data?.users || gasRes.data.users || [];
      console.log(`[Migrate] Starting migration for ${users.length} users...`);
      const results = [];
      for (const user of users) {
        try {
          const uid = String(user.empId || user.EmpId || "").trim();
          const username = String(user.username || "").trim();
          const password = String(user.password || "").trim();
          if (!uid || !username) continue;
          console.log(`[Migrate] Processing ${username} (${uid})...`);
          const email = mapUsernameToEmail(username);
          try {
            const existingEmailUser = await import_firebase_admin.default.auth().getUserByEmail(email);
            if (existingEmailUser && existingEmailUser.uid !== uid) {
              console.log(
                `[Migrate] Email ${email} in use by UID ${existingEmailUser.uid}. Deleting conflict.`
              );
              await import_firebase_admin.default.auth().deleteUser(existingEmailUser.uid);
            }
          } catch (e) {
          }
          try {
            await import_firebase_admin.default.auth().createUser({
              uid,
              email,
              password: password || "Lulu@123",
              displayName: user.name,
              emailVerified: true
            });
          } catch (e) {
            if (e.code === "auth/uid-already-exists") {
              console.log(
                `[Migrate] Auth user ${uid} already exists, updating...`
              );
              await import_firebase_admin.default.auth().updateUser(uid, { email, displayName: user.name });
            } else {
              throw e;
            }
          }
          if (db) {
            await db.collection("users").doc(uid).set(
              {
                ...user,
                empId: uid,
                // Normalize keys
                role: String(user.role || "picker").toLowerCase(),
                updatedAt: (/* @__PURE__ */ new Date()).toISOString()
              },
              { merge: true }
            );
          }
          results.push({ username, status: "migrated" });
        } catch (err) {
          console.error(`[Migrate] Failed user ${user.username}:`, err.message);
          results.push({
            username: user.username,
            status: "failed",
            error: err.message
          });
        }
      }
      res.json({ status: "success", count: results.length, details: results });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => res.sendFile(import_path.default.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server on :${PORT}`);
    if (db && messaging) {
      const runTick = async () => {
        try {
          await runMonitorTick(db, messaging);
        } catch (e) {
          console.error("[Monitor] Tick failed:", e);
        } finally {
          setTimeout(runTick, 6e4);
        }
      };
      setTimeout(runTick, 1e4);
    }
  });
}
startServer().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});
//# sourceMappingURL=server.cjs.map
