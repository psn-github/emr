import { TRPCError } from "@trpc/server";
import { asId } from "@oxford/core";
import type { LanguagePref, Sex } from "@oxford/registry";
import { router, protectedProcedure } from "./trpc.js";

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
});

export type AppRouter = typeof appRouter;
