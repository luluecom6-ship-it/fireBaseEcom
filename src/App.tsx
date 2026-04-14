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
import { useAlertTrigger } from "./hooks/useAlertTrigger";
import { useSystemConfig } from "./hooks/useSystemConfig";
import { useAttendance } from "./hooks/useAttendance";
import { useToast } from "./hooks/useToast";

// --- FIREBASE / FCM ---
import { auth, requestForToken, onMessageListener } from "./firebase";

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
    adminData, fetchAdminData, handleResetAttendance 
  } = useAdmin(user, showToast, setLoading);

  const { 
    activeAlerts, alertLogs, handleAlertAction, logAlertAction,
    minimizedAlerts, setMinimizedAlerts, expandedAlertId, setExpandedAlertId,
    adminHiddenAlerts, requestNotificationPermission, testAlert, testBuzzer,
    lastBroadcast, setLastBroadcast
  } = useAlerts(user, showToast);

  const { 
    escalationRules, setEscalationRules, maxImages, setMaxImages, 
    scheduledThreshold, setScheduledThreshold,
    saveSystemConfig, isSavingConfig 
  } = useSystemConfig(user, showToast);

  useAlertTrigger(user, matrixData, escalationRules, alertLogs, logAlertAction, scheduledThreshold);

  const { 
    attendanceStatus, hoursWorked, isShiftComplete, 
    handleAttendanceSubmit, fetchStatus 
  } = useAttendance(user, showToast, setLoading);

  // Auto-request notification permission on first interaction
  useEffect(() => {
    // Request FCM token on launch
    requestForToken().then(token => {
      if (token) {
        console.log("FCM Token acquired on launch:", token);
      }
    });

    // Listen for foreground messages
    onMessageListener().then((payload: any) => {
      showToast(`${payload.notification.title}: ${payload.notification.body}`, "info");
    });

    if (!user) return;
    
    const handleFirstInteraction = async () => {
      if ("Notification" in window && Notification.permission === "default") {
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
      fetchStatus(user.empId);
    } else {
      setPage("login");
    }
  }, [user, fetchStatus]);

  // Background Refresh Handler: Trigger refresh when app returns to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        console.log("[App] App returned to foreground, triggering refresh...");
        fetchMatrixData();
        fetchAdminData();
        fetchStatus(user.empId);
        if ((window as any).refreshAlertHistory) {
          (window as any).refreshAlertHistory();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, fetchMatrixData, fetchAdminData, fetchStatus]);

  // Navigation Helper
  const navigateTo = useCallback((target: typeof page) => {
    const role = String(user?.role || "").toLowerCase().trim();
    if (target === "admin" && role !== "admin" && role !== "supervisor") {
      showToast("Access Denied: Admin or Supervisor Only", "error");
      return;
    }
    setPage(target);
    window.scrollTo(0, 0);
  }, [user, showToast]);

  // Sync user state from useAuth to other hooks if needed
  // (Most hooks take user as a parameter and handle internal effects)

  const handleLogin = useCallback(async (username: string, password: string) => {
    const result = await login(username, password);
    if (!result.success) {
      showToast(result.message || "Login failed", "error");
    }
  }, [login, showToast]);

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
            onSaveConfig={saveSystemConfig}
            isSavingConfig={isSavingConfig}
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
        return <Dashboard user={user} onLogout={logout} attendanceStatus={attendanceStatus} hoursWorked={hoursWorked} isShiftComplete={isShiftComplete} navigateTo={navigateTo} fetchAdminData={fetchAdminData} fetchMatrixData={fetchMatrixData} isMatrixLoading={isMatrixLoading} setShowEarlyPunchOutConfirm={setShowEarlyPunchOutConfirm} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100">
      <Loader loading={loading || authLoading} />
      
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
