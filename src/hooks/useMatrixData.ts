import { useState, useEffect, useCallback } from 'react';
import { MatrixData } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

export function useMatrixData(autoRefresh = true, intervalMs = 30000) {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isManual = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const urlObj = new URL(API_URL.trim());
      urlObj.searchParams.set('action', 'getMatrixData');
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const text = await res.text();

      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const data = JSON.parse(text);
        const matrix = data.status === "success" ? data.data : data;
        
        if (matrix && (matrix.quick || matrix.schedule)) {
          setMatrixData({
            quick: matrix.quick || [],
            schedule: matrix.schedule || [],
            syncTime: matrix.syncTime || data.timestamp || matrix.timestamp || null,
            timestamp: new Date().toISOString()
          });
        } else {
          throw new Error("Invalid matrix data format");
        }
      } else {
        throw new Error("Server returned non-JSON response");
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
    fetchData();
    if (autoRefresh) {
      const timer = setInterval(() => fetchData(false), intervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchData, autoRefresh, intervalMs]);

  return { matrixData, isLoading, error, refetch: () => fetchData(true) };
}
