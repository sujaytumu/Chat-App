// Keeps unfinished uploads (picked videos / photos and what was typed) on this device, so an app update, a
// reload or going out of the app and back never loses them. Uses IndexedDB because it can hold big files.
// Every call is safe: if storage is blocked or full, the upload screen just works without the safety net.

const DB = "talkies-drafts";
const STORE = "drafts";

let dbp = null;
const open = () => {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
};

const run = async (mode, fn) => {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return undefined;
  }
};

export const draftPut = (key, value) => run("readwrite", (s) => s.put(value, key));
export const draftGet = (key) => run("readonly", (s) => s.get(key));
export const draftDel = (key) => run("readwrite", (s) => s.delete(key));
export const draftDelPrefix = (prefix) => run("readwrite", (s) => s.delete(IDBKeyRange.bound(prefix, prefix + "￿")));
export const draftGetPrefix = async (prefix) => {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const out = [];
      const req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, prefix + "￿"));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};
