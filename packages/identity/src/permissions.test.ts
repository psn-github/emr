import { describe, expect, it } from "vitest";
import { isPermissionDomain, permissionSatisfies } from "./permissions.js";

describe("permissions", () => {
  it("recognises valid domains", () => {
    expect(isPermissionDomain("clinical")).toBe(true);
    expect(isPermissionDomain("embryology")).toBe(true);
    expect(isPermissionDomain("marketing")).toBe(false);
  });

  it("satisfies exact matches", () => {
    expect(permissionSatisfies("clinical:note.write", "clinical:note.write")).toBe(true);
    expect(permissionSatisfies("clinical:note.write", "clinical:note.read")).toBe(false);
  });

  it("satisfies domain wildcards within the same domain only", () => {
    expect(permissionSatisfies("embryology:*", "embryology:grade.write")).toBe(true);
    expect(permissionSatisfies("embryology:*", "financial:invoice.read")).toBe(false);
  });

  it("super-admin satisfies anything", () => {
    expect(permissionSatisfies("*:*", "financial:invoice.void")).toBe(true);
  });
});
