// Email for the "forgot password" code, sent over HTTPS (free hosts such as Render block normal SMTP ports).
// Two providers are supported; whichever is configured is used (Resend first):
//
//   Resend (resend.com)   RESEND_API_KEY
//                         MAIL_FROM_EMAIL  optional, default onboarding@resend.dev
//                         NOTE: until you verify a domain in Resend, it only delivers to the email
//                         address of your own Resend account. Verify a domain to email every user.
//   Brevo (brevo.com)     BREVO_API_KEY + MAIL_FROM_EMAIL (a sender address verified in Brevo)
//
//   MAIL_FROM_NAME        optional, default "Talkies"
// Without a provider no email is sent (in development the code is printed in the server console instead).
const resendKey = () => process.env.RESEND_API_KEY || "";
const brevoKey = () => process.env.BREVO_API_KEY || "";
const fromEmail = () => process.env.MAIL_FROM_EMAIL || "";
const fromName = () => process.env.MAIL_FROM_NAME || "Talkies";

export const mailEnabled = () => !!(resendKey() || (brevoKey() && fromEmail()));

async function viaResend(to, subject, text, html) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${fromName()} <${fromEmail() || "onboarding@resend.dev"}>`, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15000),
  });
}

async function viaBrevo(to, subject, text, html) {
  return fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: fromName(), email: fromEmail() }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(15000),
  });
}

export async function sendMail(to, subject, text, html) {
  try {
    if (!to) return false;
    if (!mailEnabled()) {
      console.log("Email not configured (RESEND_API_KEY, or BREVO_API_KEY + MAIL_FROM_EMAIL) - password reset emails cannot be sent.");
      return false;
    }
    const r = resendKey() ? await viaResend(to, subject, text, html) : await viaBrevo(to, subject, text, html);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.log("Email send failed:", r.status, t.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.log("Email error:", e.message);
    return false;
  }
}
