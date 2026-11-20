import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  return { title: `Privacy Policy — ${tenant?.name ?? "iCourt Social"}` };
}

export default async function PrivacyPage() {
  const tenant = await getTenant();
  const brand = tenant?.name ?? "this venue";
  const email = tenant?.footer_email ?? null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {brand} handles your information on this booking site.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">The short version</h2>
        <p className="text-sm text-muted-foreground">
          We use only what&rsquo;s needed to keep you signed in and to run this booking site. No analytics or
          advertising cookies, and we never sell your data.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">What we collect</h2>
        <p className="text-sm text-muted-foreground">
          The details you provide to book and manage a reservation or membership — your name, email, mobile
          number, booking and payment details, and any payment receipt you upload. If you create an account, we
          store your sign-in details so you can return to your bookings.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Cookies</h2>
        <p className="text-sm text-muted-foreground">
          We use only essential cookies — they keep you signed in and let the booking site work. We don&rsquo;t use
          analytics or advertising cookies, and we don&rsquo;t track you across other sites.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">How we use your information</h2>
        <p className="text-sm text-muted-foreground">
          To create and manage your bookings and membership, record payments, and send you the related emails
          (confirmations, reminders, and membership updates). That&rsquo;s it.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Who we share it with</h2>
        <p className="text-sm text-muted-foreground">
          We never sell your data. It&rsquo;s handled only by the service providers that run this site for us —
          hosting, database and sign-in, email delivery, and file storage for payment receipts — and used solely
          to operate the booking service on our behalf.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Your choices</h2>
        <p className="text-sm text-muted-foreground">
          You can ask us to access, correct, or delete your information at any time
          {email ? (
            <>
              {" "}by emailing{" "}
              <a href={`mailto:${email}`} className="font-medium text-foreground underline underline-offset-2">
                {email}
              </a>
              .
            </>
          ) : (
            <> by contacting {brand}.</>
          )}
        </p>
      </section>
    </div>
  );
}
