import { useState, useEffect, useCallback, useRef } from 'react';
import { MatrixData, MatrixItem } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';
import { getBucketFromAgeing } from '../utils/formatters';

// Cooldown between monitor pings (ms). Every matrix refresh triggers a
// monitor tick so alert detection runs in real time instead of waiting
// for the Vercel cron (which only fires every 5 min on Pro, or daily on Hobby).
const MONITOR_PING_COOLDOWN = 90_000; // 90 seconds

async function pingMonitor() {
  try {
    // Fire-and-forget: don't await the full response, just kick it off.
    // Use keepalive so the request survives a page navigation.
    const monitorSecret = (import.meta as any).env?.VITE_MONITOR_SECRET_KEY || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (monitorSecret) headers['x-monitor-key'] = monitorSecret;
    fetch('/api/monitor', { method: 'POST', headers, keepalive: true }).catch(() => {});
    console.log('[useMatrixData] Monitor tick pinged');
  } catch {
    // Silently ignore — alert detection will still run on the next cycle
  }
}

export function useMatrixData(autoRefresh = true, intervalMs = 120000) {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastMonitorPingRef = useRef(0);

  const fetchData = useCallback(async (isManual = false) => {
    if (!API_URL) {
      setError("API_URL is not configured.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const baseUrl = API_URL.trim();
      const searchParams = new URLSearchParams();
      searchParams.set('action', 'getMatrixData');
      if (isManual) {
        searchParams.set('cache', 'skip');
      }
      
      const queryStr = searchParams.toString();
      const finalUrl = baseUrl.includes('?') 
        ? `${baseUrl}&${queryStr}` 
        : `${baseUrl}?${queryStr}`;
      
      const res = await robustFetch(finalUrl);
      const text = await res.text();
      const trimmed = text.trim();

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const data = JSON.parse(text);
        const matrix = data.status === "success" ? data.data : data;
        
        if (matrix) {
          const processItems = (items: any[]): MatrixItem[] => {
            if (!Array.isArray(items)) return [];
            return items.map(item => {
              const status = item.status || item.Status || "";
              const storeID = item.storeID || item.storeId || item.StoreID || "";
              const orderID = item.orderID || item.orderId || item.OrderID || "";
              const slot = item.slot || item.Slot || "";
              const timestamp = item.timestamp || item.Timestamp || "";
              
              // Ensure bucket is present
              let bucket = item.bucket || item.Bucket || "";
              if (!bucket && timestamp) {
                bucket = getBucketFromAgeing(timestamp);
              }

              return { status, storeID, orderID, slot, bucket, timestamp };
            });
          };

          setMatrixData({
            quick: processItems(matrix.quick || []),
            schedule: processItems(matrix.schedule || []),
            syncTime: matrix.syncTime || data.timestamp || matrix.timestamp || null,
            timestamp: new Date().toISOString()
          });

          // ── Bug C fix: Trigger monitor tick after every successful matrix fetch ──
          // This ensures alert detection + broadcast processing runs in real time
          // regardless of the Vercel cron schedule (which is daily on Hobby plan).
          // A 90-second cooldown prevents hammering the endpoint when multiple
          // tabs are open or when the user manually refreshes.
          const now = Date.now();
          if (now - lastMonitorPingRef.current > MONITOR_PING_COOLDOWN) {
            lastMonitorPingRef.current = now;
            pingMonitor();
          }
        } else {
          throw new Error("Invalid matrix data format");
        }
      } else {
        const isHtml = trimmed.toLowerCase().includes('<!doctype') || trimmed.toLowerCase().includes('<html');
        if (isHtml) {
          console.warn("[useMatrixData] Server is still booting, received HTML. Retrying soon...");
        } else {
          console.error("[useMatrixData] Non-JSON response:", text.substring(0, 200));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[useMatrixData] Fetch failed:", msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    // Add a randomized jitter between 0 and 15 seconds to the refresh interval
    // to prevent simultaneous requests from multiple browser tabs (Stampeding Herd)
    const jitter = Math.floor(Math.random() * 15000);
    const timer = setInterval(() => fetchData(false), intervalMs + jitter);
    
    return () => clearInterval(timer);
  }, [fetchData, autoRefresh, intervalMs]);

  return { matrixData, isLoading, error, refetch: () => fetchData(true) };
}
