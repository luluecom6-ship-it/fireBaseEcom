import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { OOSRecord, User } from '../types';

export const useOOSHistory = (user: User | null, isEnabled: boolean) => {
  const [oosItems, setOosItems] = useState<OOSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!isEnabled || !user) {
      setLoading(false);
      return;
    }

    try {
      const res = await axios.get('/api/oos-history');
      if (res.data?.status === "success") {
        const items = res.data.data as OOSRecord[];
        
        // Memory sort by timestamp desc
        items.sort((a, b) => {
          const tA = new Date(a.timestamp || 0).getTime();
          const tB = new Date(b.timestamp || 0).getTime();
          return tB - tA;
        });

        setOosItems(items);
      }
    } catch (error) {
      console.error("[useOOSHistory] Error fetching over REST:", error);
    } finally {
      setLoading(false);
    }
  }, [user, isEnabled]);

  useEffect(() => {
    if (!isEnabled) return;
    
    // Initial fetch
    setLoading(true);
    fetchHistory();

    // Poll every 30 seconds
    timeoutRef.current = setInterval(() => {
      fetchHistory();
    }, 30000);

    return () => {
      if (timeoutRef.current) clearInterval(timeoutRef.current);
    };
  }, [isEnabled, fetchHistory]);

  return { oosItems, loading, refetch: fetchHistory };
};
