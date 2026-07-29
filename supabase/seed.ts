/**
 * Seeds realistic dummy data for local development: 1 venue, 6 courts, 30 members,
 * and a week of bookings, so the app is clickable without manually creating fixtures.
 * Run with `npm run seed` after `supabase start` (needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY from `supabase status` in .env.local).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill them in from `supabase status`.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const FIRST_NAMES = [
  "Miguel", "Andrea", "Carlo", "Bea", "Jomari", "Kristine", "Paolo", "Angel", "Enzo", "Mika",
  "Raphael", "Trisha", "Diego", "Nicole", "Gab", "Samantha", "Vince", "Erika", "Ryan", "Cassy",
  "Marco", "Joyce", "Lance", "Patricia", "Kevin", "Denise", "Aaron", "Franchesca", "Xavier", "Louise",
];
const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Del Rosario",
  "Aquino", "Villanueva", "Ramos", "Castillo", "Gonzales", "Fernandez",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function skillLevel(): number {
  const levels = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
  return randomFrom(levels);
}

async function main() {
  console.log("Seeding venue...");
  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .insert({
      name: "DinkDrop Pickleball Club — BGC",
      address: "9th Ave corner 31st St, Bonifacio Global City, Taguig",
      timezone: "Asia/Manila",
      contact: "+639171234567",
      amenities: ["Parking", "Showers", "Pro shop", "Water station"],
      min_lead_minutes: 60,
      max_advance_days: 14,
      cancellation_cutoff_hours: 3,
    })
    .select()
    .single();
  if (venueError) throw venueError;

  console.log("Seeding operating hours...");
  const hoursRows = Array.from({ length: 7 }, (_, day) => ({
    venue_id: venue.id,
    day_of_week: day,
    open_time: "06:00",
    close_time: "22:00",
  }));
  const { error: hoursError } = await supabase.from("operating_hours").insert(hoursRows);
  if (hoursError) throw hoursError;

  console.log("Seeding courts...");
  const courtSpecs = [
    { name: "Court 1", surface: "Cushioned acrylic", is_indoor: false, hourly_rate_cents: 60000, member_rate_cents: 45000 },
    { name: "Court 2", surface: "Cushioned acrylic", is_indoor: false, hourly_rate_cents: 60000, member_rate_cents: 45000 },
    { name: "Court 3", surface: "Cushioned acrylic", is_indoor: false, hourly_rate_cents: 60000, member_rate_cents: 45000 },
    { name: "Court 4 (Indoor)", surface: "Hardwood", is_indoor: true, hourly_rate_cents: 80000, member_rate_cents: 60000 },
    { name: "Court 5 (Indoor)", surface: "Hardwood", is_indoor: true, hourly_rate_cents: 80000, member_rate_cents: 60000 },
    { name: "Court 6", surface: "Cushioned acrylic", is_indoor: false, hourly_rate_cents: 55000, member_rate_cents: null },
  ];
  const { data: courts, error: courtsError } = await supabase
    .from("courts")
    .insert(courtSpecs.map((c) => ({ ...c, venue_id: venue.id, is_active: true })))
    .select();
  if (courtsError) throw courtsError;

  console.log("Seeding 30 members...");
  const profileIds: string[] = [];
  for (let i = 0; i < 30; i++) {
    const firstName = FIRST_NAMES[i];
    const lastName = randomFrom(LAST_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, "")}${i}@dinkdrop.test`;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}` },
    });
    if (createError) {
      console.warn(`  skip ${email}: ${createError.message}`);
      continue;
    }
    const profileId = created.user.id;
    profileIds.push(profileId);

    const role = i === 0 ? "admin" : i <= 2 ? "organizer" : "player";
    await supabase
      .from("profiles")
      .update({
        phone: `+639${String(170000000 + i).padStart(9, "0")}`,
        skill_level: skillLevel(),
        role,
      })
      .eq("id", profileId);

    if (i % 2 === 0) {
      await supabase.from("memberships").insert({
        profile_id: profileId,
        tier: i % 4 === 0 ? "premium" : "standard",
        starts_on: new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10),
        ends_on: new Date(Date.now() + 300 * 86400_000).toISOString().slice(0, 10),
        status: "active",
      });
    }
  }
  console.log(`  created ${profileIds.length} members (index 0 = admin, 1-2 = organizers)`);

  console.log("Seeding a week of bookings...");
  const guestPool: [string, string][] = [
    ["Anton Villareal", "+639181112222"],
    ["Bianca Salcedo", "+639182223333"],
    ["Carlos Ibanez", "+639183334444"],
  ];
  let bookingCount = 0;
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date();
    day.setDate(day.getDate() + dayOffset);
    const dateStr = day.toISOString().slice(0, 10);

    // A handful of bookings per day across random courts/hours, skipping anything
    // inside the venue's 60-minute lead time (only matters for dayOffset === 0).
    const slotsToday = dayOffset === 0 ? 3 : 5;
    for (let s = 0; s < slotsToday; s++) {
      const hour = 8 + Math.floor(Math.random() * 12); // 08:00-19:00 local start
      const startsAt = new Date(`${dateStr}T00:00:00+08:00`);
      startsAt.setHours(startsAt.getHours() + hour);
      if (startsAt.getTime() < Date.now() + 90 * 60_000) continue; // respect lead time

      const court = randomFrom(courts);
      const duration = randomFrom([30, 60, 90]);
      const useMember = Math.random() < 0.6 && profileIds.length > 0;

      const rpcArgs: Record<string, unknown> = {
        p_court_id: court.id,
        p_starts_at: startsAt.toISOString(),
        p_duration_minutes: duration,
        p_party_size: 2 + Math.floor(Math.random() * 3),
        p_source: "online",
      };
      if (useMember) {
        rpcArgs.p_booked_by = randomFrom(profileIds);
      } else {
        const [name, phone] = randomFrom(guestPool);
        rpcArgs.p_guest_name = name;
        rpcArgs.p_guest_phone = phone;
      }

      const { error } = await supabase.rpc("create_booking", rpcArgs);
      if (error) {
        // Conflicts are expected occasionally since slots are randomly chosen; skip quietly.
        if (error.code !== "23P01") console.warn(`  booking skipped: ${error.message}`);
        continue;
      }
      bookingCount++;
    }
  }
  console.log(`  created ${bookingCount} bookings`);

  console.log("\nDone. Admin login: index-0 member's email above (magic link) — check `supabase status` Inbucket URL to view local emails.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
