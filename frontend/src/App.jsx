import { startPrefsSync } from "./lib/prefsSync";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import MainLayout from "./components/MainLayout";
import NotificationManager from "./components/NotificationManager";
import ErrorBoundary from "./components/ErrorBoundary";
import GroupCallManager from "./components/GroupCallManager";
import CallManager from "./components/CallManager"; // NOT lazy: calls must be ready to render the instant a socket event fires, even on a slow/cold connection

import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import { useThemeStore } from "./store/useThemeStore";
import { useEffect, useRef, lazy, Suspense } from "react";
import { startVersionWatcher } from "./lib/versionCheck";
import { syncPrefsToWorker } from "./lib/soundSettings";

import { Loader } from "lucide-react";
import { Toaster } from "react-hot-toast";

// Secondary screens load on demand so the chat screen (what people open the
// app for) downloads and starts faster. They're prefetched once the app is
// idle (below), so switching tabs is still instant.
const loaders = {
  SignUpPage: () => import("./pages/SignUpPage"),
  LoginPage: () => import("./pages/LoginPage"),
  SettingsPage: () => import("./pages/SettingsPage"),
  SettingsMore: () => import("./pages/SettingsMorePages"),
  NotificationsPage: () => import("./pages/NotificationsPage"),
  ProfilePage: () => import("./pages/ProfilePage"),
  CallsPage: () => import("./pages/CallsPage"),
  StatusPage: () => import("./pages/StatusPage"),
};
const SignUpPage = lazy(loaders.SignUpPage);
const LoginPage = lazy(loaders.LoginPage);
const NotificationsPage = lazy(loaders.NotificationsPage);
const AppearancePage = lazy(() => loaders.SettingsPage().then((m) => ({ default: m.AppearancePage })));
const more = (name) => lazy(() => loaders.SettingsMore().then((m) => ({ default: m[name] })));
const AccountPage = more("AccountPage");
const StarredPage = more("StarredPage");
const ChatsSettingsPage = more("ChatsSettingsPage");
const StoragePage = more("StoragePage");
const AccessibilityPage = more("AccessibilityPage");
const HelpPage = more("HelpPage");
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
  const navigate = useNavigate();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const isChatScreen = (["/", "/calls", "/status", "/profile", "/starred"].includes(location.pathname) || location.pathname.startsWith("/settings")) && authUser;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Keep appearance + sound choices the same on every device signed into this account
  const signedInId = authUser?._id;
  useEffect(() => {
    if (!signedInId) return;
    return startPrefsSync();
  }, [signedInId]);

  // Like WhatsApp, the app always opens on Chats: if it is (re)opened on
  // Updates / Calls / Profile / Settings, or you come back to it after being
  // away for a while, land on the main chat list instead.
  const OTHER_SCREENS = ["/status", "/calls", "/profile", "/starred"];
  const isOther = (path) => OTHER_SCREENS.includes(path) || path.startsWith("/settings");
  const signedIn = !!authUser;
  useEffect(() => {
    if (signedIn && isOther(pathRef.current)) navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    let hiddenAt = null;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (away > 15000 && isOther(pathRef.current)) navigate("/", { replace: true });
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, navigate]);

  // Warm the other screens' code in the background once the app is idle.
  useEffect(() => {
    if (!authUser) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(() => Object.values(loaders).forEach((load) => load().catch(() => {})));
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [authUser]);

  // Let the service worker know the vibration / silent-group choices.
  useEffect(() => {
    if (authUser) syncPrefsToWorker();
  }, [authUser]);

  // Move to the newest build whenever a newer one is deployed (no stale UI).
  useEffect(() => startVersionWatcher(), []);

  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-wa-bg">
        <Loader className="size-10 animate-spin text-[#25D366]" />
      </div>
    );

  return (
    <div
      data-theme={theme}
      // Signed-in screens are all dark; only the login / sign-up pages keep the
      // soft green background. (The old light-green wrapper showed through as a
      // strip at the bottom of the chat on phone browsers.)
      className={`min-h-[100dvh] flex flex-col ${
        authUser ? "bg-wa-bg text-wa-text" : "bg-[#D9E5D8] text-gray-900"
      }`}
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
      {authUser && (
        <ErrorBoundary silent>
          <GroupCallManager />
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
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          <Route
            path="/settings/account"
            element={authUser ? <MainLayout><AccountPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/chats"
            element={authUser ? <MainLayout><ChatsSettingsPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/notifications"
            element={authUser ? <MainLayout><NotificationsPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/appearance"
            element={authUser ? <MainLayout><AppearancePage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/storage"
            element={authUser ? <MainLayout><StoragePage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/accessibility"
            element={authUser ? <MainLayout><AccessibilityPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/help"
            element={authUser ? <MainLayout><HelpPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/starred"
            element={authUser ? <MainLayout><StarredPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/profile"
            element={
              authUser ? (
                <MainLayout>
                  <ProfilePage />
                </MainLayout>
              ) : (
                <Navigate to="/login" />
              )
            }
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
