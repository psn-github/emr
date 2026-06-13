import type { Id } from "@oxford/core";

// Cryostorage types (docs/01 §E6; ADR-0015/AMD-0002 ownership; AMD-0003 billing).
// RI Witness is authoritative for witnessing; cryostore reconciles via the seam.

export type CryoSpecimenId = Id<"CryoSpecimen">;
export type CustodyEventId = Id<"CustodyEvent">;
export type TankId = Id<"Tank">;
export type StorageConsentId = Id<"StorageConsent">;
export type TankReadingId = Id<"TankReading">;

export type SpecimenKind = "oocyte" | "embryo" | "sperm" | "tissue";
export type SpecimenStatus = "stored" | "thawed" | "discarded" | "transferred";

/** Owner is a person OR a couple (ADR-0015/AMD-0002): person-owned for
 *  preservation, couple-owned for treatment/embryos. */
export type OwnerKind = "person" | "couple";
export interface SpecimenOwner {
  readonly kind: OwnerKind;
  readonly id: string;
}

/** A fully addressable storage position: tank → canister → cane → position. */
export interface CryoPosition {
  readonly tankId: string;
  readonly canister: string;
  readonly cane: string;
  readonly position: string;
}

export interface Tank {
  readonly id: TankId;
  readonly label: string;
}

export interface CryoSpecimen {
  readonly id: CryoSpecimenId;
  readonly kind: SpecimenKind;
  readonly owner: SpecimenOwner;
  readonly cycleId: string;
  readonly straws: number;
  readonly position: CryoPosition;
  readonly status: SpecimenStatus;
  readonly freezeEventRef: string;
  readonly witnessKey: string;
  readonly createdAt: string;
}

export type CustodyEventType = "freeze" | "move" | "thaw" | "discard";

export interface CustodyEvent {
  readonly id: CustodyEventId;
  readonly specimenId: CryoSpecimenId;
  readonly type: CustodyEventType;
  readonly fromPosition: CryoPosition | null;
  readonly toPosition: CryoPosition | null;
  readonly occurredAt: string;
  readonly operator: string;
  readonly witnessKey: string;
}

export interface StorageConsent {
  readonly id: StorageConsentId;
  readonly specimenId: CryoSpecimenId;
  readonly consentedAt: string;
  /** Configurable: derived from the clinic's Kuwaiti legal storage limit. */
  readonly expiresAt: string;
  readonly renewedAt: string | null;
}

export interface TankReading {
  readonly id: TankReadingId;
  readonly tankId: string;
  readonly temperatureC: number;
  readonly nitrogenLevelPct: number;
  readonly recordedAt: string;
}

/** Non-engagement / non-payment pathway (AMD-0003). Strictly graduated; there is
 *  no automated-destruction state — terminal disposition is a reviewed human
 *  step bounded by the pending legal confirms. */
export type EngagementState = "current" | "reminded" | "overdue" | "in_legal_review";

export type DispositionReviewId = Id<"DispositionReview">;

/** Why a specimen entered disposition review. Extensible; marital-status change
 *  (couple dissolution) is the first reason (AMD-0004). */
export type ReviewReason = "marital_status_change";

/** The reviewed human decision. `retain` keeps the specimen in storage; `discard`
 *  routes through the witnessed, audited discard. Never automatic. */
export type ReviewOutcome = "retain" | "discard";

export interface DispositionReview {
  readonly id: DispositionReviewId;
  readonly specimenId: CryoSpecimenId;
  readonly reason: ReviewReason;
  readonly state: "open" | "resolved";
  readonly outcome: ReviewOutcome | null;
  readonly rationale: string | null;
  readonly openedBy: string;
  readonly openedAt: string;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
}
