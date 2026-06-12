import { describe, expect, it } from "vitest";
import { newId, asId } from "./ids.js";
import { systemClock, fixedClock } from "./clock.js";
import { AppError, validationError, notFound, forbidden, conflict, unauthenticated, preconditionFailed } from "./errors.js";

describe("ids", () => {
  it("newId returns a unique uuid-shaped string", () => {
    const a = newId<"Person">();
    const b = newId<"Person">();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("asId wraps an existing string", () => {
    expect(asId<"Couple">("abc")).toBe("abc");
  });
});

describe("clock", () => {
  it("systemClock returns a Date near now", () => {
    const delta = Math.abs(systemClock.now().getTime() - Date.now());
    expect(delta).toBeLessThan(1000);
  });

  it("fixedClock is frozen, settable, and advanceable", () => {
    const c = fixedClock(new Date("2026-01-01T00:00:00.000Z"));
    expect(c.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    c.advanceMs(1000);
    expect(c.now().toISOString()).toBe("2026-01-01T00:00:01.000Z");
    c.set(new Date("2030-06-01T00:00:00.000Z"));
    expect(c.now().toISOString()).toBe("2030-06-01T00:00:00.000Z");
  });
});

describe("errors", () => {
  it("AppError carries code and optional detailKey", () => {
    const e = new AppError("INTERNAL", "boom", "err.boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("INTERNAL");
    expect(e.detailKey).toBe("err.boom");
  });

  it("factories set the right codes", () => {
    expect(validationError("x").code).toBe("VALIDATION");
    expect(notFound("x").code).toBe("NOT_FOUND");
    expect(forbidden("x").code).toBe("FORBIDDEN");
    expect(conflict("x").code).toBe("CONFLICT");
    expect(unauthenticated("x").code).toBe("UNAUTHENTICATED");
    expect(preconditionFailed("x").code).toBe("PRECONDITION_FAILED");
  });
});
