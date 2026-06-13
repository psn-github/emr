import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { assertResolveAllowed, outcomeRequiresDiscard } from "./disposition-review.js";
import type { DispositionReview } from "./types.js";

const review = (over: Partial<DispositionReview> = {}): DispositionReview => ({
  id: asId<"DispositionReview">("r-1"),
  specimenId: asId<"CryoSpecimen">("s-1"),
  reason: "marital_status_change",
  state: "open",
  outcome: null,
  rationale: null,
  openedBy: "u",
  openedAt: "2026-06-13T00:00:00Z",
  resolvedBy: null,
  resolvedAt: null,
  ...over,
});

describe("disposition review", () => {
  it("allows resolving an open review with a rationale", () => {
    expect(assertResolveAllowed(review(), "couple dissolved; partner elects to retain").ok).toBe(true);
  });
  it("blocks resolving an already-resolved review", () => {
    const r = assertResolveAllowed(review({ state: "resolved" }), "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.review.already_resolved");
  });
  it("requires a non-empty rationale", () => {
    const r = assertResolveAllowed(review(), "   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.review.rationale_required");
  });
  it("only the discard outcome routes through the witnessed discard", () => {
    expect(outcomeRequiresDiscard("discard")).toBe(true);
    expect(outcomeRequiresDiscard("retain")).toBe(false);
  });
});
