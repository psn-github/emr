import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type {
  Oocyte,
  Insemination,
  FertilisationCheck,
  Embryo,
  GradingEntry,
  Disposition,
  EmbryoTransfer,
  EmbryoId,
  GardnerGrade,
} from "./types.js";
import type { EmbryologyStore, PgtStore } from "./store.js";
import type { PgtOrder, PgtOrderId, PgtResult } from "./types.js";

/** Postgres-backed EmbryologyStore. Clinical lab data is append-only/soft-delete
 *  per CLAUDE.md; these writes are inserts. */
export class PgEmbryologyStore implements EmbryologyStore {
  constructor(private readonly pool: Pool) {}

  async saveOocyte(o: Oocyte): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.oocyte (id, cycle_id, retrieval_procedure_id, maturity, dish, position, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [o.id, o.cycleId, o.retrievalProcedureId, o.maturity, o.dish, o.position, o.recordedBy],
    );
  }
  async oocytesForCycle(cycleId: string): Promise<readonly Oocyte[]> {
    const r = await this.pool.query<OocyteRow>("SELECT * FROM embryology.oocyte WHERE cycle_id = $1 ORDER BY id", [cycleId]);
    return r.rows.map(oocyteFrom);
  }
  async saveInsemination(i: Insemination): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.insemination (id, cycle_id, oocyte_id, method, sperm_source_id, operator, inseminated_at, witness_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [i.id, i.cycleId, i.oocyteId, i.method, i.spermSourceId, i.operator, i.inseminatedAt, i.witnessKey],
    );
  }
  async inseminationsForCycle(cycleId: string): Promise<readonly Insemination[]> {
    const r = await this.pool.query<InsemRow>("SELECT * FROM embryology.insemination WHERE cycle_id = $1 ORDER BY inseminated_at", [cycleId]);
    return r.rows.map(insemFrom);
  }
  async saveFertilisationCheck(f: FertilisationCheck): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.fertilisation_check (id, cycle_id, oocyte_id, pn, checked_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.cycleId, f.oocyteId, f.pn, f.checkedAt, f.recordedBy],
    );
  }
  async checksForCycle(cycleId: string): Promise<readonly FertilisationCheck[]> {
    const r = await this.pool.query<CheckRow>("SELECT * FROM embryology.fertilisation_check WHERE cycle_id = $1 ORDER BY checked_at", [cycleId]);
    return r.rows.map(checkFrom);
  }
  async saveEmbryo(e: Embryo): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.embryo (id, cycle_id, oocyte_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.cycleId, e.oocyteId, e.createdAt],
    );
  }
  async embryosForCycle(cycleId: string): Promise<readonly Embryo[]> {
    const r = await this.pool.query<EmbryoRow>("SELECT * FROM embryology.embryo WHERE cycle_id = $1 ORDER BY created_at", [cycleId]);
    return r.rows.map(embryoFrom);
  }
  async embryoById(id: EmbryoId): Promise<Embryo | undefined> {
    const r = await this.pool.query<EmbryoRow>("SELECT * FROM embryology.embryo WHERE id = $1", [id]);
    return r.rows[0] ? embryoFrom(r.rows[0]) : undefined;
  }
  async saveGrading(g: GradingEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.grading_entry (id, embryo_id, day, morphology, gardner, recorded_by, assessed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [g.id, g.embryoId, g.day, g.morphology, g.gardner, g.recordedBy, g.assessedAt],
    );
  }
  async gradingsForEmbryo(embryoId: EmbryoId): Promise<readonly GradingEntry[]> {
    const r = await this.pool.query<GradingRow>("SELECT * FROM embryology.grading_entry WHERE embryo_id = $1 ORDER BY day", [embryoId]);
    return r.rows.map(gradingFrom);
  }
  async saveDisposition(d: Disposition): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.disposition (id, embryo_id, cycle_id, type, occurred_at, operator, witness_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.embryoId, d.cycleId, d.type, d.occurredAt, d.operator, d.witnessKey],
    );
  }
  async dispositionsForCycle(cycleId: string): Promise<readonly Disposition[]> {
    const r = await this.pool.query<DispRow>("SELECT * FROM embryology.disposition WHERE cycle_id = $1 ORDER BY occurred_at", [cycleId]);
    return r.rows.map(dispFrom);
  }
  async saveTransfer(t: EmbryoTransfer): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.embryo_transfer (id, cycle_id, embryo_ids, count, catheter, difficulty, ultrasound_guided, procedure_ref, operator, transferred_at, witness_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.cycleId, JSON.stringify(t.embryoIds), t.count, t.catheter, t.difficulty, t.ultrasoundGuided, t.procedureRef, t.operator, t.transferredAt, t.witnessKey],
    );
  }
  async transfersForCycle(cycleId: string): Promise<readonly EmbryoTransfer[]> {
    const r = await this.pool.query<TransferRow>("SELECT * FROM embryology.embryo_transfer WHERE cycle_id = $1 ORDER BY transferred_at", [cycleId]);
    return r.rows.map(transferFrom);
  }
}

interface OocyteRow { id: string; cycle_id: string; retrieval_procedure_id: string; maturity: string; dish: string; position: string; recorded_by: string }
interface InsemRow { id: string; cycle_id: string; oocyte_id: string; method: string; sperm_source_id: string; operator: string; inseminated_at: Date; witness_key: string }
interface CheckRow { id: string; cycle_id: string; oocyte_id: string; pn: string; checked_at: Date; recorded_by: string }
interface EmbryoRow { id: string; cycle_id: string; oocyte_id: string; created_at: Date }
interface GradingRow { id: string; embryo_id: string; day: number; morphology: string; gardner: GardnerGrade | null; recorded_by: string; assessed_at: Date }
interface DispRow { id: string; embryo_id: string; cycle_id: string; type: string; occurred_at: Date; operator: string; witness_key: string }
interface TransferRow { id: string; cycle_id: string; embryo_ids: string[]; count: number; catheter: string; difficulty: string; ultrasound_guided: boolean; procedure_ref: string | null; operator: string; transferred_at: Date; witness_key: string }

