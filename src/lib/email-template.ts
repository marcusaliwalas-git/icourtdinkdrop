// Pure, dependency-free email HTML renderer — deliberately no "server-only" import so it
// can be unit-tested and previewed outside the Next.js server runtime. email.ts (which is
// server-only, because it holds transport credentials) composes these.
//
// Table-based, all styles inline: the only combination email clients (Gmail, Outlook,
// Apple Mail, Mailpit) render consistently. `<style>` blocks and class selectors are widely
// stripped, so everything here is a `style="..."` attribute.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DetailRow = { label: string; value: string; mono?: boolean };

export interface EmailTemplate {
  heading: string;
  /** One or more short paragraphs of plain text shown above the details card. */
  intro: string[];
  detailRows: DetailRow[];
  button: { label: string; url: string };
  /** Optional paragraphs shown below the button. */
  outro?: string[];
  /** Accent bar / button colour. Green for normal flows, red for cancellations. */
  accent?: "green" | "red";
}

export function renderEmail(t: EmailTemplate): string {
  const accentColor = t.accent === "red" ? "#e5484d" : "#9fce20";
  const buttonTextColor = t.accent === "red" ? "#ffffff" : "#0a1400";

  const introHtml = t.intro
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(p)}</p>`
    )
    .join("");

  const rowsHtml = t.detailRows
    .map(
      (r) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#71717a;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(r.label)}</td>
          <td align="right" style="padding:6px 0;font-size:14px;font-weight:bold;color:#18181b;font-family:${r.mono ? "'Courier New',monospace" : "Arial,Helvetica,sans-serif"};${r.mono ? "letter-spacing:2px;" : ""}">${escapeHtml(r.value)}</td>
        </tr>`
    )
    .join("");

  const outroHtml = (t.outro ?? [])
    .map(
      (p) =>
        `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#71717a;">${escapeHtml(p)}</p>`
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
            <!-- header -->
            <tr>
              <td style="background-color:#0a0a0a;padding:26px 32px;text-align:center;">
                <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px;">iCourt<span style="color:${accentColor};">&middot;</span>Social</span>
              </td>
            </tr>
            <!-- accent bar -->
            <tr><td style="height:4px;background-color:${accentColor};line-height:4px;font-size:4px;">&nbsp;</td></tr>
            <!-- body -->
            <tr>
              <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#18181b;">${escapeHtml(t.heading)}</h1>
                ${introHtml}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;border-radius:10px;margin:20px 0 24px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${rowsHtml}
                      </table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background-color:${accentColor};">
                      <a href="${t.button.url}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${buttonTextColor};text-decoration:none;border-radius:10px;">${escapeHtml(t.button.label)}</a>
                    </td>
                  </tr>
                </table>
                ${outroHtml}
              </td>
            </tr>
            <!-- footer -->
            <tr>
              <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #eee;text-align:center;">
                <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#a1a1aa;margin:0;">
                  iCourt Social Pickleball Court<br/>
                  This is an automated message — no need to reply.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
