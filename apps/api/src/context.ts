import { fileURLToPath } from "node:url";
import type pg from "pg";
import { systemClock, asId, ok, err, conflict, notFound } from "@oxford/core";
import {
  AuditLog,
  DomainEventLog,
  InMemoryChainStore,
  PgAuditChainStore,
  type DomainEventPayload,
} from "@oxford/audit";
import { Authorizer } from "@oxford/identity";
import { LocalKeyProvider } from "@oxford/crypto";
import { RegistryService, PgRegistryStore } from "@oxford/registry";
import { I18n, coreMessages, type Catalog } from "@oxford/i18n";
import { SchedulingService, PgSchedulingStore } from "@oxford/scheduling";
import { FacilityService, FlowService, PgFacilityStore, PgFlowStore, type PatientFlowStatus } from "@oxford/facility";
import { NotificationService, RecordingNotificationProvider, notificationMessages } from "@oxford/notifications";
import { BillingService, PgBillingStore, PackageService, PgPackageStore, InstalmentService, PgInstalmentStore, GatewayPaymentService, StubPaymentGateway, ChargeCaptureService, PgChargeMasterStore, PgChargeStore } from "@oxford/billing";
import { ClinicalService, PgClinicalStore, PgOrderSetStore, AntenatalService, PgAntenatalStore } from "@oxford/clinical";
import { WitnessingService, PgWitnessingStore, RiWitnessStubProvider } from "@oxford/witnessing";
import { EmbryologyService, PgEmbryologyStore, PgtService, PgPgtStore, LabQcService, PgQcParameterStore, PgQcReadingStore, MorphokineticsService, PgMorphokineticRangeStore, PgMorphokineticAnnotationStore, type WitnessPort } from "@oxford/embryology";
import { AndrologyService, PgAndrologyStore, PgAdvancedTestSpecStore } from "@oxford/andrology";
import { OutcomesService, PgOutcomesStore } from "@oxford/outcomes";
import { CryostoreService, PgCryostoreStore, type UseGate, type BillingPort, type AssetPpmPort } from "@oxford/cryostore";
import {
  PerioperativeService,
  PgPerioperativeStore,
  TheatreSchedulingService,
  PgTheatreCaseStore,
  PreOpService,
  PgPreOpStore,
  WhoChecklistService,
  PgWhoChecklistStore,
  IntraOpService,
  PgIntraOpStore,
  DeviceRegistryService,
  PgDeviceCatalogueStore,
  PgImplantUsageStore,
  RecoveryService,
  PgRecoveryStore,
  CssdService,
  PgCssdStore,
  type FacilityFlowPort,
  type SchedulingPort,
  type PerioperativeBillingPort,
  type PharmacyPort,
} from "@oxford/perioperative";
import { CatalogueService, PgCatalogueStore, InventoryService, PgStockStore, ProcurementService, PgProcurementStore, ControlledDrugsService, PgControlledRegisterStore, DemandPlanningService, PgConsumptionProfileStore } from "@oxford/inventory";
import { AssetService, PgAssetStore } from "@oxford/assets";
import { AnalyticsService } from "@oxford/analytics";
import { HrService, PgHrStore } from "@oxford/hr";
import { RecordsService, PgRecordsStore, type AppointmentsPort } from "@oxford/records";
import { CycleService, PgCycleStore, StimulationService, PgStimStore, PgReasonCodeStore, PgCycleTemplateStore, formularyItem } from "@oxford/fertility";
import {
  PharmacyService,
  PgPharmacyStore,
  type FormularyPort,
  type AllergyPort as PharmacyAllergyPort,
  type InventoryPort as PharmacyInventoryPort,
  type ControlledRegisterPort,
} from "@oxford/pharmacy";
import { DocumentService, PgDocumentStore, NoopOcrProvider, LocalDiskBlobStore, type BlobStorePort } from "@oxford/documents";
import { MessagingService, PgMessagingStore } from "@oxford/messaging";
import { ConsentService, PgConsentStore } from "@oxford/consent";
import { PushService, PgPushStore, RecordingPushProvider } from "@oxford/push";

