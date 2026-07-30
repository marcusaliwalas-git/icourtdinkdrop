"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  // The home page has its own bespoke top bar; admin has its own layout/nav entirely.
  if (pathname === "/" || pathname?.startsWith("/admin")) return null;

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 p-4 text-sm">
        <Link href="/book" className="font-heading font-bold">
          DinkDrop
        </Link>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Home
        </Link>
        <Link href="/book" className="text-muted-foreground hover:text-foreground">
          Book
        </Link>
        <Link href="/bookings" className="text-muted-foreground hover:text-foreground">
          My bookings
        </Link>
        <Link href="/account" className="ml-auto text-muted-foreground hover:text-foreground">
          Account
        </Link>
      </nav>
    </header>
  );
}
