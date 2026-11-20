"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { parseSocials, parseLinks, socialLabel, type SocialPlatform } from "@/lib/footer";

// Minimal inline brand glyphs (24×24, currentColor). No icon dependency — keeps the CSP simple.
const SOCIAL_ICONS: Record<SocialPlatform, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  facebook: <path d="M14 8.5h2V5.5h-2c-1.7 0-3 1.3-3 3V11H9v3h2v6h3v-6h2.2l.8-3H14V8.9c0-.3.2-.4.5-.4Z" />,
  tiktok: <path d="M15 4c.4 2 1.7 3.4 3.5 3.7V10c-1.3 0-2.6-.4-3.5-1v5.5A4.5 4.5 0 1 1 10.5 10v2.4a2.1 2.1 0 1 0 1.9 2.1V4H15Z" />,
  x: <path d="M4 4l7 8.5M20 4l-7 8.5M13 12.5L20 20M11 11.5L4 20" />,
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M11 9.5l4 2.5-4 2.5v-5Z" fill="currentColor" stroke="none" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.4 2.5 14.6 0 17M12 3.5c-2.5 2.4-2.5 14.6 0 17" />
    </>
  ),
};

function SocialIcon({ platform }: { platform: string }) {
  const glyph = SOCIAL_ICONS[platform as SocialPlatform] ?? SOCIAL_ICONS.website;
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {glyph}
    </svg>
  );
}

export function SiteFooter({
  brandName,
  about,
  email,
  phone,
  address,
  socials: rawSocials,
  links: rawLinks,
}: {
  brandName?: string | null;
  about?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  socials?: unknown;
  links?: unknown;
}) {
  const pathname = usePathname();
  // Admin has its own chrome — no public footer there.
  if (pathname?.startsWith("/admin")) return null;

  const socials = parseSocials(rawSocials);
  const links = parseLinks(rawLinks);
  const name = brandName?.trim() || "iCourt Social";
  const hasContact = !!(email || phone || address);
  const hasBody = !!(about?.trim() || hasContact || socials.length || links.length);

  return (
    <footer className="mt-auto border-t border-border/60 bg-background/50">
      <div className="mx-auto max-w-3xl px-5 py-10">
        {hasBody && (
          <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-3">
              <span className="text-base font-semibold">{name}</span>
              {about?.trim() && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{about}</p>}
              {socials.length > 0 && (
                <div className="mt-1 flex items-center gap-3">
                  {socials.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={socialLabel(s.platform)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <SocialIcon platform={s.platform} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 text-sm">
              {hasContact && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[0.65rem] tracking-[0.15em] text-muted-foreground uppercase">Contact</span>
                  {email && (
                    <a href={`mailto:${email}`} className="text-muted-foreground transition-colors hover:text-foreground">
                      {email}
                    </a>
                  )}
                  {phone && (
                    <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-muted-foreground transition-colors hover:text-foreground">
                      {phone}
                    </a>
                  )}
                  {address && <p className="whitespace-pre-line text-muted-foreground">{address}</p>}
                </div>
              )}
              {links.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[0.65rem] tracking-[0.15em] text-muted-foreground uppercase">Links</span>
                  {links.map((l, i) => {
                    const external = /^https?:\/\//i.test(l.url);
                    return external ? (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link key={i} href={l.url} className="text-muted-foreground transition-colors hover:text-foreground">
                        {l.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={hasBody ? "mt-8 border-t border-border/40 pt-5" : ""}>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
