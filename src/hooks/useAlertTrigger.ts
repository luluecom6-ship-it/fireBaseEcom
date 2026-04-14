import { useEffect, useRef } from 'react';
import { MatrixData, EscalationRule, User, MatrixItem, AlertLog } from '../types';
import { detectAlerts } from '../utils/alertLogic';

export function useAlertTrigger(
  user: User | null,
  matrixData: MatrixData | null,
  escalationRules: EscalationRule[],
  alertLogs: AlertLog[],
  logAlertAction: (alert: Partial<MatrixItem> & { statusTrigger: string, triggeredAt: string, orderCreatedAt: string }, action: 'trigger') => Promise<void>,
  scheduledThreshold: number = 30
) {
  const triggeredAlertsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !matrixData) return;

    // Helper for store filtering
    const filterByStore = (item: MatrixItem) => {
      const role = String(user.role || "").toLowerCase().trim();
      if (role === 'admin' || role === 'supervisor') return true;
      
      const userStoreId = String(user.storeId || "").trim().toLowerCase();
      const itemStoreId = String(item.storeID || "").trim().toLowerCase();
      
      if (userStoreId === 'all') return true;
      return itemStoreId === userStoreId;
    };

    // Filter matrix data by store before detecting alerts
    const filteredMatrix: MatrixData = {
      ...matrixData,
      quick: (matrixData.quick || []).filter(filterByStore),
      schedule: (matrixData.schedule || []).filter(filterByStore)
    };

    const existingAlertIds = new Set<string>([
      ...alertLogs.map(log => log.id.toLowerCase().trim()),
      ...(Array.from(triggeredAlertsRef.current) as string[])
    ]);

    const newAlerts = detectAlerts(filteredMatrix, escalationRules, existingAlertIds, scheduledThreshold);

    newAlerts.forEach(alert => {
      triggeredAlertsRef.current.add(alert.alertKey);
      logAlertAction({
        orderId: alert.item.orderID,
        storeId: alert.item.storeID,
        statusTrigger: alert.statusTrigger,
        bucket: alert.bucket,
        triggeredAt: new Date().toISOString(),
        orderCreatedAt: alert.item.timestamp || new Date().toISOString(),
        timestamp: new Date().toISOString()
      } as any, 'trigger');
    });
  }, [matrixData, escalationRules, user, logAlertAction, alertLogs, scheduledThreshold]);
}
