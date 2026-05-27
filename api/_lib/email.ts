// License-delivery emails via Resend.
// Sends from no-reply@palavir.co (verified domain on Resend Account A).

const RESEND_API = "https://api.resend.com/emails";

function getKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return key;
}

export interface LicenseEmail {
  to: string;
  licenseKey: string;
  paidAt: string;
}

export async function sendLicenseEmail(payload: LicenseEmail): Promise<void> {
  const html = renderHtml(payload);
  const text = renderText(payload);

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AnswerVault <no-reply@palavir.co>",
      reply_to: "josh@palavir.co",
      to: [payload.to],
      subject: "Your AnswerVault Pro license",
      html,
      text,
      tags: [
        { name: "app", value: "answer-vault" },
        { name: "kind", value: "license-delivery" },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}

function renderText(p: LicenseEmail): string {
  return `Your AnswerVault Pro license is ready.

License key: ${p.licenseKey}
Purchase email: ${p.to}
Paid at: ${p.paidAt}

How to activate:
  1. Install AnswerVault from the Chrome Web Store (or load it unpacked).
  2. Open AnswerVault → Options.
  3. Paste this email and license key, then click Activate.

Keep this email. You'll need the license key to restore Pro on a new browser profile.

Questions or trouble activating?  Reply to this email — josh@palavir.co.

— Palavir LLC
https://answer-vault-site.vercel.app/`;
}

function renderHtml(p: LicenseEmail): string {
  const safeKey = p.licenseKey.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const safeEmail = p.to.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Your AnswerVault Pro license</title></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:32px 36px 16px;">
          <h1 style="margin:0 0 8px;font-size:22px;color:#0a55c4;">AnswerVault Pro is ready</h1>
          <p style="margin:0;color:#4a4a4a;font-size:15px;">Thanks for the purchase. Your license key is below.</p>
        </td></tr>
        <tr><td style="padding:8px 36px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f4fa;border-radius:6px;padding:18px 22px;">
            <tr><td style="font-size:13px;color:#5b6470;padding-bottom:4px;">License key</td></tr>
            <tr><td style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:600;color:#0a3a8a;letter-spacing:0.5px;">${safeKey}</td></tr>
            <tr><td style="font-size:13px;color:#5b6470;padding:14px 0 4px;">Purchase email</td></tr>
            <tr><td style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:15px;color:#1a1a1a;">${safeEmail}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 36px 8px;">
          <h2 style="margin:0 0 10px;font-size:17px;">How to activate</h2>
          <ol style="margin:0;padding-left:22px;color:#3a3a3a;font-size:15px;line-height:1.6;">
            <li>Install AnswerVault from the Chrome Web Store (or load it unpacked).</li>
            <li>Open AnswerVault → Options.</li>
            <li>Paste this email and the license key above, then click <strong>Activate</strong>.</li>
          </ol>
        </td></tr>
        <tr><td style="padding:18px 36px 28px;color:#5b6470;font-size:14px;line-height:1.5;">
          Keep this email. You'll need the license key to restore Pro on a new browser profile.
          <br><br>
          Questions or trouble activating? Just reply to this email.
        </td></tr>
        <tr><td style="padding:18px 36px;background:#f5f7fb;border-top:1px solid #e2e6ee;font-size:12px;color:#7a8294;">
          Palavir LLC · <a href="https://answer-vault-site.vercel.app/" style="color:#0a55c4;text-decoration:none;">answer-vault-site.vercel.app</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
