import type { CryoSpecimen, CryoSpecimenId, CustodyEvent, DispositionReview, EngagementState, LnFill, StorageConsent, Tank, TankReading } from "./types.js";

export interface CryostoreStore {
  saveTank(t: Tank): Promise<void>;
  tanks(): Promise<readonly Tank[]>;
  getTank(tankId: string): Promise<Tank | undefined>;

  saveSpecimen(s: CryoSpecimen): Promise<void>;
  specimenById(id: CryoSpecimenId): Promise<CryoSpecimen | undefined>;
  specimensForOwner(kind: string, id: string): Promise<readonly CryoSpecimen[]>;
  /** A currently-stored specimen at the given full position, if any (occupancy). */
  storedSpecimenAt(positionKey: string): Promise<CryoSpecimen | undefined>;

  saveCustodyEvent(e: CustodyEvent): Promise<void>;
  custodyForSpecimen(id: CryoSpecimenId): Promise<readonly CustodyEvent[]>;

  saveConsent(c: StorageConsent): Promise<void>;
  consentForSpecimen(id: CryoSpecimenId): Promise<StorageConsent | undefined>;
  activeConsents(): Promise<readonly StorageConsent[]>;

  saveReading(r: TankReading): Promise<void>;
  readingsForTank(tankId: string): Promise<readonly TankReading[]>;

  saveLnFill(f: LnFill): Promise<void>;
  /** LN₂ fills for a tank within [since, until] (inclusive), newest first. */
  lnFillsForTank(tankId: string, since: string, until: string): Promise<readonly LnFill[]>;

  saveEngagement(specimenId: CryoSpecimenId, state: EngagementState): Promise<void>;
  engagementFor(specimenId: CryoSpecimenId): Promise<EngagementState>;

  saveReview(review: DispositionReview): Promise<void>;
  openReviewForSpecimen(specimenId: CryoSpecimenId): Promise<DispositionReview | undefined>;
  reviewsForSpecimen(specimenId: CryoSpecimenId): Promise<readonly DispositionReview[]>;
}

/** A position is unique across the topology; this key addresses it. */
export const positionKey = (p: { tankId: string; canister: string; cane: string; position: string }): string =>
  `${p.tankId}/${p.canister}/${p.cane}/${p.position}`;

export class InMemoryCryostoreStore implements CryostoreStore {
  private readonly tankList: Tank[] = [];
  private readonly specimens: CryoSpecimen[] = [];
  private readonly custody: CustodyEvent[] = [];
  private readonly consents: StorageConsent[] = [];
  private readonly readings: TankReading[] = [];
  private readonly lnFills: LnFill[] = [];
  private readonly engagement = new Map<string, EngagementState>();
  private readonly reviews: DispositionReview[] = [];

  async saveTank(t: Tank): Promise<void> {
    this.tankList.push(t);
  }
  async tanks(): Promise<readonly Tank[]> {
    return this.tankList;
  }
  async getTank(tankId: string): Promise<Tank | undefined> {
    return this.tankList.find((t) => t.id === tankId);
  }
  async saveSpecimen(s: CryoSpecimen): Promise<void> {
    const idx = this.specimens.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.specimens[idx] = s;
    else this.specimens.push(s);
  }
  async specimenById(id: CryoSpecimenId): Promise<CryoSpecimen | undefined> {
    return this.specimens.find((s) => s.id === id);
  }
  async specimensForOwner(kind: string, id: string): Promise<readonly CryoSpecimen[]> {
    return this.specimens.filter((s) => s.owner.kind === kind && s.owner.id === id);
  }
  async storedSpecimenAt(key: string): Promise<CryoSpecimen | undefined> {
    return this.specimens.find((s) => s.status === "stored" && positionKey(s.position) === key);
  }
  async saveCustodyEvent(e: CustodyEvent): Promise<void> {
    this.custody.push(e);
  }
  async custodyForSpecimen(id: CryoSpecimenId): Promise<readonly CustodyEvent[]> {
    return this.custody.filter((e) => e.specimenId === id);
  }
  async saveConsent(c: StorageConsent): Promise<void> {
    const idx = this.consents.findIndex((x) => x.specimenId === c.specimenId);
    if (idx >= 0) this.consents[idx] = c;
    else this.consents.push(c);
  }
  async consentForSpecimen(id: CryoSpecimenId): Promise<StorageConsent | undefined> {
    return this.consents.find((c) => c.specimenId === id);
  }
  async activeConsents(): Promise<readonly StorageConsent[]> {
    return this.consents;
  }
  async saveReading(r: TankReading): Promise<void> {
    this.readings.push(r);
  }
  async readingsForTank(tankId: string): Promise<readonly TankReading[]> {
    return this.readings.filter((r) => r.tankId === tankId);
  }
  async saveLnFill(f: LnFill): Promise<void> {
    this.lnFills.push(f);
  }
  async lnFillsForTank(tankId: string, since: string, until: string): Promise<readonly LnFill[]> {
    return this.lnFills
      .filter((f) => f.tankId === tankId && f.filledAt >= since && f.filledAt <= until)
      .sort((a, b) => b.filledAt.localeCompare(a.filledAt));
  }
  async saveEngagement(specimenId: CryoSpecimenId, state: EngagementState): Promise<void> {
    this.engagement.set(specimenId, state);
  }
  async engagementFor(specimenId: CryoSpecimenId): Promise<EngagementState> {
    return this.engagement.get(specimenId) ?? "current";
  }
  async saveReview(review: DispositionReview): Promise<void> {
    const idx = this.reviews.findIndex((r) => r.id === review.id);
    if (idx >= 0) this.reviews[idx] = review;
    else this.reviews.push(review);
  }
  async openReviewForSpecimen(specimenId: CryoSpecimenId): Promise<DispositionReview | undefined> {
    return this.reviews.find((r) => r.specimenId === specimenId && r.state === "open");
  }
  async reviewsForSpecimen(specimenId: CryoSpecimenId): Promise<readonly DispositionReview[]> {
    return this.reviews.filter((r) => r.specimenId === specimenId);
  }
}
