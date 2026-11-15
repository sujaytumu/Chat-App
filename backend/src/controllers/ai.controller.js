import { aiComplete, aiEnabled } from "../lib/ai.js";

const CHAT_SYSTEM = `You are Talkies AI, a friendly assistant inside the Talkies chat app.
Reply in the same language and script the person writes in (including Hinglish or Telugu in English letters).
Keep answers short and easy to read on a phone: a few sentences, simple lists only when useful.
Help with writing messages, replies, translations, ideas, quick facts and everyday questions.
You can't see the person's other chats, contacts or files, and you can't take actions in the app. If asked, say so plainly.
Never claim to be a human. If you are not sure of a fact, say so instead of guessing.`;

const SUGGEST_SYSTEM = `You suggest quick replies a person could send in a chat.
You get the last few messages ("Them:" is the other person, "Me:" is the user). Write exactly 3 different short replies the user could send next.
Rules: same language and script as the chat; each under 60 characters; sound natural and casual; cover different intents (for example agree, decline, ask back); no quotes, no numbering, no explanations.
Return ONLY a JSON array of 3 strings.`;

const uses = new Map(); // `${kind}:${userId}` -> timestamps
const limited = (kind, userId, max) => {
  const key = `${kind}:${userId}`;
  const hits = (uses.get(key) || []).filter((t) => Date.now() - t < 3600_000);
  if (hits.length >= max) return true;
  hits.push(Date.now());
  uses.set(key, hits);
  return false;
};

const errorText = {
  not_configured: "Talkies AI isn't switched on for this server yet.",
  busy: "Talkies AI is busy right now. Try again in a moment.",
  failed: "Talkies AI couldn't answer. Try again.",
};

export const aiStatus = (_req, res) => res.status(200).json({ enabled: aiEnabled() });

export const aiChat = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const history = raw
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!history.length || history[history.length - 1].role !== "user") return res.status(400).json({ error: "Send a message first." });
    if (!aiEnabled()) return res.status(503).json({ error: errorText.not_configured, code: "not_configured" });
    if (limited("chat", req.user._id, 60)) return res.status(429).json({ error: "You've asked a lot this hour. Try again in a while." });
    const out = await aiComplete({ system: CHAT_SYSTEM, messages: history, maxTokens: 600, temperature: 0.6 });
    if (out.error) return res.status(502).json({ error: errorText[out.error] || errorText.failed, code: out.error });
    res.status(200).json({ reply: out.text.slice(0, 4000) });
  } catch (error) {
    console.log("Error in aiChat controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const aiSuggest = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lines = raw
      .filter((m) => m && (m.from === "me" || m.from === "them") && typeof m.text === "string" && m.text.trim())
      .slice(-6)
      .map((m) => `${m.from === "me" ? "Me" : "Them"}: ${m.text.trim().slice(0, 300)}`);
    if (!lines.length || !lines[lines.length - 1].startsWith("Them:")) return res.status(200).json({ replies: [] });
    if (!aiEnabled()) return res.status(200).json({ replies: [], code: "not_configured" });
    if (limited("suggest", req.user._id, 150)) return res.status(200).json({ replies: [] });
    const out = await aiComplete({ system: SUGGEST_SYSTEM, messages: [{ role: "user", content: lines.join("\n") }], maxTokens: 120, temperature: 0.7 });
    if (out.error) return res.status(200).json({ replies: [] });
    let replies = [];
    try {
      const m = out.text.match(/\[[\s\S]*\]/);
      replies = JSON.parse(m ? m[0] : out.text);
    } catch {
      replies = out.text.split("\n").map((l) => l.replace(/^[-*\d.)\s"]+|["\s]+$/g, ""));
    }
    replies = [...new Set((Array.isArray(replies) ? replies : []).filter((r) => typeof r === "string").map((r) => r.trim()).filter((r) => r && r.length <= 80))].slice(0, 3);
    res.status(200).json({ replies });
  } catch (error) {
    console.log("Error in aiSuggest controller:", error.message);
    res.status(200).json({ replies: [] });
  }
};
