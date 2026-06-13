import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type {
  CryoSpecimen,
  CryoSpecimenId,
  CryoPosition,
  CustodyEvent,
  DispositionReview,
  EngagementState,
  SpecimenOwner,
  StorageConsent,
  Tank,
  TankReading,
} from "./types.js";
import type { CryostoreStore } from "./store.js";
import { positionKey } from "./store.js";

/** Postgres-backed CryostoreStore. Specimen status is updated in place
 *  (stored→thawed/discarded is a soft state change, audited); custody is
 *  append-only. */
export class PgCryostoreStore implements CryostoreStore {
  constructor(private readonly pool: Pool) {}

  async saveTank(t: Tank): Promise<void> {
    await this.pool.query("INSERT INTO cryostore.tank (id, label) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [t.id, t.label]);
  }
  async tanks(): Promise<readonly Tank[]> {
    const r = await this.pool.query<{ id: string; label: string }>("SELECT * FROM cryostore.tank ORDER BY label");
    return r.rows.map((x) => ({ id: asId<"Tank">(x.id), label: x.label }));
  }

  async saveSpecimen(s: CryoSpecimen): Promise<void> {
    await this.pool.query(
      `INSERT INTO cryostore.cryo_specimen (id, kind, owner, cycle_id, straws, position, position_key, status, freeze_event_ref, witness_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET position=EXCLUDED.position, position_key=EXCLUDED.position_key, status=EXCLUDED.status`,
      [s.id, s.kind, JSON.stringify(s.owner), s.cycleId, s.straws, JSON.stringify(s.position), positionKey(s.position), s.status, s.freezeEventRef, s.witnessKey, s.createdAt],
    );
  }
  async specimenById(id: CryoSpecimenId): Promise<CryoSpecimen | undefined> {
    const r = await this.pool.query<SpecimenRow>("SELECT * FROM cryostore.cryo_specimen WHERE id = $1", [id]);
    return r.rows[0] ? specimenFrom(r.rows[0]) : undefined;
  }
  async specimensForOwner(kind: string, id: string): Promise<readonly CryoSpecimen[]> {
    const r = await this.pool.query<SpecimenRow>(
      "SELECT * FROM cryostore.cryo_specimen WHERE owner->>'kind' = $1 AND owner->>'id' = $2 ORDER BY created_at",
      [kind, id],
    );
    return r.rows.map(specimenFrom);
  }
  async storedSpecimenAt(key: string): Promise<CryoSpecimen | undefined> {
    const r = await this.pool.query<SpecimenRow>("SELECT * FROM cryostore.cryo_specimen WHERE position_key = $1 AND status = 'stored'", [key]);
    return r.rows[0] ? specimenFrom(r.rows[0]) : undefined;
  }

  async saveCustodyEvent(e: CustodyEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO cryostore.custody_event (id, specimen_id, type, from_position, to_position, occurred_at, operator, witness_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.specimenId, e.type, e.fromPosition ? JSON.stringify(e.fromPosition) : null, e.toPosition ? JSON.stringify(e.toPosition) : null, e.occurredAt, e.operator, e.witnessKey],
    );
  }
  async custodyForSpecimen(id: CryoSpecimenId): Promise<readonly CustodyEvent[]> {
    const r = await this.pool.query<CustodyRow>("SELECT * FROM cryostore.custody_event WHERE specimen_id = $1 ORDER BY occurred_at", [id]);
    return r.rows.map(custodyFrom);
  }

  async saveConsent(c: StorageConsent): Promise<void> {
    await this.pool.query(
      `INSERT INTO cryostore.storage_consent (id, specimen_id, consented_at, expires_at, renewed_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (specimen_id) DO UPDATE SET consented_at=EXCLUDED.consented_at, expires_at=EXCLUDED.expires_at, renewed_at=EXCLUDED.renewed_at`,
      [c.id, c.specimenId, c.consentedAt, c.expiresAt, c.renewedAt],
    );
  }
  async consentForSpecimen(id: CryoSpecimenId): Promise<StorageConsent | undefined> {
    const r = await this.pool.query<ConsentRow>("SELECT * FROM cryostore.storage_consent WHERE specimen_id = $1", [id]);
    return r.rows[0] ? consentFrom(r.rows[0]) : undefined;
  }
  async activeConsents(): Promise<readonly StorageConsent[]> {
    const r = await this.pool.query<ConsentRow>("SELECT * FROM cryostore.storage_consent ORDER BY expires_at");
    return r.rows.map(consentFrom);
  }

