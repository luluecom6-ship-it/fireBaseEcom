import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      } else {
        // Default role for new Google users
        const isDefaultAdmin = fbUser.email === "luluecom6@gmail.com";
        userData = {
          empId: fbUser.uid,
          name: fbUser.displayName || "Google User",
          role: isDefaultAdmin ? "admin" : "user",
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
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('action', 'login');
      urlObj.searchParams.set('username', username);
      urlObj.searchParams.set('password', password);
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const data = await res.json();
      
      const userData = data.status === "success" ? data : (data.empId ? data : null);
      
      if (userData && (userData.status === "success" || userData.empId)) {
        setUser(userData);
        localStorage.setItem("lulu_user", JSON.stringify(userData));
        localStorage.setItem("lulu_login_time", new Date().getTime().toString());
        return { success: true, user: userData };
      } else {
        return { success: false, message: "Invalid Credentials" };
      }
    } catch (err) {
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
      if (fbUser) {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUser(userSnap.data() as User);
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

  return { user, loading, login, loginWithGoogle, logout, setUser };
}
