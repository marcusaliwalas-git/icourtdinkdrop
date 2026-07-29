import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 p-4 text-sm">
          <span className="font-semibold">DinkDrop Admin</span>
          <Link href="/admin/venue" className="text-muted-foreground hover:text-foreground">
            Venue &amp; Courts
          </Link>
          <Link href="/admin/calendar" className="text-muted-foreground hover:text-foreground">
            Calendar
          </Link>
          <Link href="/admin/members" className="text-muted-foreground hover:text-foreground">
            Members
          </Link>
          <Link href="/admin/audit" className="text-muted-foreground hover:text-foreground">
            Audit Log
          </Link>
          <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
            Back to site
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