  async saveReading(r: TankReading): Promise<void> {
    await this.pool.query(
      `INSERT INTO cryostore.tank_reading (id, tank_id, temperature_c, nitrogen_level_pct, recorded_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.tankId, r.temperatureC, r.nitrogenLevelPct, r.recordedAt],
    );
  }
  async readingsForTank(tankId: string): Promise<readonly TankReading[]> {
    const r = await this.pool.query<ReadingRow>("SELECT * FROM cryostore.tank_reading WHERE tank_id = $1 ORDER BY recorded_at", [tankId]);
    return r.rows.map(readingFrom);
  }

  async saveEngagement(specimenId: CryoSpecimenId, state: EngagementState): Promise<void> {
    await this.pool.query(
      "INSERT INTO cryostore.engagement (specimen_id, state) VALUES ($1,$2) ON CONFLICT (specimen_id) DO UPDATE SET state=EXCLUDED.state",
      [specimenId, state],
    );
  }
  async engagementFor(specimenId: CryoSpecimenId): Promise<EngagementState> {
    const r = await this.pool.query<{ state: string }>("SELECT state FROM cryostore.engagement WHERE specimen_id = $1", [specimenId]);
    return (r.rows[0]?.state as EngagementState | undefined) ?? "current";
  }

  async saveReview(review: DispositionReview): Promise<void> {
    await this.pool.query(
      `INSERT INTO cryostore.disposition_review (id, specimen_id, reason, state, outcome, rationale, opened_by, opened_at, resolved_by, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state, outcome=EXCLUDED.outcome, rationale=EXCLUDED.rationale, resolved_by=EXCLUDED.resolved_by, resolved_at=EXCLUDED.resolved_at`,
      [review.id, review.specimenId, review.reason, review.state, review.outcome, review.rationale, review.openedBy, review.openedAt, review.resolvedBy, review.resolvedAt],
    );
  }
  async openReviewForSpecimen(specimenId: CryoSpecimenId): Promise<DispositionReview | undefined> {
    const r = await this.pool.query<ReviewRow>("SELECT * FROM cryostore.disposition_review WHERE specimen_id = $1 AND state = 'open' ORDER BY opened_at LIMIT 1", [specimenId]);
    return r.rows[0] ? reviewFrom(r.rows[0]) : undefined;
  }
  async reviewsForSpecimen(specimenId: CryoSpecimenId): Promise<readonly DispositionReview[]> {
    const r = await this.pool.query<ReviewRow>("SELECT * FROM cryostore.disposition_review WHERE specimen_id = $1 ORDER BY opened_at", [specimenId]);
    return r.rows.map(reviewFrom);
  }
}

interface SpecimenRow { id: string; kind: string; owner: SpecimenOwner; cycle_id: string; straws: number; position: CryoPosition; status: string; freeze_event_ref: string; witness_key: string; created_at: Date }
interface CustodyRow { id: string; specimen_id: string; type: string; from_position: CryoPosition | null; to_position: CryoPosition | null; occurred_at: Date; operator: string; witness_key: string }
interface ConsentRow { id: string; specimen_id: string; consented_at: Date; expires_at: Date; renewed_at: Date | null }
interface ReadingRow { id: string; tank_id: string; temperature_c: number; nitrogen_level_pct: number; recorded_at: Date }
interface ReviewRow { id: string; specimen_id: string; reason: string; state: string; outcome: string | null; rationale: string | null; opened_by: string; opened_at: Date; resolved_by: string | null; resolved_at: Date | null }

const iso = (d: Date): string => new Date(d).toISOString();

function specimenFrom(r: SpecimenRow): CryoSpecimen {
  return {
    id: asId<"CryoSpecimen">(r.id),
    kind: r.kind as CryoSpecimen["kind"],
    owner: r.owner,
    cycleId: r.cycle_id,
    straws: r.straws,
    position: r.position,
    status: r.status as CryoSpecimen["status"],
    freezeEventRef: r.freeze_event_ref,
    witnessKey: r.witness_key,
    createdAt: iso(r.created_at),
  };
}
function custodyFrom(r: CustodyRow): CustodyEvent {
  return {
    id: asId<"CustodyEvent">(r.id),
    specimenId: asId<"CryoSpecimen">(r.specimen_id),
    type: r.type as CustodyEvent["type"],
    fromPosition: r.from_position,
    toPosition: r.to_position,
    occurredAt: iso(r.occurred_at),
    operator: r.operator,
    witnessKey: r.witness_key,
  };
}
function consentFrom(r: ConsentRow): StorageConsent {
  return {
    id: asId<"StorageConsent">(r.id),
    specimenId: asId<"CryoSpecimen">(r.specimen_id),
    consentedAt: iso(r.consented_at),
    expiresAt: iso(r.expires_at),
    renewedAt: r.renewed_at ? iso(r.renewed_at) : null,
  };
}
function readingFrom(r: ReadingRow): TankReading {
  return { id: asId<"TankReading">(r.id), tankId: r.tank_id, temperatureC: r.temperature_c, nitrogenLevelPct: r.nitrogen_level_pct, recordedAt: iso(r.recorded_at) };
}
function reviewFrom(r: ReviewRow): DispositionReview {
  return {
    id: asId<"DispositionReview">(r.id),
    specimenId: asId<"CryoSpecimen">(r.specimen_id),
    reason: r.reason as DispositionReview["reason"],
    state: r.state as DispositionReview["state"],
    outcome: r.outcome as DispositionReview["outcome"],
    rationale: r.rationale,
    openedBy: r.opened_by,
    openedAt: iso(r.opened_at),
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at ? iso(r.resolved_at) : null,
  };
}
