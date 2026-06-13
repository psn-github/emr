import { TRPCError } from "@trpc/server";
import { asId } from "@oxford/core";
import type { LanguagePref, Sex } from "@oxford/registry";
import type { EncounterType, OrderKind } from "@oxford/clinical";
import type { InvoiceLine, PaymentMethod } from "@oxford/billing";
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
    // Embryology lab data — embryology domain permission required.
    read: protectedProcedure("embryology:lab.read").query(() => ({ ok: true })),
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
  }),
});

export type AppRouter = typeof appRouter;
