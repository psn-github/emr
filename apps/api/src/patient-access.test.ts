// ADVERSARIAL SELF-REVIEW (patient identity/access) — a patient may only ever
// touch their OWN record via the portal.
import { describe, expect, it } from "vitest";
import { assertOwnData } from "./patient-access.js";

describe("assertOwnData", () => {
  it("allows a patient to act on their own record", () => {
    expect(assertOwnData({ patientId: "pat-1" }, "pat-1").ok).toBe(true);
  });

  it("[attack] blocks a patient from acting on someone else's record", () => {
    const r = assertOwnData({ patientId: "pat-1" }, "pat-2");
    console.log("[attack] patient pat-1 → pat-2 data:", r.ok ? "ALLOWED (FAIL)" : "DENIED");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("portal.not_own_data");
  });
});
