import type { StockLot, StockLotId, ColdChainReading } from "./types.js";

export interface StockStore {
  saveLot(lot: StockLot): Promise<void>;
  lotById(id: StockLotId): Promise<StockLot | undefined>;
  lotsForItem(itemId: string): Promise<readonly StockLot[]>;
  lotsForItemLot(itemId: string, lotNo: string): Promise<readonly StockLot[]>;
  /** The single lot at a specific (item, lot, location) — for receive upsert. */
  lotAt(itemId: string, lotNo: string, locationId: string): Promise<StockLot | undefined>;
  allLots(): Promise<readonly StockLot[]>;
  saveColdChainReading(r: ColdChainReading): Promise<void>;
  coldChainForLocation(locationId: string): Promise<readonly ColdChainReading[]>;
}

const key = (l: StockLot): string => `${l.itemId}|${l.lotNo}|${l.locationId}`;

export class InMemoryStockStore implements StockStore {
  private readonly lots = new Map<string, StockLot>(); // by id
  private readonly readings: ColdChainReading[] = [];

  async saveLot(lot: StockLot): Promise<void> {
    this.lots.set(lot.id, lot);
  }
  async lotById(id: StockLotId): Promise<StockLot | undefined> {
    return this.lots.get(id);
  }
  async lotsForItem(itemId: string): Promise<readonly StockLot[]> {
    return [...this.lots.values()].filter((l) => l.itemId === itemId);
  }
  async lotsForItemLot(itemId: string, lotNo: string): Promise<readonly StockLot[]> {
    return [...this.lots.values()].filter((l) => l.itemId === itemId && l.lotNo === lotNo);
  }
  async lotAt(itemId: string, lotNo: string, locationId: string): Promise<StockLot | undefined> {
    return [...this.lots.values()].find((l) => key(l) === `${itemId}|${lotNo}|${locationId}`);
  }
  async allLots(): Promise<readonly StockLot[]> {
    return [...this.lots.values()];
  }
  async saveColdChainReading(r: ColdChainReading): Promise<void> {
    this.readings.push(r);
  }
  async coldChainForLocation(locationId: string): Promise<readonly ColdChainReading[]> {
    return this.readings.filter((r) => r.locationId === locationId);
  }
}
