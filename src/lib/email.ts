import "server-only";
import { config } from "@/lib/config";
import { Resend } from "resend";

/**
 * Transactional email via [Resend](https://resend.com) — used to deliver the
 * admin's one-time code for sensitive actions (M-Pesa paybill changes).
 *
 * The API key lives in `RESEND_API_KEY` (server-side only). On Vercel, set it
 * in the project's environment variables; locally it goes in `.env.local`.
 *
 * Sender identity:
 *   * With a verified domain on Resend, set `EMAIL_FROM`
 *     (e.g. "Farmer's Choice <noreply@farmerschoice.co.ke>").
 *   * Without one, Resend allows sending from their shared test sender
 *     `onboarding@resend.dev` — fine for development, but only delivers to
 *     the account owner's own address.
 */
let client: Resend | null = null;

function resendClient(): Resend {
  if (!config.email.apiKey) {
    throw new Error(
      "Email sending is not configured. Add RESEND_API_KEY to the environment (see README → Admin email code)."
    );
  }
  if (!client) client = new Resend(config.email.apiKey);
  return client;
}

export interface SendCodeEmailResult {
  ok: boolean;
  error?: string;
}

/** Send the one-time code. The subject states what it is for. */
export async function sendOtpEmail(params: {
  to: string;
  code: string;
  /** Human-readable purpose shown in the subject line. */
  purpose: string;
  /** How long the code stays valid, for the email body. */
  expiresInMinutes: number;
}): Promise<SendCodeEmailResult> {
  try {
    const resend = resendClient();
    const { error } = await resend.emails.send({
      from: config.email.from,
      to: params.to,
      subject: `${params.code} is your Farmer's Choice verification code`,
      text: [
        `Your verification code for ${params.purpose} is:`,
        "",
        `    ${params.code}`,
        "",
        `It expires in ${params.expiresInMinutes} minutes and can be used once.`,
        "If you did not request this, you can safely ignore this email.",
        "",
        "— Farmer's Choice Market",
      ].join("\n"),
      html: [
        '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">',
        '  <h2 style="margin:0 0 8px;color:#166534;">Farmer\'s Choice Market</h2>',
        `  <p style="color:#334155;margin:0 0 16px;">Your verification code for <strong>${params.purpose}</strong>:</p>`,
        `  <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;margin:0 0 16px;">${params.code}</p>`,
        `  <p style="color:#64748b;font-size:13px;margin:0;">It expires in ${params.expiresInMinutes} minutes and can be used once.`,
        "  If you did not request this, you can safely ignore this email.</p>",
        "</div>",
      ].join(""),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send the email.",
    };
  }
}
