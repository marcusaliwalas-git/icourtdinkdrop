"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenant } from "./actions";
import { slugify } from "@/lib/validation/tenant";

export function CreateTenantForm({ rootDomain }: { rootDomain: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; customDomain: string } | null>(null);

  // What the slug will be if the field is left blank — derived from the name, same as the server.
  const effectiveSlug = slug.trim() || slugify(name);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createTenant({
        name: String(formData.get("name") ?? ""),
        slug: String(formData.get("slug") ?? ""),
        customDomain: String(formData.get("customDomain") ?? ""),
        timezone: String(formData.get("timezone") ?? "Asia/Manila"),
        adminEmail: String(formData.get("adminEmail") ?? ""),
        adminPassword: String(formData.get("adminPassword") ?? ""),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone({ slug: result.slug ?? "", customDomain: String(formData.get("customDomain") ?? "") });
      setName("");
      setSlug("");
      setCustomDomain("");
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Tenant created ✓</p>
        <p className="text-muted-foreground">Point the venue&rsquo;s hostname at this deployment:</p>
        <ul className="flex flex-col gap-1 font-mono text-xs">
          <li>
            Subdomain: <span className="text-foreground">{done.slug}.{rootDomain}</span> — works immediately (wildcard
            DNS).
          </li>
          {done.customDomain && (
            <li>
              Custom domain: <span className="text-foreground">{done.customDomain}</span> — add it in Vercel → Domains,
              then have the client CNAME it to Vercel.
            </li>
          )}
        </ul>
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setDone(null)}>
          Onboard another
        </Button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Venue name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Acme Pickleball"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" name="timezone" defaultValue="Asia/Manila" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slug">Subdomain (slug) — optional</Label>
        <Input
          id="slug"
          name="slug"
          placeholder="auto from name"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
        />
        <p className="font-mono text-xs text-muted-foreground">
          {effectiveSlug ? `${effectiveSlug}.${rootDomain}` : `<slug>.${rootDomain}`}
        </p>
        <p className="text-xs text-muted-foreground">Leave blank to auto-generate from the venue name.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customDomain">Custom domain (optional)</Label>
        <Input
          id="customDomain"
          name="customDomain"
          placeholder="acmepickleball.com"
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
        />
        <p className="text-xs text-muted-foreground">Add it in Vercel → Domains after creating.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adminEmail">Admin email</Label>
        <Input id="adminEmail" name="adminEmail" type="email" placeholder="owner@acme.com" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adminPassword">Admin password</Label>
        <Input id="adminPassword" name="adminPassword" type="password" placeholder="At least 8 characters" required />
      </div>
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create tenant"}
        </Button>
      </div>
    </form>
  );
}
