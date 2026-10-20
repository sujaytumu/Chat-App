// "Summarize chat": asks a hosted language model (Groq or OpenAI, whichever key the server has) for a short
// recap of the most recent messages. Only runs when a person taps the button.
const SYSTEM = `You write short recaps of a chat conversation.
Reply in the same language the people use. Format:
1) One sentence saying what the conversation is about.
2) Then up to 5 short bullet lines ("- ") covering key points, decisions, plans or dates, and anything still waiting for a reply.
Only use what is in the chat. Do not invent names, numbers or facts. Do not add advice or commentary.`;

export const aiConfigured = () => !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);

export async function summarizeTranscript(transcript) {
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  if (!groq && !openai) return { error: "not_configured" };
  const r = await fetch(groq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groq || openai}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: groq ? "llama-3.3-70b-versatile" : "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Chat to summarize:\n\n${transcript}` },
      ],
    }),
  });
  if (!r.ok) {
    console.log("Summary failed:", r.status, (await r.text().catch(() => "")).slice(0, 200));
    return { error: "failed" };
  }
  const text = String((await r.json())?.choices?.[0]?.message?.content || "").trim();
  return text ? { text: text.slice(0, 2000) } : { error: "failed" };
}
