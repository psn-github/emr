import { describe, expect, it } from "vitest";
import { ageBand, toRegistryRow, buildRegistryExport, type RegistryCycleInput } from "./research-export.js";

const input: RegistryCycleInput = {
  cycleId: "cycle-123",
  patientRef: "person-456",
  ageYears: 41,
  cycleType: "ICSI",
  protocol: "antagonist",
  oocytesRetrieved: 12,
  matureOocytes: 9,
  twoPnZygotes: 7,
  embryosTransferred: 1,
  biochemicalPregnancy: true,
  clinicalPregnancy: true,
  liveBirth: false,
  liveBirthCount: 0,
};

describe("research/registry export — de-identification (pure)", () => {
  it("bands maternal age (exact age never emitted)", () => {
    expect(ageBand(34)).toBe("<35");
    expect(ageBand(35)).toBe("35-37");
    expect(ageBand(37)).toBe("35-37");
    expect(ageBand(38)).toBe("38-39");
    expect(ageBand(40)).toBe("40-42");
    expect(ageBand(43)).toBe(">42");
  });

  it("emits hashed keys + banded age + clinical fields — no raw identifiers", () => {
    const row = toRegistryRow(input, "salt-A");
    // no direct identifiers leak through
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain("cycle-123");
    expect(serialised).not.toContain("person-456");
    expect(serialised).not.toContain("41"); // exact age gone (banded)
    expect(row.ageBand).toBe("40-42");
    expect(row.cycleKey).toMatch(/^[0-9a-f]{16}$/);
    expect(row.patientKey).toMatch(/^[0-9a-f]{16}$/);
    expect(row.cycleType).toBe("ICSI");
    expect(row.twoPnZygotes).toBe(7);
  });

  it("hashing is deterministic per salt and changes with the salt (non-reversible)", () => {
    expect(toRegistryRow(input, "salt-A").cycleKey).toBe(toRegistryRow(input, "salt-A").cycleKey);
    expect(toRegistryRow(input, "salt-A").cycleKey).not.toBe(toRegistryRow(input, "salt-B").cycleKey);
    // same patient across two cycles → same patientKey (sibling-cycle linkage), different cycleKey
    const other = toRegistryRow({ ...input, cycleId: "cycle-999" }, "salt-A");
    const first = toRegistryRow(input, "salt-A");
    expect(other.patientKey).toBe(first.patientKey);
    expect(other.cycleKey).not.toBe(first.cycleKey);
  });

  it("builds the full export", () => {
    const rows = buildRegistryExport([input, { ...input, cycleId: "c2" }], "salt-A");
    expect(rows).toHaveLength(2);
  });
});
