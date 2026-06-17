// P2 — TIME-LAPSE MORPHOKINETIC ANALYTICS, end-to-end on real Postgres. Proves:
// optimal ranges are config; a per-embryo annotation derives intervals, scores
// against the ranges, flags direct cleavage, and persists (jsonb round-trip) —
// with the audit chain intact. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedMorphokineticRanges, MORPHOKINETIC_RANGES } from "@oxford/embryology";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const EMBRYO = "emb-mk-1";

describe.skipIf(!DATABASE_URL)("P2 morphokinetic analytics (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedMorphokineticRanges(pool, MORPHOKINETIC_RANGES);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE embryology.morphokinetic_annotation");
    await pool.query("DELETE FROM embryology.embryo WHERE id = $1", [EMBRYO]);
    await pool.query("INSERT INTO embryology.embryo (id, cycle_id, oocyte_id, created_at) VALUES ($1,$2,$3,now()) ON CONFLICT (id) DO NOTHING", [EMBRYO, "cyc-mk-1", "ooc-mk-1"]);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lists range config and annotates an embryo with derived analytics", async () => {
    expect((await services.morphokinetics.listRanges()).map((r) => r.code)).toEqual(expect.arrayContaining(["t2", "cc2", "t5_t2"]));

    const good = await services.morphokinetics.recordAnnotation("emb-1", { embryoId: EMBRYO, source: "EmbryoScope", events: { t2: 26, t3: 37, t4: 40, t5: 50 }, annotatedAt: "2026-06-14T08:00:00.000Z" });
    expect(good.ok && good.value.score).toBe(6);
    expect(good.ok && good.value.intervals.cc2).toBe(11);

    const dc = await services.morphokinetics.recordAnnotation("emb-1", { embryoId: EMBRYO, source: "Geri", events: { t2: 24, t3: 27 }, annotatedAt: "2026-06-14T09:00:00.000Z" });
    expect(dc.ok && dc.value.flags).toContain("direct_cleavage");

    // persisted history round-trips (jsonb events/intervals/inRange preserved)
    const history = await services.morphokinetics.annotationsForEmbryo(good.ok ? good.value.embryoId : (EMBRYO as never));
    expect(history).toHaveLength(2);
    const newest = history[0]!;
    expect(newest.flags).toContain("direct_cleavage"); // newest first
    expect(history[1]!.inRange.t2).toBe(true);

    // unknown embryo rejected
    expect((await services.morphokinetics.recordAnnotation("emb-1", { embryoId: "ghost", source: "EmbryoScope", events: { t2: 26 }, annotatedAt: "2026-06-14T10:00:00.000Z" })).ok).toBe(false);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
