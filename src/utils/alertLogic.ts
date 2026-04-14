import { MatrixData, EscalationRule, MatrixItem, AlertLog } from '../types';
import { AGE_BUCKETS } from '../constants';

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
  scheduledThreshold: number = 30
): AlertTriggerResult[] {
  const results: AlertTriggerResult[] = [];
  const normalize = (s: string) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  const activeRules = escalationRules.filter(r => r.isActive);
  
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // 1. Quick Commerce Alerts
  if (activeRules.length > 0) {
    (matrixData.quick || []).forEach(item => {
      const status = normalize(item.status);
      const bucket = normalize(item.bucket);
      const itemBucketIndex = getBucketIndex(item.bucket);
      
      const matchingRules = activeRules.filter(rule => {
        const ruleStatus = normalize(rule.status);
        const ruleBucketIndex = getBucketIndex(rule.bucket);
        return ruleStatus === status && itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
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
