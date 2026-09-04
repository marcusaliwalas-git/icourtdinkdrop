"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  pathname,
  className,
  children,
}: {
  href: string;
  pathname: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "border-b-2 border-transparent py-1 transition-colors",
        isActive ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </Link>
  );
}

// `isAdmin` is resolved server-side (see RootLayout → isVenueAdmin) and means "admin of THIS
// venue" — so the shortcut never shows on a venue you don't administer. It's only a convenience;
// /admin is independently guarded by requireAdmin server-side.
export function SiteHeader({
  logoUrl,
  brandName,
  isAdmin = false,
  coachesEnabled = true,
}: {
  logoUrl?: string | null;
  brandName?: string | null;
  isAdmin?: boolean;
  coachesEnabled?: boolean;
}) {
  const pathname = usePathname();

  // Admin has its own layout/nav entirely.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center gap-5 p-4 text-sm">
        <Link href="/" aria-label={brandName ?? "Home"}>
          {logoUrl ? (
            // Tenant's own logo (public bucket URL) — a plain img avoids next/image remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName ?? ""} className="h-7 w-auto object-contain" />
          ) : brandName ? (
            <span className="text-base font-semibold">{brandName}</span>
          ) : (
            <Image src="/icourt-social-logo.png" alt="iCourt Social" width={903} height={438} className="h-7 w-auto" priority />
          )}
        </Link>
        <NavLink href="/" pathname={pathname}>Home</NavLink>
        <NavLink href="/book" pathname={pathname}>Book</NavLink>
        {coachesEnabled && <NavLink href="/coaches" pathname={pathname}>Coaches</NavLink>}
        <NavLink href="/bookings" pathname={pathname}>My bookings</NavLink>
        {isAdmin && (
          <NavLink href="/admin/venue" pathname={pathname} className="text-primary hover:text-primary">
            Admin
          </NavLink>
        )}
        <NavLink href="/account" pathname={pathname} className="ml-auto">
          Account
        </NavLink>
      </nav>
    </header>
  );
}
