import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, limit, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
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
      if (!db) {
        throw new Error("Firestore not initialized");
      }
      
      const q = query(
        collection(db, 'oos_history'),
        limit(500)
      );
      const snap = await getDocs(q);
      
      const items = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OOSRecord[];
      
      // Memory sort by timestamp desc
      items.sort((a, b) => {
        const tA = new Date(a.timestamp || 0).getTime();
        const tB = new Date(b.timestamp || 0).getTime();
        return tB - tA;
      });

      setOosItems(items);
    } catch (error) {
      console.error("[useOOSHistory] Error fetching from Firestore:", error);
    } finally {
      setLoading(false);
    }
  }, [user, isEnabled]);

  useEffect(() => {
    if (!isEnabled) return;
    
    // Initial fetch
    setLoading(true);
    fetchHistory();

  }, [isEnabled, fetchHistory]);

  return { oosItems, loading, refetch: fetchHistory };
};
