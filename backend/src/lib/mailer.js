// Email for the "forgot password" code, sent through Brevo's HTTPS API (free: 300 emails/day, no domain
// needed - just verify one sender address). HTTPS is used on purpose: free hosts such as Render block
// the normal SMTP ports, so nodemailer/SMTP would never get out.
//
// Server variables:
//   BREVO_API_KEY      API key from brevo.com -> SMTP & API -> API keys
//   MAIL_FROM_EMAIL    the sender address you verified in Brevo (Senders & IP)
//   MAIL_FROM_NAME     optional, default "Talkies"
// Without them no email is sent (in development the code is printed in the server console instead).
const key = () => process.env.BREVO_API_KEY || "";
const fromEmail = () => process.env.MAIL_FROM_EMAIL || "";

export const mailEnabled = () => !!(key() && fromEmail());

export async function sendMail(to, subject, text, html) {
  try {
    if (!to) return false;
    if (!mailEnabled()) {
      console.log("Email not configured (BREVO_API_KEY / MAIL_FROM_EMAIL) - password reset emails cannot be sent.");
      return false;
    }
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.MAIL_FROM_NAME || "Talkies", email: fromEmail() },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.log("Email send failed:", r.status, t.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.log("Email error:", e.message);
    return false;
  }
}
