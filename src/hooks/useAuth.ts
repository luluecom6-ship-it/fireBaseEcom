import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

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

  const logout = useCallback(() => {
    localStorage.removeItem("lulu_user");
    localStorage.removeItem("lulu_login_time");
    setUser(null);
  }, []);

  useEffect(() => {
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
  }, [logout]);

  return { user, loading, login, logout, setUser };
}
