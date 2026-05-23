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
import { useOOSHistory } from "./hooks/useOOSHistory";
import { useToast } from "./hooks/useToast";
import { usePWA } from "./hooks/usePWA";

// --- FIREBASE / FCM ---
import { auth, db, requestForToken, onForegroundMessage } from "./firebase";
import { doc, setDoc } from "firebase/firestore";

// --- COMPONENTS ---
import { Loader } from "./components/layout/common/Loader";
import { Header } from "./components/layout/Header";
import { AlertOverlay } from "./components/layout/AlertOverlay";
import { GlobalModals } from "./components/layout/common/GlobalModals";

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
import { RosterDashboard } from "./pages/RosterDashboard";
import { AttendanceIntelligence } from "./pages/AttendanceDashboard2";
import { OOSHistory } from "./pages/OOSHistory";
import MatrixV2 from "./pages/MatrixV2";

export default function App() {
  // Navigation
  const [page, setPage] = useState<"login" | "dashboard" | "upload" | "attendance" | "admin" | "search" | "matrix" | "analytics" | "alerts" | "attendance-history" | "roster" | "attendance-v2" | "matrix-v2" | "oos-history">("login");
  
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
    updateProfileImage,
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
    oosPushEnabled, setOosPushEnabled,
    oosPushRegions, setOosPushRegions,
    saveSystemConfig, isSavingConfig 
  } = useSystemConfig(user, showToast, isFirebaseAuthenticated);

  const { staffStatus } = useStaffStatus(user, isFirebaseAuthenticated);

  const { oosItems, loading: oosLoading, refetch: refetchOOS } = useOOSHistory(user, page === "oos-history");

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
        
        // Also show native OS notification if they are in another window/app but tab is open
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const iconUrl = payload.data?.icon || payload.data?.image || 'https://placehold.co/192x192.png?text=OOS';
            const imageUrl = payload.data?.image || 'https://placehold.co/192x192.png?text=OOS';
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(payload.notification.title || "Matrix Alert", {
                  body: payload.notification.body,
                  icon: iconUrl,
                  image: imageUrl,
                } as any).catch(e => console.error("SW notification failed", e));
              });
            } else {
              new Notification(payload.notification.title || "Matrix Alert", {
                body: payload.notification.body,
                icon: iconUrl,
                image: imageUrl,
              } as any);
            }
          } catch (e) {
            console.error("Foreground native notification failed", e);
          }
        }
      }
    });

    if (!user) return unsubscribe;
    
    const handleFirstInteraction = async () => {
      if ("Notification" in window && Notification.permission === "default") {
        if (!localStorage.getItem('notificationRequested')) {
          localStorage.setItem('notificationRequested', 'true');
          console.log("[App] First interaction detected, requesting notification permission...");
          await requestNotificationPermission();
        }
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

    // Pulse every minute
    const interval = setInterval(updatePresence, 60000);
    
    // Also pulse on focus/visibility change for better responsiveness
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        updatePresence();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleFocus);

    // Initial pulse
    updatePresence();

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user, isFirebaseAuthenticated]);

  // Navigation Helper
  const navigateTo = useCallback((target: typeof page) => {
    const role = String(user?.role || "").toLowerCase().trim();
    if (target === "matrix" && role !== "admin") {
      showToast("Access Denied: Admin Only", "error");
      return;
    }
    if (target === "analytics" && role !== "admin") {
      showToast("Access Denied: Admin Only", "error");
      return;
    }
    if (target === "admin" && role !== "admin" && role !== "supervisor") {
      showToast("Access Denied: Admin or Supervisor Only", "error");
      return;
    }
    if (target === "roster" && role !== "admin" && role !== "supervisor" && role !== "manager") {
      showToast("Access Denied: Admin, Supervisor or Manager only", "error");
      return;
    }
    if (target === "attendance-v2" && role !== "admin" && role !== "supervisor" && role !== "manager") {
      showToast("Access Denied: Admin, Supervisor or Manager only", "error");
      return;
    }
    if (target === "matrix-v2" && role !== "admin" && role !== "supervisor" && role !== "manager" && role !== "picker" && role !== "store") {
      showToast("Access Denied: Restricted access", "error");
      return;
    }
    setPage(target);
    if (target === "admin" || target === "attendance-v2") fetchAdminData();
    if (target === "matrix" || target === "dashboard" || target === "matrix-v2") fetchMatrixData();
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

  const handleToggleSound = async (forceVal?: boolean, targetId?: string) => {
    const currentVal = targetId 
      ? (staffStatus.find(s => s.empId === targetId)?.soundAlertsEnabled !== false) 
      : (user?.soundAlertsEnabled !== false);
      
    const newVal = forceVal !== undefined ? forceVal : !currentVal;
    
    console.log(`[Sound] Toggling sound for ${targetId || 'self'} to ${newVal}`);
    const res = await toggleSound(newVal, targetId);
    
    if (res.success) {
      if (!targetId) {
        showToast(`Sound Alerts ${newVal ? "Active" : "Muted"}`, "info");
      } else {
        showToast(`Remote Buzzer updated for staff`, "success");
      }
      if (res.warning) console.warn(res.warning);
    } else {
      showToast(res.message || "Action failed", "error");
    }
  };

  const handleToggleGlobalSound = async (newVal: boolean) => {
    setSoundAlertsEnabled(newVal);
    try {
      const configRef = doc(db, 'system', 'config');
      await setDoc(configRef, { soundAlertsEnabled: newVal }, { merge: true });
      showToast(`Global Buzzer ${newVal ? "Enabled" : "Disabled"}`, "info");
    } catch (e) {
      console.error("Failed to update global sound", e);
      showToast("Global sync failed", "error");
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
            onUpdateProfileImage={updateProfileImage}
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
        if (user?.role !== 'admin') {
          return <Dashboard 
            user={user} 
            onLogout={logout} 
            attendanceStatus={attendanceStatus} 
            hoursWorked={hoursWorked} 
            isShiftComplete={isShiftComplete} 
            navigateTo={navigateTo as any} 
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
            onUpdateProfileImage={updateProfileImage}
          />;
        }
        return (
          <Matrix 
            matrixData={matrixData}
            adminData={adminData}
            isMatrixLoading={isMatrixLoading}
            onRefetch={fetchMatrixData}
            setMatrixDetail={setMatrixDetail}
            navigateTo={navigateTo as any}
            user={user}
          />
        );
      case "analytics":
        if (user?.role !== 'admin') {
          return <Dashboard 
            user={user} 
            onLogout={logout} 
            attendanceStatus={attendanceStatus} 
            hoursWorked={hoursWorked} 
            isShiftComplete={isShiftComplete} 
            navigateTo={navigateTo as any} 
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
            onUpdateProfileImage={updateProfileImage}
          />;
        }
        return (
          <Analytics 
            matrixData={matrixData}
            adminData={adminData}
            isMatrixLoading={isMatrixLoading}
            onRefetch={fetchMatrixData}
            navigateTo={navigateTo as any}
            user={user}
          />
        );
      case "alerts":
        return (
          <Alerts 
            alertLogs={alertLogs}
            onViewImage={setFullImage}
            navigateTo={navigateTo as any}
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
            setSystemSoundEnabled={handleToggleGlobalSound}
            setSoundAlertsEnabled={handleToggleSound}
            oosPushEnabled={oosPushEnabled}
            setOosPushEnabled={setOosPushEnabled}
            oosPushRegions={oosPushRegions}
            setOosPushRegions={setOosPushRegions}
            staffStatus={staffStatus}
            scheduledThreshold={scheduledThreshold}
            setScheduledThreshold={setScheduledThreshold}
            navigateTo={navigateTo as any}
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
            navigateTo={navigateTo as any}
            onViewImage={setFullImage}
          />
        );
      case "roster":
        return (
          <RosterDashboard
            user={user}
            navigateTo={navigateTo as any}
          />
        );
      case "attendance-v2":
        return (
          <AttendanceIntelligence
            user={user}
            adminData={adminData}
            navigateTo={navigateTo as any}
            onViewImage={setFullImage}
            onRefetch={fetchAdminData}
            isLoading={loading}
          />
        );
      case "oos-history":
        return (
          <OOSHistory 
            oosItems={oosItems}
            loading={oosLoading}
            onRefresh={refetchOOS}
            onViewImage={setFullImage}
            navigateTo={navigateTo as any}
            user={user}
            adminData={adminData}
          />
        );
      case "matrix-v2":
        return (
          <MatrixV2 
            user={user}
            adminData={adminData}
            staffStatus={staffStatus}
            navigateTo={navigateTo as any}
            escalationRules={escalationRules}
            alertLogs={alertLogs}
            logAlertAction={logAlertAction}
            scheduledThreshold={scheduledThreshold}
            scheduledConfig={{
              pastSlot: { isActive: scheduledPastSlotActive, regions: scheduledPastSlotRegions },
              runningSlot: { isActive: scheduledRunningSlotActive, regions: scheduledRunningSlotRegions }
            }}
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
            navigateTo={navigateTo as any} 
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
            onUpdateProfileImage={updateProfileImage}
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
            case 'roster':            return 'Roster & Availability';
            case 'attendance-v2': return 'Workforce Intelligence';
            case 'matrix-v2': return 'Matrix Intelligence V2';
            case 'oos-history': return 'OOS History';
            default: return page.charAt(0).toUpperCase() + page.slice(1).replace("-", " ");
          }
        })()} 
        showBack={page !== "dashboard" && page !== "login"} 
        onBack={() => navigateTo("dashboard")} 
        user={user}
        isInstallable={isInstallable}
        onInstall={showInstallPrompt}
        onToggleSound={() => handleToggleSound()}
        onUpdateProfileImage={updateProfileImage}
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
        navigateTo={navigateTo as any}
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
