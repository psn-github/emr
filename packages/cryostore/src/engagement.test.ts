import { describe, expect, it } from "vitest";
import { nextEngagementState } from "./engagement.js";

describe("non-engagement pathway (AMD-0003)", () => {
  it("advances graduated: current → reminded → overdue → in_legal_review", () => {
    const a = nextEngagementState("current", "remind");
    expect(a.ok && a.value).toBe("reminded");
    const b = nextEngagementState("reminded", "mark_overdue");
    expect(b.ok && b.value).toBe("overdue");
    const c = nextEngagementState("overdue", "escalate_review");
    expect(c.ok && c.value).toBe("in_legal_review");
  });

  it("a payment always returns the account to current — from any state", () => {
    for (const s of ["current", "reminded", "overdue", "in_legal_review"] as const) {
      const r = nextEngagementState(s, "renew_paid");
      expect(r.ok && r.value).toBe("current");
    }
  });

  it("refuses out-of-order escalation (cannot jump straight to review)", () => {
    const r = nextEngagementState("current", "escalate_review");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.engagement.bad_transition");
  });

  it("there is no action that destroys a specimen", () => {
    // The machine's whole codomain excludes any destroyed/disposed state.
    const reachable = new Set(["current", "reminded", "overdue", "in_legal_review"]);
    for (const s of reachable) {
      for (const action of ["remind", "mark_overdue", "escalate_review", "renew_paid"] as const) {
        const r = nextEngagementState(s as never, action);
        if (r.ok) expect(reachable.has(r.value)).toBe(true);
      }
    }
  });
});
