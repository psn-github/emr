// The HTTP host end-to-end, OVER REAL HTTP against a real Postgres (ADR-0062):
// the same enforcement the in-process e2es prove must hold once the router is
// mounted on a socket — deny-by-default, MFA-gated domains, own-data-only
// patient principals — plus the /health probe the deploy pipeline checks.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { createApiServer } from "./http-host.js";
import { devStaffDirectory } from "./staff-directory.js";
import type { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const token = (sub: string): string => `dev:${JSON.stringify({ sub, amr: ["pwd", "mfa"] })}`;

describe.skipIf(!DATABASE_URL)("HTTP host (e2e over real HTTP + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let server: Server;
  let base: string;

  const client = (bearer?: string) =>
    createTRPCClient<typeof appRouter>({
      links: [
        httpBatchLink({
          url: `${base}/trpc`,
          headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
        }),
      ],
    });

  beforeAll(async () => {
    await runMigrations(pool);
    const services = buildServices(pool);
    server = createApiServer({ services, pool, isProduction: false, resolveSubject: devStaffDirectory(false) });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await pool.end();
  });

  it("GET /health pings the database", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "oxford-his-api", status: "ok", db: "ok" });
  });

  it("unauthenticated and unprovisioned callers are rejected; unknown paths 404", async () => {
    await expect(client().registry.registerPerson.mutate(person("111"))).rejects.toSatisfy(
      (e: unknown) => e instanceof TRPCClientError && e.data?.code === "UNAUTHORIZED",
    );
    await expect(client(token("dev-stranger")).registry.registerPerson.mutate(person("112"))).rejects.toSatisfy(
      (e: unknown) => e instanceof TRPCClientError && e.data?.code === "UNAUTHORIZED",
    );
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it("a consultant registers a patient over HTTP; a wrong-domain role is FORBIDDEN", async () => {
    const doc = client(token("dev-consultant"));
    const r = await doc.registry.registerPerson.mutate(person("287010112345"));
    expect(r.personId).toBeTruthy();

    await expect(client(token("dev-reception")).embryology.read.query()).rejects.toSatisfy(
      (e: unknown) => e instanceof TRPCClientError && e.data?.code === "FORBIDDEN",
    );
  });

  it("a patient principal reads only their own portal data", async () => {
    const doc = client(token("dev-consultant"));
    const { personId } = await doc.registry.registerPerson.mutate(person("287010154321"));

    const own = await client(`devpatient:${personId}`).portal.appointments.query({ patientId: personId });
    expect(own.appointments).toEqual([]);

    await expect(
      client("devpatient:someone-else").portal.appointments.query({ patientId: personId }),
    ).rejects.toSatisfy((e: unknown) => e instanceof TRPCClientError && e.data?.code === "FORBIDDEN");
  });
});

function person(civilId: string) {
  return {
    name: { en: "Test Patient", ar: "مريضة تجريبية" },
    civilId,
    dob: "1990-01-01",
    sex: "female" as const,
    nationality: "KW",
    languagePref: "ar" as const,
  };
}
