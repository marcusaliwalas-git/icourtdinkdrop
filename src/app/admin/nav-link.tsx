"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** A small count pill for "N items need attention" on a nav tab. Renders nothing when count is 0. */
export function NavBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[0.65rem] font-semibold text-white tabular-nums"
      aria-label={`${count} awaiting review`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AdminNavLink({
  href,
  className,
  children,
  badge,
  ...props
}: React.ComponentProps<typeof Link> & { badge?: number }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex items-center border-b-2 border-transparent py-1 transition-colors",
        isActive ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
      <NavBadge count={badge} />
    </Link>
  );
}
