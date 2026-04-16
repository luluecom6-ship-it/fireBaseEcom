import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

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
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const baseUrl = API_URL.trim();
      let urlObj: URL;
      try {
        urlObj = new URL(baseUrl);
      } catch (e) {
        urlObj = new URL(baseUrl, window.location.origin);
      }
      urlObj.searchParams.set('action', 'login');
      urlObj.searchParams.set('username', username);
      urlObj.searchParams.set('password', password);
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const text = await res.text();
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error("[useAuth] Failed to parse JSON response:", text.substring(0, 100));
        return { success: false, message: "Server returned non-JSON response. Check API configuration." };
      }
      
      const userData = (data.status === "success" || data.empId) ? data : null;
      
      if (userData && (userData.status === "success" || userData.empId)) {
        if (userData.role) userData.role = userData.role.toLowerCase() as any;
        setUser(userData);
        localStorage.setItem("lulu_user", JSON.stringify(userData));
        localStorage.setItem("lulu_login_time", new Date().getTime().toString());
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsFirebaseAuthenticated(!!fbUser);
      if (fbUser) {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as User;
          const originalRole = userData.role;
          if (userData.role) userData.role = userData.role.toLowerCase() as any;
          
          // Proactively sync normalized role back to Firestore if it changed
          if (originalRole !== userData.role) {
            await setDoc(userRef, { role: userData.role }, { merge: true });
          }
          
          setUser(userData);
        }
      } else {
        const savedUser = localStorage.getItem("lulu_user");
        const loginTime = localStorage.getItem("lulu_login_time");

        if (savedUser && loginTime) {
          const now = new Date().getTime();
          const loginTimestamp = parseInt(loginTime);
          const twentyFourHours = 24 * 60 * 60 * 1000;

          if (now - loginTimestamp > twentyFourHours) {
            logout();
          } else {
            setUser(JSON.parse(savedUser));
          }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [logout]);

  return { user, loading, isFirebaseAuthenticated, login, loginWithEmail, loginWithGoogle, logout, setUser };
}
