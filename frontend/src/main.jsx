import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import { useThemeStore } from "./store/useThemeStore";

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

