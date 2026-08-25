"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

export function SiteHeader() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  // Show the "Admin" shortcut only to a signed-in admin. Checked client-side (the header is
  // already a client component) — a user can read their own profile.role under RLS, and the
  // /admin routes are still independently guarded server-side by requireAdmin, so this link
  // is only a convenience, never the access-control boundary.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (active) setIsAdmin(profile?.role === "admin");
    })();
    return () => {
      active = false;
    };
  }, [pathname]);

  // Admin has its own layout/nav entirely.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center gap-5 p-4 text-sm">
        <Link href="/" aria-label="iCourt Social">
          <Image src="/icourt-social-logo.png" alt="iCourt Social" width={903} height={438} className="h-7 w-auto" priority />
        </Link>
        <NavLink href="/" pathname={pathname}>Home</NavLink>
        <NavLink href="/book" pathname={pathname}>Book</NavLink>
        <NavLink href="/coaches" pathname={pathname}>Coaches</NavLink>
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
