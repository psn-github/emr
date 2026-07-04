import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import type pg from "pg";
import { AuthService, DevOidcProvider, type OidcProvider, type Session, type SubjectResolver } from "@oxford/identity";
import { appRouter } from "./router.js";
import { serviceInfo } from "./index.js";
import type { Services } from "./context.js";
import type { ApiContext } from "./trpc.js";
import type { PatientPrincipal } from "./patient-access.js";

// The HTTP host (ADR-0062): mounts the one tRPC app router — the same surface
// every e2e proves — on a plain node:http server. The server stays the
// enforcement point: a request carries only a bearer token; the session is
// resolved server-side and deny-by-default authorization runs per procedure.
//
//   GET  /health          liveness + a real DB ping (deploy/monitoring probe)
//   *    /trpc/<path>     the tRPC API (staff + patient-portal procedures)
//
// Patient-portal auth: a `devpatient:<patientId>` bearer maps to a
// PatientPrincipal — DEV/STAGING ONLY (refused in production, like
// DevOidcProvider). The real portal identity lands with the PWA shell.

export interface ApiServerOptions {
  readonly services: Services;
  readonly pool: pg.Pool;
  readonly isProduction: boolean;
  readonly resolveSubject: SubjectResolver;
  /** Token verifier; defaults to the dev provider (which refuses production). */
  readonly oidc?: OidcProvider;
}

const SESSION_CACHE_TTL_MS = 5 * 60_000;

/** Authenticated-session cache so a stable bearer token does not re-run (and
 *  re-audit) the login path on every request. Failed tokens are never cached. */
class SessionCache {
  private readonly entries = new Map<string, { session: Session; expires: number }>();
  get(token: string, now: number): Session | null {
    const hit = this.entries.get(token);
    if (!hit) return null;
    if (hit.expires < now) {
      this.entries.delete(token);
      return null;
    }
    return hit.session;
  }
  put(token: string, session: Session, now: number): void {
    if (this.entries.size > 10_000) this.entries.clear(); // bounded, dev-scale
    this.entries.set(token, { session, expires: now + SESSION_CACHE_TTL_MS });
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createApiServer(opts: ApiServerOptions): Server {
  const { services, pool, isProduction } = opts;
  const auth = new AuthService(opts.oidc ?? new DevOidcProvider(isProduction), opts.resolveSubject, services.audit);
  const sessions = new SessionCache();

  // One context construction point. `devTools` enables the `dev` sub-router
  // (stub-provider feeds for the synthetic-patient simulator) outside
  // production only; production boot is refused regardless (serve.ts).
  const context = (session: Session | null, patient: PatientPrincipal | null): ApiContext => ({
    session,
    patient,
    services,
    devTools: !isProduction,
  });

  async function contextFor(req: IncomingMessage): Promise<ApiContext> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return context(null, null);
    const token = header.slice("Bearer ".length);

    if (token.startsWith("devpatient:")) {
      if (isProduction) return context(null, null);
      return context(null, { patientId: token.slice("devpatient:".length) });
    }

    const now = Date.now();
    const cached = sessions.get(token, now);
    if (cached) return context(cached, null);
    const result = await auth.authenticate(token);
    if (!result.ok) return context(null, null);
    sessions.put(token, result.value, now);
    return context(result.value, null);
  }

  const trpc = createHTTPHandler({
    router: appRouter,
    createContext: ({ req }) => contextFor(req),
  });

  return createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/health") {
      pool
        .query("SELECT 1")
        .then(() => {
          const info = serviceInfo();
          sendJson(res, 200, info.ok ? { ...info.value, db: "ok" } : { db: "ok" });
        })
        .catch(() => sendJson(res, 503, { name: "oxford-his-api", status: "degraded", db: "unreachable" }));
      return;
    }

    if (url.startsWith("/trpc/")) {
      req.url = url.slice("/trpc".length);
      trpc(req, res);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });
}
