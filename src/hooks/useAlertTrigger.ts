import { useEffect, useRef } from 'react';
import { MatrixData, EscalationRule, User, MatrixItem, AlertLog } from '../types';
import { AGE_BUCKETS } from '../constants';

const PREP_STATUSES = [
  "PICKING",
  "PICKING WITH PACKING",
  "PICKING WITH UNASSIGNED ZONE",
  "STORING",
  "STORED",
  "PARKED",
  "AUDITING",
  "TRANSFERRING"
];

const DELIVERY_STATUSES = [
  "GOING TO ORIGIN",
  "GOING TO DESTINATION",
  "IN ROUTE",
  "DELIVERING"
];

const getBucketIndex = (bucket: string) => {
  const normalized = (bucket || "").toString().toUpperCase().replace(/\s+/g, '').trim();
  return AGE_BUCKETS.findIndex(b => b.toUpperCase().replace(/\s+/g, '').trim() === normalized);
};

const parseTime = (t: string) => {
  if (!t) return 0;
  // Handle formats like "8 AM", "8:30 AM", "8am", "8:30am"
  const cleaned = t.trim().toUpperCase();
  const match = cleaned.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/);
  if (!match) return 0;
  
  let hrs = parseInt(match[1], 10);
  let mins = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];
  
  if (period === 'PM' && hrs !== 12) hrs += 12;
  if (period === 'AM' && hrs === 12) hrs = 0;
  return hrs * 60 + mins;
};

const parseSlot = (slot: string) => {
  if (!slot || !slot.includes('-')) return null;
  const [startStr, endStr] = slot.split('-').map(s => s.trim());
  return {
    start: parseTime(startStr),
    end: parseTime(endStr)
  };
};

export function useAlertTrigger(
  user: User | null,
  matrixData: MatrixData | null,
  escalationRules: EscalationRule[],
  alertLogs: AlertLog[],
  logAlertAction: (alert: Partial<MatrixItem> & { statusTrigger: string, triggeredAt: string, orderCreatedAt: string }, action: 'trigger') => Promise<void>
) {
  const triggeredAlertsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !matrixData) return;

    const normalize = (s: string) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();
    const activeRules = escalationRules.filter(r => r.isActive);
    
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Helper for store filtering
    const filterByStore = (item: MatrixItem) => {
      const role = String(user.role || "").toLowerCase().trim();
      if (role === 'admin' || role === 'supervisor') return true;
      
      const userStoreId = String(user.storeId || "").trim().toLowerCase();
      const itemStoreId = String(item.storeID || "").trim().toLowerCase();
      
      if (userStoreId === 'all') return true;
      return itemStoreId === userStoreId;
    };

    // 1. Quick Commerce Alerts
    if (activeRules.length > 0) {
      const quickItems = (matrixData.quick || []).filter(filterByStore);
      quickItems.forEach(item => {
        const status = normalize(item.status);
        const bucket = normalize(item.bucket);
        const itemBucketIndex = getBucketIndex(item.bucket);
        
        // Find rules that match the status and where the item's ageing is >= the rule's bucket
        const matchingRules = activeRules.filter(rule => {
          const ruleStatus = normalize(rule.status);
          const ruleBucketIndex = getBucketIndex(rule.bucket);
          return ruleStatus === status && itemBucketIndex >= ruleBucketIndex && ruleBucketIndex !== -1;
        });

        if (matchingRules.length > 0) {
          // Use the highest priority (highest bucket index) matching rule
          const bestRule = matchingRules.reduce((prev, curr) => 
            getBucketIndex(curr.bucket) > getBucketIndex(prev.bucket) ? curr : prev
          );

          // Include bucket in key so it re-triggers when moving to a new bucket
          const alertKey = `QUICK|${item.orderID}|${status}|${bucket}`.toLowerCase().trim();
          const alreadyInLogs = alertLogs.some(log => log.id === alertKey);
          
          if (!alreadyInLogs && !triggeredAlertsRef.current.has(alertKey)) {
            triggeredAlertsRef.current.add(alertKey);
            logAlertAction({
              orderId: item.orderID,
              storeId: item.storeID,
              statusTrigger: `${status} (${item.bucket})`,
              bucket: item.bucket,
              triggeredAt: new Date().toISOString(),
              orderCreatedAt: item.timestamp || new Date().toISOString(),
              timestamp: new Date().toISOString()
            } as any, 'trigger');
          }
        }
      });
    }

    // 2. Scheduled Commerce Alerts
    const scheduleItems = (matrixData.schedule || []).filter(filterByStore);
    scheduleItems.forEach(item => {
      const slotInfo = parseSlot(item.slot);
      if (!slotInfo) return;

      const status = (item.status || "").toUpperCase().trim();
      let shouldTrigger = false;
      let reason = "";

      // Past Slot: Any order in any status is an alert
      if (nowMins >= slotInfo.end) {
        shouldTrigger = true;
        reason = `PAST SLOT: ${item.slot}`;
      } 
      // Running Slot: start <= now < end
      else if (nowMins >= slotInfo.start) {
        // Prep statuses should be done before start
        if (PREP_STATUSES.includes(status)) {
          shouldTrigger = true;
          reason = `RUNNING SLOT (PREP): ${item.slot}`;
        } 
        // Delivery statuses should be done 30 mins before end
        else if (DELIVERY_STATUSES.includes(status) && nowMins >= slotInfo.end - 30) {
          shouldTrigger = true;
          reason = `RUNNING SLOT (DELIVERY): ${item.slot}`;
        }
      }

      if (shouldTrigger) {
        // Include slot in key to allow multiple alerts if order moves slots (unlikely but safe)
        const alertKey = `SCHED|${item.orderID}|${status}|${item.slot}`.toLowerCase().trim();
        const alreadyInLogs = alertLogs.some(log => log.id === alertKey);
        
        if (!alreadyInLogs && !triggeredAlertsRef.current.has(alertKey)) {
          triggeredAlertsRef.current.add(alertKey);
          logAlertAction({
            orderId: item.orderID,
            storeId: item.storeID,
            statusTrigger: `${status} (${reason})`,
            bucket: item.slot, // Repurpose bucket field for slot info
            triggeredAt: new Date().toISOString(),
            orderCreatedAt: item.timestamp || new Date().toISOString(),
            timestamp: new Date().toISOString()
          } as any, 'trigger');
        }
      }
    });
  }, [matrixData, escalationRules, user, logAlertAction, alertLogs]);
}
