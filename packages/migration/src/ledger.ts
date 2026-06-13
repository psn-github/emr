// Idempotency ledger: records which source records have been imported (and to
// which target id), so the migration job is RE-RUNNABLE without duplicating.

export interface ImportLedger {
  /** The target id a source record was imported to, or null if not yet imported. */
  targetFor(system: string, entity: string, sourceId: string): Promise<string | null>;
  record(system: string, entity: string, sourceId: string, targetId: string): Promise<void>;
  /** All source ids already imported for an entity (for reconciliation). */
  importedSourceIds(system: string, entity: string): Promise<Set<string>>;
}

export class InMemoryImportLedger implements ImportLedger {
  private readonly rows = new Map<string, string>(); // key -> targetId

  private key(system: string, entity: string, sourceId: string): string {
    return `${system}|${entity}|${sourceId}`;
  }

  async targetFor(system: string, entity: string, sourceId: string): Promise<string | null> {
    return this.rows.get(this.key(system, entity, sourceId)) ?? null;
  }
  async record(system: string, entity: string, sourceId: string, targetId: string): Promise<void> {
    this.rows.set(this.key(system, entity, sourceId), targetId);
  }
  async importedSourceIds(system: string, entity: string): Promise<Set<string>> {
    const prefix = `${system}|${entity}|`;
    const ids = new Set<string>();
    for (const k of this.rows.keys()) {
      if (k.startsWith(prefix)) ids.add(k.slice(prefix.length));
    }
    return ids;
  }
}
