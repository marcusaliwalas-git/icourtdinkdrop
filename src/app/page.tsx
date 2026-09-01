import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeLiveStatus } from "@/lib/home-status";
import { minutesToLabel, timeToMinutes } from "@/lib/home-status";
import { formatInTimezone, startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { allRatesCents } from "@/lib/pricing";
import { getTenant } from "@/lib/tenant";
import { DEFAULT_HOW_NOTE, DEFAULT_HOW_STEPS } from "@/lib/home-defaults";

export const dynamic = "force-dynamic";

function pesos(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open now",
  booked: "In use",
  closed: "Closed",
};

export default async function HomePage() {
  const supabase = await createClient();
  const venue = await getTenant();

  if (!venue) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg">iCourt Social is getting set up.</p>
          <p className="mt-2 text-sm text-muted-foreground">Check back soon, or sign in as an admin to configure a venue.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const today = formatInTimezone(now, "yyyy-MM-dd", venue.timezone);
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, is_indoor, surface, hourly_rate_cents, member_rate_cents")
    .eq("venue_id", venue.id)
    .eq("is_active", true)
    .order("name");

  const { data: sections } = await supabase
    .from("venue_sections")
    .select("id, title, body, media_url, media_type")
    .eq("venue_id", venue.id)
    .eq("is_visible", true)
    .order("sort_order");

  const howSteps = venue.how_steps?.length ? venue.how_steps : DEFAULT_HOW_STEPS;
  const howNote = venue.how_note_hidden ? null : (venue.how_note ?? DEFAULT_HOW_NOTE);

  const courtIds = (courts ?? []).map((c) => c.id);
  const dayStart = startOfLocalDayUtc(today, venue.timezone);
  const dayEnd = endOfLocalDayUtc(today, venue.timezone);

  const [{ data: dayHours }, { data: prevDayHours }, { data: bookedSlots }, { data: ratePeriods }] = await Promise.all([
    supabase
      .from("operating_hours")
      .select("open_time, close_time, closes_next_day")
      .eq("venue_id", venue.id)
      .eq("day_of_week", dayOfWeek),
    supabase
      .from("operating_hours")
      .select("open_time, close_time, closes_next_day")
      .eq("venue_id", venue.id)
      .eq("day_of_week", (dayOfWeek + 6) % 7),
    courtIds.length
      ? supabase
          .from("booking_slots")
          .select("court_id, time_range")
          .in("court_id", courtIds)
          .filter("time_range", "ov", `[${dayStart.toISOString()},${dayEnd.toISOString()})`)
      : Promise.resolve({ data: [] as { court_id: string; time_range: string }[] }),
    courtIds.length
      ? supabase.from("court_rate_periods").select("court_id, start_time, end_time, hourly_rate_cents, member_rate_cents").in("court_id", courtIds)
      : Promise.resolve({ data: [] as { court_id: string; start_time: string; end_time: string; hourly_rate_cents: number; member_rate_cents: number | null }[] }),
  ]);

  const ratePeriodsByCourtId: Record<string, NonNullable<typeof ratePeriods>> = {};
  for (const period of ratePeriods ?? []) {
    (ratePeriodsByCourtId[period.court_id] ??= []).push(period);
  }

  const status = computeLiveStatus({
    now,
    timezone: venue.timezone,
    dayHours: dayHours ?? [],
    prevDayHours: prevDayHours ?? [],
    courts: (courts ?? []).map((c) => ({ id: c.id, name: c.name, is_indoor: c.is_indoor })),
    bookedSlots: bookedSlots ?? [],
  });

  // Considers every court's flat rate plus any time-based rate periods, so a venue with
  // peak/off-peak pricing shows its real range instead of just the base rate.
  const guestRates = (courts ?? []).flatMap((c) =>
    allRatesCents({
      baseHourlyRateCents: c.hourly_rate_cents,
      baseMemberRateCents: c.member_rate_cents,
      ratePeriods: ratePeriodsByCourtId[c.id] ?? [],
      isMember: false,
    })
  );
  const memberRates = (courts ?? []).flatMap((c) =>
    (ratePeriodsByCourtId[c.id] ?? []).some((p) => p.member_rate_cents != null) || c.member_rate_cents != null
      ? allRatesCents({
          baseHourlyRateCents: c.hourly_rate_cents,
          baseMemberRateCents: c.member_rate_cents,
          ratePeriods: ratePeriodsByCourtId[c.id] ?? [],
          isMember: true,
        })
      : []
  );
  const minRate = guestRates.length ? Math.min(...guestRates) : null;
  const maxRate = guestRates.length ? Math.max(...guestRates) : null;
  const minMemberRate = memberRates.length ? Math.min(...memberRates) : null;
  const hasTimeBasedRates = Object.values(ratePeriodsByCourtId).some((periods) => periods.length > 0);

  const indoorCount = (courts ?? []).filter((c) => c.is_indoor).length;
  const outdoorCount = (courts ?? []).length - indoorCount;

  const todaysHoursLabel =
    dayHours && dayHours.length > 0
      ? `${minutesToLabel(Math.min(...dayHours.map((h) => timeToMinutes(h.open_time))))} – ${minutesToLabel(
          Math.max(...dayHours.map((h) => timeToMinutes(h.close_time)))
        )}`
      : "Closed today";

  const directionsHref = venue.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`
    : null;

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pt-10 pb-10">
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">
          {venue.name}
        </p>
        <h1 className="mt-3 text-[2.75rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
          {venue.hero_heading ? (
            venue.hero_heading
          ) : (
            <>
              See what&apos;s open.
              <br />
              Book it. Play tonight.
            </>
          )}
        </h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground">
          {venue.hero_subheading ??
            "Real-time court availability, no account needed. Reserve in about 30 seconds and pay when you arrive."}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link
            href="/book"
            className="rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
          >
            Book a court
          </Link>
          <span className="text-xs text-muted-foreground">No card, no sign-up required.</span>
        </div>
        {venue.hero_media_url &&
          (venue.hero_media_type === "video" ? (
            <video
              src={venue.hero_media_url}
              className="mt-8 aspect-video w-full rounded-2xl border border-border object-cover"
              autoPlay
              muted
              loop
              playsInline
              // `controls` is the fallback: when a browser blocks muted-autoplay the visitor can still
              // press play, so the hero is never a dead frame.
              controls
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={venue.hero_media_url}
              alt=""
              className="mt-8 aspect-video w-full rounded-2xl border border-border object-cover"
            />
          ))}
      </section>

      <CourtLineDivider />

      {/* ── Live status board ──────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Court status
          </h2>
          <span className="font-mono text-xs text-muted-foreground">
            {formatInTimezone(now, "h:mm a", venue.timezone)} today
          </span>
        </div>

        {status.courts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courts configured yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {status.courts.map((court, i) => (
              <div
                key={court.id}
                style={{ animationDelay: `${i * 60}ms` }}
                className="motion-safe:[animation:board-row-in_0.4s_ease-out_both] flex items-center justify-between border-b border-border px-5 py-3.5 last:border-0"
              >
                <span className="font-mono text-sm">
                  {court.name}
                  {court.isIndoor && <span className="ml-2 text-muted-foreground">indoor</span>}
                </span>
                <span
                  className={`flex items-center gap-2 font-mono text-xs tracking-wide uppercase ${
                    court.status === "open"
                      ? "text-primary"
                      : court.status === "booked"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      court.status === "open" ? "bg-primary motion-safe:animate-pulse" : "bg-current"
                    }`}
                  />
                  {STATUS_LABEL[court.status]}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-sm text-muted-foreground">
          {status.isOpenNow
            ? `${status.openCourtsCount} of ${status.totalCourts} courts open right now.`
            : status.nextOpenLabel
              ? `Closed right now — opens today at ${status.nextOpenLabel}.`
              : "Closed for the day — see tomorrow's schedule."}
        </p>
      </section>

      {/* ── Venue's own content sections ───────────────────────── */}
      {(sections ?? []).map((s) => (
        <div key={s.id}>
          <CourtLineDivider />
          <section className="mx-auto max-w-3xl px-5 py-10">
            {s.title && (
              <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">{s.title}</h2>
            )}
            {s.media_url &&
              (s.media_type === "video" ? (
                <video
                  src={s.media_url}
                  className="mb-4 aspect-video w-full rounded-2xl border border-border object-cover"
                  controls
                  playsInline
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.media_url} alt="" className="mb-4 w-full rounded-2xl border border-border object-cover" />
              ))}
            {s.body && <p className="text-base leading-relaxed whitespace-pre-line text-muted-foreground">{s.body}</p>}
          </section>
        </div>
      ))}

      <CourtLineDivider />

      {/* ── How it works ───────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          How it works
        </h2>
        <div className="font-heading flex flex-wrap items-center gap-x-3 gap-y-2 text-xl font-medium sm:text-2xl">
          {howSteps.map((step: string, i: number) => (
            <span key={i} className="flex items-center gap-x-3">
              {i > 0 && <span className="text-primary">→</span>}
              <span>{step}</span>
            </span>
          ))}
        </div>
        {howNote && <p className="mt-3 text-sm text-muted-foreground">{howNote}</p>}
      </section>

      <CourtLineDivider />

      {/* ── The club ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          The club
        </h2>
        <h3 className="text-2xl font-bold">{venue.name}</h3>
        {venue.address && <p className="mt-1 text-sm text-muted-foreground">{venue.address}</p>}

        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Today&apos;s hours</dt>
            <dd className="mt-0.5">{todaysHoursLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Courts</dt>
            <dd className="mt-0.5">
              {(courts ?? []).length} total
              {(courts ?? []).length > 0 &&
                ` (${outdoorCount} outdoor, ${indoorCount} indoor)`}
            </dd>
          </div>
          {venue.contact && (
            <div>
              <dt className="text-muted-foreground">Contact</dt>
              <dd className="mt-0.5">{venue.contact}</dd>
            </div>
          )}
        </dl>

        {venue.amenities && venue.amenities.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {venue.amenities.map((a: string) => (
              <span
                key={a}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
              >
                {a}
              </span>
            ))}
          </div>
        )}

        {directionsHref && (
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block text-sm underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground"
          >
            Get directions
          </a>
        )}
      </section>

      <CourtLineDivider />

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Pricing
        </h2>
        {minRate != null && maxRate != null ? (
          <p className="text-2xl font-bold">
            {minRate === maxRate ? pesos(minRate) : `${pesos(minRate)}–${pesos(maxRate)}`}
            <span className="text-base font-normal text-muted-foreground"> /hr for guests</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Pricing coming soon.</p>
        )}
        {minMemberRate != null && (
          <p className="mt-1 text-sm text-muted-foreground">Members from {pesos(minMemberRate)}/hr.</p>
        )}
        {hasTimeBasedRates && (
          <p className="mt-1 text-sm text-muted-foreground">Rates vary by time of day — see exact pricing when you book.</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          No card required — pay cash or GCash at the counter.
        </p>
      </section>

      {/* ── Closing CTA + footer ────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pt-4 pb-12 text-center">
        <Link
          href="/book"
          className="inline-block rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
        >
          Book a court
        </Link>
        <div className="mt-8 flex justify-center gap-5 text-xs text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/bookings/guest" className="hover:text-foreground">
            Manage a guest booking
          </Link>
        </div>
      </section>
    </div>
  );
}

/** A simplified pickleball court line-crossing (kitchen line + centerline) used as a
 * structural divider between sections instead of a generic hairline rule. */
function CourtLineDivider() {
  return (
    <div className="mx-auto max-w-3xl px-5" aria-hidden="true">
      <svg viewBox="0 0 400 16" preserveAspectRatio="none" className="h-4 w-full text-border">
        <line x1="0" y1="8" x2="400" y2="8" stroke="currentColor" strokeWidth="1" />
        <line x1="200" y1="2" x2="200" y2="14" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  );
}
