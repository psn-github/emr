import type { Staff, StaffId, Credential, Shift, Leave } from "./types.js";

export interface HrStore {
  saveStaff(s: Staff): Promise<void>;
  getStaff(id: StaffId): Promise<Staff | null>;
  staff(): Promise<readonly Staff[]>;
  saveCredential(c: Credential): Promise<void>;
  credentialsForStaff(staffId: string): Promise<readonly Credential[]>;
  allCredentials(): Promise<readonly Credential[]>;
  saveShift(s: Shift): Promise<void>;
  shiftsForResource(resourceId: string): Promise<readonly Shift[]>;
  saveLeave(l: Leave): Promise<void>;
  leaveForStaff(staffId: string): Promise<readonly Leave[]>;
}

export class InMemoryHrStore implements HrStore {
  private readonly staffList = new Map<string, Staff>();
  private readonly credentials: Credential[] = [];
  private readonly shifts: Shift[] = [];
  private readonly leaves: Leave[] = [];

  async saveStaff(s: Staff): Promise<void> {
    this.staffList.set(s.id, s);
  }
  async getStaff(id: StaffId): Promise<Staff | null> {
    return this.staffList.get(id) ?? null;
  }
  async staff(): Promise<readonly Staff[]> {
    return [...this.staffList.values()];
  }
  async saveCredential(c: Credential): Promise<void> {
    this.credentials.push(c);
  }
  async credentialsForStaff(staffId: string): Promise<readonly Credential[]> {
    return this.credentials.filter((c) => c.staffId === staffId);
  }
  async allCredentials(): Promise<readonly Credential[]> {
    return this.credentials;
  }
  async saveShift(s: Shift): Promise<void> {
    this.shifts.push(s);
  }
  async shiftsForResource(resourceId: string): Promise<readonly Shift[]> {
    return this.shifts.filter((s) => s.resourceId === resourceId);
  }
  async saveLeave(l: Leave): Promise<void> {
    this.leaves.push(l);
  }
  async leaveForStaff(staffId: string): Promise<readonly Leave[]> {
    return this.leaves.filter((l) => l.staffId === staffId);
  }
}
