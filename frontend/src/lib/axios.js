import axios from "axios";

export const axiosInstance = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api",
  withCredentials: true,
});

// If the session ended while the app was open (signed out from Linked devices, server restarted with a new secret...)
// and this phone has a saved login, sign in again quietly and repeat the request once, instead of showing errors.
axiosInstance.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error?.config;
    const url = String(cfg?.url || "");
    if (error?.response?.status !== 401 || !cfg || cfg._retried || url.includes("/auth/")) throw error;
    cfg._retried = true;
    try {
      const { useAuthStore } = await import("../store/useAuthStore");
      if (await useAuthStore.getState().silentRelogin()) return axiosInstance(cfg);
    } catch {
      /* fall through to the original error */
    }
    throw error;
  }
);
