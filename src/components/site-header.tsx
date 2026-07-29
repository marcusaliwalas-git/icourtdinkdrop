"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 p-4 text-sm">
        <Link href="/book" className="font-semibold">
          DinkDrop
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
