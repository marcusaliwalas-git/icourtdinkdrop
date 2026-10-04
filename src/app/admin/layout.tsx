import Image from "next/image";
import { requireStaff, isSuperAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { featureEnabled } from "@/lib/features";
import { AdminNavLink } from "./nav-link";
import { AdminNavDropdown } from "./nav-dropdown";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both admins and front-desk staff enter here; front desk sees a reduced nav (the four
  // operational tabs) and admin-only pages guard themselves with requireAdmin().
  const { role, supabase } = await requireStaff();
  const isAdmin = role === "admin";
  const tenant = await getTenant();
  const superAdmin = await isSuperAdmin();
  const coachesEnabled = featureEnabled(tenant?.features, "coaches");
  const analyticsEnabled = featureEnabled(tenant?.features, "analytics");
  const expensesEnabled = featureEnabled(tenant?.features, "expenses");
  const officialMembersEnabled = featureEnabled(tenant?.features, "official_members");

  // Counts for the "needs review" badges on the nav. Bookings have no venue_id column, so scope via
  // the court's venue. Subscription requests are admin-only and venue-scoped.
  let pendingPayments = 0;
  let pendingRequests = 0;
  if (tenant) {
    const { count: payCount } = await supabase
      .from("bookings")
      .select("id, courts!inner(venue_id)", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("courts.venue_id", tenant.id);
    pendingPayments = payCount ?? 0;

    if (isAdmin && officialMembersEnabled) {
      const { count: reqCount } = await supabase
        .from("membership_requests")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", tenant.id)
        .eq("status", "pending");
      pendingRequests = reqCount ?? 0;
    }
  }

  const peopleItems = [
    { href: "/admin/members", label: "Members" },
    ...(officialMembersEnabled
      ? [{ href: "/admin/members/requests", label: "Subscription Requests", badge: pendingRequests }]
      : []),
    ...(analyticsEnabled ? [{ href: "/admin/customers", label: "Top Customers" }] : []),
    ...(coachesEnabled ? [{ href: "/admin/coaches", label: "Coaches" }] : []),
  ];
  const reportsItems = [
    ...(analyticsEnabled ? [{ href: "/admin/sales", label: "Sales" }] : []),
    ...(expensesEnabled ? [{ href: "/admin/expenses", label: "Expenses" }] : []),
    { href: "/admin/audit", label: "Audit Log" },
  ];

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-5xl items-center gap-5 p-4 text-sm">
          <AdminNavLink href="/admin" className="flex items-center gap-2 border-transparent" aria-label={`${tenant?.name ?? "Venue"} Admin`}>
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
          <AdminNavLink href="/admin/front-desk">Front desk</AdminNavLink>
          <AdminNavLink href="/admin/calendar">Calendar</AdminNavLink>
          <AdminNavLink href="/admin/bookings">Bookings</AdminNavLink>
          <AdminNavLink href="/admin/payments" badge={pendingPayments}>Payments</AdminNavLink>
          {isAdmin && <AdminNavDropdown label="People" items={peopleItems} />}
          {isAdmin && (
            <AdminNavDropdown
              label="Setup"
              items={[
                { href: "/admin/venue", label: "Venue & Courts" },
                { href: "/admin/homepage", label: "Home page" },
                { href: "/admin/announcement", label: "Announcement" },
                { href: "/admin/footer", label: "Footer" },
              ]}
            />
          )}
          {isAdmin && <AdminNavDropdown label="Reports" items={reportsItems} />}
          {superAdmin && <AdminNavLink href="/superadmin" className="ml-auto text-primary">Platform ↗</AdminNavLink>}
          <AdminNavLink href="/" className={superAdmin ? "" : "ml-auto"}>Back to site</AdminNavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
