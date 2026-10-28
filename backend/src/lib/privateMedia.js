import mongoose from "mongoose";
import cloudinary from "./cloudinary.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import Status from "../models/status.model.js";
import Highlight from "../models/highlight.model.js";

// Chat photos / videos / documents / voice notes are PRIVATE to the people in that chat.
//  - They are uploaded to Cloudinary as "authenticated" assets (no public address at all).
//  - The server never sends the Cloudinary address to the browser. Every response / socket event shows
//    /api/media/<token> instead; that route checks you are in the chat, then hands over a signed link.
// So someone who is not in the chat can neither see the picture in the app nor open it by guessing a link.

const PRIVATE_URL = /https?:\/\/res\.cloudinary\.com\/[^"\\\s]*\/chat-app\/(?:messages|files)\/[^"\\\s]*/g;
const PARSE = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:v(\d+)\/)?(.+)$/;

export const isPrivateUrl = (u) => typeof u === "string" && /^https?:\/\/res\.cloudinary\.com\//.test(u) && /\/chat-app\/(?:messages|files)\//.test(u);

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s) => {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return "";
  }
};

// /api/media/<token>.<ext> — the extension is only a hint for the app (pdf, mp4, jpg…).
export function maskUrl(url) {
  const path = url.split("?")[0];
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(path)?.[1];
  return `/api/media/${b64(url)}${ext ? `.${ext.toLowerCase()}` : ""}`;
}

// A JSON string with every private address swapped for its /api/media/ form.
export const maskString = (s) => (s.includes("/chat-app/") ? s.replace(PRIVATE_URL, (m) => maskUrl(m)) : s);

// Anything about to leave the server (a socket event payload).
export function maskPayload(value) {
  if (value === null || typeof value !== "object") return value;
  try {
    const s = JSON.stringify(value);
    if (!s || !s.includes("/chat-app/")) return value;
    return JSON.parse(maskString(s));
  } catch {
    return value;
  }
}

// Express: every JSON answer goes through maskString (unless a route opts out with res.locals.noMask).
export function maskJsonMiddleware(req, res, next) {
  const orig = res.json.bind(res);
  res.json = (body) => {
    if (res.locals.noMask || body === undefined) return orig(body);
    let s;
    try {
      s = JSON.stringify(body);
    } catch {
      return orig(body);
    }
    if (s === undefined) return orig(body);
    return res.type("json").send(maskString(s));
  };
  next();
}

export const tokenToUrl = (token) => {
  const t = String(token || "").replace(/\.[A-Za-z0-9]{1,6}$/, "");
  const url = unb64(t);
  return isPrivateUrl(url) ? url : null;
};

// May this person open this file? Only people in the chat the file was sent in, and not if they removed it.
// Statuses and highlights keep their song / media in the same private area, so a file used there is
// open to whoever the owner shared that update with (the owner always).
const audienceAllows = (aud, ownerId, me) => {
  if (String(ownerId) === me) return true;
  if (!aud || !aud.mode || aud.mode === "all") return true;
  const listed = (aud.users || []).some((u) => String(u) === me);
  return aud.mode === "only" ? listed : !listed;
};

async function canAccessStatusMedia(me, url) {
  const statuses = await Status.find({ $or: [{ "song.url": url }, { content: url }] }).select("userId audience expiresAt").limit(10).lean();
  for (const st of statuses) {
    if (String(st.userId) === me || (st.expiresAt > new Date() && audienceAllows(st.audience, st.userId, me))) return true;
  }
  const hls = await Highlight.find({ $or: [{ "items.song.url": url }, { "items.content": url }] }).select("userId audience items").limit(10).lean();
  for (const h of hls) {
    if (!audienceAllows(h.audience, h.userId, me)) continue; // the whole highlight is kept from this person
    for (const it of h.items || []) {
      if ((it.song?.url === url || it.content === url) && audienceAllows(it.audience, h.userId, me)) return true;
    }
  }
  return false;
}

export async function canAccessMedia(userId, url) {
  const me = String(userId);
  if (await canAccessStatusMedia(me, url)) return true;
  const rows = await Message.find({ $or: [{ image: url }, { "file.url": url }] })
    .select("senderId receiverId groupId deletedFor deletedForEveryone")
    .limit(10)
    .lean();
  for (const m of rows) {
    if (m.deletedForEveryone) continue;
    if ((m.deletedFor || []).some((d) => String(d) === me)) continue;
    if (m.groupId) {
      if (await Group.exists({ _id: m.groupId, members: me })) return true;
    } else if (String(m.senderId) === me || String(m.receiverId) === me) {
      return true;
    }
  }
  return false;
}

// A signed Cloudinary address for a stored one (older public files are returned as they are).
export function deliveryUrl(raw, { width } = {}) {
  const m = PARSE.exec(String(raw).split("?")[0]);
  if (!m) return raw;
  const [, resourceType, type, version, rest] = m;
  let id = decodeURIComponent(rest);
  const opts = { resource_type: resourceType, type, secure: true, sign_url: type !== "upload", ...(version ? { version } : {}) };
  if (resourceType !== "raw") {
    const dot = id.lastIndexOf(".");
    const ext = dot > 0 ? id.slice(dot + 1) : "";
    if (dot > 0) id = id.slice(0, dot);
    if (resourceType === "image" && width) opts.transformation = [{ width, crop: "limit", quality: "auto", fetch_format: "auto" }];
    else if (ext) opts.format = ext;
  }
  return cloudinary.url(id, opts);
}

// A view-once photo that nobody opens is thrown away after this long.
export const VIEW_ONCE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// The picture's bytes, read by the server itself. A view-once photo is handed to the receiver
// from here, so no long-lived (signed) Cloudinary address ever reaches the browser.
export async function fetchPrivateImage(raw, { maxBytes = 15 * 1024 * 1024 } = {}) {
  const resp = await fetch(deliveryUrl(raw), { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`storage answered ${resp.status}`);
  const type = resp.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("not an image");
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!buf.length || buf.length > maxBytes) throw new Error("bad image size");
  return { buf, type };
}

// Delete a private file from Cloudinary for good (and drop it from the CDN cache). Used for a
// view-once photo the moment it has been opened, so any address that leaked stops working.
export async function destroyPrivateAsset(raw) {
  const m = PARSE.exec(String(raw).split("?")[0]);
  if (!m) return false;
  const [, resourceType, type, , rest] = m;
  let id = decodeURIComponent(rest);
  if (resourceType !== "raw") {
    const dot = id.lastIndexOf(".");
    if (dot > 0) id = id.slice(0, dot);
  }
  const r = await cloudinary.uploader.destroy(id, { resource_type: resourceType, type, invalidate: true });
  return r?.result === "ok";
}

// Forwarding sends back the /api/media/ address it was shown: turn it into a fetchable one (after checking access).
export async function resolveMediaRef(ref, userId) {
  if (typeof ref !== "string" || !ref.startsWith("/api/media/")) return ref;
  const url = tokenToUrl(ref.slice("/api/media/".length).split("?")[0]);
  if (!url || !(await canAccessMedia(userId, url))) {
    const err = new Error("You can't use that file");
    err.status = 403;
    throw err;
  }
  return deliveryUrl(url);
}

export const isValidId = (id) => mongoose.isValidObjectId(id);
