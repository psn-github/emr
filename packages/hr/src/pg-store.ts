import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Staff, StaffId, Credential, Shift, Leave } from "./types.js";
import type { HrStore } from "./store.js";

/** Postgres-backed HrStore. */
export class PgHrStore implements HrStore {
  constructor(private readonly pool: Pool) {}

  async saveStaff(s: Staff): Promise<void> {
    await this.pool.query(
      `INSERT INTO hr.staff (id, name, role, professional_id, active) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, active=EXCLUDED.active`,
      [s.id, s.name, s.role, s.professionalId, s.active],
    );
  }
  async getStaff(id: StaffId): Promise<Staff | null> {
    const r = await this.pool.query<StaffRow>("SELECT * FROM hr.staff WHERE id = $1", [id]);
    return r.rows[0] ? staffFrom(r.rows[0]) : null;
  }
  async staff(): Promise<readonly Staff[]> {
    const r = await this.pool.query<StaffRow>("SELECT * FROM hr.staff ORDER BY name");
    return r.rows.map(staffFrom);
  }
  async saveCredential(c: Credential): Promise<void> {
    await this.pool.query(
      `INSERT INTO hr.credential (id, staff_id, type, name, authority, issued_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.staffId, c.type, c.name, c.authority, c.issuedAt, c.expiresAt],
    );
  }
  async credentialsForStaff(staffId: string): Promise<readonly Credential[]> {
    const r = await this.pool.query<CredRow>("SELECT * FROM hr.credential WHERE staff_id = $1 ORDER BY expires_at", [staffId]);
    return r.rows.map(credFrom);
  }
  async allCredentials(): Promise<readonly Credential[]> {
    const r = await this.pool.query<CredRow>("SELECT * FROM hr.credential ORDER BY expires_at");
    return r.rows.map(credFrom);
  }
  async saveShift(s: Shift): Promise<void> {
    await this.pool.query(
      `INSERT INTO hr.shift (id, staff_id, resource_id, start, "end", role) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.staffId, s.resourceId, s.start, s.end, s.role],
    );
  }
  async shiftsForResource(resourceId: string): Promise<readonly Shift[]> {
    const r = await this.pool.query<ShiftRow>('SELECT * FROM hr.shift WHERE resource_id = $1 ORDER BY start', [resourceId]);
    return r.rows.map(shiftFrom);
  }
  async saveLeave(l: Leave): Promise<void> {
    await this.pool.query(
      `INSERT INTO hr.leave (id, staff_id, type, start, "end", note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [l.id, l.staffId, l.type, l.start, l.end, l.note],
    );
  }
  async leaveForStaff(staffId: string): Promise<readonly Leave[]> {
    const r = await this.pool.query<LeaveRow>('SELECT * FROM hr.leave WHERE staff_id = $1 ORDER BY start', [staffId]);
    return r.rows.map(leaveFrom);
  }
}

interface StaffRow { id: string; name: string; role: string; professional_id: string | null; active: boolean }
interface CredRow { id: string; staff_id: string; type: string; name: string; authority: string | null; issued_at: Date; expires_at: Date }
interface ShiftRow { id: string; staff_id: string; resource_id: string; start: Date; end: Date; role: string }
interface LeaveRow { id: string; staff_id: string; type: string; start: Date; end: Date; note: string | null }

const iso = (d: Date): string => new Date(d).toISOString();
function staffFrom(r: StaffRow): Staff {
  return { id: asId<"Staff">(r.id), name: r.name, role: r.role, professionalId: r.professional_id, active: r.active };
}
function credFrom(r: CredRow): Credential {
  return { id: asId<"Credential">(r.id), staffId: r.staff_id, type: r.type as Credential["type"], name: r.name, authority: r.authority, issuedAt: iso(r.issued_at), expiresAt: iso(r.expires_at) };
}
function shiftFrom(r: ShiftRow): Shift {
  return { id: asId<"Shift">(r.id), staffId: r.staff_id, resourceId: r.resource_id, start: iso(r.start), end: iso(r.end), role: r.role };
}
function leaveFrom(r: LeaveRow): Leave {
  return { id: asId<"Leave">(r.id), staffId: r.staff_id, type: r.type as Leave["type"], start: iso(r.start), end: iso(r.end), note: r.note };
}
