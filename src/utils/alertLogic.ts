import { MatrixData, EscalationRule, MatrixItem, AlertLog } from '../types.ts';
import { AGE_BUCKETS } from '../constants.ts';

export const PREP_STATUSES = [
  "PICKING",
  "PICKING WITH PACKING",
  "PICKING WITH UNASSIGNED ZONE",
  "STORING",
  "STORED",
  "PARKED",
  "AUDITING",
  "TRANSFERRING"
];

export const DELIVERY_STATUSES = [
  "GOING TO ORIGIN",
  "GOING TO DESTINATION",
  "IN ROUTE",
  "DELIVERING"
];

export const getBucketIndex = (bucket: string) => {
  const normalized = (bucket || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  return AGE_BUCKETS.findIndex(b => b.toUpperCase().replace(/\s+/g, '').trim() === normalized);
};

export const parseTime = (t: string) => {
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

export const parseSlot = (slot: string) => {
  if (!slot || !slot.includes('-')) return null;
  const [startStr, endStr] = slot.split('-').map(s => s.trim());
  return {
    start: parseTime(startStr),
    end: parseTime(endStr)
  };
};

export interface AlertTriggerResult {
  alertKey: string;
  item: MatrixItem;
  statusTrigger: string;
  bucket: string;
  type: 'QUICK' | 'SCHED';
}

export function detectAlerts(
  matrixData: MatrixData,
  escalationRules: EscalationRule[],
  existingAlertIds: Set<string>,
  scheduledThreshold: number = 30,
  storeToRegion: Record<string, string> = {},
  scheduledConfig?: {
    pastSlot?: { isActive: boolean, regions: string[] };
    runningSlot?: { isActive: boolean, regions: string[] };
  }
): AlertTriggerResult[] {
  const results: AlertTriggerResult[] = [];
  // Use UTC as base for all calculations
  const utcNow = new Date();
  
  // Helper to get local minutes for a specific region
  const getLocalMins = (region: string) => {
    const r = (region || "").toUpperCase().trim();
    
    // Default to IST (+5:30) as per previous requirement, but allow overrides
    let offsetMinutes = 330; 
    
    // Mapping of common regions to their UTC offsets in minutes
    const OFFSETS: Record<string, number> = {
      'DUBAI': 240,    // UTC+4
      'UAE': 240,
      'SHARJAH': 240,
      'ABUDHABI': 240,
      'SAUDI': 180,    // UTC+3
      'RIYADH': 180,
      'JEDDAH': 180,
      'QATAR': 180,
      'DOHA': 180,
      'KUWAIT': 180,
      'BAHRAIN': 180,
      'OMAN': 240,     // UTC+4
      'MUSCAT': 240,
      'INDIA': 330,    // UTC+5:30
      'MUMBAI': 330,
      'DELHI': 330,
      'BENGALURU': 330,
      'CHENNAI': 330,
      'HYDERABAD': 330,
      'EGYPT': 120,     // UTC+2
      'CAIRO': 120,
    };

    // Check if the region name (or part of it) matches an offset
    for (const [key, offset] of Object.entries(OFFSETS)) {
      if (r.includes(key)) {
        offsetMinutes = offset;
        break;
      }
    }

    const utcMins = utcNow.getUTCHours() * 60 + utcNow.getUTCMinutes();
    return (utcMins + offsetMinutes) % 1440;
  };

  const normalize = (s: string) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  const activeRules = escalationRules.filter(r => r.isActive);

  // 1. Quick Commerce Alerts
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
        
        // Match Status and Bucket
        const basicMatch = ruleStatus === status && itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
        if (!basicMatch) return false;

        // Match Region
        if (ruleRegion === "All") return true;
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

  // 2. Scheduled Commerce Alerts
  (matrixData.schedule || []).forEach(item => {
    const itemStoreId = String(item.storeID || "").trim();
    const itemRegion = storeToRegion[itemStoreId] || "";
    const nowMins = getLocalMins(itemRegion);

    // Check if slot contains a date and if it's today
    if (item.slot) {
      const dateMatch = item.slot.match(/([A-Za-z]{3}\s\d{1,2},\s\d{4})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          // Compare using local date of the region if possible, but ISO today is usually fine for daily resets
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
    let triggerType: 'PAST' | 'RUNNING' | null = null;

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

    // Apply Scheduled Configuration Toggles and Regions
    if (shouldTrigger && triggerType && scheduledConfig) {
      const config = triggerType === 'PAST' ? scheduledConfig.pastSlot : scheduledConfig.runningSlot;
      if (config) {
        // Condition 1: Check if Active
        if (config.isActive === false) shouldTrigger = false;
        
        // Condition 2: Check Region
        if (shouldTrigger && config.regions && config.regions.length > 0) {
          const matchesRegion = config.regions.includes('All') || config.regions.includes(itemRegion);
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
