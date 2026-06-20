import { useState, useEffect, useCallback, useRef } from 'react';
import { MatrixData, MatrixItem } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';
import { getBucketFromAgeing } from '../utils/formatters';

export function useMatrixData(autoRefresh = true, intervalMs = 120000) {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

              return {
                status,
                storeID,
                orderID,
                slot,
                bucket,
                timestamp
              };
            });
          };

          setMatrixData({
            quick: processItems(matrix.quick || []),
            schedule: processItems(matrix.schedule || []),
            syncTime: matrix.syncTime || data.timestamp || matrix.timestamp || null,
            timestamp: new Date().toISOString()
          });
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
