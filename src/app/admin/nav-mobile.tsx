"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavBadge } from "./nav-link";

export type MobileNavItem = { href: string; label: string; badge?: number; accent?: boolean };
export type MobileNavSection = { label?: string; items: MobileNavItem[] };

/** The admin nav collapsed into a tap-to-open menu for phones. The full inline nav doesn't fit a
 * phone's width (items overflow off-screen and the brand collides with the first tab), so below the
 * `md` breakpoint this replaces it. Sections mirror the desktop groups. */
export function AdminMobileNav({ sections }: { sections: MobileNavSection[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const totalBadge = sections.reduce(
    (sum, s) => sum + s.items.reduce((n, it) => n + (it.badge ?? 0), 0),
    0
  );

  // Close the menu whenever the route changes (i.e. after tapping an item).
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-9 items-center justify-center rounded-md border border-input text-foreground"
      >
        {open ? <XIcon size={18} /> : <MenuIcon size={18} />}
        {!open && totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500" aria-hidden />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-11 right-0 z-50 max-h-[80vh] w-60 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
            {sections.map((section, i) => (
              <div key={i} className={cn(i > 0 && "mt-1 border-t border-border/60 pt-1")}>
                {section.label && (
                  <p className="px-3 pt-1 pb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {section.label}
                  </p>
                )}
                {section.items.map((it) => {
                  const active = pathname === it.href || pathname?.startsWith(`${it.href}/`);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        it.accent && !active && "text-primary"
                      )}
                    >
                      <span className="inline-flex items-center">
                        {it.label}
                        <NavBadge count={it.badge} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
