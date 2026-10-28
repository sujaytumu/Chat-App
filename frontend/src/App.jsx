import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import MainLayout from "./components/MainLayout";
import NotificationManager from "./components/NotificationManager";
import ErrorBoundary from "./components/ErrorBoundary";

// Tells index.html's safety net that the app started fine.
window.__talkiesBooted = true;
try {
  sessionStorage.removeItem("talkies-recover");
} catch {
  /* ignore */
}
import GroupCallManager from "./components/GroupCallManager";
import CallKeepAlive from "./components/CallKeepAlive";
import LiveLocationManager from "./components/LiveLocationManager";
import ProfileLinkHandler, { rememberProfileLink } from "./components/ProfileLinkHandler";
import ReminderListener from "./components/ReminderListener";
import BackgroundCallSetup from "./components/BackgroundCallSetup";
import AccessNotifier from "./components/AccessNotifier";
import PayReturn from "./components/PayReturn";
import CallManager from "./components/CallManager"; // NOT lazy: calls must be ready to render the instant a socket event fires, even on a slow/cold connection

import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import { useThemeStore } from "./store/useThemeStore";
import { syncPreferences } from "./lib/prefsSync";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { startVersionWatcher, GlobalUpdatePill } from "./lib/versionCheck";
import { syncPrefsToWorker } from "./lib/soundSettings";

import { Loader } from "lucide-react";
import { warmReels } from "./lib/reelsCache";
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
const AccessPage = lazy(() => import("./pages/AccessPage"));
const StarredPage = more("StarredPage");
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const ReelsPage = lazy(() => import("./pages/ReelsPage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const PostPage = lazy(() => import("./pages/PostPage"));
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const PrivacyPage = more("PrivacyPage");
const TwoStepPage = more("TwoStepPage");
const LinkedDevicesPage = more("LinkedDevicesPage");
const ChatsSettingsPage = more("ChatsSettingsPage");
const StoragePage = more("StoragePage");
const AccessibilityPage = more("AccessibilityPage");
const HelpPage = more("HelpPage");
const ProfilePage = lazy(loaders.ProfilePage);
const CallsPage = lazy(loaders.CallsPage);
const CallJoinPage = lazy(() => import("./pages/CallJoinPage"));
const ChannelsPage = lazy(() => import("./pages/ChannelsPage"));

// Someone opened a call link while signed out: remember it, sign in, then land on the call.
const CallLinkLogin = () => {
  const { code } = useParams();
  try {
    sessionStorage.setItem("talkies-call-code", code);
  } catch {
    /* ignore */
  }
  return <Navigate to="/login" replace />;
};
const StatusPage = lazy(loaders.StatusPage);

const JoinGroupDialog = lazy(() => import("./components/JoinGroupDialog"));

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
  rememberProfileLink(); // profile link …/?u=username (remembered through sign-in)
  // Invite link: …/?join=CODE (remembered through sign-in)
  const [joinCode, setJoinCode] = useState(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("join");
      if (c) sessionStorage.setItem("talkies-join", c);
      return sessionStorage.getItem("talkies-join");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (authUser && joinCode) try { sessionStorage.removeItem("talkies-join"); } catch { /* ignore */ }
  }, [authUser, joinCode]);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const isChatScreen = (["/", "/calls", "/status", "/profile", "/starred"].includes(location.pathname) || location.pathname.startsWith("/settings")) && authUser;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Warm up the first Reels so the tab opens instantly
  useEffect(() => {
    if (!authUser?._id) return;
    const t = setTimeout(warmReels, 1500);
    return () => clearTimeout(t);
  }, [authUser?._id]);

  // Signed in after opening a call link: go to that call
  useEffect(() => {
    if (!authUser) return;
    try {
      const code = sessionStorage.getItem("talkies-call-code");
      if (code) {
        sessionStorage.removeItem("talkies-call-code");
        navigate(`/call/${code}`, { replace: true });
      }
    } catch {
      /* ignore */
    }
  }, [authUser, navigate]);

  // Same look & sounds on every device signed in to this account.
  const userId = authUser?._id;
  useEffect(() => {
    if (userId) syncPreferences();
  }, [userId]);

  // Remember where you were (Updates / Calls / Reels / Search / Post / You) and come back to exactly that
  // screen when the app is reopened or resumed — it no longer throws you back to Chats.
  const REMEMBER = ["/status", "/calls", "/profile", "/reels", "/explore", "/post"];
  const signedIn = !!authUser;
  useEffect(() => {
    const p = location.pathname;
    try {
      if (REMEMBER.includes(p)) localStorage.setItem("lastScreen", JSON.stringify({ p, at: Date.now() }));
      else if (p === "/" ) localStorage.removeItem("lastScreen");
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    if (!signedIn || pathRef.current !== "/" || location.search || location.hash) return;
    try {
      const saved = JSON.parse(localStorage.getItem("lastScreen") || "null");
      if (saved && REMEMBER.includes(saved.p) && Date.now() - saved.at < 6 * 3600 * 1000) navigate(saved.p);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Warm the other screens' code in the background once the app is idle.
  useEffect(() => {
    if (!authUser) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(() => { Object.values(loaders).forEach((load) => load().catch(() => {})); [() => import("./pages/ReelsPage"), () => import("./pages/ExplorePage"), () => import("./pages/PostPage")].forEach((load) => load().catch(() => {})); });
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
      <div className="splash">
        <img src="/icon-v2-192.png" alt="" />
        <b>Talkies</b>
        <i />
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

      {authUser && joinCode && (
        <Suspense fallback={null}>
          <JoinGroupDialog
            code={joinCode}
            onDone={() => {
              setJoinCode(null);
              window.history.replaceState(null, "", window.location.pathname);
            }}
          />
        </Suspense>
      )}
      {authUser && <NotificationManager />}
      {authUser && <GlobalUpdatePill />}
      {authUser && <CallKeepAlive />}
      {authUser && <ProfileLinkHandler />}
      {authUser && <ReminderListener />}
      {authUser && (
        <ErrorBoundary silent>
          <LiveLocationManager />
        </ErrorBoundary>
      )}
      {authUser && <BackgroundCallSetup />}
      {authUser && (
        <ErrorBoundary silent>
          <CallManager />
          <AccessNotifier />
          <PayReturn />
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
            path="/call/:code"
            element={authUser ? <MainLayout><CallJoinPage /></MainLayout> : <CallLinkLogin />}
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
          <Route path="/reels" element={authUser ? <ReelsPage /> : <Navigate to="/login" />} />
          <Route path="/post" element={authUser ? <PostPage /> : <Navigate to="/login" />} />
          <Route path="/activity" element={authUser ? <ActivityPage /> : <Navigate to="/login" />} />
          <Route path="/explore" element={authUser ? <ExplorePage /> : <Navigate to="/login" />} />
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
            path="/settings/access"
            element={authUser ? <MainLayout><AccessPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/two-step"
            element={authUser ? <MainLayout><TwoStepPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/devices"
            element={authUser ? <MainLayout><LinkedDevicesPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/privacy"
            element={authUser ? <MainLayout><PrivacyPage /></MainLayout> : <Navigate to="/login" />}
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
            path="/channels"
            element={authUser ? <MainLayout><ChannelsPage /></MainLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/settings/payments"
            element={authUser ? <MainLayout><PaymentsPage /></MainLayout> : <Navigate to="/login" />}
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
