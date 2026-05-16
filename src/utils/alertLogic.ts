import { MatrixData, EscalationRule, MatrixItem, AlertLog } from '../types.js';
import { AGE_BUCKETS } from '../constants.js';

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
  if (!bucket) return -1;
  const normalized = bucket.toString().toUpperCase().replace(/\s+/g, '').trim();
  
  // 1. Try exact match
  const exactIndex = AGE_BUCKETS.findIndex(b => b.toUpperCase().replace(/\s+/g, '').trim() === normalized);
  if (exactIndex !== -1) return exactIndex;

  // 2. Try partial match or numeric extraction (e.g. "25MIN" -> 25)
  const numericMatch = normalized.match(/(\d+)/);
  if (numericMatch) {
    const mins = parseInt(numericMatch[1], 10);
    // Find the bucket where the end value matches or is close
    // AGE_BUCKETS: 0-5, 5-10, 10-15, 15-20, 20-25, 25-30...
    return AGE_BUCKETS.findIndex(b => {
      const bNorm = b.toUpperCase().replace(/\s+/g, '');
      if (bNorm.includes('+')) {
        const plusVal = parseInt(bNorm.replace('MIN+', ''), 10);
        return mins >= plusVal;
      }
      const parts = bNorm.replace('MIN', '').split('-');
      if (parts.length === 2) {
        const end = parseInt(parts[1], 10);
        return mins <= end && mins > parseInt(parts[0], 10);
      }
      return false;
    });
  }

  return -1;
};

export interface AlertTriggerResult {
  alertKey: string;
  item: MatrixItem;
  statusTrigger: string;
  bucket: string;
  type: 'QUICK' | 'SCHED';
}

// Helper to get local info for a specific region
export const getLocalInfo = (region: string) => {
  const utcNow = new Date();
  const r = (region || "").toUpperCase().trim();
  
  // Default to KSA (+3:00) as per primary operating region
  let offsetMinutes = 180; 
  
  // Mapping of common regions to their UTC offsets in minutes
  const OFFSETS: Record<string, number> = {
    'DUBAI': 240,    // UTC+4
    'UAE': 240,
    'SHARJAH': 240,
    'ABUDHABI': 240,
    'KSA': 180,      // UTC+3
    'SAUDI': 180,
    'RIYADH': 180,
    'JEDDAH': 180,
    'QATAR': 180,
    'DOHA': 180,
    'KUWAIT': 180,
    'BAHRAIN': 180,
    'OMAN': 240,     // UTC+4
    'MUSCAT': 240,
    'JORDAN': 180,   // UTC+3
    'EGYPT': 120,    // UTC+2
    'CAIRO': 120,
    'INDIA': 330,    // UTC+5:30
    'MUMBAI': 330,
    'DELHI': 330,
    'BENGALURU': 330,
    'CHENNAI': 330,
    'HYDERABAD': 330,
    'MALAYSIA': 480, // UTC+8
    'INDONESIA': 420, // UTC+7 (WIB)
  };

  // Check if the region name (or part of it) matches an offset
  for (const [key, offset] of Object.entries(OFFSETS)) {
    if (r.indexOf(key) !== -1) {
      offsetMinutes = offset;
      break;
    }
  }

  // Create a local date for the region to handle date rollovers correctly
  const localTimeLong = utcNow.getTime() + (offsetMinutes * 60000);
  const localDate = new Date(localTimeLong);
  
  return {
    nowMins: localDate.getUTCHours() * 60 + localDate.getUTCMinutes(),
    dateStr: localDate.getUTCFullYear() + '-' + String(localDate.getUTCMonth() + 1).padStart(2, '0') + '-' + String(localDate.getUTCDate()).padStart(2, '0'),
    offsetMins: offsetMinutes,
    rawLocalDate: localDate
  };
};

export const parseTime = (t: string, offsetMins: number = 0) => {
  if (!t) return 0;
  const cleaned = t.trim().toUpperCase();
  
  // 1. Check if it's an ISO date string or full date string
  if (cleaned.includes('T') || cleaned.includes('-') || (cleaned.includes(':') && cleaned.length > 8)) {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      // Use getUTC components + offset to get the local minutes in that region
      const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + offsetMins;
      return (totalMins + 1440) % 1440;
    }
  }

  // 2. Try HH:MM AM/PM or HH AM/PM
  const ampmMatch = cleaned.match(/(\d+)(?::(\d+))?\s*(AM|PM)/);
  if (ampmMatch) {
    let hrs = parseInt(ampmMatch[1], 10);
    let mins = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3];
    
    if (period === 'PM' && hrs !== 12) hrs += 12;
    if (period === 'AM' && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
  }

  // 3. Try 24h format HH:MM or HH
  const h24Match = cleaned.match(/(\d{1,2})(?::(\d{2}))?/);
  if (h24Match) {
    const hrs = parseInt(h24Match[1], 10);
    const mins = h24Match[2] ? parseInt(h24Match[2], 10) : 0;
    if (hrs >= 0 && hrs < 24) {
      return hrs * 60 + mins;
    }
  }

  return 0;
};

