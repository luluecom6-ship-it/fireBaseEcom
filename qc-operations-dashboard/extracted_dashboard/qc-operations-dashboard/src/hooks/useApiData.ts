import { useState, useEffect, useCallback } from 'react';
import { Order } from '../types';
import fallbackData from '../data/orders.json';

// Google Apps Script URL for fetching JSON data
const API_URL = 'https://script.google.com/macros/s/AKfycbzIVMXK29x1t1YUrNPjyKt2v231WNcosaQJCW8bN4ZfTBMjUKK6GtIW4dRftri02z_gQw/exec';

interface UseApiDataReturn {
  data: Order[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  dataSource: 'api' | 'fallback';
}

export function useApiData(): UseApiDataReturn {
  const [data, setData] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'api' | 'fallback'>('fallback');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL, {
        method: 'GET',
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Handle the new JSON format - could be direct array or wrapped in object
      let orders: Order[] = [];

      if (Array.isArray(result)) {
        orders = result;
      } else if (result && typeof result === 'object' && result.data) {
        orders = result.data;
      } else if (result && typeof result === 'object' && Array.isArray(result.orders)) {
        orders = result.orders;
      } else if (result && typeof result === 'object' && Array.isArray(result.results)) {
        orders = result.results;
      } else if (result && typeof result === 'object' && Array.isArray(result.rows)) {
        orders = result.rows;
      }

      // If we got valid data from API, use it
      if (orders.length > 0) {
        setData(orders);
        setDataSource('api');
        setLastUpdated(new Date());
        return;
      }

      // Fall back to local data if API returns empty
      throw new Error('No data from API');

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