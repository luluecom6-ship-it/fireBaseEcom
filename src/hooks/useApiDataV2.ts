import { useState, useEffect, useCallback } from 'react';
import { Order } from '../typesV2';
import fallbackData from '../data/ordersV2.json';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

// V2 GAS URL added to proxy options
const FALLBACK_V2_GAS_URL = "https://script.google.com/macros/s/AKfycbzIVMXK29x1t1YUrNPjyKt2v231WNcosaQJCW8bN4ZfTBMjUKK6GtIW4dRftri02z_gQw/exec";
const V2_GAS_URL = import.meta.env.VITE_V2_GAS_URL || FALLBACK_V2_GAS_URL;

interface UseApiDataReturn {
  data: Order[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  dataSource: 'api' | 'fallback';
}

export function useApiDataV2(): UseApiDataReturn {
  const [data, setData] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'api' | 'fallback'>('fallback');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use the proxy instead of direct GAS call to avoid CORS issues
      const proxyUrl = `${API_URL}?gasUrl=${encodeURIComponent(V2_GAS_URL)}&action=getMatrixData&_t=${Date.now()}&_skipCache=true`;
      const response = await robustFetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[useApiDataV2] API Response raw:', result);

      // Handle the new JSON format - could be direct array or wrapped in object
      let orders: Order[] = [];

      if (Array.isArray(result)) {
        orders = result;
      } else if (result && typeof result === 'object') {
        // Look for any property that contains an array
        const arrayProps = Object.keys(result).filter(k => Array.isArray(result[k]));
        
        if (arrayProps.length > 0) {
          // Priority keys to check first
          const priorityKeys = ['data', 'orders', 'results', 'rows', 'items', 'matrix'];
          const foundKey = priorityKeys.find(k => Array.isArray(result[k])) || arrayProps[0];
          orders = result[foundKey];
          console.log(`[useApiDataV2] Found array in property: "${foundKey}" (${orders.length} items)`);
        } else if (result.status === 'error') {
           throw new Error(result.message || 'API returned an error status');
        }
      }

      // If we got valid data from API (even empty array), use it
      if (Array.isArray(orders)) {
        console.log(`[useApiDataV2] Successfully sets ${orders.length} orders from API`);
        setData(orders);
        setDataSource('api');
        setLastUpdated(new Date());
        return;
      }

      // Fall back only if we didn't get any recognizable structure
      console.warn('[useApiDataV2] API returned unrecognized format or empty:', result);
      throw new Error(`API format unrecognized (Type: ${typeof result})`);

    } catch (err) {
      console.warn('API fetch failed, using fallback data:', err);

      // Use fallback data from local JSON file
      const fallbackOrders = fallbackData as unknown as Order[];
      setData(fallbackOrders);
      setDataSource('fallback');
      setLastUpdated(new Date());
      setError(null); // Clear error since we have fallback data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds for real-time updates (only if API is working)
    const intervalId = setInterval(() => {
      if (dataSource === 'api') {
        fetchData();
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fetchData, dataSource]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
    dataSource
  };
}
