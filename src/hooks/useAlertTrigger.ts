import { useEffect, useRef } from 'react';
import { MatrixData, EscalationRule, User, MatrixItem, AlertLog } from '../types';

export function useAlertTrigger(
  user: User | null,
  matrixData: MatrixData | null,
  escalationRules: EscalationRule[],
  alertLogs: AlertLog[],
  logAlertAction: (alert: Partial<MatrixItem> & { statusTrigger: string, triggeredAt: string, orderCreatedAt: string }, action: 'trigger') => Promise<void>
) {
  const triggeredAlertsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !matrixData || escalationRules.length === 0) return;

    const activeRules = escalationRules.filter(r => r.isActive);
    if (activeRules.length === 0) return;

    const allItems = [...(matrixData.quick || []), ...(matrixData.schedule || [])].filter(item => {
      const role = user.role.toLowerCase();
      if (role === 'admin' || role === 'supervisor') return true;
      return String(item.storeID).trim() === String(user.storeId).trim();
    });

    allItems.forEach(item => {
      const status = (item.status || "").toUpperCase().trim();
      const bucket = (item.bucket || "").toUpperCase().trim();
      
      const matchingRule = activeRules.find(rule => 
        rule.status.toUpperCase().trim() === status && 
        rule.bucket.toUpperCase().trim() === bucket
      );

      if (matchingRule) {
        const alertKey = `${item.orderID}|${status}`.toLowerCase().trim();
        
        // Check if alert already exists in logs or was triggered in this session
        const alreadyInLogs = alertLogs.some(log => log.id === alertKey);
        
        if (!alreadyInLogs && !triggeredAlertsRef.current.has(alertKey)) {
          triggeredAlertsRef.current.add(alertKey);
          
          logAlertAction({
            orderId: item.orderID,
            storeId: item.storeID,
            statusTrigger: status,
            bucket: bucket,
            triggeredAt: new Date().toISOString(),
            orderCreatedAt: item.timestamp || new Date().toISOString(),
            timestamp: new Date().toISOString()
          } as any, 'trigger');
        }
      }
    });
  }, [matrixData, escalationRules, user, logAlertAction, alertLogs]);
}
