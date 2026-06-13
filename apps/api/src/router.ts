import { TRPCError } from "@trpc/server";
import { asId } from "@oxford/core";
import type { LanguagePref, Sex } from "@oxford/registry";
import type { EncounterType, OrderKind } from "@oxford/clinical";
import type { InvoiceLine, PaymentMethod } from "@oxford/billing";
import type { SemenParameters } from "@oxford/andrology";
import type { OutcomeType } from "@oxford/outcomes";
import type { SpecimenKind, SpecimenOwner, CryoPosition, EngagementAction, ReviewOutcome } from "@oxford/cryostore";
import type { PgtType, PgtResultStatus } from "@oxford/embryology";
import type { ItemCategory } from "@oxford/inventory";
import type { AssetCategory } from "@oxford/assets";
import type { JourneyStage, WhoPhase, AnaesthesiaUnit, ConsumableUseInput } from "@oxford/perioperative";
import { router, protectedProcedure, patientProcedure } from "./trpc.js";
import { assertOwnData } from "./patient-access.js";

// The internal tRPC surface. Domain services do the work; procedures only
// declare the permission, validate input, and map domain errors to transport
// codes. A thin REST/FHIR surface (ADR-0009) wraps the same services for
// external consumers and is added alongside this.

interface RegisterInput {
  name: { ar: string; en: string };
  civilId: string;
  dob: string;
  sex: Sex;
  nationality: string;
  languagePref: LanguagePref;
}

const asRegisterInput = (v: unknown): RegisterInput => {
  const o = v as RegisterInput;
  if (!o?.name?.ar || !o.name.en || !o.civilId || !o.dob) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "invalid person input" });
  }
  return o;
};
const asCoupleInput = (v: unknown): { husbandPersonId: string; wifePersonId: string } =>
  v as { husbandPersonId: string; wifePersonId: string };
const asVerifyInput = (v: unknown): { coupleId: string; documentRef: string; method: string } =>
  v as { coupleId: string; documentRef: string; method: string };
const asCoupleId = (v: unknown): { coupleId: string } => v as { coupleId: string };

