import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./polish.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { BrowserRouter } from "react-router-dom";
import { useThemeStore, applyTheme, watchAutoTheme } from "./store/useThemeStore";
import { applyUiSettings } from "./lib/uiSettings";
import { applyAppFont } from "./lib/appFont";
import { applyAccent } from "./lib/accent";
import { applyChatColor } from "./lib/chatColor";
import { consumeLaunchIntentEarly } from "./lib/nativePush";

applyUiSettings();
consumeLaunchIntentEarly(); // Android: an "Answer" tapped on the call notification is picked up immediately
applyAppFont();
applyAccent();
applyChatColor();
applyTheme(useThemeStore.getState().theme);
watchAutoTheme();

// Wrapper to provide global theme
const RootWrapper = () => {
  const { theme } = useThemeStore(); // get theme from store
  return (
    <div data-theme={theme} className="h-screen w-screen">
      <App />
    </div>
  );
};


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary showError>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

