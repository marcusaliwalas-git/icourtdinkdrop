import { requireAdmin } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Help & how-tos" };

/** In-app operator guide, reached from Setup › Help. Static content — mirrors the standalone
 * Court Handbook, styled with the app's own tokens so it follows the venue theme. */

type Role = "players" | "desk" | "admin";
const ROLE_LABEL: Record<Role, string> = { players: "Players", desk: "Front desk", admin: "Admin" };
const ROLE_CLASS: Record<Role, string> = {
  players: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  desk: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  admin: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
};

function RoleChips({ roles }: { roles: Role[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <span key={r} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_CLASS[r]}`}>
          {ROLE_LABEL[r]}
        </span>
      ))}
    </div>
  );
}

function Section({ id, title, roles, children }: { id: string; title: string; roles: Role[]; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border/60 pt-8">
      <RoleChips roles={roles} />
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-1 h-0.5 w-10 rounded bg-primary" />
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Literal in-app navigation path, e.g. Setup › Venue & Courts. */
function Path({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.82em] font-medium whitespace-nowrap text-primary">
      {children}
    </span>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Callout({ variant = "info", title, children }: { variant?: "info" | "warn"; title: string; children: React.ReactNode }) {
  const bar = variant === "warn" ? "border-l-amber-500" : "border-l-primary";
  const head = variant === "warn" ? "text-amber-700 dark:text-amber-400" : "text-primary";
  return (
    <div className={`rounded-md border border-border border-l-4 bg-card p-3.5 ${bar}`}>
      <p className={`text-xs font-semibold tracking-wide uppercase ${head}`}>{title}</p>
      <p className="mt-1 text-sm text-foreground/90">{children}</p>
    </div>
  );
}

const QUICK_NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: "Players",
    items: [
      { id: "booking", label: "Book a court" },
      { id: "addons", label: "Equipment & coaching" },
      { id: "my-bookings", label: "Manage bookings" },
      { id: "membership", label: "Membership" },
      { id: "account", label: "Account" },
    ],
  },
  {
    group: "Front desk & bookings",
    items: [
      { id: "front-desk", label: "Front-desk board" },
      { id: "walkins", label: "Walk-ins" },
      { id: "calendar", label: "Calendar" },
      { id: "bookings", label: "Bookings & actions" },
      { id: "payments", label: "Payments" },
    ],
  },
  {
    group: "Your venue",
    items: [
      { id: "venue-setup", label: "Venue & courts" },
      { id: "promotions", label: "Promotions" },
      { id: "members-admin", label: "Members & requests" },
      { id: "coaches-admin", label: "Coaches" },
      { id: "site", label: "Public site" },
      { id: "reports", label: "Reports" },
      { id: "reference", label: "Reference" },
    ],
  },
];

export default async function AdminHelpPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Help</p>
      <h1 className="mt-1 text-2xl font-bold">Help &amp; how-tos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A guide to everything in the app — for your players, your front desk, and you. Jump to a topic below.
      </p>

      {/* Quick nav */}
      <nav className="mt-5 grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        {QUICK_NAV.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.group}</p>
            <ul className="space-y-1">
              {g.items.map((it) => (
                <li key={it.id}>
                  <a href={`#${it.id}`} className="text-sm text-foreground hover:text-primary hover:underline">
                    {it.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-8 space-y-8">
        <Section id="overview" title="What this app does" roles={["players", "desk", "admin"]}>
          <p>
            Your venue runs end to end here: players book and pay for courts online, staff manage the day from a
            live board, and you set prices, promotions, memberships, and equipment — all against one shared
            schedule.
          </p>
          <Callout title="Good to know">
            Some features are switched on per venue — memberships, coaching, expenses, and analytics may or may not
            appear in your menus. If a section below isn&apos;t in your app, it isn&apos;t enabled for your venue yet.
          </Callout>
        </Section>

        <Section id="booking" title="Book a court" roles={["players"]}>
          <p>
            Every open slot shows its price per hour — a member&apos;s rate if they&apos;re an active member. Players tap
            slots to build a cart, then review and pay once for all of them.
          </p>
          <h3 className="pt-1 font-semibold text-foreground">Find a time</h3>
          <p>
            From <Path>Book</Path>, pick a day (Today, Tomorrow, This weekend, or a date within your advance window),
            then choose a view:
          </p>
          <Bullets
            items={[
              <><strong>Grid</strong> — courts across the top, hours down the side.</>,
              <><strong>Timeline</strong> — a track per court with a &quot;now&quot; line for today.</>,
              <><strong>Find a time</strong> — enter a length and it lists the open windows.</>,
            ]}
          />
          <h3 className="pt-1 font-semibold text-foreground">Build a cart and pay</h3>
          <Steps
            items={[
              "Tap open (green) slots to add them — across courts and times. Contiguous hours on one court join into a single booking, and the running total shows any promo discount already applied.",
              <>Choose <strong>Continue</strong> to review, add equipment or a coach, and confirm the total.</>,
              "Transfer the total via GCash or bank to the account shown, then attach proof of payment (a reference number is optional).",
              <>Choose <strong>Request booking</strong>. Slots are held as pending until you confirm the payment; the player gets an email once it&apos;s confirmed.</>,
            ]}
          />
          <Callout title="Good to know">
            Discounts apply automatically at checkout — no codes. The cart names each promo that applied (for example,
            &quot;Promo discount (Early Bird Special)&quot;) so players see their savings before paying.
          </Callout>
        </Section>

        <Section id="addons" title="Equipment & coaching" roles={["players"]}>
          <h3 className="font-semibold text-foreground">Rent equipment</h3>
          <p>In the review step, players set quantities with − / +. Each item shows how it&apos;s charged:</p>
          <Bullets
            items={[
              <><strong>Per hour</strong> (e.g. &quot;₱100/hr&quot;) — billed across the booking&apos;s length.</>,
              <><strong>Flat</strong> (e.g. &quot;₱300 flat&quot;) — one charge for the whole rental, however long they play.</>,
            ]}
          />
          <p>Availability is live, so only what&apos;s free for that time is offered.</p>
          <h3 className="pt-1 font-semibold text-foreground">Add a coach</h3>
          <p>
            If coaching is offered, players pick a coach in the review step, or browse <Path>Coaches</Path> and choose
            <strong> Request a session</strong>. Coaching is charged on top of the court and is never discounted by
            court promos.
          </p>
        </Section>

        <Section id="my-bookings" title="Manage your bookings" roles={["players"]}>
          <p>
            Signed in, a player opens <Path>My bookings</Path> to see upcoming and past play, reference codes, and the
            court guidelines.
          </p>
          <Bullets
            items={[
              <><strong>Reschedule</strong> — move a not-yet-started booking to another open slot. Equipment and coach add-ons move with it, and any price difference is shown first.</>,
              <><strong>Cancel</strong> — release a booking that hasn&apos;t started.</>,
            ]}
          />
          <Callout title="Booked as a guest?">
            Players who booked without an account use the <strong>Manage your booking</strong> link from their
            confirmation — no sign-in needed.
          </Callout>
        </Section>

        <Section id="membership" title="Become a member" roles={["players"]}>
          <p>
            If membership is offered, <Path>Membership</Path> shows the tiers and their member rates. Members get the
            member price automatically wherever it applies.
          </p>
          <Steps
            items={[
              <>Open <Path>Membership</Path> and choose a tier.</>,
              "Fill in any details the tier asks for, then submit payment proof like a booking.",
              "They get an email confirming the request was received, then a second email when you approve or decline it.",
            ]}
          />
          <Callout title="Good to know">
            Only one membership is active at a time; on renewal or a tier change, the latest-ending one counts.
          </Callout>
        </Section>

        <Section id="account" title="Your account" roles={["players"]}>
          <p>
            Players open <Path>Account</Path> to see their sign-in email and keep their name and mobile number up to
            date — the number you use to reach them about a booking. To change a password, sign out and use
            <strong> Reset password</strong> on the sign-in screen.
          </p>
        </Section>

        <Section id="front-desk" title="The front-desk board" roles={["desk"]}>
          <p>
            <Path>Front desk</Path> is the live view of today&apos;s play, grouped by time. Use it at the counter to
            greet players and settle each booking as they arrive.
          </p>
          <Bullets
            items={[
              <><strong>Check in</strong> — mark a player as arrived (the board tracks how many of each group are in).</>,
              <><strong>Mark paid</strong> — record payment taken at the desk.</>,
              <><strong>Confirm booking</strong> — approve a pending booking on the spot.</>,
              <><strong>Mark no-show</strong> — for players who didn&apos;t turn up.</>,
            ]}
          />
          <p>You can also start a <strong>Walk-in</strong> straight from here.</p>
        </Section>

        <Section id="walkins" title="Walk-in bookings" roles={["desk", "admin"]}>
          <p>
            Book a court for someone in person from <Path>Calendar</Path> or the front desk. Walk-ins are charged the
            standard (non-member) rate, and active promotions still apply.
          </p>
          <h3 className="font-semibold text-foreground">One court</h3>
          <Steps
            items={[
              <>With multi-select off, tap an open slot&apos;s <strong>+ Walk-in</strong>.</>,
              "Enter the name (mobile optional), choose duration and payment method, and add equipment if needed.",
              <>Check the total — any promo shows by name — then <strong>Confirm walk-in</strong>.</>,
            ]}
          />
          <h3 className="pt-1 font-semibold text-foreground">Several courts at once (open play)</h3>
          <Steps
            items={[
              <>Turn on <strong>Multi-select</strong>, then tap open slots across courts and times.</>,
              <>Choose <strong>Book walk-ins</strong>, enter one name and payment for the session, add equipment once, and confirm — all slots book together under one payment.</>,
            ]}
          />
        </Section>

        <Section id="calendar" title="The calendar" roles={["admin", "desk"]}>
          <p>
            <Path>Calendar</Path> is the day&apos;s schedule across every court. Move between days with Prev / Today /
            Next or the date picker, and switch between <strong>Grid</strong>, <strong>Timeline</strong>, and
            <strong> Find a time</strong> — your chosen view is remembered.
          </p>
          <p>
            The colour key shows each slot&apos;s state. Tap an open slot to take a walk-in; tap a booked slot to open
            its details and actions. Use <strong>Export day CSV</strong> to download the day&apos;s bookings.
          </p>
        </Section>

        <Section id="bookings" title="Bookings & actions" roles={["admin"]}>
          <p>
            <Path>Bookings</Path> lists every reservation. Sort any column and filter by status, payment, court, date
            range, or search by name or reference. Slots paid together share a cart tag (🛒).
          </p>
          <p>
            Tap a row to open its detail sheet — the player, the charge breakdown (court, coaching, equipment, and any
            promo discount by name), payment proof, and these actions:
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>When to use it</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-medium text-foreground">Confirm</TableCell><TableCell>Approve a pending booking (or a whole cart at once).</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Record payment</TableCell><TableCell>Set or change the payment method for walk-in / admin bookings; add a bank &amp; reference for online payments.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Reschedule</TableCell><TableCell>Move a not-yet-started booking; add-ons move with it and the price difference is shown.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Cancel</TableCell><TableCell>Release a booking that hasn&apos;t started.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Mark no-show</TableCell><TableCell>For a booking whose time has passed and the player didn&apos;t arrive.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Void</TableCell><TableCell>Remove a mistaken or past booking from reports and free its slot. Needs a reason and stays in the audit log.</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
          <Callout variant="warn" title="Heads up">
            <strong>Cancel</strong> is for bookings that haven&apos;t started; <strong>Void</strong> fixes mistakes or
            past entries and always records your reason. Void is available on admin-created bookings that have already
            started.
          </Callout>
        </Section>

        <Section id="payments" title="Reviewing payments" roles={["admin"]}>
          <p>
            <Path>Payments</Path> collects online bookings waiting for you to check their transfer. The menu badges how
            many are waiting.
          </p>
          <Steps
            items={[
              "Each card is one payment. Read the receipt — slots, equipment, and any promo discount by name — down to the Total to verify.",
              "Open the attached proof and match it against the total and reference.",
              <>Choose <strong>Confirm</strong> to approve the whole booking (the player gets a confirmation email), or <strong>Reject</strong> if the proof doesn&apos;t match.</>,
            ]}
          />
        </Section>

        <Section id="venue-setup" title="Venue & courts" roles={["admin"]}>
          <p>
            <Path>Setup › Venue &amp; Courts</Path> is where your venue is configured, organised into tabs:
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tab</TableHead>
                  <TableHead>What you set here</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-medium text-foreground">Details</TableCell><TableCell>Name, address, contact, logo, timezone, the email bookings are sent from, and how far ahead players can book.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Courts</TableCell><TableCell>Add and name courts and their base hourly rate.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Hours</TableCell><TableCell>Operating hours, plus rate periods for time-of-day pricing (e.g. a higher evening rate).</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Payment</TableCell><TableCell>The GCash / bank accounts players pay into, and the methods you accept.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Membership</TableCell><TableCell>Membership tiers, their member rates, and any extra details a tier collects.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Equipment</TableCell><TableCell>Rentable items — rate, how it&apos;s charged (per hour or flat), stock, and max per booking.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Promotions</TableCell><TableCell>Automatic checkout discounts. See Promotions below.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Closures</TableCell><TableCell>Block off dates or times when courts aren&apos;t bookable.</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
          <h3 className="pt-1 font-semibold text-foreground">Add equipment with flat pricing</h3>
          <Steps
            items={[
              <>On the <strong>Equipment</strong> tab, add an item and set its <strong>Rate</strong>.</>,
              <>Under <strong>Charge</strong>, pick <em>Hourly</em> or <em>Flat</em>. Flat charges the rate once per rental; hourly bills across the booking.</>,
              <>Set <strong>Stock</strong> and an optional max per booking, then save.</>,
            ]}
          />
        </Section>

        <Section id="promotions" title="Promotions" roles={["admin"]}>
          <p>
            Promotions are automatic discounts applied at checkout — no codes. Add them under
            <Path> Setup › Venue &amp; Courts › Promotions</Path>. Each one shows on the cart and is recorded on the
            booking by name.
          </p>
          <h3 className="font-semibold text-foreground">Create a promotion</h3>
          <Steps
            items={[
              <>Choose <strong>Add promotion</strong> and pick a <strong>Type</strong> (see the reference table). The form adapts to the type.</>,
              "Give it a name players and staff will recognise — it's the name shown on carts, receipts, and booking details.",
              "Fill in the settings, choose who it applies to, whether it can combine with others (stackable), and optional start/end dates.",
              "Save. Active promos apply automatically to matching bookings.",
            ]}
          />
          <h3 className="pt-1 font-semibold text-foreground">Who gets the deal</h3>
          <p>
            Most promos use <strong>Eligibility</strong> — <em>Everyone</em>, <em>Members only</em>, or
            <em> Guests only</em>. The percentage-off type instead has its own <strong>Applies to</strong> picker for
            finer control — any mix of guests (no account), signed-in non-members, and members. When a type manages its
            own audience, the Eligibility dropdown is hidden so there&apos;s just one place to choose.
          </p>
          <h3 className="pt-1 font-semibold text-foreground">When two promos overlap</h3>
          <p>The app always gives the player the bigger total discount, so the result never depends on order:</p>
          <Bullets
            items={[
              <><strong>Stackable</strong> promos combine — their discounts add up.</>,
              <><strong>Non-stackable</strong> promos don&apos;t share — only the single best one is used.</>,
              <>When both match, the app compares the combined stackables against the best non-stackable and applies whichever saves more. <strong>Priority</strong> only breaks ties between non-stackable promos.</>,
            ]}
          />
          <p>Every discount is capped to the slot&apos;s own price, so stacking can never take a slot below ₱0.</p>
        </Section>

        <Section id="members-admin" title="Members & requests" roles={["admin"]}>
          <p>
            <Path>People › Members</Path> lists everyone with a membership. Add a member manually, or open one to edit
            their details — including any custom fields their tier collects. Only one membership is active at a time.
          </p>
          <p>New applications arrive in <Path>People › Subscription Requests</Path> (the menu badges how many wait).</p>
          <Steps
            items={[
              "Open a request to see the applicant, their tier, the details they filled in, and payment proof.",
              <><strong>Approve</strong> to activate the membership (they get an approval email), or <strong>reject</strong> it (they get the outcome).</>,
            ]}
          />
          <Callout variant="warn" title="Heads up">
            If you remove a tier that collected custom details, the app guards against losing that information. Review
            members on the old tier before deleting it.
          </Callout>
        </Section>

        <Section id="coaches-admin" title="Coaches" roles={["admin"]}>
          <p>
            If coaching is enabled, <Path>People › Coaches</Path> manages the coaches on your public page and the
            session requests players send. Add a coach with their rate and review incoming requests here.
          </p>
        </Section>

        <Section id="site" title="Your public site" roles={["admin"]}>
          <p>Shape what players see without touching code:</p>
          <Bullets
            items={[
              <><Path>Setup › Home page</Path> — the welcome content and how-to notes on your landing page.</>,
              <><Path>Setup › Announcement</Path> — a short message or image banner for events, closures, or promos.</>,
              <><Path>Setup › Footer</Path> — the links and details at the bottom of every page.</>,
            ]}
          />
        </Section>

        <Section id="reports" title="Sales, expenses & audit" roles={["admin"]}>
          <p>Under <Path>Reports</Path> (when enabled for your venue):</p>
          <Bullets
            items={[
              <><strong>Sales</strong> — revenue over a date range, paced by days actually elapsed so an in-progress month reads fairly.</>,
              <><strong>Expenses</strong> — record your venue&apos;s costs; visible only to your venue&apos;s admins.</>,
              <><strong>Audit Log</strong> — a trail of important changes (voids, payment-account edits, and more) with who and when.</>,
            ]}
          />
          <p>
            Under <Path>People</Path>, <strong>Top Customers</strong> highlights your most frequent players when
            analytics is on. You can also export bookings and the member list to CSV.
          </p>
        </Section>

        <Section id="reference" title="Reference" roles={["admin"]}>
          <h3 className="font-semibold text-foreground">Promotion types</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>What it does</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-medium text-foreground">Multi-court discount</TableCell><TableCell>A discount when someone books several courts together — set minimum courts, the amount, and an optional time window.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Free hours (time window)</TableCell><TableCell>After a minimum booking length within a window, some hours are free. Supports overnight windows.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Hour bundle (flat price)</TableCell><TableCell>A block of hours within a window for one flat price (e.g. &quot;3 hours for ₱1,000&quot;); extra hours bill at the normal rate.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Percentage off (min hours)</TableCell><TableCell>A percentage off once the booking reaches a minimum total hours — courts combine, so 3 courts × 1 hour counts as 3 hours. Targets guests, signed-in non-members, and/or members.</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>

          <h3 className="pt-2 font-semibold text-foreground">How players pay</h3>
          <p>
            Players transfer the total by GCash or bank to the account you set under <Path>Setup › Payment</Path>, then
            attach proof. You verify and confirm in Payments. At the desk, staff can record cash or other methods
            directly. Prices are in Philippine pesos (₱).
          </p>

          <h3 className="pt-2 font-semibold text-foreground">Emails the app sends</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who gets it</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-medium text-foreground">Booking confirmed</TableCell><TableCell>The player, once you approve their payment.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Booking cancelled / rescheduled</TableCell><TableCell>The player, when the booking changes.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Membership request received</TableCell><TableCell>The applicant, as soon as they submit.</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-foreground">Membership approved / rejected</TableCell><TableCell>The applicant, with the outcome.</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="pt-1 text-xs">Your menus may show more or fewer options than this guide depending on which features are enabled.</p>
        </Section>
      </div>
    </div>
  );
}
