// "Save password?" support.
//
// In the Android app the email + password are kept by the native SavedLogin plugin, which
// encrypts them with a key held in the phone's hardware-backed Keystore. The password is
// NEVER written to localStorage. In a normal browser the browser's own password manager
// does the job (the login form carries the right autocomplete attributes), so nothing is
// stored by us there.
//
// Everything here is async and best-effort: it must never slow down or break the app.

const NEVER_KEY = "talkies-never-save"; // emails the person said "Never" for (not secret)
const SIGNED_OUT_KEY = "talkies-signed-out"; // set by an explicit Log out: no silent sign-in after it

const plugin = () => {
  try {
    return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.SavedLogin || null : null;
  } catch {
    return null;
  }
};

export const canSaveLogin = () => !!plugin();

export async function getSavedLogin() {
  const p = plugin();
  if (!p) return null;
  try {
    const r = await p.get();
    return r?.email && r?.password ? { email: r.email, password: r.password } : null;
  } catch {
    return null;
  }
}

export async function saveLogin(email, password) {
  const p = plugin();
  if (!p) return false;
  try {
    await p.save({ email, password });
    return true;
  } catch {
    return false;
  }
}

export async function clearSavedLogin() {
  const p = plugin();
  if (!p) return;
  try {
    await p.clear();
  } catch {
    // nothing to clear
  }
}

const readNever = () => {
  try {
    return JSON.parse(localStorage.getItem(NEVER_KEY) || "[]");
  } catch {
    return [];
  }
};

export const isNeverSave = (email) => readNever().includes((email || "").trim().toLowerCase());

export const setNeverSave = (email) => {
  try {
    const list = new Set(readNever());
    list.add((email || "").trim().toLowerCase());
    localStorage.setItem(NEVER_KEY, JSON.stringify([...list]));
  } catch {
    // ignore
  }
};

export const markSignedOut = (on) => {
  try {
    if (on) localStorage.setItem(SIGNED_OUT_KEY, "1");
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // ignore
  }
};

export const wasSignedOut = () => {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
};
