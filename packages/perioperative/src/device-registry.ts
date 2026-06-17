import type { ConsumableUse, DeviceCatalogueEntry, ImplantRecord } from "./types.js";

// Implant/device registry (docs/01 §E7 P2). The catalogue is CONFIGURATION
// (CLAUDE.md "configuration is data") — which consumable codes are registrable
// implantable devices, with regulatory metadata; bilingual. Reporting enriches
// captured ConsumableUse lines (point-of-use, lot-traced) with this metadata.

export const SEED_DEVICE_CATALOGUE: readonly DeviceCatalogueEntry[] = [
  { code: "adhesion_barrier", name: { ar: "حاجز الالتصاقات", en: "Adhesion barrier" }, deviceType: "adhesion_barrier", manufacturer: "—", active: true },
  { code: "surgical_mesh", name: { ar: "شبكة جراحية", en: "Surgical mesh" }, deviceType: "mesh", manufacturer: "—", active: true },
  { code: "tubal_clip", name: { ar: "مشبك بوقي", en: "Tubal occlusion clip" }, deviceType: "tubal_occlusion", manufacturer: "—", active: true },
];

/** Enrich a captured ConsumableUse line with its catalogue metadata → an ImplantRecord (pure). */
export function toImplantRecord(use: ConsumableUse, entry: DeviceCatalogueEntry): ImplantRecord {
  return {
    consumableUseId: use.id,
    patientId: use.patientId,
    encounterId: use.encounterId,
    code: use.code,
    deviceType: entry.deviceType,
    deviceName: entry.name,
    manufacturer: entry.manufacturer,
    lotNo: use.lotNo,
    quantity: use.quantity,
    implantedAt: use.recordedAt,
    recordedBy: use.recordedBy,
  };
}

/** Lookup surface for the device catalogue (own-module config). */
export interface DeviceCatalogueStore {
  get(code: string): Promise<DeviceCatalogueEntry | null>;
  listActive(): Promise<readonly DeviceCatalogueEntry[]>;
}

/** In-memory catalogue store seeded from a set (defaults to the seed list). */
export class InMemoryDeviceCatalogueStore implements DeviceCatalogueStore {
  private readonly byCode: Map<string, DeviceCatalogueEntry>;
  constructor(entries: readonly DeviceCatalogueEntry[] = SEED_DEVICE_CATALOGUE) {
    this.byCode = new Map(entries.map((e) => [e.code, e]));
  }
  async get(code: string): Promise<DeviceCatalogueEntry | null> {
    return this.byCode.get(code) ?? null;
  }
  async listActive(): Promise<readonly DeviceCatalogueEntry[]> {
    return [...this.byCode.values()].filter((e) => e.active);
  }
}
