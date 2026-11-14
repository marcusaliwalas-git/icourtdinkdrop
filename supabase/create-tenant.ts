/**
 * Onboard a new tenant (venue) into the shared database, plus its first admin.
 *
 *   npx tsx --env-file=.env.local supabase/create-tenant.ts \
 *     --name "Acme Pickleball" --slug acme --admin-email owner@acme.com --admin-password 'secret123' \
 *     [--timezone Asia/Manila] [--domain acmepickleball.com]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from `supabase status` locally, or
 * the linked project's service-role key for production). Idempotent-ish: it errors clearly if the
 * slug/domain/email already exist rather than creating duplicates.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const name = arg("name");
const slug = arg("slug");
const adminEmail = arg("admin-email");
const adminPassword = arg("admin-password");
const timezone = arg("timezone") ?? "Asia/Manila";
const customDomain = arg("domain") ?? null;

if (!name || !slug || !adminEmail || !adminPassword) {
  console.error("Required: --name, --slug, --admin-email, --admin-password (optional: --timezone, --domain).");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("--slug must be lowercase letters, numbers, and hyphens only (it becomes a subdomain).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // 1. Venue (the tenant).
  const { data: venue, error: venueErr } = await supabase
    .from("venues")
    .insert({ name, slug, custom_domain: customDomain, timezone })
    .select("id")
    .single();
  if (venueErr) {
    console.error("Could not create the venue:", venueErr.message);
    process.exit(1);
  }
  const venueId = venue.id as string;
  console.log(`Venue created: ${name} (${venueId}), slug "${slug}"${customDomain ? `, domain ${customDomain}` : ""}`);

  // 2. Sensible defaults so the site isn't empty: full-week operating hours + one starter court.
  await supabase.from("operating_hours").insert(
    Array.from({ length: 7 }, (_, day) => ({
      venue_id: venueId,
      day_of_week: day,
      open_time: "06:00",
      close_time: "22:00",
    }))
  );
  await supabase.from("courts").insert({ venue_id: venueId, name: "Court 1", hourly_rate_cents: 50000, is_active: true });

  // 3. The venue's first admin — tagged with the venue via metadata so handle_new_user pins them
  //    to this tenant, then promoted to admin.
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { venue_id: venueId },
  });
  if (userErr || !created.user) {
    console.error("Venue was created, but the admin user failed:", userErr?.message);
    process.exit(1);
  }
  const { error: roleErr } = await supabase
    .from("profiles")
    .update({ role: "admin", venue_id: venueId })
    .eq("id", created.user.id);
  if (roleErr) {
    console.error("Admin user created, but promoting to admin failed:", roleErr.message);
    process.exit(1);
  }

  console.log(`Admin created: ${adminEmail}`);
  console.log("\nDone. Point the tenant's hostname at this deployment:");
  console.log(`  • subdomain:  ${slug}.<your root domain>`);
  if (customDomain) console.log(`  • custom domain: ${customDomain}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
