import Image from "next/image";
import { requireAdmin, isSuperAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { AdminNavLink } from "./nav-link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const tenant = await getTenant();
  const superAdmin = await isSuperAdmin();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-5xl items-center gap-5 p-4 text-sm">
          <AdminNavLink href="/admin/venue" className="flex items-center gap-2 border-transparent" aria-label={`${tenant?.name ?? "Venue"} Admin`}>
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="" className="h-6 w-auto object-contain" />
            ) : tenant?.name ? (
              <span className="text-sm font-semibold">{tenant.name}</span>
            ) : (
              <Image src="/icourt-social-logo.png" alt="" width={903} height={438} className="h-6 w-auto" priority />
            )}
            <span className="font-mono text-[0.65rem] tracking-[0.15em] text-muted-foreground uppercase">Admin</span>
          </AdminNavLink>
          <AdminNavLink href="/admin/venue">Venue &amp; Courts</AdminNavLink>
          <AdminNavLink href="/admin/homepage">Home page</AdminNavLink>
          <AdminNavLink href="/admin/calendar">Calendar</AdminNavLink>
          <AdminNavLink href="/admin/bookings">Bookings</AdminNavLink>
          <AdminNavLink href="/admin/customers">Top Customers</AdminNavLink>
          <AdminNavLink href="/admin/coaches">Coaches</AdminNavLink>
          <AdminNavLink href="/admin/sales">Sales</AdminNavLink>
          <AdminNavLink href="/admin/members">Members</AdminNavLink>
          <AdminNavLink href="/admin/audit">Audit Log</AdminNavLink>
          {superAdmin && <AdminNavLink href="/superadmin" className="ml-auto text-primary">Platform ↗</AdminNavLink>}
          <AdminNavLink href="/" className={superAdmin ? "" : "ml-auto"}>Back to site</AdminNavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
