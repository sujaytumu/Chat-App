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

// A sleeping / slow server must never leave a screen hanging. A GET with no answer after 25 s gives up
// (instead of waiting forever) and is quietly tried again (the host is usually awake by then). Only reads
// are retried, so nothing is ever sent twice; downloads and calls that set their own timeout are left alone.
const RETRY_STATUS = new Set([502, 503, 504]);
const isGet = (cfg) => String(cfg?.method || "get").toLowerCase() === "get";
axiosInstance.interceptors.request.use((cfg) => {
  if (isGet(cfg) && !cfg.timeout && !cfg.responseType) cfg.timeout = 25000;
  return cfg;
});
axiosInstance.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error?.config;
    if (!cfg || !isGet(cfg) || axios.isCancel(error) || cfg.signal?.aborted || cfg.noRetry) throw error;
    const status = error.response?.status;
    const noAnswer = !error.response && ["ECONNABORTED", "ERR_NETWORK", "ETIMEDOUT"].includes(error.code);
    if (!(noAnswer || RETRY_STATUS.has(status))) throw error;
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw error; // really offline: say so now
    cfg._tries = (cfg._tries || 0) + 1;
    if (cfg._tries > 2) throw error;
    await new Promise((r) => setTimeout(r, 1000 * cfg._tries));
    return axiosInstance(cfg);
  }
);
