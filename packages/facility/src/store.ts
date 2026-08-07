import type { Bed, BedId, Floor, LocationNode } from "./types.js";

export interface FacilityStore {
  saveFloor(floor: Floor): Promise<void>;
  saveLocation(node: LocationNode): Promise<void>;
  saveBed(bed: Bed): Promise<void>;
  getBed(id: BedId): Promise<Bed | null>;
  listBeds(): Promise<readonly Bed[]>;
  listLocations(): Promise<readonly LocationNode[]>;
  listFloors(): Promise<readonly Floor[]>;
}

export class InMemoryFacilityStore implements FacilityStore {
  private readonly floors = new Map<string, Floor>();
  private readonly locations = new Map<string, LocationNode>();
  private readonly beds = new Map<string, Bed>();

  async saveFloor(floor: Floor): Promise<void> {
    this.floors.set(floor.id, floor);
  }
  async saveLocation(node: LocationNode): Promise<void> {
    this.locations.set(node.id, node);
  }
  async saveBed(bed: Bed): Promise<void> {
    this.beds.set(bed.id, bed);
  }
  async getBed(id: BedId): Promise<Bed | null> {
    return this.beds.get(id) ?? null;
  }
  async listBeds(): Promise<readonly Bed[]> {
    return [...this.beds.values()];
  }
  async listLocations(): Promise<readonly LocationNode[]> {
    return [...this.locations.values()];
  }
  async listFloors(): Promise<readonly Floor[]> {
    return [...this.floors.values()];
  }
}
