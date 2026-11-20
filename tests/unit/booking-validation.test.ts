import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createBookingsSchema } from "@/lib/validation/booking";

// Regression guard for the cart idempotency-key bug: the old key concatenated every court@time in
// the cart, so at 3+ slots it blew past the schema's 200-char idempotencyKey limit and the whole
// booking was rejected as invalid. The app now sends a single bounded `cart-<uuid>` key, so a cart
// of any size validates.

function segment(dayOffset: number) {
  return {
    courtId: randomUUID(),
    startsAt: new Date(Date.now() + dayOffset * 86_400_000).toISOString(),
    durationMinutes: 60,
  };
}

describe("createBookingsSchema — cart idempotency key", () => {
  it("accepts a large cart with the bounded cart-<uuid> key", () => {
    const segments = Array.from({ length: 24 }, (_, i) => segment(i + 1));
    const result = createBookingsSchema.safeParse({
      segments,
      guestName: "Jaemi",
      guestPhone: "09171234567",
      guestEmail: "jaemi@example.com",
      paymentSlipPath: "slips/receipt.png",
      idempotencyKey: `cart-${randomUUID()}`, // ~41 chars, independent of cart size
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unbounded key (the old behaviour that broke 3+ slot carts)", () => {
    const segments = Array.from({ length: 3 }, (_, i) => segment(i + 1));
    const oldStyleKey = `cart-${segments.map((s) => `${s.courtId}@${s.startsAt}`).join(",")}-${Date.now()}`;
    expect(oldStyleKey.length).toBeGreaterThan(200);
    const result = createBookingsSchema.safeParse({
      segments,
      guestName: "Jaemi",
      guestPhone: "09171234567",
      guestEmail: "jaemi@example.com",
      paymentSlipPath: "slips/receipt.png",
      idempotencyKey: oldStyleKey,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["idempotencyKey"]);
    }
  });
});
