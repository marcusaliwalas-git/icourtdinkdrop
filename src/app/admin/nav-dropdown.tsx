"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Item = { href: string; label: string };

/** A grouped admin-nav menu: a trigger that opens a dropdown of related pages. The trigger reads
 * as active (and names the open child) whenever the current route is one of its items. */
export function AdminNavDropdown({ label, items }: { label: string; items: Item[] }) {
  const pathname = usePathname();
  const active = items.find((it) => pathname === it.href || pathname?.startsWith(`${it.href}/`));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1 border-b-2 border-transparent py-1 outline-none transition-colors",
          active ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {active ? active.label : label}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((it) => (
          <DropdownMenuItem key={it.href} asChild>
            <Link href={it.href} aria-current={active?.href === it.href ? "page" : undefined}>
              {it.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