export const formatTimeDisplay = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
};

export const formatSlotDisplay = (slot: string, offsetMins: number = 0) => {
  if (!slot) return "";
  if (!slot.includes('-')) return slot;
  
  const parts = slot.split(' - ');
  if (parts.length !== 2) return slot;

  const startMins = parseTime(parts[0], offsetMins);
  const endMins = parseTime(parts[1], offsetMins);

  if (startMins === 0 && endMins === 0 && !parts[0].includes('00:00')) return slot;

  return `${formatTimeDisplay(startMins)} - ${formatTimeDisplay(endMins)}`;
};

export const parseSlot = (slot: string, offsetMins: number = 0) => {
  if (!slot || !slot.includes('-')) return null;
  const [startStr, endStr] = slot.split('-').map(s => s.trim());
  return {
    start: parseTime(startStr, offsetMins),
    end: parseTime(endStr, offsetMins)
  };
};

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
  
  const normalize = (s: string) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  const activeRules = escalationRules.filter(r => r.isActive);

  // 1. Quick Commerce Alerts
  if (activeRules.length > 0) {
    (matrixData.quick || []).forEach((item, idx) => {
      const status = normalize(item.status);
      const bucket = normalize(item.bucket);
      const itemBucketIndex = getBucketIndex(item.bucket);
      const itemStoreId = String(item.storeID || "").trim();
      const itemRegion = normalize(storeToRegion[itemStoreId] || "");
      
      if (idx < 5) {
        console.log(`[AlertLogic DEBUG] Checking Quick Order ${item.orderID}: Status=${status}, Bucket=${bucket} (Idx ${itemBucketIndex}), Region=${itemRegion}`);
      }

      const matchingRules = activeRules.filter((rule, rIdx) => {
        const ruleStatus = normalize(rule.status);
        const ruleBucketIndex = getBucketIndex(rule.bucket);
        const ruleRegion = normalize(rule.region || "All");
        
        const statusMatch = ruleStatus === status;
        const bucketMatch = itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
        const regionMatch = (ruleRegion === "ALL" || ruleRegion === itemRegion);

        if (idx < 5 && statusMatch) {
          console.log(`  - Rule ${rIdx}: Status=${ruleStatus}, BucketIdx=${ruleBucketIndex}, Region=${ruleRegion} -> Match: Status=${statusMatch}, Bucket=${bucketMatch}, Region=${regionMatch}`);
        }

        return statusMatch && bucketMatch && regionMatch;
      });

      if (matchingRules.length > 0) {
        // Dedup by orderId + status + bucket. 
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
  (matrixData.schedule || []).forEach((item, idx) => {
    const itemStoreId = String(item.storeID || "").trim();
    const itemRegion = normalize(storeToRegion[itemStoreId] || "");
    const localInfo = getLocalInfo(itemRegion);
    const nowMins = localInfo.nowMins;
    const offsetMins = localInfo.offsetMins;
    const status = (item.status || "").toUpperCase().trim();

    if (idx < 5) {
      console.log(`[AlertLogic DEBUG] Checking Sched Order ${item.orderID}: Status=${status}, Slot=${item.slot}, NowMins=${nowMins}, Region=${itemRegion}, LocalDate=${localInfo.dateStr}`);
    }

    // Check if slot contains a date and if it's today
    if (item.slot) {
      const dateMatch = item.slot.match(/([A-Za-z]{3}\s\d{1,2},\s\d{4})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!isNaN(d.getTime())) {
          // Compare using local date of the region
          const slotDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          if (slotDateStr !== localInfo.dateStr) return; // Skip if not today in that region
        }
      }
    }

    const slotInfo = parseSlot(item.slot, offsetMins);
    if (!slotInfo) return;


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
          const normalizedTargetRegions = config.regions.map((r: string) => normalize(r));
          const matchesRegion = normalizedTargetRegions.includes('ALL') || normalizedTargetRegions.includes(itemRegion);
          if (!matchesRegion) shouldTrigger = false;
        }
      }
    } else if (shouldTrigger && triggerType && !scheduledConfig) {
      // Default behavior if config is missing: allow PAST alerts but maybe restrict RUNNING
      // For now, if config is missing, we follow the default logic (which might be too aggressive)
      // but we MUST check dedup regardless.
    }

    if (shouldTrigger) {
      const displaySlot = formatSlotDisplay(item.slot, offsetMins);
      const alertKey = `SCHED|${item.orderID}|${status}|${normalize(item.slot)}`.toLowerCase().trim();
      
      if (!existingAlertIds.has(alertKey)) {
        results.push({
          alertKey,
          item,
          statusTrigger: `Stage: ${item.status || status} - ${displaySlot}`,
          bucket: displaySlot,
          type: 'SCHED'
        });
      }
    }
  });

  return results;
}
