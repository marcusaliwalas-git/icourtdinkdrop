import Image from "next/image";
import { requireAdmin, isSuperAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { AdminNavLink } from "./nav-link";
import { AdminNavDropdown } from "./nav-dropdown";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const tenant = await getTenant();
  const superAdmin = await isSuperAdmin();
  const coachesEnabled = featureEnabled(tenant?.features, "coaches");
  const analyticsEnabled = featureEnabled(tenant?.features, "analytics");

  const peopleItems = [
    { href: "/admin/members", label: "Members" },
    ...(analyticsEnabled ? [{ href: "/admin/customers", label: "Top Customers" }] : []),
    ...(coachesEnabled ? [{ href: "/admin/coaches", label: "Coaches" }] : []),
  ];
  const reportsItems = [
    ...(analyticsEnabled ? [{ href: "/admin/sales", label: "Sales" }] : []),
    { href: "/admin/audit", label: "Audit Log" },
  ];

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
          <AdminNavLink href="/admin/calendar">Calendar</AdminNavLink>
          <AdminNavLink href="/admin/bookings">Bookings</AdminNavLink>
          <AdminNavLink href="/admin/payments">Payments</AdminNavLink>
          <AdminNavDropdown label="People" items={peopleItems} />
          <AdminNavDropdown
            label="Setup"
            items={[
              { href: "/admin/venue", label: "Venue & Courts" },
              { href: "/admin/homepage", label: "Home page" },
              { href: "/admin/announcement", label: "Announcement" },
              { href: "/admin/footer", label: "Footer" },
            ]}
          />
          <AdminNavDropdown label="Reports" items={reportsItems} />
          {superAdmin && <AdminNavLink href="/superadmin" className="ml-auto text-primary">Platform ↗</AdminNavLink>}
          <AdminNavLink href="/" className={superAdmin ? "" : "ml-auto"}>Back to site</AdminNavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
