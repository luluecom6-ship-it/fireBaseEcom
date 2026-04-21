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
    const qPresence = query(collection(db, 'presence'));

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
          if (lastSeen instanceof Timestamp) {
            lastSeenMs = lastSeen.toMillis();
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
          isOnline: diffMins < 5,
          lastSeen: lastSeenMs ? new Date(lastSeenMs).toISOString() : undefined,
          presenceStatus
        };
      });

      // Sort by status: Active > Inactive > Offline
      combined.sort((a, b) => {
        const statusOrder = { 'Active': 0, 'Inactive': 1, 'Offline': 2 };
        return statusOrder[a.presenceStatus] - statusOrder[b.presenceStatus];
      });

      setStaffStatus(combined);
    };

    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      snapshot.forEach(doc => {
        users[doc.id] = doc.data() as User;
      });
      updateCombinedStatus();
      setLoading(false);
    });

    const unsubPresence = onSnapshot(qPresence, (snapshot) => {
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.uid) presence[data.uid] = data;
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
