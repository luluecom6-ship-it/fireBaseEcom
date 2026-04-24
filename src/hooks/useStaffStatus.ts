import { useState, useEffect } from 'react';
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

    const qUsers = query(collection(db, 'users'), ...constraints);
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

      setStaffStatus(combined);
    };

    // Listen to users
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      snapshot.forEach(doc => {
        users[doc.id] = doc.data() as User;
      });
      updateCombinedStatus();
      setLoading(false);
    });

    // Listen to all presence updates (filtered by who we actually care about in updateCombinedStatus)
    // This avoids the 30-limit which was breaking presence for stores with many staff members
    const unsubPresence = onSnapshot(collection(db, 'presence'), (pSnap) => {
      pSnap.docs.forEach(pDoc => {
        const data = pDoc.data();
        const uid = data.uid || pDoc.id;
        if (uid) presence[uid] = data;
      });
      updateCombinedStatus();
    });

    return () => {
      unsubUsers();
      unsubPresence();
    };
  }, [user, isFirebaseAuthenticated, selectedStoreId]);

  return { staffStatus, loading };
}
