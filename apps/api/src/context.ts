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
import { ClinicalService, PgClinicalStore } from "@oxford/clinical";
import { WitnessingService, PgWitnessingStore, RiWitnessStubProvider } from "@oxford/witnessing";
import { EmbryologyService, PgEmbryologyStore, PgtService, PgPgtStore, type WitnessPort } from "@oxford/embryology";
import { AndrologyService, PgAndrologyStore } from "@oxford/andrology";
import { OutcomesService, PgOutcomesStore } from "@oxford/outcomes";
import { CryostoreService, PgCryostoreStore, type UseGate, type BillingPort } from "@oxford/cryostore";
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
  RecoveryService,
  PgRecoveryStore,
  CssdService,
  PgCssdStore,
  type FacilityFlowPort,
  type SchedulingPort,
  type PerioperativeBillingPort,
  type PharmacyPort,
} from "@oxford/perioperative";
import { CatalogueService, PgCatalogueStore, InventoryService, PgStockStore, ProcurementService, PgProcurementStore, ControlledDrugsService, PgControlledRegisterStore } from "@oxford/inventory";
import { AssetService, PgAssetStore } from "@oxford/assets";
import { AnalyticsService } from "@oxford/analytics";
import { HrService, PgHrStore } from "@oxford/hr";
import { CycleService, PgCycleStore, StimulationService, PgStimStore, PgReasonCodeStore } from "@oxford/fertility";
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
  readonly witnessing: WitnessingService;
  readonly embryology: EmbryologyService;
  readonly pgt: PgtService;
  readonly andrology: AndrologyService;
  readonly outcomes: OutcomesService;
  readonly cryostore: CryostoreService;
  readonly perioperative: PerioperativeService;
  readonly theatreScheduling: TheatreSchedulingService;
  readonly preOp: PreOpService;
  readonly whoChecklist: WhoChecklistService;
  readonly intraOp: IntraOpService;
  readonly recovery: RecoveryService;
  readonly cssd: CssdService;
  readonly catalogue: CatalogueService;
  readonly inventory: InventoryService;
  readonly procurement: ProcurementService;
  readonly controlledDrugs: ControlledDrugsService;
  readonly assets: AssetService;
  readonly analytics: AnalyticsService;
  readonly hr: HrService;
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
  const clinical = new ClinicalService(new PgClinicalStore(pool), audit, events, clock);

  // Witnessing: RI Witness is authoritative (ADR-0018). A stub provider stands in
  // until the CooperSurgical integration is scoped + residency-reviewed. The
  // embryology lab integrates through the WitnessPort seam — it never witnesses.
  const witnessProvider = new RiWitnessStubProvider();
  const witnessing = new WitnessingService(new PgWitnessingStore(pool), witnessProvider, audit, events, clock);
  const witnessPort: WitnessPort = {
    registerHandlingEvent: (actorId, input) => witnessing.registerHandlingEvent(actorId, input).then(() => undefined),
    assertCycleStepSignOff: (cycleId) => witnessing.assertCycleStepSignOff(cycleId),
  };
  const embryology = new EmbryologyService(new PgEmbryologyStore(pool), witnessPort, audit, events);
  // PGT capture (genetics lab stays external). Permitted indications are CONFIG,
  // bounded by clinic counsel — EMPTY by default, so PGT orders are blocked until
  // the clinic configures its counsel-confirmed permitted set (no permissive default).
  const pgt = new PgtService(new PgPgtStore(pool), audit, events, PGT_PERMITTED_INDICATIONS);
  // Andrology shares the witnessing seam (its sperm freeze is a witnessed event).
  const andrology = new AndrologyService(new PgAndrologyStore(pool), witnessPort, audit, events);
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
  const cryostore = new CryostoreService(new PgCryostoreStore(pool), witnessPort, cryoUseGate, cryoBilling, audit, events, clock);

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
  // Controlled-drugs register (docs/01 §E8): a legal-grade, two-person-witnessed,
  // reconcilable ledger for items flagged `controlled` in the catalogue. Its own
  // append-only book balance; a physical count reconciles against it.
  const controlledDrugs = new ControlledDrugsService(new PgControlledRegisterStore(pool), catalogueStore, audit, events);
  // Asset & biomedical-equipment register (docs/01 §E10): PPM/calibration with
  // due-date alerting and a use-blocking gate for critical equipment whose
  // calibration is overdue/missing (ADR-0029), plus fault/downtime logging.
  const assets = new AssetService(new PgAssetStore(pool), audit, events);
  // KPI/outcome read models (ADR-0039). Pure computation over counts gathered from
  // the lab/outcome services; Vienna-consensus thresholds are config (defaults).
  const analytics = new AnalyticsService();
  // Light HR (ADR-0040): staff registry, licence/competency expiry alerts, and
  // rota shifts feeding scheduling availability. Full payroll stays external.
  const hr = new HrService(new PgHrStore(pool), audit, events);
  // Cycle engine (read surface used by the patient portal timeline). The marriage
  // hard-gate is wired to the registry (fertility never imports registry directly).
  const cycle = new CycleService(new PgCycleStore(pool), audit, events, clock, {
    assertMayTreat: (coupleId) => registry.canStartFertility(asId<"Couple">(coupleId)),
  }, new PgReasonCodeStore(pool));
  // Stimulation chart — read surface for the patient medication schedule.
  const stim = new StimulationService(new PgStimStore(pool), audit, events, clock);
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
  const cssd = new CssdService(new PgCssdStore(pool), audit, events);

  const whoChecklist = new WhoChecklistService(new PgWhoChecklistStore(pool), audit, events);
  // Recovery/post-op + the discharge gate (prescription fulfilled + follow-up).
  const pharmacyStub = new StubPharmacyProvider();
  const recovery = new RecoveryService(new PgRecoveryStore(pool), pharmacyStub, audit, events);
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

  return { audit, events, registry, authorizer, i18n, scheduling, facility, flow, notifications, billing, packages, instalments, gatewayPayments, paymentGateway, charges, clinical, witnessing, embryology, pgt, andrology, outcomes, cryostore, perioperative, theatreScheduling, preOp, whoChecklist, intraOp, recovery, cssd, catalogue, inventory, procurement, controlledDrugs, assets, analytics, hr, cycle, stim, messaging, consent, push, pushOutbox, pharmacyStub, notificationOutbox, witnessProvider };
}
