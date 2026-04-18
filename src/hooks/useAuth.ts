import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db, signInWithCustomToken } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import axios from 'axios';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, pass);
      const fbUser = result.user;
      
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data() as User;
        if (userData.role) userData.role = userData.role.toLowerCase() as any;
        setUser(userData);
        localStorage.setItem("lulu_user", JSON.stringify(userData));
        return { success: true, user: userData };
      } else {
        // Handle case where auth exists but no Firestore profile
        const isDefaultAdmin = fbUser.email === "luluecom6@gmail.com" || fbUser.email === "505011@sa.lulumea.com";
        const userData: User = {
          empId: fbUser.uid,
          name: fbUser.displayName || fbUser.email?.split('@')[0] || "Staff",
          role: isDefaultAdmin ? "admin" : "picker", // Default to picker for staff email
          storeId: "ALL",
          email: fbUser.email || "",
          status: "Active"
        };
        await setDoc(userRef, { ...userData, updatedAt: new Date().toISOString() });
        setUser(userData);
        localStorage.setItem("lulu_user", JSON.stringify(userData));
        return { success: true, user: userData };
      }
    } catch (error: any) {
      console.error("Email Login Error:", error);
      return { success: false, message: error.message || "Login Failed" };
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      
      // Check if user exists in Firestore or create profile
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      
      let userData: User;
      
      if (userSnap.exists()) {
        userData = userSnap.data() as User;
        if (userData.role) userData.role = userData.role.toLowerCase() as any;
        // Ensure admin status is synced if email matches default admin
        const isDefaultAdmin = fbUser.email === "luluecom6@gmail.com" || fbUser.email === "505011@sa.lulumea.com";
        if (isDefaultAdmin && userData.role !== 'admin') {
          userData.role = 'admin';
          await setDoc(userRef, { ...userData, updatedAt: new Date().toISOString() });
        }
      } else {
        // Inherit role from legacy session if available, otherwise check default admin email
        const legacyRole = user?.role;
        const isDefaultAdmin = fbUser.email === "luluecom6@gmail.com" || fbUser.email === "505011@sa.lulumea.com";
        
        userData = {
          empId: fbUser.uid,
          name: fbUser.displayName || "Google User",
          role: (legacyRole === 'admin' || isDefaultAdmin) ? "admin" : "user",
          storeId: "ALL",
          email: fbUser.email || "",
          status: "Active"
        };
        
        await setDoc(userRef, {
          ...userData,
          updatedAt: new Date().toISOString()
        });
      }
      
      setUser(userData);
      localStorage.setItem("lulu_user", JSON.stringify(userData));
      return { success: true, user: userData };
    } catch (error) {
      console.error("Google Login Error:", error);
      return { success: false, message: "Google Login Failed" };
    } finally {
      setLoading(false);
    }
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const baseUrl = API_URL.trim();
      let urlObj: URL;
      try {
        urlObj = new URL(baseUrl);
      } catch (e) {
        // Handle relative paths by prepending the current origin
        const origin = window.location.origin;
        urlObj = new URL(baseUrl, origin);
      }
      
      console.log(`[useAuth] Fetching from: ${urlObj.toString()}`);
      
      // Keep only cache buster in URL
      urlObj.searchParams.set('_t', Date.now().toString());
      
      // Move credentials to POST body
      const body = new URLSearchParams({
        action: 'login',
        username: username.trim(),
        password: password.trim(),
      });
      
      const res = await robustFetch(urlObj.toString(), {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      });
      const text = await res.text();
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        if (text.trim().toLowerCase().startsWith('<!doctype html>')) {
          console.error("[useAuth] HTML response received. Possible causes:\n1. Backend proxy route (/api/proxy-gas) is not configured\n2. Vercel deployment missing serverless functions\n3. GAS script is erroring out and returning an error page");
          return { success: false, message: "Backend communication error (HTML received instead of JSON). Check deployment settings." };
        }
        console.error("[useAuth] Failed to parse JSON response:", text.substring(0, 200));
        return { success: false, message: "Malformed response from server. Check API configuration." };
      }
      
      const userData = (data.status === "success" && data.user) ? data.user : (data.empId ? data : null);
      
      if (userData) {
        if (userData.role) userData.role = String(userData.role).trim().toLowerCase() as any;
        // Ensure consistent structure for string numeric empId
        if (userData.empId) userData.empId = String(userData.empId).trim();
        // Ensure storeId is a string
        if (userData.storeId) userData.storeId = String(userData.storeId).trim();
        
        setUser(userData);
        localStorage.setItem("lulu_user", JSON.stringify(userData));
        localStorage.setItem("lulu_login_time", new Date().getTime().toString());

        // CRITICAL: Sync profile to Firestore via Backend and get Custom Token
        try {
          // We pass the full userData so the backend can sync it to Firestore using Admin SDK
          // before we even try to authenticate on the client.
          const tokenRes = await axios.post('/api/auth/token', { 
            empId: userData.empId,
            user: userData 
          });
          
          if (tokenRes.data.token) {
            // Now that backend has synced the data, we authenticate.
            // The onSnapshot listener (triggered by this call) will now read the updated doc.
            await signInWithCustomToken(auth, tokenRes.data.token);
            console.log(`[useAuth] Authenticated standard session with Custom Token: ${userData.empId}`);
          }
        } catch (tokenErr) {
          console.warn("[useAuth] Failed to sync profile or get custom token.", tokenErr);
          
          // Best-effort client-side fallback (might hit permission issues depending on rules)
          try {
            const userRef = doc(db, 'users', userData.empId);
            await setDoc(userRef, { 
              ...userData, 
              updatedAt: new Date().toISOString() 
            }, { merge: true });
          } catch (syncErr) {
            console.warn("[useAuth] Client-side fallback sync failed:", syncErr);
          }
        }

        return { success: true, user: userData };
      } else {
        console.warn("Login failed: Invalid credentials or status", data);
        return { success: false, message: data.message || "Invalid Credentials" };
      }
    } catch (err) {
      console.error("Login catch error:", err);
      return { success: false, message: "Connection Error. Please check your internet." };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem("lulu_user");
    localStorage.removeItem("lulu_login_time");
    setUser(null);
  }, []);

  const toggleSound = useCallback(async (enabled: boolean, targetUserId?: string) => {
    if (!user && !targetUserId) return { success: false, message: "No user found" };
    const uid = targetUserId || user?.empId;
    if (!uid) return { success: false, message: "No UID found" };

    try {
      // 1. Update local state immediately for responsiveness
      if (!targetUserId && user) {
        setUser(prev => prev ? ({ ...prev, soundAlertsEnabled: enabled }) : null);
        const savedUser = JSON.parse(localStorage.getItem("lulu_user") || "{}");
        if (savedUser.empId === uid) {
          localStorage.setItem("lulu_user", JSON.stringify({ ...savedUser, soundAlertsEnabled: enabled }));
        }
      }

      // 2. Try Firestore sync
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { 
        soundAlertsEnabled: enabled, 
        empId: uid, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
      
      return { success: true };
    } catch (error) {
      console.warn("Firestore sync failed:", error);
      if (targetUserId) {
        return { success: false, message: "Remote update failed" };
      }
      return { success: true, warning: "Local update only" };
    }
  }, [user]);

  useEffect(() => {
    let userUnsubscribe: (() => void) | null = null;
    let fallbackUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsFirebaseAuthenticated(!!fbUser);
      
      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = null;
      }

      if (fbUser) {
        // Set up real-time listener for user profile using Firebase UID
        const userRef = doc(db, 'users', fbUser.uid);
        userUnsubscribe = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const userData = snap.data() as User;
            const firestoreRole = userData.role ? userData.role.toLowerCase() : "";
            
            // 🛡️ EXPLICIT GUARD: Prevent generic Firestore profiles from overwriting login "Gold Standard" data.
            // Check if current in-memory user (from login) has a privileged role.
            const currentUser = JSON.parse(localStorage.getItem("lulu_user") || "{}");
            const currentHasRealRole = currentUser.role && currentUser.role !== 'user';
            
            // Define what we consider "generic" or "downgraded" in Firestore
            const fsHasRealRole = firestoreRole && firestoreRole !== 'user' && firestoreRole !== 'picker';
            
            if (currentHasRealRole && !fsHasRealRole && currentUser.empId === userData.empId) {
              console.warn("[useAuth] Snapshot returned generic/downgraded profile — ignoring to preserve login state", {
                current: currentUser.role,
                incoming: firestoreRole
              });
              
              // HEAL: Push the correct data back to Firestore so it stops being generic
              setTimeout(() => {
                setDoc(userRef, { 
                  ...userData,
                  name: currentUser.name, 
                  storeId: currentUser.storeId, 
                  role: currentUser.role,
                  region: currentUser.region || userData.region || "",
                  updatedAt: new Date().toISOString() 
                }, { merge: true })
                .then(() => console.log("[useAuth] Successfully healed user profile in Firestore"))
                .catch(err => console.warn("[useAuth] Self-healing profile sync failed:", err));
              }, 2000);
              
              return; // ⛔ STOP: Do not execute setUser or update localStorage
            }

            if (userData.role) userData.role = firestoreRole as any;
            setUser(userData);
            localStorage.setItem("lulu_user", JSON.stringify(userData));
          } else {
            // New user handling (if not created during login)
            // check against both email and uid (empId) for admin status
            const isDefaultAdmin = fbUser.email === "luluecom6@gmail.com" || 
                                 fbUser.email === "505011@sa.lulumea.com" ||
                                 fbUser.uid === "505011";
            
            // Attempt to restore from localeStorage first to avoid overwriting with defaults
            const savedUserStr = localStorage.getItem("lulu_user");
            let newUser: User;

            if (savedUserStr) {
               const saved = JSON.parse(savedUserStr);
               if (saved.empId === fbUser.uid) {
                 newUser = saved;
               } else {
                 newUser = {
                   empId: fbUser.uid,
                   name: fbUser.displayName || fbUser.email?.split('@')[0] || "Staff",
                   role: isDefaultAdmin ? "admin" : "picker",
                   storeId: "ALL",
                   email: fbUser.email || "",
                   status: "Active"
                 };
               }
            } else {
              newUser = {
                empId: fbUser.uid,
                name: fbUser.displayName || fbUser.email?.split('@')[0] || "Staff",
                role: isDefaultAdmin ? "admin" : "picker",
                storeId: "ALL",
                email: fbUser.email || "",
                status: "Active"
              };
            }
            
            // Force role to admin if it's a default admin
            if (isDefaultAdmin) newUser.role = 'admin';

            setDoc(userRef, { ...newUser, updatedAt: new Date().toISOString() }, { merge: true });
          }
        }, (err) => {
          console.error("User profile sync error:", err);
        });
      } else {
        const savedUserStr = localStorage.getItem("lulu_user");
        const loginTime = localStorage.getItem("lulu_login_time");

        if (savedUserStr && loginTime) {
          const now = new Date().getTime();
          const loginTimestamp = parseInt(loginTime);
          const twentyFourHours = 24 * 60 * 60 * 1000;

          if (now - loginTimestamp > twentyFourHours) {
            logout();
          } else {
            const parsedUser = JSON.parse(savedUserStr) as User;
            setUser(parsedUser);
          }
        }
      }
      setLoading(false);
    });

    return () => {
      authUnsubscribe();
      if (userUnsubscribe) userUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, [logout]);

  return { user, loading, isFirebaseAuthenticated, login, loginWithEmail, loginWithGoogle, logout, toggleSound, setUser };
}