// Composition root: wire the real Postgres-backed stores + services. Host-touching
// choices (pool, key provider, notification provider) are config so the in-region
// OCI target (ADR-0014) is a config swap. Dev/stub providers are guarded.
export interface Services {
  readonly audit: AuditLog;
  readonly events: DomainEventLog;
  readonly registry: RegistryService;
  readonly authorizer: Authorizer;
  readonly i18n: I18n;
  readonly scheduling: SchedulingService;
  readonly facility: FacilityService;
  readonly flow: FlowService;
  readonly notifications: NotificationService;
  readonly billing: BillingService;
  readonly packages: PackageService;
  readonly instalments: InstalmentService;
  readonly gatewayPayments: GatewayPaymentService;
  /** Dev/test payment gateway stub (ADR-0036) until the in-region processor. */
  readonly paymentGateway: StubPaymentGateway;
  readonly charges: ChargeCaptureService;
  readonly clinical: ClinicalService;
  readonly antenatal: AntenatalService;
  readonly witnessing: WitnessingService;
  readonly embryology: EmbryologyService;
  readonly labQc: LabQcService;
  readonly morphokinetics: MorphokineticsService;
  readonly pgt: PgtService;
  readonly andrology: AndrologyService;
  readonly outcomes: OutcomesService;
  readonly cryostore: CryostoreService;
  readonly perioperative: PerioperativeService;
  readonly theatreScheduling: TheatreSchedulingService;
  readonly preOp: PreOpService;
  readonly whoChecklist: WhoChecklistService;
  readonly intraOp: IntraOpService;
  readonly deviceRegistry: DeviceRegistryService;
  readonly recovery: RecoveryService;
  readonly cssd: CssdService;
  readonly catalogue: CatalogueService;
  readonly inventory: InventoryService;
  readonly procurement: ProcurementService;
  readonly demandPlanning: DemandPlanningService;
  readonly controlledDrugs: ControlledDrugsService;
  readonly assets: AssetService;
  readonly analytics: AnalyticsService;
  readonly hr: HrService;
  readonly records: RecordsService;
  readonly pharmacy: PharmacyService;
  /** Versioned, access-controlled document store (ADR-0067). Scanned paper
   *  (consents, marriage certificates, ID scans, external reports). */
  readonly documents: DocumentService;
  /** Document CONTENT storage (blob) behind the BlobStorePort; the metadata store
   *  is `documents`. Staging: local disk; production: in-region object store. */
  readonly documentBlobs: BlobStorePort;
  readonly cycle: CycleService;
  readonly stim: StimulationService;
  readonly messaging: MessagingService;
  readonly consent: ConsentService;
  readonly push: PushService;
  /** Dev/test push provider (records sent pushes; real web-push is config). */
  readonly pushOutbox: RecordingPushProvider;
  /** Dev/test pharmacy stub (discharge-prescription fulfilment; real is E8). */
  readonly pharmacyStub: StubPharmacyProvider;
  /** Dev/test stub outbox (records messages; no real provider wired yet). */
  readonly notificationOutbox: RecordingNotificationProvider;
  /** RI Witness stub provider (ADR-0018) until CooperSurgical scoping. Exposed
   *  so dev/test can feed the witnessing records RI would otherwise return. */
  readonly witnessProvider: RiWitnessStubProvider;
}

/** Clinic-configured, counsel-confirmed permitted PGT indications. EMPTY until
 *  the clinic confirms its permitted set with legal counsel — PGT orders are
 *  rejected until then (conservative; AMD-0004 open item). Configuration, not code. */
const PGT_PERMITTED_INDICATIONS: readonly string[] = [];

/** L2 inpatient bed count — the seeded topology (ADR-0023). A day's theatre list
 *  reserving more than this is flagged (not blocked). Configuration, not code. */
const L2_BED_CAPACITY = 6;

/** The Ground-floor pharmacy's stock location — the dispensing seam issues from
 *  here by default (ADR-0066). Configuration, not code. */
const PHARMACY_LOCATION_ID = "pharmacy-ground";

/** Document blob store root — env-driven, defaulting to `<repo>/var/documents`
 *  locally (gitignored, OUTSIDE the deploy path like the DB — ADR-0067). The
 *  in-region object store replaces the disk backend behind BlobStorePort. */
function documentStoreDir(): string {
  return process.env.DOCUMENT_STORE_DIR ?? fileURLToPath(new URL("../../../var/documents", import.meta.url));
}

/** Dev/test pharmacy stub (ADR-0025) — discharge-prescription fulfilment until
 *  the real E8 pharmacy lands. `markFulfilled` simulates the pharmacy handover. */
