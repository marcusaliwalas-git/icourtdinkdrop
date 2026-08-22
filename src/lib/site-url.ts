/**
 * Absolute base URL of the deployed site, for building links in emails and other
 * server-side contexts where `window.location.origin` isn't available.
 *
 * Prefers an explicit NEXT_PUBLIC_SITE_URL (set this to the real custom domain in
 * production, e.g. https://icourt.dinkdrop.live). Falls back to Vercel's per-deployment
 * URL, then to localhost for local dev. Never returns a trailing slash.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
