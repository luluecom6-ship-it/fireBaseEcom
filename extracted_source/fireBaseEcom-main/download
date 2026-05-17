/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";

// --- TYPES ---
import { User, OrderRecord, MatrixItem } from "./types";

// --- CONSTANTS ---
import { API_URL } from "./constants";

// --- HOOKS ---
import { useAuth } from "./hooks/useAuth";
import { useMatrixData } from "./hooks/useMatrixData";
import { useOrders } from "./hooks/useOrders";
import { useAdmin } from "./hooks/useAdmin";
import { useAlerts } from "./hooks/useAlerts";
import { useSystemConfig } from "./hooks/useSystemConfig";
import { useAttendance } from "./hooks/useAttendance";
import { useStaffStatus } from "./hooks/useStaffStatus";
import { useToast } from "./hooks/useToast";
import { usePWA } from "./hooks/usePWA";

// --- FIREBASE / FCM ---
import { auth, requestForToken, onForegroundMessage } from "./firebase";

// --- COMPONENTS ---
import { Loader } from "./components/common/Loader";
import { Header } from "./components/layout/Header";
import { AlertOverlay } from "./components/layout/AlertOverlay";
import { GlobalModals } from "./components/common/GlobalModals";

// --- PAGES ---
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Upload } from "./pages/Upload";
import { Attendance } from "./pages/Attendance";
import { Admin } from "./pages/Admin";
import { Search } from "./pages/Search";
import { Matrix } from "./pages/Matrix";
import { Analytics } from "./pages/Analytics";
import { Alerts } from "./pages/Alerts";
import { AttendanceHistory } from "./pages/AttendanceHistory";

