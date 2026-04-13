import { useState, useCallback, useEffect } from 'react';
import { EscalationRule } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

import { User } from '../types';

export function useSystemConfig(
  user: User | null,
  showToast?: (msg: string, type?: 'success' | 'error') => void
) {
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [maxImages, setMaxImages] = useState(1);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Use Firestore for real-time config
  useEffect(() => {
    const configDoc = doc(db, 'system', 'config');
    
    // Listen for real-time updates
    const unsubscribe = onSnapshot(configDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (Array.isArray(data.escalationRules)) {
          setEscalationRules(data.escalationRules);
        }
        if (typeof data.maxImages === 'number') {
          setMaxImages(data.maxImages);
        }
      } else {
        // Default rules if nothing in Firestore yet
        const defaultRules = [
          { id: '1', status: 'Created', bucket: '15-20Min', escalationUser: 'Supervisor A', isActive: true },
          { id: '2', status: 'Picking', bucket: '15-20Min', escalationUser: 'Supervisor B', isActive: true }
        ];
        setEscalationRules(defaultRules);
        setMaxImages(1);
      }
    }, (error) => {
      console.error("Firestore config error:", error);
      if (showToast) showToast("Failed to load live config", "error");
    });

    return () => unsubscribe();
  }, [showToast]);

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
        updatedAt: new Date().toISOString()
      });
      
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
  }, [escalationRules, maxImages, showToast, user]);

  return { 
    escalationRules, 
    setEscalationRules, 
    maxImages, 
    setMaxImages, 
    isSavingConfig, 
    saveSystemConfig 
  };
}
