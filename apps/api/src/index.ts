// @oxford/api — the API host (composition root).
//
// This is where the tRPC router (internal web/portal clients) and the versioned
// REST/FHIR-flavoured surface (external/integration consumers) are mounted, per
// ADR-0009. Routers are contributed by the domain packages; this app only wires
// them together, applies the deny-by-default auth middleware (ADR-0010), and
// starts the HTTP server. Concrete routes land with the identity module (PR 0.2).
import type { Result } from "@oxford/core";
import { ok } from "@oxford/core";

export interface ServiceInfo {
  readonly name: string;
  readonly status: "ok";
}

/** Liveness signal for the platform. Real health checks (db, redis, RI link)
 *  are added as those dependencies are introduced. */
export function serviceInfo(): Result<ServiceInfo, never> {
  return ok({ name: "oxford-his-api", status: "ok" });
}
