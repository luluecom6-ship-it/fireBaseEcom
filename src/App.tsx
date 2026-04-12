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
  const { user, loading: authLoading, login, logout, setUser } = useAuth();
  
  // Toast Hook
  const { toast, showToast } = useToast();

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
    activeAlerts, alertLogs, fetchAlertLogs, handleAlertAction, logAlertAction,
    minimizedAlerts, setMinimizedAlerts, expandedAlertId, setExpandedAlertId,
    adminHiddenAlerts, isBuzzerMuted, setIsBuzzerMuted, requestNotificationPermission, testAlert
  } = useAlerts(user, showToast);

  const { 
    escalationRules, setEscalationRules, maxImages, setMaxImages, 
    fetchSystemConfig, saveSystemConfig, isSavingConfig 
  } = useSystemConfig(showToast);

  useAlertTrigger(user, matrixData, escalationRules, alertLogs, logAlertAction);

  const { 
    attendanceStatus, hoursWorked, isShiftComplete, 
    handleAttendanceSubmit, fetchStatus 
  } = useAttendance(user, showToast, setLoading);

  // Auto-request notification permission on first interaction
  useEffect(() => {
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
      fetchSystemConfig();
    } else {
      setPage("login");
    }
  }, [user, fetchStatus, fetchSystemConfig]);

  // Navigation Helper
  const navigateTo = useCallback((target: typeof page) => {
    setPage(target);
    window.scrollTo(0, 0);
  }, []);

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
      return <Login onLogin={handleLogin} loading={authLoading} />;
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
            fetchAlertLogs={fetchAlertLogs}
            fetchMatrixData={fetchMatrixData}
            isMatrixLoading={isMatrixLoading}
            setShowEarlyPunchOutConfirm={setShowEarlyPunchOutConfirm}
            requestNotificationPermission={requestNotificationPermission}
            testAlert={testAlert}
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
            onRefetch={fetchAlertLogs}
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
            navigateTo={navigateTo}
            onViewImage={setFullImage}
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
        return <Dashboard user={user} onLogout={logout} attendanceStatus={attendanceStatus} hoursWorked={hoursWorked} isShiftComplete={isShiftComplete} navigateTo={navigateTo} fetchAdminData={fetchAdminData} fetchAlertLogs={fetchAlertLogs} fetchMatrixData={fetchMatrixData} isMatrixLoading={isMatrixLoading} setShowEarlyPunchOutConfirm={setShowEarlyPunchOutConfirm} />;
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
        isBuzzerMuted={isBuzzerMuted}
        setIsBuzzerMuted={setIsBuzzerMuted}
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
