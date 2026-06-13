import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./bed.js";

describe("bed transitions", () => {
  it("allows the legal moves", () => {
    expect(canTransition("free", "occupied")).toBe(true);
    expect(canTransition("occupied", "cleaning")).toBe(true);
    expect(canTransition("cleaning", "free")).toBe(true);
    expect(canTransition("free", "blocked")).toBe(true);
    expect(canTransition("blocked", "free")).toBe(true);
  });

  it("rejects nonsense moves", () => {
    expect(canTransition("free", "cleaning")).toBe(false);
    expect(canTransition("occupied", "free")).toBe(false);
    expect(canTransition("blocked", "occupied")).toBe(false);
  });

  it("assertTransition: same status is a no-op ok", () => {
    expect(assertTransition("occupied", "occupied").ok).toBe(true);
  });

  it("assertTransition: legal move ok, illegal move errors", () => {
    expect(assertTransition("free", "occupied").ok).toBe(true);
    const bad = assertTransition("free", "cleaning");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("facility.bed.bad_transition");
  });
});
