import { initTRPC, TRPCError } from "@trpc/server";
import type { Permission, Session } from "@oxford/identity";
import type { Services } from "./context.js";
import type { PatientPrincipal } from "./patient-access.js";

// tRPC setup with the deny-by-default auth middleware (ADR-0009/0010). Every
// protected procedure declares the permission it needs; the middleware runs the
// Authorizer (which audits denials) and rejects UNAUTHENTICATED / FORBIDDEN.
// A patient-portal session carries a PatientPrincipal scoped to one patient.
export interface ApiContext {
  readonly session: Session | null;
  readonly patient: PatientPrincipal | null;
  readonly services: Services;
}

const t = initTRPC.context<ApiContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** A patient-portal procedure: requires an authenticated patient principal. The
 *  handler must still enforce own-data with assertOwnData(ctx.patient, ...). */
export const patientProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (ctx.patient === null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "patient authentication required" });
  }
  return next({ ctx: { ...ctx, patient: ctx.patient } });
});

/** A procedure gated on a required permission. The server is the enforcement
 *  point — the UI never decides access. */
export function protectedProcedure(required: Permission) {
  return t.procedure.use(async ({ ctx, next }) => {
    if (ctx.session === null) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "authentication required" });
    }
    const decision = await ctx.services.authorizer.authorize(ctx.session, required);
    if (!decision.ok) {
      throw new TRPCError({ code: "FORBIDDEN", message: decision.error.detailKey ?? "forbidden" });
    }
    return next({ ctx: { ...ctx, session: ctx.session } });
  });
}
