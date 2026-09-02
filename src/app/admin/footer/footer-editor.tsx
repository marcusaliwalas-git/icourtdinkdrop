"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOCIAL_PLATFORMS, type FooterSocial, type FooterLink } from "@/lib/footer";
import { updateFooter } from "./actions";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function FooterEditor({
  footer,
}: {
  footer: {
    about: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    socials: FooterSocial[];
    links: FooterLink[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [socials, setSocials] = useState<FooterSocial[]>(footer.socials);
  const [links, setLinks] = useState<FooterLink[]>(footer.links);

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateFooter({
        about: String(formData.get("about") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        address: String(formData.get("address") ?? ""),
        socials: socials.filter((s) => s.url.trim()),
        links: links.filter((l) => l.label.trim() && l.url.trim()),
      });
      setMessage(result.error ?? "Saved");
      if (!result.error) router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      {/* About / tagline */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="about">About / tagline</Label>
        <textarea
          id="about"
          name="about"
          defaultValue={footer.about ?? ""}
          rows={2}
          maxLength={600}
          placeholder="A friendly line about your venue — what you offer, your vibe."
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">A © line with the current year and your venue name is always shown.</p>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Contact</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={footer.email ?? ""} placeholder="hello@yourvenue.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={footer.phone ?? ""} placeholder="+63 917 123 4567" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address</Label>
          <textarea
            id="address"
            name="address"
            defaultValue={footer.address ?? ""}
            rows={2}
            maxLength={300}
            placeholder="123 Court Ave, Makati City"
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      </div>

      {/* Social links */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Social links</span>
        {socials.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
        {socials.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={s.platform}
              onChange={(e) => setSocials((prev) => prev.map((p, j) => (j === i ? { ...p, platform: e.target.value } : p)))}
              className={selectClass}
              aria-label="Platform"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <Input
              value={s.url}
              onChange={(e) => setSocials((prev) => prev.map((p, j) => (j === i ? { ...p, url: e.target.value } : p)))}
              placeholder="https://instagram.com/yourvenue"
              className="flex-1"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setSocials((prev) => prev.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        {socials.length < 8 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setSocials((prev) => [...prev, { platform: "instagram", url: "" }])}
          >
            + Add social
          </Button>
        )}
      </div>

      {/* Custom links */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Custom links</span>
        {links.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={l.label}
              onChange={(e) => setLinks((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
              placeholder="Terms"
              className="w-40"
            />
            <Input
              value={l.url}
              onChange={(e) => setLinks((prev) => prev.map((p, j) => (j === i ? { ...p, url: e.target.value } : p)))}
              placeholder="/terms or https://…"
              className="flex-1"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        {links.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
          >
            + Add link
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending ? "Saving…" : "Save footer"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}
