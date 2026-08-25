import { describe, it, expect } from "vitest";
import { buildIcs } from "@/lib/ics";

describe("buildIcs", () => {
  const event = {
    uid: "ABC12345@dinkdrop",
    start: new Date("2026-08-30T10:00:00Z"),
    end: new Date("2026-08-30T11:00:00Z"),
    title: "Pickleball — Court 1",
    description: "Booking reference: ABC12345",
    location: "DinkDrop, BGC",
  };

  it("wraps events in a valid VCALENDAR/VEVENT structure", () => {
    const ics = buildIcs([event]);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
  });

  it("formats start/end as UTC basic timestamps", () => {
    const ics = buildIcs([event]);
    expect(ics).toContain("DTSTART:20260830T100000Z");
    expect(ics).toContain("DTEND:20260830T110000Z");
    expect(ics).toContain("UID:ABC12345@dinkdrop");
  });

  it("escapes commas in text fields (RFC 5545)", () => {
    const ics = buildIcs([event]);
    expect(ics).toContain("LOCATION:DinkDrop\\, BGC");
    expect(ics).toContain("SUMMARY:Pickleball — Court 1");
  });

  it("emits one VEVENT per booking in a cart", () => {
    const ics = buildIcs([event, { ...event, uid: "XYZ99999@dinkdrop" }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:XYZ99999@dinkdrop");
  });

  it("uses CRLF line breaks", () => {
    expect(buildIcs([event])).toContain("\r\n");
  });
});
