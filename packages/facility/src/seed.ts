import type { FacilityService } from "./facility-service.js";
import type { BilingualName, LocationSpec, TopologySpec } from "./types.js";

// The real four-level building (docs/00 §1, docs/01 §E1): Ground pharmacy;
// L1 = 2 theatres + 3 recovery beds; L2 = 6 inpatient beds; L3 = clinic + lab.
// Bilingual CONFIGURATION DATA (CLAUDE.md: "configuration is data") — the shape
// an admin APPLIES through FacilityService.applyTopology, which is idempotent,
// so seeding is safe to repeat on a persistent database.
export interface SeedResult {
  readonly locations: number;
  readonly beds: number;
}

/** The actor recorded when the canonical topology is applied by a seed helper
 *  rather than by a named admin through the API. */
export const SEED_ACTOR = "system:facility-seed";

const N = (ar: string, en: string): BilingualName => ({ ar, en });

function bedded(level: LocationSpec["level"], type: LocationSpec["type"], ar: string, en: string, label: string): LocationSpec {
  return { level, type, name: N(ar, en), capacity: 1, beds: [label] };
}

/** The canonical Oxford Medical Kuwait topology. */
export const OXFORD_TOPOLOGY: TopologySpec = {
  floors: [
    { level: "ground", name: N("الطابق الأرضي", "Ground Floor") },
    { level: "L1", name: N("الطابق الأول", "Level 1") },
    { level: "L2", name: N("الطابق الثاني", "Level 2") },
    { level: "L3", name: N("الطابق الثالث", "Level 3") },
  ],
  locations: [
    // Ground — pharmacy (external operator; the location is ours)
    { level: "ground", type: "pharmacy", name: N("الصيدلية", "Pharmacy"), capacity: 1 },
    // L1 — two theatres + three recovery beds
    ...[1, 2].map((n): LocationSpec => ({ level: "L1", type: "theatre", name: N(`غرفة العمليات ${n}`, `Theatre ${n}`), capacity: 1 })),
    ...[1, 2, 3].map((n): LocationSpec => bedded("L1", "recovery_bed", `سرير الإفاقة ${n}`, `Recovery Bed ${n}`, `L1-R${n}`)),
    // L2 — six inpatient beds
    ...[1, 2, 3, 4, 5, 6].map((n): LocationSpec => bedded("L2", "inpatient_bed", `سرير التنويم ${n}`, `Inpatient Bed ${n}`, `L2-${n}`)),
    // L3 — clinic (consult + scan rooms) and the IVF lab
    ...[1, 2, 3, 4].map((n): LocationSpec => ({ level: "L3", type: "consult_room", name: N(`غرفة الاستشارة ${n}`, `Consult Room ${n}`), capacity: 1 })),
    ...[1, 2].map((n): LocationSpec => ({ level: "L3", type: "scan_room", name: N(`غرفة الأشعة ${n}`, `Ultrasound Room ${n}`), capacity: 1 })),
    { level: "L3", type: "lab", name: N("مختبر الأجنة", "IVF Laboratory"), capacity: 1 },
  ],
};

/** Apply the canonical topology (idempotent — see FacilityService.applyTopology).
 *  Returns what this call CREATED, so seeding an empty facility reports the full
 *  layout and re-seeding reports zero. */
export async function seedFacility(svc: FacilityService, actorId: string = SEED_ACTOR): Promise<SeedResult> {
  const r = await svc.applyTopology(actorId, OXFORD_TOPOLOGY);
  return { locations: r.created.locations, beds: r.created.beds };
}
