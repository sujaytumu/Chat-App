import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import MainLayout from "./components/MainLayout";
import NotificationManager from "./components/NotificationManager";
import ErrorBoundary from "./components/ErrorBoundary";
import CallManager from "./components/CallManager"; // NOT lazy: calls must be ready to render the instant a socket event fires, even on a slow/cold connection

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import { useThemeStore } from "./store/useThemeStore";
import { useEffect, lazy, Suspense } from "react";
import { startVersionWatcher } from "./lib/versionCheck";

import { Loader } from "lucide-react";
import { Toaster } from "react-hot-toast";

// Secondary screens load on demand so the chat screen (what people open the
// app for) downloads and starts faster. They're prefetched once the app is
// idle (below), so switching tabs is still instant.
const loaders = {
  SignUpPage: () => import("./pages/SignUpPage"),
  LoginPage: () => import("./pages/LoginPage"),
  SettingsPage: () => import("./pages/SettingsPage"),
  ProfilePage: () => import("./pages/ProfilePage"),
  CallsPage: () => import("./pages/CallsPage"),
  StatusPage: () => import("./pages/StatusPage"),
};
const SignUpPage = lazy(loaders.SignUpPage);
const LoginPage = lazy(loaders.LoginPage);
const SettingsPage = lazy(loaders.SettingsPage);
const ProfilePage = lazy(loaders.ProfilePage);
const CallsPage = lazy(loaders.CallsPage);
const StatusPage = lazy(loaders.StatusPage);

const RouteFallback = () => (
  <div className="flex items-center justify-center h-[60dvh]">
    <Loader className="size-8 animate-spin text-[#25D366]" />
  </div>
);

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore();
  const location = useLocation();
  const isChatScreen = ["/", "/calls", "/status"].includes(location.pathname) && authUser;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Warm the other screens' code in the background once the app is idle.
  useEffect(() => {
    if (!authUser) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(() => Object.values(loaders).forEach((load) => load().catch(() => {})));
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [authUser]);

  // Move to the newest build whenever a newer one is deployed (no stale UI).
  useEffect(() => startVersionWatcher(), []);

  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-[#0B141A]">
        <Loader className="size-10 animate-spin text-[#25D366]" />
      </div>
    );

  return (
    <div
      data-theme={theme}
      className="min-h-screen flex flex-col bg-[#D9E5D8] text-gray-900" // ✅ soft green background
    >
      {/* Navbar — hidden on the chat screen itself to give messages more room;
          Sidebar has its own compact profile/settings/logout icons instead */}
      {!isChatScreen && <Navbar />}

      {authUser && <NotificationManager />}
      {authUser && (
        <ErrorBoundary silent>
          <CallManager />
        </ErrorBoundary>
      )}

      {/* Main routes */}
      <main className="flex-1">
        <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              authUser ? (
                <MainLayout>
                  <HomePage />
                </MainLayout>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/calls"
            element={
              authUser ? (
                <MainLayout>
                  <CallsPage />
                </MainLayout>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/status"
            element={
              authUser ? (
                <MainLayout>
                  <StatusPage />
                </MainLayout>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/signup"
            element={!authUser ? <SignUpPage /> : <Navigate to="/" />}
          />
          <Route
            path="/login"
            element={!authUser ? <LoginPage /> : <Navigate to="/" />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/profile"
            element={authUser ? <ProfilePage /> : <Navigate to="/login" />}
          />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{ style: { background: "#128C7E", color: "white" } }}
      />
    </div>
  );
};

export default App;
