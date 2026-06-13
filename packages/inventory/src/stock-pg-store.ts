import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { StockLot, StockLotId, ColdChainReading } from "./types.js";
import type { StockStore } from "./stock-store.js";

/** Postgres-backed StockStore (lots + cold-chain readings). */
export class PgStockStore implements StockStore {
  constructor(private readonly pool: Pool) {}

  async saveLot(l: StockLot): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.stock_lot (id, item_id, lot_no, location_id, quantity, expiry_date, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET quantity=EXCLUDED.quantity`,
      [l.id, l.itemId, l.lotNo, l.locationId, l.quantity, l.expiryDate, l.receivedAt],
    );
  }
  async lotById(id: StockLotId): Promise<StockLot | undefined> {
    const r = await this.pool.query<Row>("SELECT *, expiry_date::text AS expiry_date FROM inventory.stock_lot WHERE id = $1", [id]);
    return r.rows[0] ? from(r.rows[0]) : undefined;
  }
  async lotsForItem(itemId: string): Promise<readonly StockLot[]> {
    const r = await this.pool.query<Row>("SELECT *, expiry_date::text AS expiry_date FROM inventory.stock_lot WHERE item_id = $1", [itemId]);
    return r.rows.map(from);
  }
  async lotsForItemLot(itemId: string, lotNo: string): Promise<readonly StockLot[]> {
    const r = await this.pool.query<Row>("SELECT *, expiry_date::text AS expiry_date FROM inventory.stock_lot WHERE item_id = $1 AND lot_no = $2", [itemId, lotNo]);
    return r.rows.map(from);
  }
  async lotAt(itemId: string, lotNo: string, locationId: string): Promise<StockLot | undefined> {
    const r = await this.pool.query<Row>("SELECT *, expiry_date::text AS expiry_date FROM inventory.stock_lot WHERE item_id = $1 AND lot_no = $2 AND location_id = $3", [itemId, lotNo, locationId]);
    return r.rows[0] ? from(r.rows[0]) : undefined;
  }
  async allLots(): Promise<readonly StockLot[]> {
    const r = await this.pool.query<Row>("SELECT *, expiry_date::text AS expiry_date FROM inventory.stock_lot");
    return r.rows.map(from);
  }
  async saveColdChainReading(c: ColdChainReading): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.cold_chain_reading (id, location_id, temperature_c, recorded_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.locationId, c.temperatureC, c.recordedAt, c.recordedBy],
    );
  }
  async coldChainForLocation(locationId: string): Promise<readonly ColdChainReading[]> {
    const r = await this.pool.query<CcRow>("SELECT * FROM inventory.cold_chain_reading WHERE location_id = $1 ORDER BY recorded_at", [locationId]);
    return r.rows.map(ccFrom);
  }
}

interface Row { id: string; item_id: string; lot_no: string; location_id: string; quantity: number; expiry_date: string; received_at: Date }
interface CcRow { id: string; location_id: string; temperature_c: number; recorded_at: Date; recorded_by: string }

function from(r: Row): StockLot {
  return { id: asId<"StockLot">(r.id), itemId: r.item_id, lotNo: r.lot_no, locationId: r.location_id, quantity: r.quantity, expiryDate: r.expiry_date, receivedAt: new Date(r.received_at).toISOString() };
}
function ccFrom(r: CcRow): ColdChainReading {
  return { id: asId<"ColdChainReading">(r.id), locationId: r.location_id, temperatureC: r.temperature_c, recordedAt: new Date(r.recorded_at).toISOString(), recordedBy: r.recorded_by };
}
