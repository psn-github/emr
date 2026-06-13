import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { ItemCategory } from "./types.js";

// Catalogue item validation (pure, 100%). No free-text units with empty names;
// pack size a positive integer; par level a non-negative integer.

export interface CatalogueItemInput {
  readonly name: string;
  readonly category: ItemCategory;
  readonly unit: string;
  readonly packSize: number;
  readonly coldChain: boolean;
  readonly controlled: boolean;
  readonly parLevel: number;
}

export function validateCatalogueItem(input: CatalogueItemInput): Result<void, AppError> {
  if (input.name.trim() === "") return err(validationError("item name is required", "inventory.item.name_required"));
  if (input.unit.trim() === "") return err(validationError("item unit is required", "inventory.item.unit_required"));
  if (!Number.isInteger(input.packSize) || input.packSize < 1) {
    return err(validationError("pack size must be a positive integer", "inventory.item.bad_pack_size"));
  }
  if (!Number.isInteger(input.parLevel) || input.parLevel < 0) {
    return err(validationError("par level must be a non-negative integer", "inventory.item.bad_par_level"));
  }
  return ok(undefined);
}
