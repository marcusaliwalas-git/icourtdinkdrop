"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Consent is a once-per-browser acknowledgement, so it lives in localStorage (persists across visits),
// unlike the per-visit SiteAnnouncement. Bumping this key re-shows the notice to everyone.
const CONSENT_KEY = "dd-cookie-consent:v1";

/** A small, dismissible cookie notice for the customer-facing site. Essential-cookies only, so this is
 * an acknowledgement ("Got it"), not an opt-in/opt-out — matching the copy. */
export function CookieConsent() {
  const pathname = usePathname();
  // Operational surfaces (admin / super admin) are staff tools, not the public booking site.
  const hidden = pathname?.startsWith("/admin") || pathname?.startsWith("/superadmin");

  // Start hidden and reveal after the mount check so a previously-dismissed notice never flashes, and
  // so server and first client render agree (nothing rendered).
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (hidden) {
      setShow(false);
      return;
    }
    try {
      setShow(localStorage.getItem(CONSENT_KEY) !== "1");
    } catch {
      setShow(true); // storage blocked — show it rather than hide it
    }
  }, [hidden]);

  function accept() {
    try {
      localStorage.setItem(CONSENT_KEY, "1");
    } catch {
      /* storage blocked — just close for this view */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4" role="dialog" aria-label="Cookie notice" aria-live="polite">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 rounded-xl border border-border bg-popover p-4 shadow-lg">
        <p className="text-sm text-muted-foreground">
          We use only what&rsquo;s needed to keep you signed in and to run this booking site. No analytics or
          advertising cookies, and we never sell your data. See our{" "}
          <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <Button onClick={accept} className="w-full">
          Got it
        </Button>
      </div>
    </div>
  );
}
