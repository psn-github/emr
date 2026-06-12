import { describe, expect, it } from "vitest";
import { can, heldPermissions, type AuthSubject, type Role } from "./rbac.js";

const role = (id: string, permissions: Role["permissions"]): Role => ({ id, name: id, permissions });
const subject = (roles: Role[]): AuthSubject => ({ staffId: "staff-1", roles });

describe("rbac", () => {
  it("denies by default when no roles are assigned", () => {
    expect(can(subject([]), "clinical:note.read")).toBe(false);
  });

  it("dedupes held permissions across roles", () => {
    const s = subject([
      role("nurse", ["clinical:note.read", "clinical:note.write"]),
      role("coord", ["clinical:note.read", "scheduling:appointment.book"]),
    ]);
    expect(heldPermissions(s)).toContain("clinical:note.read");
    expect(heldPermissions(s).filter((p) => p === "clinical:note.read")).toHaveLength(1);
  });

  it("grants on an exact permission", () => {
    expect(can(subject([role("nurse", ["clinical:note.write"])]), "clinical:note.write")).toBe(true);
  });

  it("grants via a domain wildcard", () => {
    expect(can(subject([role("lab", ["embryology:*"])]), "embryology:grade.write")).toBe(true);
  });

  it("does not leak across domains", () => {
    expect(can(subject([role("lab", ["embryology:*"])]), "financial:invoice.read")).toBe(false);
  });
});
