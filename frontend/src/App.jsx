import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";//login
import SettingsPage from "./pages/SettingsPage";//settings page
import ProfilePage from "./pages/ProfilePage";
import NotificationManager from "./components/NotificationManager";
import { lazy, Suspense } from "react";
const CallManager = lazy(() => import("./components/CallManager"));

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import { useThemeStore } from "./store/useThemeStore";
import { useEffect } from "react";

import { Loader } from "lucide-react";
import { Toaster } from "react-hot-toast";

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore();
  const location = useLocation();
  const isChatScreen = location.pathname === "/" && authUser;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-screen bg-[#D9E5D8]">
        <Loader className="size-10 animate-spin text-[#128C7E]" />
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
        <Suspense fallback={null}>
          <CallManager />
        </Suspense>
      )}

      {/* Main routes */}
      <main className="flex-1">
        <Routes>
          <Route
            path="/"
            element={authUser ? <HomePage /> : <Navigate to="/login" />}
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
