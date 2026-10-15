"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateTenantHost } from "./actions";

/** Super-admin control to rename a venue's host — its subdomain slug and/or custom domain. The DB
 * change is instant; the dialog reminds you the DNS/Vercel/Supabase steps are still manual. */
export function EditVenueHost({
  venueId,
  venueName,
  slug,
  customDomain,
  rootDomain,
}: {
  venueId: string;
  venueName: string;
  slug: string | null;
  customDomain: string | null;
  rootDomain: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slugVal, setSlugVal] = useState(slug ?? "");
  const [domainVal, setDomainVal] = useState(customDomain ?? "");

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateTenantHost(venueId, { slug: slugVal, customDomain: domainVal });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Edit host
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit host — {venueName}</DialogTitle>
          <DialogDescription>Change the subdomain and/or custom domain. Bookings and members are unaffected.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editSlug">Subdomain (slug)</Label>
            <Input id="editSlug" value={slugVal} onChange={(e) => setSlugVal(e.target.value)} placeholder="acme" />
            <p className="font-mono text-xs text-muted-foreground">
              {slugVal ? `${slugVal}.${rootDomain}` : `<slug>.${rootDomain}`}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editDomain">Custom domain (optional)</Label>
            <Input
              id="editDomain"
              value={domainVal}
              onChange={(e) => setDomainVal(e.target.value)}
              placeholder="acmepickleball.com"
            />
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">After saving, finish the routing manually:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                New subdomain: add <span className="font-mono">{slugVal || "<slug>"}.{rootDomain}</span> in Vercel → Domains + a
                Namecheap CNAME to <span className="font-mono">cname.vercel-dns.com</span>.
              </li>
              {domainVal && (
                <li>
                  Custom domain: add <span className="font-mono">{domainVal}</span> in Vercel, point its DNS, then add{" "}
                  <span className="font-mono">{`https://${domainVal}/**`}</span> to Supabase → Auth → Redirect URLs.
                </li>
              )}
              <li>Remove the old host from Vercel/DNS once the new one resolves.</li>
            </ul>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save host"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