export const appRouter = router({
  registry: router({
    registerPerson: protectedProcedure("clinical:patient.register")
      .input(asRegisterInput)
      .mutation(async ({ ctx, input }) => {
        const p = await ctx.services.registry.registerPerson(ctx.session.subject.staffId, input);
        return { personId: p.id };
      }),

    createCouple: protectedProcedure("clinical:patient.register")
      .input(asCoupleInput)
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.registry.createCouple(
          ctx.session.subject.staffId,
          asId<"Person">(input.husbandPersonId),
          asId<"Person">(input.wifePersonId),
        );
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid couple" });
        return { coupleId: r.value.id };
      }),

    verifyMarriage: protectedProcedure("clinical:patient.register")
      .input(asVerifyInput)
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.registry.verifyMarriage(
          ctx.session.subject.staffId,
          asId<"Couple">(input.coupleId),
          { documentRef: input.documentRef, method: input.method },
        );
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "verify failed" });
        return { status: r.value.status };
      }),

    // Clinician-attested death record — the authoritative vital status for the
    // cryostore no-posthumous-use gate. Restricted permission.
    recordDeath: protectedProcedure("clinical:vital_status.write")
      .input((v: unknown) => v as { personId: string; dateOfDeath: string; documentRef: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.registry.recordDeath(ctx.session.subject.staffId, asId<"Person">(input.personId), { dateOfDeath: input.dateOfDeath, documentRef: input.documentRef });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "record death failed" });
        return { deathRecordId: r.value.id };
      }),

    // Dissolve a couple on a marital-status change and OPEN a cryostore
    // disposition review of its specimens (never auto-disposes; AMD-0004).
    dissolveCouple: protectedProcedure("clinical:patient.register")
      .input((v: unknown) => v as { coupleId: string; reason: string })
      .mutation(async ({ ctx, input }) => {
        const actor = ctx.session.subject.staffId;
        const d = await ctx.services.registry.dissolveCouple(actor, asId<"Couple">(input.coupleId), input.reason);
        if (!d.ok) throw new TRPCError({ code: "BAD_REQUEST", message: d.error.detailKey ?? "dissolve failed" });
        const opened = await ctx.services.cryostore.openDispositionReview(actor, { kind: "couple", id: input.coupleId }, "marital_status_change");
        return { status: d.value.status, reviewsOpened: opened.length };
      }),
  }),

  // Cryostorage. Lab custody (freeze/thaw/discard/consent/locate) is the
  // embryology domain; the annual storage charge + non-engagement pathway is the
  // financial domain. The thaw re-gate enforces ownership + the no-posthumous-use
  // invariant via registry facts (no override).
  cryostore: router({
    freeze: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { kind: SpecimenKind; owner: SpecimenOwner; cycleId: string; straws: number; position: CryoPosition; freezeEventRef: string; patientId: string; occurredAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cryostore.freezeIntoStorage(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "CONFLICT", message: r.error.detailKey ?? "freeze failed" });
        return { specimenId: r.value.id };
      }),
    thaw: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { specimenId: string; coupleId: string; patientId: string; occurredAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cryostore.thawForTreatment(ctx.session.subject.staffId, asId<"CryoSpecimen">(input.specimenId), input.coupleId, input.patientId, input.occurredAt);
        if (!r.ok) {
          const blocked = r.error.code === "FORBIDDEN" || r.error.code === "PRECONDITION_FAILED";
          throw new TRPCError({ code: blocked ? "FORBIDDEN" : "BAD_REQUEST", message: r.error.detailKey ?? "thaw blocked" });
        }
        return { status: r.value.status };
      }),
    recordConsent: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { specimenId: string; consentedAt: string; storageYears: number })
      .mutation(async ({ ctx, input }) => {
        const c = await ctx.services.cryostore.recordStorageConsent(ctx.session.subject.staffId, asId<"CryoSpecimen">(input.specimenId), input.consentedAt, input.storageYears);
        return { consentId: c.id, expiresAt: c.expiresAt };
      }),
    locate: protectedProcedure("embryology:lab.read")
      .input((v: unknown) => v as { specimenId: string })
      .query(async ({ ctx, input }) => {
        const r = await ctx.services.cryostore.locate(asId<"CryoSpecimen">(input.specimenId));
        if (!r.ok) throw new TRPCError({ code: "NOT_FOUND", message: r.error.detailKey ?? "not found" });
        return r.value;
      }),
    raiseAnnualCharge: protectedProcedure("financial:invoice.write")
      .input((v: unknown) => v as { specimenId: string; patientId: string; chargeCode: string; descriptionEn: string; descriptionAr: string; amountFils: number })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cryostore.raiseAnnualStorageCharge(ctx.session.subject.staffId, asId<"CryoSpecimen">(input.specimenId), input.patientId, { chargeCode: input.chargeCode, descriptionEn: input.descriptionEn, descriptionAr: input.descriptionAr, amountFils: input.amountFils });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "charge failed" });
        return { invoiceId: r.value.invoiceId };
      }),
    advanceEngagement: protectedProcedure("financial:invoice.write")
      .input((v: unknown) => v as { specimenId: string; action: EngagementAction })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cryostore.advanceEngagement(ctx.session.subject.staffId, asId<"CryoSpecimen">(input.specimenId), input.action);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "bad transition" });
        return { state: r.value };
      }),
    // Resolve a marital-status disposition review — an explicit human decision
    // (retain / witnessed-discard) with a recorded rationale. Never automatic.
    resolveDispositionReview: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { specimenId: string; outcome: ReviewOutcome; rationale: string; patientId: string; occurredAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cryostore.resolveDispositionReview(ctx.session.subject.staffId, asId<"CryoSpecimen">(input.specimenId), input.outcome, input.rationale, input.patientId, input.occurredAt);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "resolve failed" });
        return { state: r.value.state, outcome: r.value.outcome };
      }),
  }),

  fertility: router({
    // THE MARRIAGE GATE, AT THE API. Starting any fertility workflow is blocked
    // server-side unless the couple has a verified marriage record.
    startIntake: protectedProcedure("clinical:cycle.create")
      .input(asCoupleId)
      .mutation(async ({ ctx, input }) => {
        const gate = await ctx.services.registry.canStartFertility(asId<"Couple">(input.coupleId));
        if (!gate.ok) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: gate.error.detailKey ?? "blocked" });
        }
        return { started: true };
      }),
  }),

  embryology: router({
    // Embryology lab data — embryology domain permission required (MFA-gated).
    read: protectedProcedure("embryology:lab.read").query(() => ({ ok: true })),

    // Record an insemination/ICSI handling event (witnessed via RI Witness).
    recordInsemination: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { cycleId: string; oocyteId: string; method: "IVF" | "ICSI"; spermSourceId: string; operator: string; inseminatedAt: string; patientId: string })
      .mutation(async ({ ctx, input }) => {
        const rec = await ctx.services.embryology.recordInsemination(ctx.session.subject.staffId, input);
        return { inseminationId: rec.id };
      }),

    // Embryo transfer — a TERMINAL act. Blocked unless every gamete/embryo
    // handling event reconciles with RI Witness (no override).
    recordTransfer: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { cycleId: string; embryoIds: string[]; catheter: string; difficulty: "easy" | "moderate" | "difficult"; ultrasoundGuided: boolean; procedureRef?: string; operator: string; transferredAt: string; patientId: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.embryology.recordTransfer(ctx.session.subject.staffId, input);
        if (!r.ok) {
          const blocked = r.error.detailKey === "witnessing.sign_off.blocked";
          throw new TRPCError({ code: blocked ? "PRECONDITION_FAILED" : "BAD_REQUEST", message: r.error.detailKey ?? "transfer failed" });
        }
        return { transferId: r.value.id, count: r.value.count };
      }),

    // Terminal disposition (freeze/discard/PGT-biopsy) — same witnessing gate.
    recordDisposition: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { cycleId: string; embryoId: string; type: "transfer" | "freeze" | "discard" | "pgt_biopsy"; occurredAt: string; operator: string; patientId: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.embryology.recordDisposition(ctx.session.subject.staffId, input);
        if (!r.ok) {
          const blocked = r.error.detailKey === "witnessing.sign_off.blocked";
          throw new TRPCError({ code: blocked ? "PRECONDITION_FAILED" : "BAD_REQUEST", message: r.error.detailKey ?? "disposition failed" });
        }
        return { dispositionId: r.value.id };
      }),

    // PGT order/consent/result capture (genetics lab stays external). Orders are
    // rejected unless a consent is captured AND the indication is in the clinic's
    // counsel-confirmed permitted set (config; empty by default).
    orderPgt: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { embryoId: string; cycleId: string; type: PgtType; indication: string; consentDocumentRef: string; orderedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.pgt.orderPgt(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "pgt order rejected" });
        return { orderId: r.value.id };
      }),
    recordPgtResult: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { orderId: string; embryoId: string; status: PgtResultStatus; reportRef: string; resolvedAt: string })
      .mutation(async ({ ctx, input }) => {
        const res = await ctx.services.pgt.recordPgtResult(ctx.session.subject.staffId, input);
        return { resultId: res.id, status: res.status };
      }),

    // Media-lot ↔ embryo traceability (docs/01 §E4). Records which media/consumable
    // lot (the inventory's itemId + lotNo) touched which embryo/oocyte — append-only.
    recordMediaApplication: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { cycleId: string; embryoId?: string; oocyteId?: string; itemId: string; lotNo: string; step: string; quantity: number; appliedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.embryology.recordMediaApplication(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "media application rejected" });
        return { applicationId: r.value.id };
      }),
    // Recall reachability: every embryo/oocyte/cycle exposed to a recalled lot.
    mediaRecall: protectedProcedure("embryology:lab.read")
      .input((v: unknown) => v as { itemId: string; lotNo: string })
      .query(async ({ ctx, input }) => ctx.services.embryology.mediaRecall(input.itemId, input.lotNo)),
  }),

  // Andrology lab (WHO 6th-ed semen analysis; sperm prep/freeze/retrieval).
  // Lab data → the embryology permission domain (MFA-gated).
  andrology: router({
    recordSemenAnalysis: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { patientId: string; collectedAt: string; parameters: SemenParameters })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.andrology.recordSemenAnalysis(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid analysis" });
        return { analysisId: r.value.id, allWithinReference: r.value.allWithinReference, flags: r.value.flags };
      }),
    recordFreeze: protectedProcedure("embryology:lab.write")
      .input((v: unknown) => v as { cycleId: string; patientId: string; cryoSpecimenRef: string; straws: number; frozenAt: string })
      .mutation(async ({ ctx, input }) => {
        const f = await ctx.services.andrology.recordFreeze(ctx.session.subject.staffId, input);
        return { freezeId: f.id, witnessKey: f.witnessKey };
      }),
  }),

  // Outcome continuum (β-hCG → clinical pregnancy → live birth), linked back to
  // the originating cycle. Clinical permission domain (MFA-gated).
  outcomes: router({
    recordTest: protectedProcedure("clinical:outcome.write")
      .input((v: unknown) => v as { cycleId: string; betaHcgMiuMl: number; testedAt: string; threshold?: number })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.outcomes.recordPregnancyTest(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid test" });
        return { testId: r.value.id, result: r.value.result };
      }),
    recordAssessment: protectedProcedure("clinical:outcome.write")
      .input((v: unknown) => v as { cycleId: string; gestationalSacs: number; fetalHeartbeats: number; assessedAt: string })
      .mutation(async ({ ctx, input }) => {
        const a = await ctx.services.outcomes.recordClinicalAssessment(ctx.session.subject.staffId, input);
        return { assessmentId: a.id, clinicalPregnancy: a.clinicalPregnancy };
      }),
    recordOutcome: protectedProcedure("clinical:outcome.write")
      .input((v: unknown) => v as { cycleId: string; type: OutcomeType; liveBirthCount?: number; gestationalAgeWeeks?: number; occurredAt: string; note?: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.outcomes.recordPregnancyOutcome(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid outcome" });
        return { outcomeId: r.value.id, type: r.value.type };
      }),
    summary: protectedProcedure("clinical:outcome.read")
      .input((v: unknown) => v as { cycleId: string })
      .query(async ({ ctx, input }) => {
        const summary = await ctx.services.outcomes.outcomeForCycle(input.cycleId);
        const kpi = await ctx.services.outcomes.kpiInputs(input.cycleId);
        return { summary, kpi };
      }),
  }),

  // Perioperative journey (admit → bed → recovery → theatre → recovery → bed →
  // discharge). Each stage drives an audited, capacity-aware bed/floor movement.
  perioperative: router({
    admit: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { patientId: string; indication: string; admittedAt: string; theatreCaseRef?: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.perioperative.admit(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "CONFLICT", message: r.error.detailKey ?? "admission failed" });
        return { encounterId: r.value.id, stage: r.value.stage };
      }),
    advance: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; toStage: JourneyStage })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.perioperative.advanceJourney(ctx.session.subject.staffId, asId<"SurgicalEncounter">(input.encounterId), input.toStage);
        if (!r.ok) {
          // CONFLICT = bed/theatre capacity; PRECONDITION_FAILED = WHO checklist gate.
          const code = r.error.code === "CONFLICT" ? "CONFLICT" : r.error.code === "PRECONDITION_FAILED" ? "PRECONDITION_FAILED" : "BAD_REQUEST";
          throw new TRPCError({ code, message: r.error.detailKey ?? "advance failed" });
        }
        return { stage: r.value.stage };
      }),
    cancel: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; reason: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.perioperative.cancel(ctx.session.subject.staffId, asId<"SurgicalEncounter">(input.encounterId), input.reason);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "cancel failed" });
        return { stage: r.value.stage };
      }),

    // Two-theatre case scheduling (shared calendar; provisional L2 bed reservation).
    scheduleCase: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { typeId: string; patientId: string; encounterId?: string; procedure: string; theatreResourceId: string; surgeonResourceId: string; supportResourceIds?: string[]; equipment?: string[]; scheduledDate: string; start: string; end: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.theatreScheduling.scheduleCase(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "CONFLICT", message: r.error.detailKey ?? "scheduling conflict" });
        return { caseId: r.value.theatreCase.id, bedReservation: r.value.bedReservation };
      }),
    cancelCase: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { caseId: string; reason: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.theatreScheduling.cancelCase(ctx.session.subject.staffId, asId<"TheatreCase">(input.caseId), input.reason);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "cancel failed" });
        return { status: r.value.status };
      }),
    dayList: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { scheduledDate: string })
      .query(async ({ ctx, input }) => ctx.services.theatreScheduling.dayList(input.scheduledDate)),
    theatreUtilisation: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { theatreResourceId: string; scheduledDate: string; availableMinutes: number })
      .query(async ({ ctx, input }) => ctx.services.theatreScheduling.utilisation(input.theatreResourceId, input.scheduledDate, input.availableMinutes)),

    // Pre-operative assessment (anaesthetic hx, airway, ASA, fasting, consent).
    recordPreOp: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; anaestheticHistory: string; mallampatiClass: number; asaGrade: number; investigations?: string[]; fastingConfirmed: boolean; consentRef: string; assessedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.preOp.recordPreOp(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid pre-op assessment" });
        return { assessmentId: r.value.id, asaGrade: r.value.asaGrade };
      }),

    // WHO Surgical Safety Checklist — complete a phase (sign-in/time-out/sign-out).
    // The journey's advance() enforces the blocking gate (no incision without
    // sign-in+time-out; no leaving theatre without sign-out).
    completeChecklistPhase: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; phase: WhoPhase; confirmedItems: string[]; completedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.whoChecklist.completePhase(ctx.session.subject.staffId, input.encounterId, input.phase, input.confirmedItems, input.completedAt);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "checklist phase failed" });
        return { phase: input.phase, ok: true };
      }),

    // Intra-operative + anaesthesia record (drugs from formulary).
    recordIntraOp: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; procedurePerformed: string; findings: string; anaestheticTechnique: string; drugs: { formularyCode: string; dose: number; unit: AnaesthesiaUnit }[]; staff: string[]; startedAt: string; finishedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.intraOp.recordIntraOp(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid intra-op record" });
        return { recordId: r.value.id };
      }),
    // Consumables/implants at point of use → stock deduction + billing (lot-traced).
    recordConsumables: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; patientId: string; uses: ConsumableUseInput[]; recordedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.intraOp.recordConsumables(ctx.session.subject.staffId, input.encounterId, input.patientId, input.uses, input.recordedAt);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "consumables failed" });
        return { invoiceRef: r.value.invoiceRef, count: r.value.consumables.length };
      }),
    recordSpecimen: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; type: string; site: string; lotRef: string; collectedAt: string })
      .mutation(async ({ ctx, input }) => {
        const s = await ctx.services.intraOp.recordSpecimen(ctx.session.subject.staffId, input);
        return { specimenId: s.id };
      }),

    // Recovery (L1) + post-op ward (L2) observations and the discharge follow-up.
    recordObservation: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; phase: "recovery" | "post_op_ward"; aldreteScore?: number; systolicBp: number; heartRate: number; spo2: number; notes?: string; recordedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.recovery.recordObservation(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid observation" });
        return { observationId: r.value.id };
      }),
    bookFollowUp: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { encounterId: string; scheduledFor: string; bookedAt: string })
      .mutation(async ({ ctx, input }) => {
        const f = await ctx.services.recovery.bookFollowUp(ctx.session.subject.staffId, input);
        return { followUpId: f.id };
      }),

    // CSSD / instrument-set tracking — a set may only be used when sterile.
    registerSet: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { name: string; composition: string[] })
      .mutation(async ({ ctx, input }) => {
        const s = await ctx.services.cssd.registerSet(ctx.session.subject.staffId, input.name, input.composition);
        return { setId: s.id, status: s.status };
      }),
    recordSterilisation: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { setId: string; cycleType: string; loadRef: string; result: "pass" | "fail"; completedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cssd.recordSterilisation(ctx.session.subject.staffId, asId<"InstrumentSet">(input.setId), input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "sterilisation failed" });
        return { cycleId: r.value.id };
      }),
    useSet: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { setId: string; encounterId: string; usedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.cssd.useSet(ctx.session.subject.staffId, asId<"InstrumentSet">(input.setId), input.encounterId, input.usedAt);
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "set not usable" });
        return { usageId: r.value.id };
      }),
  }),

  // Patient-portal self-service booking. The patient principal may ONLY act on
  // their own record (assertOwnData) — no access to anyone else's data.
  portal: router({
    book: patientProcedure
      .input((v: unknown) => v as { patientId: string; typeId: string; practitionerId: string; resourceIds: string[]; start: string; end: string })
      .mutation(async ({ ctx, input }) => {
        const own = assertOwnData(ctx.patient, input.patientId);
        if (!own.ok) throw new TRPCError({ code: "FORBIDDEN", message: own.error.detailKey ?? "forbidden" });
        const r = await ctx.services.scheduling.book(`patient:${ctx.patient.patientId}`, {
          typeId: asId<"AppointmentType">(input.typeId),
          patientId: input.patientId,
          practitionerId: asId<"Resource">(input.practitionerId),
          resourceIds: input.resourceIds.map((x) => asId<"Resource">(x)),
          start: input.start,
          end: input.end,
        });
        if (!r.ok) throw new TRPCError({ code: "CONFLICT", message: r.error.detailKey ?? "could not book" });
        return { appointmentId: r.value.id };
      }),
  }),

  // Front-desk check-in: advance the appointment and place the patient on the
  // flow board (location/status only).
  flow: router({
    checkIn: protectedProcedure("scheduling:appointment.checkin")
      .input((v: unknown) => v as { appointmentId: string; patientId: string; locationNodeId: string })
      .mutation(async ({ ctx, input }) => {
        const actor = ctx.session.subject.staffId;
        const advanced = await ctx.services.scheduling.checkIn(actor, asId<"Appointment">(input.appointmentId));
        if (!advanced.ok) throw new TRPCError({ code: "BAD_REQUEST", message: advanced.error.detailKey ?? "check-in failed" });
        const placed = await ctx.services.flow.moveTo(actor, input.patientId, asId<"LocationNode">(input.locationNodeId), "waiting");
        if (!placed.ok) throw new TRPCError({ code: "BAD_REQUEST", message: placed.error.detailKey ?? "placement failed" });
        return { checkedIn: true };
      }),

    // Bed turnaround (housekeeping): return a vacated (cleaning) bed to the pool.
    completeTurnaround: protectedProcedure("scheduling:appointment.checkin")
      .input((v: unknown) => v as { bedId: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.facility.completeTurnaround(ctx.session.subject.staffId, asId<"Bed">(input.bedId));
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "turnaround failed" });
        return { status: r.value.status };
      }),
    bedsAwaitingTurnaround: protectedProcedure("scheduling:appointment.checkin")
      .query(async ({ ctx }) => ({ beds: (await ctx.services.facility.bedsAwaitingTurnaround()).map((b) => ({ bedId: b.id, label: b.label })) })),
  }),

  // Staff scheduling (books on a patient's behalf at reception).
  scheduling: router({
    book: protectedProcedure("scheduling:appointment.book")
      .input((v: unknown) => v as { patientId: string; typeId: string; practitionerId: string; resourceIds: string[]; start: string; end: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.scheduling.book(ctx.session.subject.staffId, {
          typeId: asId<"AppointmentType">(input.typeId),
          patientId: input.patientId,
          practitionerId: asId<"Resource">(input.practitionerId),
          resourceIds: input.resourceIds.map((x) => asId<"Resource">(x)),
          start: input.start,
          end: input.end,
        });
        if (!r.ok) throw new TRPCError({ code: "CONFLICT", message: r.error.detailKey ?? "could not book" });
        return { appointmentId: r.value.id };
      }),
  }),

  // Clinical EMR (MFA-gated clinical domain).
  clinical: router({
    openEncounter: protectedProcedure("clinical:encounter.write")
      .input((v: unknown) => v as { patientId: string; type: EncounterType; practitionerId: string })
      .mutation(async ({ ctx, input }) => {
        const enc = await ctx.services.clinical.openEncounter(ctx.session.subject.staffId, input.patientId, input.type, input.practitionerId);
        return { encounterId: enc.id };
      }),
    writeNote: protectedProcedure("clinical:note.write")
      .input((v: unknown) => v as { encounterId: string; patientId: string; body: Record<string, unknown> })
      .mutation(async ({ ctx, input }) => {
        const note = await ctx.services.clinical.writeNote(ctx.session.subject.staffId, asId<"Encounter">(input.encounterId), input.patientId, input.body);
        return { noteId: note.id };
      }),
    placeOrder: protectedProcedure("clinical:order.write")
      .input((v: unknown) => v as { encounterId: string; patientId: string; kind: OrderKind; code: string })
      .mutation(async ({ ctx, input }) => {
        const order = await ctx.services.clinical.placeOrder(ctx.session.subject.staffId, asId<"Encounter">(input.encounterId), input.patientId, input.kind, input.code);
        return { orderId: order.id };
      }),
    issueLetter: protectedProcedure("clinical:letter.write")
      .input((v: unknown) => v as { patientId: string; templateKey: string; locale: "en" | "ar"; body: string })
      .mutation(async ({ ctx, input }) => {
        const actor = ctx.session.subject.staffId;
        const draft = await ctx.services.clinical.draftLetter(actor, input.patientId, input.templateKey, input.locale, input.body);
        const signed = await ctx.services.clinical.signLetter(actor, draft.id);
        if (!signed.ok) throw new TRPCError({ code: "BAD_REQUEST", message: signed.error.detailKey ?? "sign failed" });
        return { letterId: draft.id, status: signed.value.status };
      }),
  }),

  // Operations ERP — supplier + item catalogue (admin/ops domain, MFA-gated).
  inventory: router({
    addSupplier: protectedProcedure("admin:inventory.write")
      .input((v: unknown) => v as { name: string; contactEmail?: string; contactPhone?: string })
      .mutation(async ({ ctx, input }) => {
        const s = await ctx.services.catalogue.addSupplier(ctx.session.subject.staffId, input);
        return { supplierId: s.id };
      }),
    addItem: protectedProcedure("admin:inventory.write")
      .input((v: unknown) => v as { name: string; category: ItemCategory; unit: string; packSize: number; coldChain: boolean; controlled: boolean; parLevel: number; preferredSupplierId?: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.catalogue.addItem(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid item" });
        return { itemId: r.value.id };
      }),
    listItems: protectedProcedure("admin:inventory.read").query(async ({ ctx }) => ({ items: await ctx.services.catalogue.items() })),

    // Multi-location stock: receive lots, FEFO issue, alerts, cold-chain log.
    receiveStock: protectedProcedure("admin:inventory.write")
      .input((v: unknown) => v as { itemId: string; lotNo: string; locationId: string; quantity: number; expiryDate: string; receivedAt: string })
      .mutation(async ({ ctx, input }) => {
        const lot = await ctx.services.inventory.receive(ctx.session.subject.staffId, input);
        return { lotId: lot.id, quantity: lot.quantity };
      }),
    issueStock: protectedProcedure("admin:inventory.write")
      .input((v: unknown) => v as { itemId: string; locationId: string; quantity: number })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.inventory.issue(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "issue failed" });
        return { lines: r.value.length };
      }),
    onHand: protectedProcedure("admin:inventory.read")
      .input((v: unknown) => v as { itemId: string })
      .query(async ({ ctx, input }) => ({ onHand: await ctx.services.inventory.onHand(input.itemId) })),
    alerts: protectedProcedure("admin:inventory.read")
      .input((v: unknown) => v as { asOf: string; withinDays: number })
      .query(async ({ ctx, input }) => ctx.services.inventory.alerts(new Date(input.asOf), input.withinDays)),
    recordColdChain: protectedProcedure("admin:inventory.write")
      .input((v: unknown) => v as { locationId: string; temperatureC: number; recordedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.inventory.recordColdChain(ctx.session.subject.staffId, input.locationId, input.temperatureC, input.recordedAt);
        return { readingId: r.id };
      }),
  }),

  // Procurement / accounts-payable (financial domain, MFA-gated). Requisition →
  // approval → PO → goods receipt (receives real stock) → supplier invoice →
  // 3-way match. AP money is integer fils, separate from patient billing.
  procurement: router({
    createRequisition: protectedProcedure("financial:procurement.write")
      .input((v: unknown) => v as { lines: { itemId: string; quantity: number }[]; reason: string; requestedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.procurement.createRequisition(ctx.session.subject.staffId, input.lines, input.reason, input.requestedAt);
        return { requisitionId: r.id, status: r.status };
      }),
    autoRequisition: protectedProcedure("financial:procurement.write")
      .input((v: unknown) => v as { asOf: string; withinDays: number; requestedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.procurement.autoRequisitionFromAlerts(ctx.session.subject.staffId, new Date(input.asOf), input.withinDays, input.requestedAt);
        return { requisitionId: r?.id ?? null, lines: r?.lines.length ?? 0 };
      }),
    decideRequisition: protectedProcedure("financial:procurement.approve")
      .input((v: unknown) => v as { requisitionId: string; approve: boolean })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.procurement.decide(ctx.session.subject.staffId, asId<"Requisition">(input.requisitionId), input.approve);
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "decision failed" });
        return { status: r.value.status };
      }),
    createPurchaseOrder: protectedProcedure("financial:procurement.write")
      .input((v: unknown) => v as { requisitionId?: string; supplierId: string; lines: { itemId: string; quantity: number; unitPriceFils: number }[]; createdAt: string })
      .mutation(async ({ ctx, input }) => {
        const po = await ctx.services.procurement.createPurchaseOrder(ctx.session.subject.staffId, input, input.createdAt);
        return { purchaseOrderId: po.id, status: po.status };
      }),
    receiveGoods: protectedProcedure("financial:procurement.write")
      .input((v: unknown) => v as { poId: string; lines: { itemId: string; lotNo: string; quantity: number; expiryDate: string; locationId: string }[]; receivedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.procurement.receiveGoods(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "NOT_FOUND", message: r.error.detailKey ?? "receive failed" });
        return { goodsReceiptId: r.value.id };
      }),
    recordSupplierInvoice: protectedProcedure("financial:procurement.write")
      .input((v: unknown) => v as { poId: string; lines: { itemId: string; quantity: number; amountFils: number }[]; totalFils: number; recordedAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.procurement.recordSupplierInvoice(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invoice failed" });
        return { supplierInvoiceId: r.value.id };
      }),
    matchInvoice: protectedProcedure("financial:procurement.approve")
      .input((v: unknown) => v as { poId: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.procurement.matchInvoice(ctx.session.subject.staffId, asId<"PurchaseOrder">(input.poId));
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "match failed" });
        return { matched: r.value.matched, discrepancies: r.value.discrepancies };
      }),
  }),

  // Controlled-drugs register (docs/01 §E8 P0) — legal-grade, two-person-witnessed,
  // reconcilable. Clinical-safety domain (MFA-gated). The second-person witness is
  // enforced in the service, not by permissions.
  controlledDrugs: router({
    record: protectedProcedure("clinical:controlled_drugs.write")
      .input((v: unknown) => v as { itemId: string; lotNo: string; type: "receipt" | "issue" | "wastage" | "destruction" | "return"; quantity: number; reason: string; patientRef?: string; witnessedBy: string; occurredAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.controlledDrugs.record(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "movement rejected" });
        return { movementId: r.value.id, balanceAfter: r.value.balanceAfter };
      }),
    reconcile: protectedProcedure("clinical:controlled_drugs.write")
      .input((v: unknown) => v as { itemId: string; lotNo: string; physicalCount: number; witnessedBy: string; reason: string; occurredAt: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.controlledDrugs.reconcileCount(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "reconcile rejected" });
        return r.value;
      }),
    balance: protectedProcedure("clinical:controlled_drugs.read")
      .input((v: unknown) => v as { itemId: string })
      .query(async ({ ctx, input }) => ({ balance: await ctx.services.controlledDrugs.balance(input.itemId) })),
    periodReport: protectedProcedure("clinical:controlled_drugs.read")
      .input((v: unknown) => v as { itemId: string; from: string; to: string })
      .query(async ({ ctx, input }) => ctx.services.controlledDrugs.periodReport(input.itemId, input.from, input.to)),
  }),

  // Asset & biomedical-equipment management (docs/01 §E10) — operations domain
  // (MFA-gated). A critical asset with overdue/missing calibration is blocked
  // from use (server-side gate, ADR-0029); overdue non-critical is alert-only.
  assets: router({
    register: protectedProcedure("admin:assets.write")
      .input((v: unknown) => v as { name: string; category: AssetCategory; locationId: string; serialNumber: string; supplierId?: string; warrantyExpiry?: string; critical: boolean })
      .mutation(async ({ ctx, input }) => {
        const a = await ctx.services.assets.registerAsset(ctx.session.subject.staffId, input);
        return { assetId: a.id };
      }),
    recordMaintenance: protectedProcedure("admin:assets.write")
      .input((v: unknown) => v as { assetId: string; type: "ppm" | "calibration" | "service"; performedAt: string; nextDueDate?: string; notes?: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.assets.recordMaintenance(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "maintenance rejected" });
        return { maintenanceId: r.value.id, nextDueDate: r.value.nextDueDate };
      }),
    reportFault: protectedProcedure("admin:assets.write")
      .input((v: unknown) => v as { assetId: string; reportedAt: string; description: string; severity: "minor" | "major" | "critical" })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.assets.reportFault(ctx.session.subject.staffId, input);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "fault rejected" });
        return { faultId: r.value.id };
      }),
    resolveFault: protectedProcedure("admin:assets.write")
      .input((v: unknown) => v as { faultId: string; resolvedAt: string; downtimeMinutes: number })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.assets.resolveFault(ctx.session.subject.staffId, asId<"Fault">(input.faultId), input.resolvedAt, input.downtimeMinutes);
        if (!r.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.detailKey ?? "resolve rejected" });
        return { downtimeMinutes: r.value.downtimeMinutes };
      }),
    status: protectedProcedure("admin:assets.read")
      .input((v: unknown) => v as { assetId: string; asOf: string })
      .query(async ({ ctx, input }) => {
        const r = await ctx.services.assets.assetStatus(input.assetId, new Date(input.asOf));
        if (!r.ok) throw new TRPCError({ code: "NOT_FOUND", message: r.error.detailKey ?? "asset not found" });
        return r.value;
      }),
    assertUsable: protectedProcedure("admin:assets.read")
      .input((v: unknown) => v as { assetId: string; asOf: string })
      .query(async ({ ctx, input }) => {
        const r = await ctx.services.assets.assertUsable(input.assetId, new Date(input.asOf));
        return { usable: r.ok, reason: r.ok ? null : r.error.detailKey };
      }),
    alerts: protectedProcedure("admin:assets.read")
      .input((v: unknown) => v as { asOf: string; withinDays: number })
      .query(async ({ ctx, input }) => ctx.services.assets.alerts(new Date(input.asOf), input.withinDays)),
  }),

  // Billing (MFA-gated financial domain).
  billing: router({
    createInvoice: protectedProcedure("financial:invoice.write")
      .input((v: unknown) => v as { patientId: string; lines: InvoiceLine[] })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.billing.createInvoice(ctx.session.subject.staffId, input.patientId, input.lines);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "invalid invoice" });
        return { invoiceId: r.value.id };
      }),
    postPayment: protectedProcedure("financial:payment.post")
      .input((v: unknown) => v as { invoiceId: string; amountFils: number; method: PaymentMethod })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.billing.postPayment(ctx.session.subject.staffId, asId<"Invoice">(input.invoiceId), input.amountFils, input.method);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "payment failed" });
        return { balanceFils: r.value.totals.balanceFils };
      }),
    // Refund (KNET/card only; append-only ledger entry). Reopens a paid invoice.
    refund: protectedProcedure("financial:payment.refund")
      .input((v: unknown) => v as { invoiceId: string; amountFils: number; method: PaymentMethod; reason: string })
      .mutation(async ({ ctx, input }) => {
        const r = await ctx.services.billing.refund(ctx.session.subject.staffId, asId<"Invoice">(input.invoiceId), input.amountFils, input.method, input.reason);
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error.detailKey ?? "refund failed" });
        return { balanceFils: r.value.totals.balanceFils, receiptNo: r.value.refund.receiptNo };
      }),
  }),
});

export type AppRouter = typeof appRouter;
