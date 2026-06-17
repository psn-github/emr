import type { AuditLog } from "@oxford/audit";
import type { ConsumableUse, DeviceCatalogueEntry, ImplantRecord } from "./types.js";
import { toImplantRecord, type DeviceCatalogueStore } from "./device-registry.js";
import type { ImplantUsageStore } from "./device-registry-store.js";

/**
 * Implant/device registry reporting (docs/01 §E7 P2). Reads the point-of-use,
 * lot-traced ConsumableUse lines and reports only those whose code is a
 * registrable device (the config catalogue), enriched with regulatory metadata.
 * Supports a patient implant record, **recall lookup** (every recipient of a
 * device code/lot — patient-safety critical), and a periodic registry export.
 * Recall + export are sensitive reads and are audited (READ_EXPORT). The module
 * never reaches across boundaries — it reads its own consumable lines.
 */
export class DeviceRegistryService {
  constructor(
    private readonly catalogue: DeviceCatalogueStore,
    private readonly usage: ImplantUsageStore,
    private readonly audit: AuditLog,
  ) {}

  /** Registrable devices (config) for the registry/entry UI. */
  listDevices(): Promise<readonly DeviceCatalogueEntry[]> {
    return this.catalogue.listActive();
  }

  /** Keep only registrable lines and enrich each with its catalogue entry. */
  private async enrich(uses: readonly ConsumableUse[]): Promise<ImplantRecord[]> {
    const out: ImplantRecord[] = [];
    for (const use of uses) {
      const entry = await this.catalogue.get(use.code);
      if (entry !== null && entry.active) out.push(toImplantRecord(use, entry));
    }
    return out;
  }

  /** A patient's implanted-device record (registrable items only). */
  async implantsForPatient(patientId: string): Promise<readonly ImplantRecord[]> {
    return this.enrich(await this.usage.byPatient(patientId));
  }

  /** Recall lookup: every recipient of a registrable device code (optionally a lot). Audited. */
  async recallLookup(actorId: string, code: string, lotNo?: string): Promise<readonly ImplantRecord[]> {
    const records = await this.enrich(await this.usage.byCodeLot(code, lotNo));
    await this.audit.record({ actorId, entityType: "DeviceRecall", entityId: lotNo === undefined ? code : `${code}:${lotNo}`, action: "READ_EXPORT", after: { code, lotNo: lotNo ?? null, matches: records.length } });
    return records;
  }

  /** Periodic registry export of implant events in a window (inclusive). Audited. */
  async registryExport(actorId: string, since: string, until: string): Promise<readonly ImplantRecord[]> {
    const records = await this.enrich(await this.usage.inWindow(since, until));
    await this.audit.record({ actorId, entityType: "DeviceRegistryExport", entityId: `${since}/${until}`, action: "READ_EXPORT", after: { since, until, count: records.length } });
    return records;
  }
}