const iso = (d: Date): string => new Date(d).toISOString();

function oocyteFrom(r: OocyteRow): Oocyte {
  return { id: asId<"Oocyte">(r.id), cycleId: r.cycle_id, retrievalProcedureId: r.retrieval_procedure_id, maturity: r.maturity as Oocyte["maturity"], dish: r.dish, position: r.position, recordedBy: r.recorded_by };
}
function insemFrom(r: InsemRow): Insemination {
  return { id: asId<"Insemination">(r.id), cycleId: r.cycle_id, oocyteId: asId<"Oocyte">(r.oocyte_id), method: r.method as Insemination["method"], spermSourceId: r.sperm_source_id, operator: r.operator, inseminatedAt: iso(r.inseminated_at), witnessKey: r.witness_key };
}
function checkFrom(r: CheckRow): FertilisationCheck {
  return { id: asId<"FertilisationCheck">(r.id), oocyteId: asId<"Oocyte">(r.oocyte_id), cycleId: r.cycle_id, pn: r.pn as FertilisationCheck["pn"], checkedAt: iso(r.checked_at), recordedBy: r.recorded_by };
}
function embryoFrom(r: EmbryoRow): Embryo {
  return { id: asId<"Embryo">(r.id), cycleId: r.cycle_id, oocyteId: asId<"Oocyte">(r.oocyte_id), createdAt: iso(r.created_at) };
}
function gradingFrom(r: GradingRow): GradingEntry {
  return { id: asId<"GradingEntry">(r.id), embryoId: asId<"Embryo">(r.embryo_id), day: r.day, morphology: r.morphology, gardner: r.gardner, recordedBy: r.recorded_by, assessedAt: iso(r.assessed_at) };
}
function dispFrom(r: DispRow): Disposition {
  return { id: asId<"Disposition">(r.id), embryoId: asId<"Embryo">(r.embryo_id), cycleId: r.cycle_id, type: r.type as Disposition["type"], occurredAt: iso(r.occurred_at), operator: r.operator, witnessKey: r.witness_key };
}
function transferFrom(r: TransferRow): EmbryoTransfer {
  return { id: asId<"EmbryoTransfer">(r.id), cycleId: r.cycle_id, embryoIds: r.embryo_ids.map((e) => asId<"Embryo">(e)), count: r.count, catheter: r.catheter, difficulty: r.difficulty as EmbryoTransfer["difficulty"], ultrasoundGuided: r.ultrasound_guided, procedureRef: r.procedure_ref, operator: r.operator, transferredAt: iso(r.transferred_at), witnessKey: r.witness_key };
}

/** Postgres-backed PgtStore. Append-only PGT order/result capture. */
export class PgPgtStore implements PgtStore {
  constructor(private readonly pool: Pool) {}

  async saveOrder(o: PgtOrder): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.pgt_order (id, embryo_id, cycle_id, type, indication, consent_document_ref, ordered_by, ordered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [o.id, o.embryoId, o.cycleId, o.type, o.indication, o.consentDocumentRef, o.orderedBy, o.orderedAt],
    );
  }
  async ordersForCycle(cycleId: string): Promise<readonly PgtOrder[]> {
    const r = await this.pool.query<PgtOrderRow>("SELECT * FROM embryology.pgt_order WHERE cycle_id = $1 ORDER BY ordered_at", [cycleId]);
    return r.rows.map(pgtOrderFrom);
  }
  async saveResult(res: PgtResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.pgt_result (id, order_id, embryo_id, status, report_ref, resolved_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [res.id, res.orderId, res.embryoId, res.status, res.reportRef, res.resolvedAt, res.recordedBy],
    );
  }
  async resultForOrder(orderId: PgtOrderId): Promise<PgtResult | undefined> {
    const r = await this.pool.query<PgtResultRow>("SELECT * FROM embryology.pgt_result WHERE order_id = $1 LIMIT 1", [orderId]);
    return r.rows[0] ? pgtResultFrom(r.rows[0]) : undefined;
  }
}

interface PgtOrderRow { id: string; embryo_id: string; cycle_id: string; type: string; indication: string; consent_document_ref: string; ordered_by: string; ordered_at: Date }
interface PgtResultRow { id: string; order_id: string; embryo_id: string; status: string; report_ref: string; resolved_at: Date; recorded_by: string }

function pgtOrderFrom(r: PgtOrderRow): PgtOrder {
  return { id: asId<"PgtOrder">(r.id), embryoId: asId<"Embryo">(r.embryo_id), cycleId: r.cycle_id, type: r.type as PgtOrder["type"], indication: r.indication, consentDocumentRef: r.consent_document_ref, orderedBy: r.ordered_by, orderedAt: iso(r.ordered_at) };
}
function pgtResultFrom(r: PgtResultRow): PgtResult {
  return { id: asId<"PgtResult">(r.id), orderId: asId<"PgtOrder">(r.order_id), embryoId: asId<"Embryo">(r.embryo_id), status: r.status as PgtResult["status"], reportRef: r.report_ref, resolvedAt: iso(r.resolved_at), recordedBy: r.recorded_by };
}
