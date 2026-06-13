import type { CdMovement } from "./types.js";

export interface ControlledRegisterStore {
  /** Append a movement (the register is immutable — no update/delete). */
  appendMovement(m: CdMovement): Promise<void>;
  /** Movements for an item, oldest first. */
  movementsForItem(itemId: string): Promise<readonly CdMovement[]>;
}

export class InMemoryControlledRegisterStore implements ControlledRegisterStore {
  private readonly movements: CdMovement[] = [];

  async appendMovement(m: CdMovement): Promise<void> {
    this.movements.push(m);
  }
  async movementsForItem(itemId: string): Promise<readonly CdMovement[]> {
    return this.movements.filter((m) => m.itemId === itemId);
  }
}