export class StubPharmacyProvider implements PharmacyPort {
  private readonly fulfilled = new Set<string>();
  markFulfilled(encounterId: string): void {
    this.fulfilled.add(encounterId);
  }
  async isPrescriptionFulfilled(encounterId: string): Promise<boolean> {
    return this.fulfilled.has(encounterId);
  }
}

function mergedCatalog(): Catalog {
  return {
    en: { ...coreMessages.en, ...notificationMessages.en },
    ar: { ...coreMessages.ar, ...notificationMessages.ar },
  };
}

export function buildServices(pool: pg.Pool, isProduction = false): Services {
  const clock = systemClock;
  const audit = new AuditLog(new PgAuditChainStore(pool), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const keys = new LocalKeyProvider(isProduction); // in production: OCI Vault provider (ADR-0014)
  const registry = new RegistryService(new PgRegistryStore(pool), keys, audit, events, clock);
  const authorizer = new Authorizer(audit);
  const i18n = new I18n(mergedCatalog());
  const scheduling = new SchedulingService(new PgSchedulingStore(pool), audit, events);
  const facility = new FacilityService(new PgFacilityStore(pool), audit, events);
  const flow = new FlowService(new PgFlowStore(pool), facility, audit, events, clock);
  const notificationOutbox = new RecordingNotificationProvider(); // residency review gates a real provider (ADR-0006)
  const notifications = new NotificationService(i18n, notificationOutbox, audit, events);
  const billing = new BillingService(new PgBillingStore(pool), audit, events, clock);
  // Packages & cycle bundles (ADR-0037): versioned config; selling raises the
  // package-price invoice via billing and tracks per-component recognition.
  const packages = new PackageService(new PgPackageStore(pool), billing, audit, events, clock);
  // Deposits & instalment plans + the cycle-progression FinanceGate (ADR-0038).
  // Grace days before an overdue instalment counts as arrears is config (default 0).
  const instalments = new InstalmentService(new PgInstalmentStore(pool), billing, audit, events, clock);
  // KNET + card via the gateway seam (ADR-0036). A residency-reviewed in-region
  // processor replaces this stub behind the same PaymentGatewayPort.
  const paymentGateway = new StubPaymentGateway();
  const gatewayPayments = new GatewayPaymentService(billing, paymentGateway);
  // Item-level charge capture (ADR-0037): priced from the charge master (no
  // free-text charges), recognised against packages, batched into invoices.
  const charges = new ChargeCaptureService(new PgChargeMasterStore(pool), new PgChargeStore(pool), packages, billing, audit, events);
  const clinical = new ClinicalService(new PgClinicalStore(pool), audit, events, clock, new PgOrderSetStore(pool));
  // Antenatal record / obstetric continuum (ADR-0050): dates a pregnancy (EDD),
  // generates a visit schedule, and derives per-visit risk flags.
  const antenatal = new AntenatalService(new PgAntenatalStore(pool), audit, events, clock);

  // Witnessing: RI Witness is authoritative (ADR-0018). A stub provider stands in
  // until the CooperSurgical integration is scoped + residency-reviewed. The
  // embryology lab integrates through the WitnessPort seam — it never witnesses.
  const witnessProvider = new RiWitnessStubProvider();
  const witnessing = new WitnessingService(new PgWitnessingStore(pool), witnessProvider, audit, events, clock);
  const witnessPort: WitnessPort = {
    registerHandlingEvent: (actorId, input) => witnessing.registerHandlingEvent(actorId, input).then(() => undefined),
    assertCycleStepSignOff: (cycleId) => witnessing.assertCycleStepSignOff(cycleId),
  };
  const embryologyStore = new PgEmbryologyStore(pool);
  const embryology = new EmbryologyService(embryologyStore, witnessPort, audit, events);
  // Lab QC log (ADR-0046): incubator gas/temp + media pH/osmolality readings vs
  // configured ranges; out-of-range raises a breach event. Equipment + media lots
  // are referenced by id (no cross-module table access).
  const labQc = new LabQcService(new PgQcParameterStore(pool), new PgQcReadingStore(pool), audit, events);
  // Time-lapse morphokinetic analytics (ADR-0051): per-embryo annotation imported
  // from the time-lapse incubator, scored against config optimal ranges; analytics
  // surfaced to embryologists (never an auto-select).
  const morphokinetics = new MorphokineticsService(embryologyStore, new PgMorphokineticRangeStore(pool), new PgMorphokineticAnnotationStore(pool), audit, events);
  // PGT capture (genetics lab stays external). Permitted indications are CONFIG,
  // bounded by clinic counsel — EMPTY by default, so PGT orders are blocked until
  // the clinic configures its counsel-confirmed permitted set (no permissive default).
  const pgt = new PgtService(new PgPgtStore(pool), audit, events, PGT_PERMITTED_INDICATIONS);
  // Andrology shares the witnessing seam (its sperm freeze is a witnessed event).
  const andrology = new AndrologyService(new PgAndrologyStore(pool), witnessPort, audit, events, new PgAdvancedTestSpecStore(pool));
  // Outcome continuum (fertility → pregnancy → live birth), linked back to the cycle.
  const outcomes = new OutcomesService(new PgOutcomesStore(pool), audit, events);

  // Cryostore. The thaw-for-treatment re-gate's facts come from the registry —
  // couple verification + membership, and the CLINICIAN-ATTESTED vital status
  // (no posthumous use; Medical Director decision 2026-06-13). The annual storage
  // charge is raised through the billing service (integer fils stays in billing).
  const cryoUseGate: UseGate = {
    async thawFacts(owner, coupleId) {
      const coupleVerified = await registry.isCoupleVerified(asId<"Couple">(coupleId));
      if (owner.kind === "couple") return { coupleVerified, coupleIncludesOwner: false, ownerAlive: true };
      const coupleIncludesOwner = await registry.coupleIncludes(asId<"Couple">(coupleId), asId<"Person">(owner.id));
      const ownerAlive = await registry.isPersonLiving(asId<"Person">(owner.id));
      return { coupleVerified, coupleIncludesOwner, ownerAlive };
    },
  };
  const cryoBilling: BillingPort = {
    async raiseStorageCharge(actorId, patientId, line) {
      const r = await billing.createInvoice(actorId, patientId, [
        { chargeCode: line.chargeCode, description: { ar: line.descriptionAr, en: line.descriptionEn }, unitAmountFils: line.amountFils, quantity: 1 },
      ]);
      if (!r.ok) throw new Error(r.error.detailKey ?? "storage charge failed");
      return r.value.id;
    },
  };
  // Asset & biomedical-equipment management (ADR-0029): asset register, PPM /
  // calibration scheduling with due-date alerting and a use-blocking gate for
  // critical equipment whose calibration is overdue/missing, plus fault logging.
  const assets = new AssetService(new PgAssetStore(pool), audit, events);
  // Cryostore tank PPM linkage (ADR-0053): a tank's preventive-maintenance status
  // is read from its linked Asset record (the asset module is authoritative).
  const cryoAssetPpm: AssetPpmPort = {
    async ppmStatus(assetRef) {
      const r = await assets.ppmStatus(assetRef, clock.now());
      return r.ok ? r.value : null;
    },
  };
  const cryostore = new CryostoreService(new PgCryostoreStore(pool), witnessPort, cryoUseGate, cryoBilling, audit, events, clock, cryoAssetPpm);

  // Perioperative journey drives bed/floor movement through the facility/flow
  // model (ADR-0023). The seam resolves a care-location KIND to a concrete node/
  // bed and enforces capacity (a placement fails if no bed/theatre is free).
  const perioperativeFlow: FacilityFlowPort = {
    async place(actorId, patientId, kind, status) {
      const [nodes, beds] = await Promise.all([facility.locations(), facility.beds()]);
      if (kind === "l3_admit") {
        const node = nodes.find((n) => n.level === "L3" && n.type === "consult_room");
        if (node === undefined) return err(notFound("no L3 admission location", "perioperative.no_l3"));
        const r = await flow.moveTo(actorId, patientId, node.id, status as PatientFlowStatus);
        return r.ok ? ok({ locationNodeId: node.id }) : err(r.error);
      }
      if (kind === "theatre") {
        const board = await flow.board();
        const inTheatre = new Set(board.locations.filter((l) => l.patients.some((p) => p.status === "in_theatre")).map((l) => l.locationNodeId));
        const free = nodes.find((n) => n.level === "L1" && n.type === "theatre" && !inTheatre.has(n.id));
        if (free === undefined) return err(conflict("no free theatre", "perioperative.no_theatre"));
        const r = await flow.moveTo(actorId, patientId, free.id, status as PatientFlowStatus);
        return r.ok ? ok({ locationNodeId: free.id }) : err(r.error);
      }
      const [level, type] = kind === "ward_bed" ? (["L2", "inpatient_bed"] as const) : (["L1", "recovery_bed"] as const);
      const nodeIds = new Set(nodes.filter((n) => n.level === level && n.type === type).map((n) => n.id));
      const freeBed = beds.find((b) => nodeIds.has(b.locationNodeId) && b.status === "free");
      if (freeBed === undefined) return err(conflict("no free bed of the required kind", "facility.bed.occupied"));
      const r = await flow.moveTo(actorId, patientId, freeBed.locationNodeId, status as PatientFlowStatus, { bedId: freeBed.id });
      return r.ok ? ok({ locationNodeId: freeBed.locationNodeId }) : err(r.error);
    },
    async release(actorId, patientId, reason) {
      const r = await flow.discharge(actorId, patientId, reason);
      return r.ok ? ok(undefined) : err(r.error);
    },
  };
  // Operations ERP. The real inventory now backs the Phase-3 InventoryPort:
  // theatre consumables deduct actual stock (ADR-0026). Consumable billing reuses
  // @oxford/billing (a multi-line invoice per case).
  const catalogueStore = new PgCatalogueStore(pool);
  const catalogue = new CatalogueService(catalogueStore, audit, events);
  const inventory = new InventoryService(new PgStockStore(pool), catalogueStore, audit, events);
  // Procurement (AP) cycle: requisition → PO → goods receipt (real stock) →
  // supplier invoice → 3-way match. Shares the real inventory so a GRN receives
  // actual stock; AP money is integer fils, kept apart from patient billing.
  const procurement = new ProcurementService(new PgProcurementStore(pool), inventory, audit, events);
  // Demand planning (ADR-0059): forecast media/consumable burn from booked cycle
  // counts using configured per-cycle profiles, netted against real on-hand stock.
  const demandPlanning = new DemandPlanningService(new PgConsumptionProfileStore(pool), { onHand: (itemId) => inventory.onHand(itemId) });
  // Controlled-drugs register (docs/01 §E8): a legal-grade, two-person-witnessed,
  // reconcilable ledger for items flagged `controlled` in the catalogue. Its own
  // append-only book balance; a physical count reconciles against it.
  const controlledDrugs = new ControlledDrugsService(new PgControlledRegisterStore(pool), catalogueStore, audit, events);
  // KPI/outcome read models (ADR-0039). Pure computation over counts gathered from
  // the lab/outcome services; Vienna-consensus thresholds are config (defaults).
  const analytics = new AnalyticsService();
  // Light HR (ADR-0040): staff registry, licence/competency expiry alerts, and
  // rota shifts feeding scheduling availability. Full payroll stays external.
  const hr = new HrService(new PgHrStore(pool), audit, events);
  // Paper medical records & filing (ADR-0065): MRN allocation, the physical file
  // registry + volumes, audited barcode-keyed movements, overdue detection and
  // the clinic pull list. The pull list reads tomorrow's bookings through the
  // scheduling module's PUBLISHED interface via this port (no cross-module table
  // access — module boundaries). Labels are pure renderers in the module.
  const recordsAppointments: AppointmentsPort = {
    async appointmentsOn(dateIso) {
      const appts = await scheduling.appointmentsOn(dateIso);
      return appts.map((a) => ({ patientId: a.patientId, start: a.start, practitionerId: a.practitionerId }));
    },
  };
  const records = new RecordsService(new PgRecordsStore(pool), recordsAppointments, audit, events, clock);
  // Documents (ADR-0067): versioned, access-controlled, OCR-seamed store. Content
  // reads verify the document's OWN requiredPermission via the AccessGuard the
  // router builds from the session + Authorizer, and are audited as sensitive
  // reads. NoopOcrProvider until a residency-reviewed OCR provider is wired; the
  // LocalDiskBlobStore is staging-only (refuses production) — the in-region object
  // store swaps in behind the same BlobStorePort.
  const documentMaxBytes = process.env.DOCUMENT_MAX_BYTES !== undefined ? Number(process.env.DOCUMENT_MAX_BYTES) : undefined;
  const documentBlobs = new LocalDiskBlobStore(documentStoreDir(), isProduction, documentMaxBytes !== undefined ? { maxBytes: documentMaxBytes } : {});
  const documents = new DocumentService(new PgDocumentStore(pool), new NoopOcrProvider(), audit, events, clock);
  // Cycle engine (read surface used by the patient portal timeline). The marriage
  // hard-gate is wired to the registry (fertility never imports registry directly).
  const cycle = new CycleService(new PgCycleStore(pool), audit, events, clock, {
    assertMayTreat: (coupleId) => registry.canStartFertility(asId<"Couple">(coupleId)),
  }, new PgReasonCodeStore(pool), new PgCycleTemplateStore(pool));
  // Stimulation chart — read surface for the patient medication schedule. The
  // prescribe-time allergy advisory (docs/01 §E8, ADR-0060) is wired to clinical
  // via an injected port (fertility never imports the clinical module's tables).
  const stim = new StimulationService(new PgStimStore(pool), audit, events, clock, {
    allergicClasses: (patientId) => clinical.allergicClasses(patientId),
  });
  // Secure patient↔clinic messaging (read/write surface for the portal).
  const messaging = new MessagingService(new PgMessagingStore(pool), audit, events, clock);
  // Consent-gated partner access (the portal read gate consults this).
  const consent = new ConsentService(new PgConsentStore(pool), audit, events, clock);
  // Discreet web-push (PWA). A recording provider stands in until the real
  // web-push transport is configured; dispatch only ever sends no-PHI prompts.
  const pushOutbox = new RecordingPushProvider();
  const push = new PushService(new PgPushStore(pool), pushOutbox, audit, events, clock);
  const perioperativeBilling: PerioperativeBillingPort = {
    async raiseConsumableCharges(actorId, patientId, lines) {
      const r = await billing.createInvoice(actorId, patientId, lines.map((l) => ({ chargeCode: l.chargeCode, description: { ar: l.descriptionAr, en: l.descriptionEn }, unitAmountFils: l.unitAmountFils, quantity: l.quantity })));
      if (!r.ok) throw new Error(r.error.detailKey ?? "consumable charge failed");
      return r.value.id;
    },
  };
  const intraOp = new IntraOpService(new PgIntraOpStore(pool), inventory, perioperativeBilling, audit, events);
  // Implant/device registry reporting (ADR-0052): reports registrable implants
  // (config catalogue) from the lot-traced consumable lines — patient implant
  // record, recall lookup, and periodic registry export (recall/export audited).
  const deviceRegistry = new DeviceRegistryService(new PgDeviceCatalogueStore(pool), new PgImplantUsageStore(pool), audit);
  const cssd = new CssdService(new PgCssdStore(pool), audit, events);

  const whoChecklist = new WhoChecklistService(new PgWhoChecklistStore(pool), audit, events);

  // Ground-floor pharmacy dispensing (ADR-0066). A DOMAIN module wired here to
  // three published-surface seams (module boundaries — pharmacy imports none of
  // these): the FORMULARY (fertility's formulary is the only prescribable source;
  // controlled/cold-chain come from the inventory catalogue by the shared drug
  // code), the ALLERGY screen (clinical.allergicClasses; advisory only, ADR-0060),
  // stock decrement (inventory's FEFO issue), and the CONTROLLED-DRUGS REGISTER
  // (a controlled item's dispense posts a witnessed issue movement).
  const pharmacyFormulary: FormularyPort = {
    async isPrescribable(drugId) {
      return formularyItem(drugId) !== null;
    },
    async drugInfo(drugId) {
      const f = formularyItem(drugId);
      if (f === null) return null;
      // controlled/cold-chain are inventory-catalogue attributes; a catalogue item
      // sharing the drug's formulary code carries them (absent ⇒ neither).
      const cat = await catalogue.item(asId<"CatalogueItem">(drugId));
      return { nameEn: f.name.en, nameAr: f.name.ar, drugClass: f.drugClass, controlled: cat?.controlled ?? false, coldChain: cat?.coldChain ?? false };
    },
  };
  const pharmacyAllergy: PharmacyAllergyPort = {
    allergicClasses: (patientId) => clinical.allergicClasses(patientId),
  };
  const pharmacyInventory: PharmacyInventoryPort = {
    async availableAt(drugId, locationId) {
      const lots = await inventory.lotsForItem(drugId);
      return lots.filter((l) => l.locationId === locationId).reduce((s, l) => s + l.quantity, 0);
    },
    async issueFefo(actorId, drugId, locationId, quantity) {
      // Read lots BEFORE issuing so FEFO-chosen lot ids resolve to lot/expiry for
      // the dispense allocation record; inventory.issue does the FEFO decrement.
      const lotsBefore = await inventory.lotsForItem(drugId);
      const r = await inventory.issue(actorId, { itemId: drugId, locationId, quantity });
      if (!r.ok) return err(r.error);
      const allocations = r.value.map((line) => {
        const lot = lotsBefore.find((l) => l.id === line.lotId)!; // just-issued lot
        return { drugId, lotNo: lot.lotNo, expiry: lot.expiryDate, quantity: line.quantity };
      });
      return ok(allocations);
    },
    async deductLots(actorId, allocations) {
      return inventory.deduct(actorId, allocations.map((a) => ({ code: a.drugId, lotNo: a.lotNo, quantity: a.quantity })));
    },
  };
  const pharmacyControlledRegister: ControlledRegisterPort = {
    async postIssue(actorId, input) {
      const r = await controlledDrugs.record(actorId, {
        itemId: input.drugId,
        lotNo: input.lotNo,
        type: "issue",
        quantity: input.quantity,
        reason: "pharmacy dispense",
        patientRef: input.patientRef,
        witnessedBy: input.witnessStaffId,
        occurredAt: input.occurredAt,
      });
      return r.ok ? ok(undefined) : err(r.error);
    },
  };
  const pharmacy = new PharmacyService(new PgPharmacyStore(pool), pharmacyFormulary, pharmacyAllergy, pharmacyInventory, pharmacyControlledRegister, audit, events, clock, { pharmacyLocationId: PHARMACY_LOCATION_ID });

  // Recovery/post-op + the discharge gate (prescription fulfilled + follow-up).
  // The gate consumes a COMPOSITE PharmacyPort (ADR-0066): fulfilled if the dev
  // stub says so OR the real pharmacy service does. Rationale — the existing
  // discharge/perioperative e2es and the simulator's dev.markPharmacyFulfilled
  // feed the stub, and journeys that skip pharmacy still need that dev feed; the
  // real ward→pharmacy→discharge loop must gate on real fulfilment without
  // breaking either. `pharmacyStub` stays exposed on Services for those feeds.
  const pharmacyStub = new StubPharmacyProvider();
  const compositePharmacy: PharmacyPort = {
    async isPrescriptionFulfilled(encounterId) {
      if (await pharmacyStub.isPrescriptionFulfilled(encounterId)) return true;
      return pharmacy.isPrescriptionFulfilled(encounterId);
    },
  };
  const recovery = new RecoveryService(new PgRecoveryStore(pool), compositePharmacy, audit, events);
  const perioperative = new PerioperativeService(new PgPerioperativeStore(pool), perioperativeFlow, whoChecklist, recovery, audit, events);

  // Two-theatre case scheduling on the SHARED scheduling calendar (conflict-aware),
  // provisionally reserving an L2 bed per case-day (capacity 6 → ADR-0023).
  const theatreScheduling = new TheatreSchedulingService(
    new PgTheatreCaseStore(pool),
    {
      async bookTheatreSlot(actorId, input) {
        const r = await scheduling.book(actorId, {
          typeId: asId<"AppointmentType">(input.typeId),
          patientId: input.patientId,
          practitionerId: asId<"Resource">(input.surgeonResourceId),
          resourceIds: input.resourceIds.map((id) => asId<"Resource">(id)),
          start: input.start,
          end: input.end,
        });
        return r.ok ? ok({ appointmentId: r.value.id }) : err(r.error);
      },
    } satisfies SchedulingPort,
    audit,
    events,
    L2_BED_CAPACITY,
  );
  const preOp = new PreOpService(new PgPreOpStore(pool), audit, events);

  return { audit, events, registry, authorizer, i18n, scheduling, facility, flow, notifications, billing, packages, instalments, gatewayPayments, paymentGateway, charges, clinical, antenatal, witnessing, embryology, labQc, morphokinetics, pgt, andrology, outcomes, cryostore, perioperative, theatreScheduling, preOp, whoChecklist, intraOp, deviceRegistry, recovery, cssd, catalogue, inventory, procurement, demandPlanning, controlledDrugs, assets, analytics, hr, records, pharmacy, documents, documentBlobs, cycle, stim, messaging, consent, push, pushOutbox, pharmacyStub, notificationOutbox, witnessProvider };
}
