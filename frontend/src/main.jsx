import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import { useThemeStore, applyTheme } from "./store/useThemeStore";
import { applyUiSettings } from "./lib/uiSettings";

applyUiSettings();
applyTheme(useThemeStore.getState().theme);

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
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

