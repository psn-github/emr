import type { FacilityService } from "./facility-service.js";

// The real four-level building (docs/00 §1, docs/01 §E1): Ground pharmacy;
// L1 = 2 theatres + 3 recovery beds; L2 = 6 inpatient beds; L3 = clinic + lab.
// Bilingual config data. Idempotency/uniqueness is the caller's concern (seed
// into an empty facility).
export interface SeedResult {
  readonly locations: number;
  readonly beds: number;
}

export async function seedFacility(svc: FacilityService): Promise<SeedResult> {
  let locations = 0;
  let beds = 0;

  await svc.addFloor("ground", { ar: "الطابق الأرضي", en: "Ground Floor" });
  await svc.addFloor("L1", { ar: "الطابق الأول", en: "Level 1" });
  await svc.addFloor("L2", { ar: "الطابق الثاني", en: "Level 2" });
  await svc.addFloor("L3", { ar: "الطابق الثالث", en: "Level 3" });

  // Ground — pharmacy
  await svc.addLocation("ground", "pharmacy", { ar: "الصيدلية", en: "Pharmacy" }, 1);
  locations++;

  // L1 — two theatres + three recovery beds
  for (const n of [1, 2]) {
    await svc.addLocation("L1", "theatre", { ar: `غرفة العمليات ${n}`, en: `Theatre ${n}` }, 1);
    locations++;
  }
  for (const n of [1, 2, 3]) {
    const node = await svc.addLocation("L1", "recovery_bed", { ar: `سرير الإفاقة ${n}`, en: `Recovery Bed ${n}` }, 1);
    locations++;
    await svc.addBed(node.id, `L1-R${n}`);
    beds++;
  }

  // L2 — six inpatient beds
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const node = await svc.addLocation("L2", "inpatient_bed", { ar: `سرير التنويم ${n}`, en: `Inpatient Bed ${n}` }, 1);
    locations++;
    await svc.addBed(node.id, `L2-${n}`);
    beds++;
  }

  // L3 — clinic (consult + scan rooms) and the IVF lab
  for (const n of [1, 2, 3, 4]) {
    await svc.addLocation("L3", "consult_room", { ar: `غرفة الاستشارة ${n}`, en: `Consult Room ${n}` }, 1);
    locations++;
  }
  for (const n of [1, 2]) {
    await svc.addLocation("L3", "scan_room", { ar: `غرفة الأشعة ${n}`, en: `Ultrasound Room ${n}` }, 1);
    locations++;
  }
  await svc.addLocation("L3", "lab", { ar: "مختبر الأجنة", en: "IVF Laboratory" }, 1);
  locations++;

  return { locations, beds };
}
