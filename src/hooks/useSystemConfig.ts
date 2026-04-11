import { useState, useCallback, useEffect } from 'react';
import { EscalationRule } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

export function useSystemConfig(showToast?: (msg: string, type?: 'success' | 'error') => void) {
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [maxImages, setMaxImages] = useState(1);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const fetchSystemConfig = useCallback(async () => {
    try {
      const baseUrl = API_URL.trim();
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('action', 'getSystemConfig');
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const response = await res.json();
      if (response.status === "success" && response.data) {
        if (Array.isArray(response.data.escalationRules)) {
          setEscalationRules(response.data.escalationRules);
        }
        if (typeof response.data.maxImages === 'number') {
          setMaxImages(response.data.maxImages);
        }
      } else {
        const savedRules = localStorage.getItem('escalationRules');
        if (savedRules) setEscalationRules(JSON.parse(savedRules));
        else {
          setEscalationRules([
            { id: '1', status: 'Created', bucket: '15-20Min', escalationUser: 'Supervisor A', isActive: true },
            { id: '2', status: 'Picking', bucket: '15-20Min', escalationUser: 'Supervisor B', isActive: true }
          ]);
        }
        const savedMax = localStorage.getItem('maxImages');
        if (savedMax) setMaxImages(parseInt(savedMax));
      }
    } catch (e) {
      const savedRules = localStorage.getItem('escalationRules');
      if (savedRules) setEscalationRules(JSON.parse(savedRules));
      const savedMax = localStorage.getItem('maxImages');
      if (savedMax) setMaxImages(parseInt(savedMax));
    }
  }, []);

  const saveSystemConfig = useCallback(async () => {
    setIsSavingConfig(true);
    try {
      const config = {
        escalationRules,
        maxImages
      };
      
      localStorage.setItem('escalationRules', JSON.stringify(escalationRules));
      localStorage.setItem('maxImages', maxImages.toString());
      
      const params = new URLSearchParams();
      params.append('action', 'saveSystemConfig');
      params.append('data', JSON.stringify(config));
      
      await robustFetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: params
      });
      
      if (showToast) showToast("System Configuration Saved", "success");
      return { success: true };
    } catch (e) {
      console.error("Failed to save config", e);
      if (showToast) showToast("Saved locally (Server sync failed)", "error");
      return { success: false, message: "Saved locally (Server sync failed)" };
    } finally {
      setIsSavingConfig(false);
    }
  }, [escalationRules, maxImages]);

  useEffect(() => {
    fetchSystemConfig();
  }, [fetchSystemConfig]);

  return { escalationRules, setEscalationRules, maxImages, setMaxImages, isSavingConfig, fetchSystemConfig, saveSystemConfig };
}
