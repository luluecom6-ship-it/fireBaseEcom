import { useState, useCallback, useEffect } from 'react';
import { EscalationRule } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

import { User } from '../types';

export function useSystemConfig(
  user: User | null,
  showToast?: (msg: string, type?: 'success' | 'error') => void,
  isFirebaseAuthenticated?: boolean
) {
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [maxImages, setMaxImages] = useState(1);
  const [scheduledThreshold, setScheduledThreshold] = useState(15);
  const [scheduledPastSlotActive, setScheduledPastSlotActive] = useState(true);
  const [scheduledRunningSlotActive, setScheduledRunningSlotActive] = useState(true);
  const [scheduledPastSlotRegions, setScheduledPastSlotRegions] = useState<string[]>(['All']);
  const [scheduledRunningSlotRegions, setScheduledRunningSlotRegions] = useState<string[]>(['All']);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [oosPushEnabled, setOosPushEnabled] = useState(true);
  const [oosPushRegions, setOosPushRegions] = useState<string[]>(['All']);
  const [whatsappOosEnabled, setWhatsappOosEnabled] = useState(false);
  const [whatsappOosRegions, setWhatsappOosRegions] = useState<string[]>(['All']);
  const [whatsappApiUrl, setWhatsappApiUrl] = useState('');
  const [whatsappInstanceName, setWhatsappInstanceName] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [whatsappAutoOosMappings, setWhatsappAutoOosMappings] = useState<{region: string, groupJid: string, instanceName?: string}[]>([]);
  const [whatsappManualStoreMappings, setWhatsappManualStoreMappings] = useState<{storeId: string, groupJid: string, instanceName?: string}[]>([]);
  const [whatsappFulfillmentMappings, setWhatsappFulfillmentMappings] = useState<{storeId: string, groupJid: string, inchargeJid: string, managerJid: string, instanceName?: string}[]>([]);
  const [whatsappLastMileMappings, setWhatsappLastMileMappings] = useState<{storeId: string, groupJid: string, inchargeJid: string, managerJid: string, instanceName?: string}[]>([]);
  const [whatsappEscalationRules, setWhatsappEscalationRules] = useState<any[]>([]);
  const [whatsappGlobalGroupJid, setWhatsappGlobalGroupJid] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Use Firestore for real-time config
  useEffect(() => {
    if (!isFirebaseAuthenticated) return;
    const configDoc = doc(db, 'system', 'config');
    
    const fetchConfig = async () => {
      try {
        const snapshot = await getDoc(configDoc);
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data.escalationRules)) {
            setEscalationRules(data.escalationRules);
          }
          if (typeof data.maxImages === 'number') {
            setMaxImages(data.maxImages);
          }
          if (typeof data.scheduledThreshold === 'number') {
            setScheduledThreshold(data.scheduledThreshold);
          }
          if (data.scheduledPastSlot) {
            setScheduledPastSlotActive(data.scheduledPastSlot.isActive ?? true);
            setScheduledPastSlotRegions(data.scheduledPastSlot.regions || ['All']);
          }
          if (data.scheduledRunningSlot) {
            setScheduledRunningSlotActive(data.scheduledRunningSlot.isActive ?? true);
            setScheduledRunningSlotRegions(data.scheduledRunningSlot.regions || ['All']);
          }
          if (typeof data.soundAlertsEnabled === 'boolean') {
            setSoundAlertsEnabled(data.soundAlertsEnabled);
          }
          if (typeof data.oosPushEnabled === 'boolean') {
            setOosPushEnabled(data.oosPushEnabled);
          }
          if (Array.isArray(data.oosPushRegions)) {
            setOosPushRegions(data.oosPushRegions);
          }
          if (typeof data.whatsappOosEnabled === 'boolean') {
            setWhatsappOosEnabled(data.whatsappOosEnabled);
          }
          if (Array.isArray(data.whatsappOosRegions)) {
            setWhatsappOosRegions(data.whatsappOosRegions);
          }
          if (typeof data.whatsappApiUrl === 'string') {
            setWhatsappApiUrl(data.whatsappApiUrl);
          }
          if (typeof data.whatsappInstanceName === 'string') {
            setWhatsappInstanceName(data.whatsappInstanceName);
          }
          if (typeof data.whatsappApiKey === 'string') {
            setWhatsappApiKey(data.whatsappApiKey);
          }
          if (Array.isArray(data.whatsappAutoOosMappings)) {
            setWhatsappAutoOosMappings(data.whatsappAutoOosMappings);
          }
          if (Array.isArray(data.whatsappManualStoreMappings)) {
            setWhatsappManualStoreMappings(data.whatsappManualStoreMappings);
          }
          if (Array.isArray(data.whatsappFulfillmentMappings)) {
            setWhatsappFulfillmentMappings(data.whatsappFulfillmentMappings);
          }
          if (Array.isArray(data.whatsappLastMileMappings)) {
            setWhatsappLastMileMappings(data.whatsappLastMileMappings);
          }
          if (Array.isArray(data.whatsappEscalationRules)) {
            setWhatsappEscalationRules(data.whatsappEscalationRules);
          }
          if (typeof data.whatsappGlobalGroupJid === 'string') {
            setWhatsappGlobalGroupJid(data.whatsappGlobalGroupJid);
          }
        } else {
          // Default rules if nothing in Firestore yet
          const defaultRules = [
            { id: '1', status: 'CREATED', bucket: '15-20MIN', escalationUser: 'Supervisor A', isActive: true },
            { id: '2', status: 'PICKING', bucket: '15-20MIN', escalationUser: 'Supervisor B', isActive: true }
          ];
          setEscalationRules(defaultRules);
          setMaxImages(1);
          setScheduledThreshold(15);
          setScheduledPastSlotActive(true);
          setScheduledRunningSlotActive(true);
          setScheduledPastSlotRegions(['All']);
          setScheduledRunningSlotRegions(['All']);
          setSoundAlertsEnabled(true);
          setOosPushEnabled(true);
          setOosPushRegions(['All']);
          setWhatsappOosEnabled(false);
          setWhatsappOosRegions(['All']);
          setWhatsappApiUrl('');
          setWhatsappInstanceName('');
          setWhatsappApiKey('');
          setWhatsappAutoOosMappings([]);
          setWhatsappManualStoreMappings([]);
          setWhatsappFulfillmentMappings([]);
          setWhatsappLastMileMappings([]);
          setWhatsappEscalationRules([]);
          setWhatsappGlobalGroupJid('');
        }
      } catch (error) {
        console.error("Firestore config error:", error);
        if (showToast) showToast("Failed to load live config", "error");
      }
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 120000);

    return () => clearInterval(interval);
  }, [showToast, isFirebaseAuthenticated]);

  const saveSystemConfig = useCallback(async () => {
    if (!user || user.role !== 'admin') {
      if (showToast) showToast("Unauthorized: Only admins can modify system config", "error");
      return { success: false, message: "Unauthorized" };
    }

    setIsSavingConfig(true);
    try {
      const configDoc = doc(db, 'system', 'config');
      await setDoc(configDoc, {
        escalationRules,
        maxImages,
        scheduledThreshold,
        scheduledPastSlot: {
          isActive: scheduledPastSlotActive,
          regions: scheduledPastSlotRegions
        },
        scheduledRunningSlot: {
          isActive: scheduledRunningSlotActive,
          regions: scheduledRunningSlotRegions
        },
        soundAlertsEnabled,
        oosPushEnabled,
        oosPushRegions,
        whatsappOosEnabled,
        whatsappOosRegions,
        whatsappApiUrl,
        whatsappInstanceName,
        whatsappApiKey,
        whatsappAutoOosMappings,
        whatsappManualStoreMappings,
        whatsappFulfillmentMappings,
        whatsappLastMileMappings,
        whatsappEscalationRules,
        whatsappGlobalGroupJid,
        updatedAt: new Date().toISOString()
      }, { merge: true }); // Use merge: true to avoid clobbering unseen config keys
      
      if (showToast) showToast("System Configuration Saved to Firebase", "success");
      return { success: true };
    } catch (error) {
      console.error("Failed to save config to Firebase", error);
      
      // Enhanced error reporting for Firestore
      const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        operationType: 'write',
        path: 'system/config',
        authInfo: {
          userId: auth.currentUser?.uid,
          isAnonymous: auth.currentUser?.isAnonymous,
        }
      };
      console.error('Firestore Error Detail:', JSON.stringify(errInfo));

      if (showToast) showToast("Failed to save to Firebase: " + (error as any).message, "error");
      return { success: false, message: "Failed to save to Firebase" };
    } finally {
      setIsSavingConfig(false);
    }
  }, [
    escalationRules, 
    maxImages, 
    scheduledThreshold, 
    scheduledPastSlotActive, 
    scheduledPastSlotRegions, 
    scheduledRunningSlotActive, 
    scheduledRunningSlotRegions, 
    soundAlertsEnabled,
    oosPushEnabled,
    oosPushRegions,
    whatsappOosEnabled,
    whatsappApiUrl,
    whatsappInstanceName,
    whatsappApiKey,
    whatsappAutoOosMappings,
    whatsappManualStoreMappings,
    whatsappFulfillmentMappings,
    whatsappLastMileMappings,
    whatsappEscalationRules,
    whatsappGlobalGroupJid,
    showToast, 
    user
  ]);

  return { 
    escalationRules, 
    setEscalationRules, 
    maxImages, 
    setMaxImages, 
    scheduledThreshold,
    setScheduledThreshold,
    scheduledPastSlotActive,
    setScheduledPastSlotActive,
    scheduledRunningSlotActive,
    setScheduledRunningSlotActive,
    scheduledPastSlotRegions,
    setScheduledPastSlotRegions,
    scheduledRunningSlotRegions,
    setScheduledRunningSlotRegions,
    soundAlertsEnabled,
    setSoundAlertsEnabled,
    oosPushEnabled,
    setOosPushEnabled,
    oosPushRegions,
    setOosPushRegions,
    whatsappOosEnabled, setWhatsappOosEnabled,
    whatsappOosRegions, setWhatsappOosRegions,
    whatsappApiUrl, setWhatsappApiUrl,
    whatsappInstanceName, setWhatsappInstanceName,
    whatsappApiKey, setWhatsappApiKey,
    whatsappAutoOosMappings,
    setWhatsappAutoOosMappings,
    whatsappManualStoreMappings,
    setWhatsappManualStoreMappings,
    whatsappFulfillmentMappings,
    setWhatsappFulfillmentMappings,
    whatsappLastMileMappings,
    setWhatsappLastMileMappings,
    whatsappEscalationRules,
    setWhatsappEscalationRules,
    whatsappGlobalGroupJid,
    setWhatsappGlobalGroupJid,
    saveSystemConfig,
    isSavingConfig 
  };
}
