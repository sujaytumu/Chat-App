import mongoose from "mongoose";
import Playlist from "../models/playlist.model.js";
import Group from "../models/group.model.js";
import { pairKey } from "../models/directChatSetting.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";

const MAX_SONGS = 50;
const PREVIEW_HOST = /(\.mzstatic\.com|^audio-ssl\.itunes\.apple\.com)$/i;

// Who is in this chat? Returns { key, others: [userIds to notify] } or null when the person isn't part of it.
async function resolveChat(me, chatType, chatId) {
  if (!mongoose.isValidObjectId(chatId)) return null;
  if (chatType === "group") {
    const g = await Group.findOne({ _id: chatId, members: me }).select("members").lean();
    return g ? { key: `g:${chatId}`, room: String(chatId), others: [] } : null;
  }
  if (chatType === "direct") return { key: `d:${pairKey(me, chatId)}`, others: [String(chatId)], room: null };
  return null;
}

function notify(me, chat, chatType, chatId) {
  if (chat.room) io.to(chat.room).emit("playlistUpdated", { chatType: "group", chatId });
  else for (const uid of chat.others) {
    const sid = getReceiverSocketId(uid);
    if (sid) io.to(sid).emit("playlistUpdated", { chatType: "direct", chatId: String(me) });
  }
}

export const getPlaylist = async (req, res) => {
  try {
    const chat = await resolveChat(req.user._id, req.params.chatType, req.params.chatId);
    if (!chat) return res.status(403).json({ error: "Not allowed" });
    const doc = await Playlist.findOne({ key: chat.key }).lean();
    res.set("Cache-Control", "no-store");
    res.json(doc?.songs || []);
  } catch (e) {
    console.log("Error in getPlaylist:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addSong = async (req, res) => {
  try {
    const { chatType, chatId } = req.params;
    const chat = await resolveChat(req.user._id, chatType, chatId);
    if (!chat) return res.status(403).json({ error: "Not allowed" });
    const b = req.body || {};
    let host = "";
    try {
      const u = new URL(String(b.preview || ""));
      if (u.protocol === "https:") host = u.hostname;
    } catch {
      /* not a link */
    }
    if (!b.id || !b.title || !PREVIEW_HOST.test(host)) return res.status(400).json({ error: "Not a supported song" });
    const song = {
      id: String(b.id).slice(0, 40),
      title: String(b.title).slice(0, 120),
      artist: String(b.artist || "").slice(0, 120),
      art: /^https:\/\//.test(String(b.art || "")) ? String(b.art).slice(0, 300) : "",
      preview: String(b.preview).slice(0, 400),
      addedBy: req.user._id,
      addedByName: req.user.fullName,
    };
    const doc = (await Playlist.findOne({ key: chat.key })) || new Playlist({ key: chat.key, songs: [] });
    if (doc.songs.some((s) => s.id === song.id)) return res.status(200).json(doc.songs);
    if (doc.songs.length >= MAX_SONGS) return res.status(400).json({ error: `A playlist holds up to ${MAX_SONGS} songs` });
    doc.songs.push(song);
    await doc.save();
    notify(req.user._id, chat, chatType, chatId);
    res.status(201).json(doc.songs);
  } catch (e) {
    console.log("Error in addSong:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeSong = async (req, res) => {
  try {
    const { chatType, chatId, songId } = req.params;
    const chat = await resolveChat(req.user._id, chatType, chatId);
    if (!chat) return res.status(403).json({ error: "Not allowed" });
    const doc = await Playlist.findOneAndUpdate({ key: chat.key }, { $pull: { songs: { id: songId } } }, { new: true });
    notify(req.user._id, chat, chatType, chatId);
    res.json(doc?.songs || []);
  } catch (e) {
    console.log("Error in removeSong:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
