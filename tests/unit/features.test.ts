import { describe, it, expect } from "vitest";
import { featureEnabled, isOptInFeature } from "@/lib/features";

describe("featureEnabled — opt-in capabilities (store)", () => {
  it("is OFF by default for a venue that never opted in", () => {
    expect(featureEnabled(undefined, "store")).toBe(false);
    expect(featureEnabled(null, "store")).toBe(false);
    expect(featureEnabled({}, "store")).toBe(false);
    expect(featureEnabled({ coaches: true }, "store")).toBe(false); // unrelated flags don't enable it
  });

  it("is OFF when explicitly disabled", () => {
    expect(featureEnabled({ store: false }, "store")).toBe(false);
  });

  it("is ON only when explicitly enabled", () => {
    expect(featureEnabled({ store: true }, "store")).toBe(true);
  });

  it("marks store as opt-in", () => {
    expect(isOptInFeature("store")).toBe(true);
  });
});

describe("featureEnabled — normal capabilities (default on)", () => {
  it("is ON by default (existing venues keep every normal capability)", () => {
    expect(featureEnabled(undefined, "equipment")).toBe(true);
    expect(featureEnabled(null, "coaches")).toBe(true);
    expect(featureEnabled({}, "analytics")).toBe(true);
  });

  it("is OFF only when a super admin explicitly turns it off", () => {
    expect(featureEnabled({ equipment: false }, "equipment")).toBe(false);
    expect(featureEnabled({ coaches: false }, "coaches")).toBe(false);
  });

  it("is unaffected by other flags", () => {
    expect(featureEnabled({ store: true }, "equipment")).toBe(true);
    expect(featureEnabled({ equipment: false }, "analytics")).toBe(true);
    expect(isOptInFeature("equipment")).toBe(false);
  });
});
