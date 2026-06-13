// e2e — secure patient↔clinic messaging THROUGH the tRPC API on real Postgres
// (docs/01 §E13). Proves: a patient starts a thread and exchanges messages with
// staff; sees only their own threads; cannot read/post to another's thread; staff
// reply requires the clinical messaging permission.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const nurse: Session = { sessionId: "s-n", subject: { staffId: "nurse-1", roles: [{ id: "nurse", name: "nurse", permissions: ["clinical:message.read", "clinical:message.write"] }] }, mfa: true };
const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("secure messaging (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE messaging.message_thread, messaging.message, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("patient ↔ staff exchange on the patient's own thread; cross-patient blocked", async () => {
    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });
    const { threadId } = await me.portal.startThread({ patientId: "pat-1", subject: "Side effects", body: "Is bloating normal?" });

    // staff reads the thread + replies
    const staff = appRouter.createCaller({ session: nurse, patient: null, services });
    expect((await staff.messaging.patientThreads({ patientId: "pat-1" })).threads).toHaveLength(1);
    await staff.messaging.reply({ threadId, body: "Yes, mild bloating is expected." });

    // patient sees both messages on their thread
    const msgs = await me.portal.threadMessages({ patientId: "pat-1", threadId });
    expect(msgs.messages.map((m) => m.senderKind)).toEqual(["patient", "staff"]);
    await me.portal.sendMessage({ patientId: "pat-1", threadId, body: "Thank you." });
    expect((await me.portal.threadMessages({ patientId: "pat-1", threadId })).messages).toHaveLength(3);
    expect((await me.portal.threads({ patientId: "pat-1" })).threads).toHaveLength(1);

    // another patient cannot read or post to pat-1's thread, nor list as pat-1
    const other = appRouter.createCaller({ session: null, patient: { patientId: "pat-2" }, services });
    await expectCode(() => other.portal.threadMessages({ patientId: "pat-2", threadId }), "FORBIDDEN");
    await expectCode(() => other.portal.sendMessage({ patientId: "pat-2", threadId, body: "snoop" }), "FORBIDDEN");
    await expectCode(() => other.portal.threads({ patientId: "pat-1" }), "FORBIDDEN");
  });

  it("RBAC: replying requires the clinical messaging permission", async () => {
    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });
    const { threadId } = await me.portal.startThread({ patientId: "pat-1", subject: "Q", body: "hello" });
    const front = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => front.messaging.reply({ threadId, body: "x" }), "FORBIDDEN");
  });
});
