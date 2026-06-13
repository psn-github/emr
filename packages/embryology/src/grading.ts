import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { GardnerGrade, GardnerLetter } from "./types.js";

// Gardner blastocyst grading (pure, 100%). Expansion 1–6; ICM + trophectoderm
// graded A/B/C. Grading drives transfer/freeze selection, so an out-of-range
// grade must be rejected, not silently coerced.

const LETTERS: readonly GardnerLetter[] = ["A", "B", "C"];

function isLetter(v: string): v is GardnerLetter {
  return (LETTERS as readonly string[]).includes(v);
}

/** Validate a Gardner grade from its parts. */
export function makeGardnerGrade(expansion: number, icm: string, te: string): Result<GardnerGrade, AppError> {
  if (!Number.isInteger(expansion) || expansion < 1 || expansion > 6) {
    return err(validationError("expansion must be an integer 1–6", "embryology.grade.bad_expansion"));
  }
  if (!isLetter(icm)) return err(validationError("ICM grade must be A, B or C", "embryology.grade.bad_icm"));
  if (!isLetter(te)) return err(validationError("trophectoderm grade must be A, B or C", "embryology.grade.bad_te"));
  return ok({ expansion, icm, te });
}

/** Parse a Gardner grade string such as "4AA". */
export function parseGardnerGrade(value: string): Result<GardnerGrade, AppError> {
  const m = /^([1-6])([A-C])([A-C])$/.exec(value);
  if (m === null) return err(validationError("grade must look like 4AA", "embryology.grade.bad_format"));
  return makeGardnerGrade(Number(m[1]), m[2]!, m[3]!);
}

/** Render a Gardner grade back to its canonical string. */
export function formatGardnerGrade(g: GardnerGrade): string {
  return `${g.expansion}${g.icm}${g.te}`;
}