export default function App() {
  // Navigation
  const [page, setPage] = useState<"login" | "dashboard" | "upload" | "attendance" | "admin" | "search" | "matrix" | "analytics" | "alerts" | "attendance-history">("login");
  
  // Auth Hook
  const { 
    user, 
    loading: authLoading, 
    isFirebaseAuthenticated,
    login, 
    loginWithEmail, 
    loginWithGoogle, 
    logout, 
    toggleSound,
    setUser 
  } = useAuth();
  
  // Toast Hook
  const { toast, showToast } = useToast();

  const handleEmailLogin = async (email: string, pass: string) => {
    const res = await loginWithEmail(email, pass);
    if (res.success) {
      showToast("Firebase Login Successful", "success");
    } else {
      showToast(res.message || "Login Failed", "error");
    }
  };

  // Global States (shared across pages or needed for modals)
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [duplicateOrder, setDuplicateOrder] = useState<OrderRecord | null>(null);
  const [successOrder, setSuccessOrder] = useState<OrderRecord | null>(null);
  const [matrixDetail, setMatrixDetail] = useState<{ title: string, stat: string, key: string, orders: MatrixItem[] } | null>(null);
  const [showEarlyPunchOutConfirm, setShowEarlyPunchOutConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Hooks
  const { matrixData, isLoading: isMatrixLoading, refetch: fetchMatrixData } = useMatrixData(
    ["matrix", "alerts", "dashboard"].includes(page)
  );

  const { 
    orderId, setOrderId, imagePreviews, setImagePreviews, 
    isSearching, searchResults, setSearchResults,
    handleSearch, handleSubmitOrder, handleDeepDive 
  } = useOrders(user, showToast, setDuplicateOrder, setSuccessOrder, setFullImage);

  const { 
    adminData, fetchAdminData, fetchRegions, handleResetAttendance 
  } = useAdmin(user, showToast, setLoading);

  const { 
    activeAlerts, alertLogs, handleAlertAction, logAlertAction,
    minimizedAlerts, setMinimizedAlerts, expandedAlertId, setExpandedAlertId,
    adminHiddenAlerts, requestNotificationPermission, testAlert, testBuzzer,
    lastBroadcast, setLastBroadcast
  } = useAlerts(user, showToast, isFirebaseAuthenticated);

  const { 
    escalationRules, setEscalationRules, maxImages, setMaxImages, 
    scheduledThreshold, setScheduledThreshold,
    scheduledPastSlotActive, setScheduledPastSlotActive,
    scheduledRunningSlotActive, setScheduledRunningSlotActive,
    scheduledPastSlotRegions, setScheduledPastSlotRegions,
    scheduledRunningSlotRegions, setScheduledRunningSlotRegions,
    soundAlertsEnabled, setSoundAlertsEnabled,
    saveSystemConfig, isSavingConfig 
  } = useSystemConfig(user, showToast, isFirebaseAuthenticated);

  const { staffStatus } = useStaffStatus(user, isFirebaseAuthenticated);

  const { 
    attendanceStatus, hoursWorked, isShiftComplete, 
    handleAttendanceSubmit, fetchStatus 
  } = useAttendance(user, showToast, setLoading);
  
  // PWA Hook
  const { isInstallable, showInstallPrompt } = usePWA();

  const lastRefreshRef = useRef(0);

  // Auto-request notification permission on first interaction
  useEffect(() => {
    // Listen for foreground messages
    const unsubscribe = onForegroundMessage((payload: any) => {
      if (payload.notification) {
        showToast(`${payload.notification.title}: ${payload.notification.body}`, "info");
      }
    });

    if (!user) return unsubscribe;
    
    const handleFirstInteraction = async () => {
      if ("Notification" in window && Notification.permission === "default") {
        console.log("[App] First interaction detected, requesting notification permission...");
        await requestNotificationPermission();
      }
      // Remove listener after first attempt
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [user, requestNotificationPermission]);

  // Initial Data Fetch
  useEffect(() => {
    if (user) {
      if (page === "login") setPage("dashboard");
      // Load essential metadata immediately for filters
      fetchRegions();
      // fetchStatus, fetchMatrixData, and fetchAdminData are handled internally by hooks on initial load
    } else {
      setPage("login");
    }
  }, [user, fetchRegions]);

  // Background Refresh Handler: Trigger refresh when app returns to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !user) return;
      
      const now = Date.now();
      if (now - lastRefreshRef.current < 60000) {
        console.log("[App] Visibility change detected, but throttled (60s).");
        return;
      }
      lastRefreshRef.current = now;

      // Random delay between 0 and 3 seconds to spread the load
      const jitter = Math.floor(Math.random() * 3000);
      
      setTimeout(() => {
        console.log("[App] App returned to foreground, triggering refresh (with jitter)...");
        fetchMatrixData();
        const role = String(user.role || "").toLowerCase().trim();
        if (page === "admin" || role === "admin" || role === "supervisor") {
          fetchAdminData();
        }
        fetchStatus(user.empId);
        if ((window as any).refreshAlertHistory) {
          (window as any).refreshAlertHistory();
        }
      }, jitter);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, fetchMatrixData, fetchAdminData, fetchStatus, page]);

  useEffect(() => {
    if (!user || !isFirebaseAuthenticated) return;
    
    // Initial heartbeat
    const updatePresence = async () => {
      try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const presenceRef = doc(db, 'presence', uid);
        await setDoc(presenceRef, { 
          uid,
          lastSeen: serverTimestamp(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.error("Presence update failed", e);
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 60000); // Pulse every minute
    return () => clearInterval(interval);
  }, [user, isFirebaseAuthenticated]);

  // Navigation Helper
  const navigateTo = useCallback((target: typeof page) => {
    const role = String(user?.role || "").toLowerCase().trim();
    if (target === "admin" && role !== "admin" && role !== "supervisor") {
      showToast("Access Denied: Admin or Supervisor Only", "error");
      return;
    }
    setPage(target);
    if (target === "admin") fetchAdminData();
    if (target === "matrix" || target === "dashboard") fetchMatrixData();
    window.scrollTo(0, 0);
  }, [user, showToast, fetchAdminData, fetchMatrixData]);

  // Sync user state from useAuth to other hooks if needed
  // (Most hooks take user as a parameter and handle internal effects)

  const handleLogin = useCallback(async (username: string, password: string) => {
    const result = await login(username, password);
    if (!result.success) {
      showToast(result.message || "Login failed", "error");
    }
  }, [login, showToast]);

  const handleToggleSound = async (targetId?: string, forceVal?: boolean) => {
    const currentVal = targetId ? (staffStatus.find(s => s.empId === targetId)?.soundAlertsEnabled !== false) : (user?.soundAlertsEnabled !== false);
    const newVal = forceVal !== undefined ? forceVal : !currentVal;
    
    const res = await toggleSound(newVal, targetId);
    if (res.success) {
      if (!targetId) {
        showToast(`Sound Alerts ${newVal ? "Active" : "Muted"}`, "info");
      }
      if (res.warning) console.warn(res.warning);
    } else {
      showToast(res.message || "Action blocked - Please Login with Google", "error");
    }
  };

  const renderPage = () => {
    if (!user || page === "login") {
      return (
        <Login 
          onLogin={handleLogin} 
          onEmailLogin={handleEmailLogin}
          onGoogleLogin={loginWithGoogle} 
          loading={authLoading} 
        />
      );
    }

    switch (page) {
      case "dashboard":
        return (
          <Dashboard 
            user={user}
            onLogout={logout}
            attendanceStatus={attendanceStatus}
            hoursWorked={hoursWorked}
            isShiftComplete={isShiftComplete}
            navigateTo={navigateTo}
            fetchAdminData={fetchAdminData}
            fetchMatrixData={fetchMatrixData}
            isMatrixLoading={isMatrixLoading}
            matrixData={matrixData}
            setShowEarlyPunchOutConfirm={setShowEarlyPunchOutConfirm}
            requestNotificationPermission={requestNotificationPermission}
            testAlert={testAlert}
            testBuzzer={testBuzzer}
            isInstallable={isInstallable}
            showInstallPrompt={showInstallPrompt}
            soundAlertsEnabled={user?.soundAlertsEnabled !== false}
            onToggleSound={() => handleToggleSound()}
          />
        );
      case "upload":
        return (
          <Upload 
            user={user}
            orderId={orderId}
            setOrderId={setOrderId}
            imagePreviews={imagePreviews}
            setImagePreviews={setImagePreviews}
            maxImages={maxImages}
            onSubmit={handleSubmitOrder}
            loading={loading}
            navigateTo={navigateTo}
          />
        );
      case "attendance":
        return (
          <Attendance 
            user={user}
            attendanceStatus={attendanceStatus}
            onAttendanceSubmit={handleAttendanceSubmit}
            loading={loading}
            navigateTo={navigateTo}
          />
        );
      case "search":
        return (
          <Search 
            searchResults={searchResults}
            isSearching={isSearching}
            onSearch={handleSearch}
            onViewImage={setFullImage}
            navigateTo={navigateTo}
            user={user}
          />
        );
      case "matrix":
        return (
          <Matrix 
            matrixData={matrixData}
            adminData={adminData}
            isMatrixLoading={isMatrixLoading}
            onRefetch={fetchMatrixData}
            setMatrixDetail={setMatrixDetail}
            navigateTo={navigateTo}
            user={user}
          />
        );
      case "analytics":
        return (
          <Analytics 
            matrixData={matrixData}
            adminData={adminData}
            isMatrixLoading={isMatrixLoading}
            onRefetch={fetchMatrixData}
            navigateTo={navigateTo}
            user={user}
          />
        );
      case "alerts":
        return (
          <Alerts 
            alertLogs={alertLogs}
            onViewImage={setFullImage}
            navigateTo={navigateTo}
            user={user}
          />
        );
      case "admin":
        return (
          <Admin 
            user={user}
            adminData={adminData}
            onRefetch={fetchAdminData}
            onResetAttendance={handleResetAttendance}
            escalationRules={escalationRules}
            setEscalationRules={setEscalationRules}
            maxImages={maxImages}
            setMaxImages={setMaxImages}
            scheduledPastSlotActive={scheduledPastSlotActive}
            setScheduledPastSlotActive={setScheduledPastSlotActive}
            scheduledRunningSlotActive={scheduledRunningSlotActive}
            setScheduledRunningSlotActive={setScheduledRunningSlotActive}
            scheduledPastSlotRegions={scheduledPastSlotRegions}
            setScheduledPastSlotRegions={setScheduledPastSlotRegions}
            scheduledRunningSlotRegions={scheduledRunningSlotRegions}
            setScheduledRunningSlotRegions={setScheduledRunningSlotRegions}
            onSaveConfig={saveSystemConfig}
            isSavingConfig={isSavingConfig}
            systemSoundEnabled={soundAlertsEnabled}
            setSystemSoundEnabled={setSoundAlertsEnabled}
            setSoundAlertsEnabled={handleToggleSound}
            staffStatus={staffStatus}
            scheduledThreshold={scheduledThreshold}
            setScheduledThreshold={setScheduledThreshold}
            navigateTo={navigateTo}
            onViewImage={setFullImage}
            onGoogleLogin={loginWithGoogle}
            onEmailLogin={handleEmailLogin}
            isFirebaseAuthenticated={isFirebaseAuthenticated}
            showToast={showToast}
            isAdminLoading={loading}
          />
        );
      case "attendance-history":
        return (
          <AttendanceHistory 
            user={user}
            navigateTo={navigateTo}
            onViewImage={setFullImage}
          />
        );
      default:
        return (
          <Dashboard 
            user={user} 
            onLogout={logout} 
            attendanceStatus={attendanceStatus} 
            hoursWorked={hoursWorked} 
            isShiftComplete={isShiftComplete} 
            navigateTo={navigateTo} 
            fetchAdminData={fetchAdminData} 
            fetchMatrixData={fetchMatrixData} 
            isMatrixLoading={isMatrixLoading} 
            matrixData={matrixData}
            setShowEarlyPunchOutConfirm={setShowEarlyPunchOutConfirm} 
            requestNotificationPermission={requestNotificationPermission}
            testAlert={testAlert}
            testBuzzer={testBuzzer}
            isInstallable={isInstallable}
            showInstallPrompt={showInstallPrompt}
            soundAlertsEnabled={user?.soundAlertsEnabled !== false}
            onToggleSound={() => handleToggleSound()}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100">
      <Loader loading={loading || authLoading} />
      
      <Header 
        title={(() => {
          switch(page) {
            case 'dashboard': return 'Matrix Intelligence';
            case 'upload': return 'Order Evidence';
            case 'search': return 'Search Orders';
            case 'matrix': return 'Live Matrix';
            case 'analytics': return 'System Analytics';
            case 'alerts': return 'Alert History';
            case 'admin': return 'Admin Control';
            case 'attendance': return 'Shift Attendance';
            case 'attendance-history': return 'Attendance History';
            default: return page.charAt(0).toUpperCase() + page.slice(1).replace("-", " ");
          }
        })()} 
        showBack={page !== "dashboard" && page !== "login"} 
        onBack={() => navigateTo("dashboard")} 
        user={user}
        isInstallable={isInstallable}
        onInstall={showInstallPrompt}
        onToggleSound={() => handleToggleSound()}
      />
      
      <AlertOverlay 
        user={user}
        activeAlerts={activeAlerts}
        minimizedAlerts={minimizedAlerts}
        expandedAlertId={expandedAlertId}
        setExpandedAlertId={setExpandedAlertId}
        adminHiddenAlerts={adminHiddenAlerts}
        handleAlertAction={handleAlertAction}
        setMinimizedAlerts={setMinimizedAlerts}
        lastBroadcast={lastBroadcast}
        setLastBroadcast={setLastBroadcast}
        soundAlertsEnabled={(user?.soundAlertsEnabled !== false) && soundAlertsEnabled}
      />

      <AnimatePresence mode="wait">
        {renderPage()}
      </AnimatePresence>

      <GlobalModals 
        fullImage={fullImage}
        setFullImage={setFullImage}
        imageScale={imageScale}
        setImageScale={setImageScale}
        duplicateOrder={duplicateOrder}
        setDuplicateOrder={setDuplicateOrder}
        imagePreviews={imagePreviews}
        handleDeepDive={(order) => {
          handleDeepDive(order);
          navigateTo("search");
        }}
        successOrder={successOrder}
        setSuccessOrder={setSuccessOrder}
        navigateTo={navigateTo}
        matrixDetail={matrixDetail}
        setMatrixDetail={setMatrixDetail}
        showToast={showToast}
        showEarlyPunchOutConfirm={showEarlyPunchOutConfirm}
        setShowEarlyPunchOutConfirm={setShowEarlyPunchOutConfirm}
        toast={toast}
      />
    </div>
  );
}
