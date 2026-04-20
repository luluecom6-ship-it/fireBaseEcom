import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { User } from '../types';

export interface UserStatus extends User {
  isOnline: boolean;
  lastSeen?: string;
  presenceStatus: 'Active' | 'Inactive' | 'Offline';
}

export function useStaffStatus(
  user: User | null, 
  isFirebaseAuthenticated: boolean,
  selectedStoreId: string = 'All'
) {
  const [staffStatus, setStaffStatus] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Track retries for permission-denied errors (Bug D fix)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !isFirebaseAuthenticated) {
      setLoading(false);
      return;
    }

    const role = String(user.role || "").toLowerCase().trim();
    if (role !== 'admin' && role !== 'supervisor') {
      setStaffStatus([]);
      setLoading(false);
      return;
    }

    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    let constraints: any[] = [];
    
    // Security: Restrict regional access for supervisors
    if (role === 'supervisor') {
      const userRegion = String(user.region || "").trim();
      if (userRegion && userRegion.toLowerCase() !== 'all') {
        constraints.push(where('region', '==', userRegion));
      }
    }

    // UI selection filter
    if (selectedStoreId !== 'All') {
      constraints.push(where('storeId', '==', selectedStoreId));
    }

    const qUsers    = query(collection(db, 'users'), ...constraints);
    const qPresence = query(collection(db, 'presence'));

    // Use plain objects as mutable stores — NOT state, so updates don't
    // cause re-renders until updateCombinedStatus() explicitly calls setStaffStatus.
    const usersMap: Record<string, User>   = {};
    const presenceMap: Record<string, any> = {};

    const updateCombinedStatus = () => {
      const combined: UserStatus[] = Object.keys(usersMap).map(uid => {
        const userData = usersMap[uid];

        // Bug D fix: presence docs may be keyed by uid OR by the doc id.
        // We stored { uid } inside the doc, so look up both ways.
        const presenceData = presenceMap[uid];
        const lastSeen = presenceData?.lastSeen;
        
        let lastSeenMs = 0;
        const now = Date.now();
        
        if (lastSeen) {
          if (lastSeen instanceof Timestamp) {
            lastSeenMs = lastSeen.toMillis();
          } else if (typeof lastSeen === 'object' && lastSeen.seconds) {
            // Plain Firestore Timestamp shape that wasn't auto-converted
            lastSeenMs = lastSeen.seconds * 1000;
          } else if (typeof lastSeen === 'string') {
            lastSeenMs = new Date(lastSeen).getTime();
          } else if (typeof lastSeen === 'number') {
            lastSeenMs = lastSeen;
          }
        }

        const diffMins = lastSeenMs ? (now - lastSeenMs) / (1000 * 60) : Infinity;
        
        let presenceStatus: 'Active' | 'Inactive' | 'Offline' = 'Offline';
        if (diffMins < 5) {
          presenceStatus = 'Active';
        } else if (diffMins < 30) {
          presenceStatus = 'Inactive';
        }

        return {
          ...userData,
          empId: String(userData.empId || uid).trim(),
          isOnline:       diffMins < 5,
          lastSeen:       lastSeenMs ? new Date(lastSeenMs).toISOString() : undefined,
          presenceStatus
        };
      });

      // Sort: Active → Inactive → Offline
      combined.sort((a, b) => {
        const order = { Active: 0, Inactive: 1, Offline: 2 };
        return order[a.presenceStatus] - order[b.presenceStatus];
      });

      setStaffStatus(combined);
    };

    let unsubUsers:    (() => void) | null = null;
    let unsubPresence: (() => void) | null = null;

    const startListeners = () => {
      unsubUsers = onSnapshot(qUsers, (snapshot) => {
        snapshot.forEach(docSnap => {
          usersMap[docSnap.id] = docSnap.data() as User;
        });
        updateCombinedStatus();
        setLoading(false);
      }, (err) => {
        console.error('[useStaffStatus] users snapshot error:', err);
        if (err.code === 'permission-denied') {
          // Profile may not have healed in named DB yet — retry in 5 s
          console.warn('[useStaffStatus] permission-denied on users — retrying in 5 s');
          retryTimeoutRef.current = setTimeout(startListeners, 5000);
        }
        setLoading(false);
      });

      unsubPresence = onSnapshot(qPresence, (snapshot) => {
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          // Store by both doc id and the uid field so we hit regardless of keying
          presenceMap[docSnap.id] = data;
          if (data.uid) presenceMap[data.uid] = data;
        });
        updateCombinedStatus();
      }, (err) => {
        console.error('[useStaffStatus] presence snapshot error:', err);
        if (err.code === 'permission-denied') {
          console.warn('[useStaffStatus] permission-denied on presence — retrying in 5 s');
          retryTimeoutRef.current = setTimeout(startListeners, 5000);
        }
      });
    };

    startListeners();

    return () => {
      if (unsubUsers)    unsubUsers();
      if (unsubPresence) unsubPresence();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [user, isFirebaseAuthenticated, selectedStoreId]);

  return { staffStatus, loading };
}
