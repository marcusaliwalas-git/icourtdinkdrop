"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNavLink({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "border-b-2 border-transparent py-1 transition-colors",
        isActive ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
