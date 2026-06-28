import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { User } from '../types';

export interface UserStatus extends User {
  isOnline: boolean;
  lastSeen?: string;
  presenceStatus: 'Active' | 'Inactive' | 'Offline';
}

export function useStaffStatus(
  user: User | null, 
  isFirebaseAuthenticated: boolean,
  selectedStoreId: string = 'All',
  isActive: boolean = false
) {
  const [allStaffStatus, setAllStaffStatus] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isFirebaseAuthenticated || !isActive) {
      setLoading(false);
      return;
    }

    const role = String(user.role || "").toLowerCase().trim();
    if (role !== 'admin') {
      setAllStaffStatus([]);
      setLoading(false);
      return;
    }

    // Filter users by operational roles only — excludes system/test accounts
    const qUsers = query(
      collection(db, 'users'),
      where('role', 'in', ['picker', 'driver', 'supervisor', 'manager', 'store'])
    );
    const users: Record<string, User> = {};
    const presence: Record<string, any> = {};

    const updateCombinedStatus = () => {
      const combined: UserStatus[] = Object.keys(users).map(uid => {
        const userData = users[uid];
        const presenceData = presence[uid];
        const lastSeen = presenceData?.lastSeen;
        
        let lastSeenMs = 0;
        const now = Date.now();
        
        if (lastSeen) {
          if (lastSeen && typeof lastSeen === 'object' && 'toMillis' in lastSeen) {
            lastSeenMs = lastSeen.toMillis();
          } else if (lastSeen && typeof lastSeen === 'object' && 'seconds' in lastSeen) {
            // Fallback for plain objects that look like Timestamps
            lastSeenMs = lastSeen.seconds * 1000;
          } else if (typeof lastSeen === 'string') {
            lastSeenMs = new Date(lastSeen).getTime();
          } else if (typeof lastSeen === 'number') {
            lastSeenMs = lastSeen;
          }
        }

        // Self-correction: if this is the CURRENT user and we have no lastSeen or it's old, 
        // but they are obviously online because they are running this code, mark as Active.
        const isSelf = user && (userData.empId === user.empId || uid === user.empId);
        let effectiveLastSeenMs = lastSeenMs;
        if (isSelf && (!lastSeenMs || (now - lastSeenMs) > 60000)) {
           effectiveLastSeenMs = now;
        }

        const diffMins = effectiveLastSeenMs ? (now - effectiveLastSeenMs) / (1000 * 60) : Infinity;
        
        let presenceStatus: 'Active' | 'Inactive' | 'Offline' = 'Offline';
        if (effectiveLastSeenMs && diffMins < 5) {
          presenceStatus = 'Active';
        } else if (effectiveLastSeenMs && diffMins < 30) {
          presenceStatus = 'Inactive';
        }

        return {
          ...userData,
          empId: String(userData.empId || uid).trim(),
          isOnline: effectiveLastSeenMs !== 0 && diffMins < 5,
          lastSeen: effectiveLastSeenMs ? new Date(effectiveLastSeenMs).toISOString() : undefined,
          presenceStatus
        };
      });

      combined.sort((a, b) => {
        const statusOrder = { 'Active': 0, 'Inactive': 1, 'Offline': 2 };
        return statusOrder[a.presenceStatus] - statusOrder[b.presenceStatus];
      });

      setAllStaffStatus(combined);
    };

    // Listen to users
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      snapshot.forEach(doc => {
        users[doc.id] = doc.data() as User;
      });
      updateCombinedStatus();
      setLoading(false);
    });

    // Poll presence every 30s instead of real-time onSnapshot.
    // Presence heartbeats fire every 5 min per user — a real-time listener on the
    // entire collection generates massive read costs across all admin Dashboard sessions.
    // A 30s poll is more than adequate for presence status display.
    const fetchPresence = async () => {
      try {
        const snap = await getDocs(collection(db, 'presence'));
        snap.forEach(pDoc => {
          const data = pDoc.data();
          const uid = data.uid || pDoc.id;
          if (uid) presence[uid] = data;
        });
        updateCombinedStatus();
      } catch (err) {
        console.error('[StaffStatus] Presence fetch error:', err);
      }
    };
    fetchPresence(); // initial fetch
    const presenceInterval = setInterval(fetchPresence, 30000); // poll every 30s

    return () => {
      unsubUsers();
      clearInterval(presenceInterval);
    };
  }, [user, isFirebaseAuthenticated, isActive]); // Added isActive to dependency array to fix massive quota leak

  // Perform UI filtering synchronously in memory to save Firebase reads
  const staffStatus = useMemo(() => {
    if (selectedStoreId === 'All') return allStaffStatus;
    return allStaffStatus.filter(s => String(s.storeId).trim().toLowerCase() === String(selectedStoreId).trim().toLowerCase());
  }, [allStaffStatus, selectedStoreId]);

  return { staffStatus, loading };
}
