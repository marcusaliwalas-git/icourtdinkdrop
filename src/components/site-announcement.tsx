"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** A short, stable key for this announcement's content — when the admin changes the message/image,
 * the key changes so anyone who dismissed the old one sees the new one. */
function contentKey(parts: (string | null | undefined)[]): string {
  const raw = parts.filter(Boolean).join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return `dd-ann:${hash}`;
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss announcement"
      className="shrink-0 rounded p-1 opacity-80 transition-opacity hover:opacity-100"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

export function SiteAnnouncement({
  enabled = false,
  type,
  text,
  imageUrl,
  link,
}: {
  enabled?: boolean;
  type?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  link?: string | null;
}) {
  const pathname = usePathname();
  const isImage = type === "image" && !!imageUrl;
  const isText = type !== "image" && !!text?.trim();
  const key = contentKey([type, text, imageUrl, link]);

  // Start hidden and reveal after the mount check, so a previously-dismissed banner never flashes.
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(key) !== "1");
    } catch {
      setShow(true); // storage blocked — show it rather than hide it
    }
  }, [key]);

  // Admin has its own chrome — no public banner there.
  if (pathname?.startsWith("/admin")) return null;
  if (!enabled || (!isImage && !isText) || !show) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  const hasLink = !!link?.trim();

  if (isImage) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl!} alt={text?.trim() || "Announcement"} className="max-h-56 w-full object-cover" />
    );
    return (
      <div className="relative w-full border-b border-border/60 bg-muted">
        {hasLink ? (
          <Link href={link!} target={/^https?:\/\//i.test(link!) ? "_blank" : undefined} className="block">
            {img}
          </Link>
        ) : (
          img
        )}
        <div className="absolute top-2 right-2 rounded-full bg-background/70 text-foreground backdrop-blur">
          <DismissButton onClick={dismiss} />
        </div>
      </div>
    );
  }

  // Text mode: a slim accent strip.
  return (
    <div className="w-full bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm">
        <span className="min-w-0 flex-1 text-center">
          {hasLink ? (
            <Link
              href={link!}
              target={/^https?:\/\//i.test(link!) ? "_blank" : undefined}
              className="underline decoration-primary-foreground/40 underline-offset-2 hover:decoration-primary-foreground"
            >
              {text}
            </Link>
          ) : (
            text
          )}
        </span>
        <DismissButton onClick={dismiss} />
      </div>
    </div>
  );
}
