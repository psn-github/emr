import type pg from "pg";
import { systemClock } from "@oxford/core";
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
import { FacilityService, FlowService, PgFacilityStore, PgFlowStore } from "@oxford/facility";
import { NotificationService, RecordingNotificationProvider, notificationMessages } from "@oxford/notifications";
import { BillingService, PgBillingStore } from "@oxford/billing";
import { ClinicalService, PgClinicalStore } from "@oxford/clinical";

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
  readonly clinical: ClinicalService;
  /** Dev/test stub outbox (records messages; no real provider wired yet). */
  readonly notificationOutbox: RecordingNotificationProvider;
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
  const clinical = new ClinicalService(new PgClinicalStore(pool), audit, events, clock);
  return { audit, events, registry, authorizer, i18n, scheduling, facility, flow, notifications, billing, clinical, notificationOutbox };
}
