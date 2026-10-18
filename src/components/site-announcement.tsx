"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** A short, stable key for this announcement's content. Dismissal is stored in sessionStorage, so it
 * lasts only for the current visit — a refresh keeps it closed, but a new browser session (or tab)
 * shows it again. The content hash also re-shows it within a visit if the admin changes it. */
function contentKey(parts: (string | null | undefined)[]): string {
  const raw = parts.filter(Boolean).join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return `dd-ann:${hash}`;
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
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const eligible = enabled && !isAdmin && (isImage || isText);

  // Start hidden and reveal after the mount check, so an overlay dismissed earlier this visit never
  // flashes. sessionStorage means the dismissal is forgotten when the browser session ends.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!eligible) return;
    try {
      setShow(sessionStorage.getItem(key) !== "1");
    } catch {
      setShow(true); // storage blocked — show it rather than hide it
    }
  }, [key, eligible]);

  // Lock background scroll and close on Escape while the overlay is open.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!eligible || !show) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  const hasLink = !!link?.trim();
  const external = hasLink && /^https?:\/\//i.test(link!);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Announcement"
      onClick={dismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div onClick={(e) => e.stopPropagation()} className="relative max-h-[85vh] w-full max-w-lg">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close announcement"
          className="absolute -top-3 -right-3 z-10 grid size-8 place-items-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-muted"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {isImage ? (
          hasLink ? (
            <Link href={link!} target={external ? "_blank" : undefined} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl!} alt={text?.trim() || "Announcement"} className="max-h-[85vh] w-full rounded-2xl object-contain shadow-2xl" />
            </Link>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl!} alt={text?.trim() || "Announcement"} className="max-h-[85vh] w-full rounded-2xl object-contain shadow-2xl" />
          )
        ) : (
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-background p-8 text-center shadow-2xl">
            <p className="text-lg leading-relaxed font-medium whitespace-pre-line">{text}</p>
            {hasLink && (
              <Link
                href={link!}
                target={external ? "_blank" : undefined}
                onClick={dismiss}
                className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Learn more
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
