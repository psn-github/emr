import { describe, expect, it } from "vitest";
import { InMemoryImportLedger } from "./ledger.js";

describe("InMemoryImportLedger", () => {
  it("records and looks up target ids; reports imported source ids per entity", async () => {
    const ledger = new InMemoryImportLedger();
    expect(await ledger.targetFor("cliniko", "patient", "c1")).toBeNull();
    await ledger.record("cliniko", "patient", "c1", "person-1");
    await ledger.record("cliniko", "patient", "c2", "person-2");
    await ledger.record("cliniko", "invoice", "i1", "inv-1");

    expect(await ledger.targetFor("cliniko", "patient", "c1")).toBe("person-1");
    expect([...(await ledger.importedSourceIds("cliniko", "patient"))].sort()).toEqual(["c1", "c2"]);
    expect([...(await ledger.importedSourceIds("cliniko", "invoice"))]).toEqual(["i1"]);
  });
});
