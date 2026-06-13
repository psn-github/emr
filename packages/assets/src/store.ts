import type { Asset, AssetId, MaintenanceRecord, FaultRecord, FaultId, MaintenanceType } from "./types.js";

export interface AssetStore {
  saveAsset(a: Asset): Promise<void>;
  getAsset(id: AssetId): Promise<Asset | undefined>;
  assets(): Promise<readonly Asset[]>;
  saveMaintenance(m: MaintenanceRecord): Promise<void>;
  maintenanceForAsset(assetId: string): Promise<readonly MaintenanceRecord[]>;
  saveFault(f: FaultRecord): Promise<void>;
  getFault(id: FaultId): Promise<FaultRecord | undefined>;
  faultsForAsset(assetId: string): Promise<readonly FaultRecord[]>;
}

/** The latest next-due date for a maintenance type from a record list (null if
 *  none of that type). Shared by the in-memory store and the service. */
export function latestNextDue(records: readonly MaintenanceRecord[], type: MaintenanceType): string | null {
  const ofType = records.filter((r) => r.type === type && r.nextDueDate !== null);
  if (ofType.length === 0) return null;
  return ofType.reduce((latest, r) => (r.performedAt > latest.performedAt ? r : latest)).nextDueDate;
}

export class InMemoryAssetStore implements AssetStore {
  private readonly assetList: Asset[] = [];
  private readonly maintenance: MaintenanceRecord[] = [];
  private readonly faults: FaultRecord[] = [];

  async saveAsset(a: Asset): Promise<void> {
    const idx = this.assetList.findIndex((x) => x.id === a.id);
    if (idx >= 0) this.assetList[idx] = a;
    else this.assetList.push(a);
  }
  async getAsset(id: AssetId): Promise<Asset | undefined> {
    return this.assetList.find((a) => a.id === id);
  }
  async assets(): Promise<readonly Asset[]> {
    return this.assetList;
  }
  async saveMaintenance(m: MaintenanceRecord): Promise<void> {
    this.maintenance.push(m);
  }
  async maintenanceForAsset(assetId: string): Promise<readonly MaintenanceRecord[]> {
    return this.maintenance.filter((m) => m.assetId === assetId);
  }
  async saveFault(f: FaultRecord): Promise<void> {
    const idx = this.faults.findIndex((x) => x.id === f.id);
    if (idx >= 0) this.faults[idx] = f;
    else this.faults.push(f);
  }
  async getFault(id: FaultId): Promise<FaultRecord | undefined> {
    return this.faults.find((f) => f.id === id);
  }
  async faultsForAsset(assetId: string): Promise<readonly FaultRecord[]> {
    return this.faults.filter((f) => f.assetId === assetId);
  }
}
