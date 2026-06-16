// @oxford/andrology — IVF laboratory andrology (docs/01 §E5). Domain module:
// core + audit + the WitnessPort seam (wired to @oxford/witnessing in the app).
// Semen analysis is flagged to WHO 6th-edition reference values; the sperm
// freeze is a witnessed handling event with a cryostore link. RI Witness is
// authoritative — andrology never witnesses.
export type {
  SemenAnalysisId,
  SpermPrepId,
  SpermFreezeId,
  SurgicalRetrievalId,
  SemenParameters,
  SemenFlags,
  ReferenceFlag,
  SemenAnalysis,
  PrepMethod,
  SpermPrep,
  SpermFreeze,
  RetrievalMethod,
  SurgicalRetrieval,
  AdvancedSpermTestId,
  AdvancedSpermTest,
  AdvancedTestSpec,
  AdvancedTestDirection,
  SpermTestInterpretation,
} from "./types.js";
export {
  WHO_6TH_LOWER_LIMITS,
  validateSemenParameters,
  flagSemen,
  allWithinReference,
  type ReferenceLimits,
} from "./semen-analysis.js";
export { SEED_ADVANCED_TEST_SPECS, interpret, type AdvancedTestSpecStore, InMemoryAdvancedTestSpecStore } from "./advanced-tests.js";
export { PgAdvancedTestSpecStore, seedAdvancedTestSpecs } from "./advanced-tests-pg-store.js";
export type { WitnessPort, HandlingEventInput } from "./witness-port.js";
export { type AndrologyStore, InMemoryAndrologyStore } from "./store.js";
export { PgAndrologyStore } from "./pg-store.js";
export {
  AndrologyService,
  type RecordAnalysisInput,
  type RecordPrepInput,
  type RecordFreezeInput,
  type RecordRetrievalInput,
  type RecordAdvancedTestInput,
} from "./andrology-service.js";
export { andrologySchema, semenAnalysis, spermPrep, spermFreeze, surgicalRetrieval, advancedTestSpec, advancedSpermTest } from "./schema.js";
