// One small client for the hosted language model (Groq or OpenAI, whichever key the server has).
// Used by "Talkies AI" chat and AI smart replies. Nothing here runs unless a person asks for it.
export const aiEnabled = () => !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);

export async function aiComplete({ system, messages, maxTokens = 500, temperature = 0.5 }) {
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  if (!groq && !openai) return { error: "not_configured" };
  try {
    const r = await fetch(groq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groq || openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: groq ? "llama-3.3-70b-versatile" : "gpt-4o-mini",
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      console.log("AI request failed:", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return { error: r.status === 429 ? "busy" : "failed" };
    }
    const text = String((await r.json())?.choices?.[0]?.message?.content || "").trim();
    return text ? { text } : { error: "failed" };
  } catch (e) {
    console.log("AI request error:", e.message);
    return { error: "failed" };
  }
}
