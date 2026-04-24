import { useState, useEffect, useCallback } from 'react';
import { StaffDashboardData, User } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useStaffDashboard(user: User | null, isEnabled: boolean) {
  const [data, setData]               = useState<StaffDashboardData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!user || !isEnabled) return;
    const role = String(user.role || '').toLowerCase();
    const isPrivileged = ['admin', 'supervisor', 'manager', 'store'].includes(role);
    if (!isPrivileged) return;

    setLoading(true);
    setError(null);

    try {
      let urlObj: URL;
      try {
        urlObj = new URL(API_URL.trim());
      } catch {
        urlObj = new URL(API_URL.trim(), window.location.origin);
      }
      urlObj.searchParams.set('action', 'getStaffDashboard');
      urlObj.searchParams.set('role', user.role || '');
      if (user.region) urlObj.searchParams.set('region', user.region);
      urlObj.searchParams.set('_t', Date.now().toString());

      const res  = await robustFetch(urlObj.toString());
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const text = await res.text();
      const trimmed = text.trim();
      
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        if (trimmed.toLowerCase().includes('<!doctype') || trimmed.toLowerCase().includes('<html')) {
          throw new Error('Server returned HTML instead of JSON. Check GAS script deployment.');
        }
        throw new Error('Invalid response format from server');
      }
      
      const json = JSON.parse(trimmed);

      if (json.status === 'success') {
        setData(json.data);
        setLastFetched(new Date());
      } else {
        setError(json.message || 'Failed to load dashboard');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [user, isEnabled]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  return { data, loading, error, lastFetched, refetch: fetchDashboard };
}
