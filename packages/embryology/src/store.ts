import type {
  Oocyte,
  Insemination,
  FertilisationCheck,
  Embryo,
  GradingEntry,
  Disposition,
  EmbryoTransfer,
  EmbryoId,
  MediaApplication,
  PgtOrder,
  PgtOrderId,
  PgtResult,
} from "./types.js";

export interface EmbryologyStore {
  saveOocyte(o: Oocyte): Promise<void>;
  oocytesForCycle(cycleId: string): Promise<readonly Oocyte[]>;
  saveInsemination(i: Insemination): Promise<void>;
  inseminationsForCycle(cycleId: string): Promise<readonly Insemination[]>;
  saveFertilisationCheck(f: FertilisationCheck): Promise<void>;
  checksForCycle(cycleId: string): Promise<readonly FertilisationCheck[]>;
  saveEmbryo(e: Embryo): Promise<void>;
  embryosForCycle(cycleId: string): Promise<readonly Embryo[]>;
  embryoById(id: EmbryoId): Promise<Embryo | undefined>;
  saveGrading(g: GradingEntry): Promise<void>;
  gradingsForEmbryo(embryoId: EmbryoId): Promise<readonly GradingEntry[]>;
  saveDisposition(d: Disposition): Promise<void>;
  dispositionsForCycle(cycleId: string): Promise<readonly Disposition[]>;
  saveTransfer(t: EmbryoTransfer): Promise<void>;
  transfersForCycle(cycleId: string): Promise<readonly EmbryoTransfer[]>;
  saveMediaApplication(m: MediaApplication): Promise<void>;
  /** Recall reachability: every application of a given media lot, across cycles. */
  mediaApplicationsForLot(itemId: string, lotNo: string): Promise<readonly MediaApplication[]>;
  /** Life-history reconstruction: a cycle's media applications. */
  mediaApplicationsForCycle(cycleId: string): Promise<readonly MediaApplication[]>;
}

/** PGT order/result persistence (kept a separate port from the lab store). */
export interface PgtStore {
  saveOrder(o: PgtOrder): Promise<void>;
  ordersForCycle(cycleId: string): Promise<readonly PgtOrder[]>;
  saveResult(r: PgtResult): Promise<void>;
  resultForOrder(orderId: PgtOrderId): Promise<PgtResult | undefined>;
}

export class InMemoryPgtStore implements PgtStore {
  private readonly orders: PgtOrder[] = [];
  private readonly results: PgtResult[] = [];

  async saveOrder(o: PgtOrder): Promise<void> {
    this.orders.push(o);
  }
  async ordersForCycle(cycleId: string): Promise<readonly PgtOrder[]> {
    return this.orders.filter((o) => o.cycleId === cycleId);
  }
  async saveResult(r: PgtResult): Promise<void> {
    this.results.push(r);
  }
  async resultForOrder(orderId: PgtOrderId): Promise<PgtResult | undefined> {
    return this.results.find((r) => r.orderId === orderId);
  }
}

export class InMemoryEmbryologyStore implements EmbryologyStore {
  private readonly oocytes: Oocyte[] = [];
  private readonly inseminations: Insemination[] = [];
  private readonly checks: FertilisationCheck[] = [];
  private readonly embryos: Embryo[] = [];
  private readonly gradings: GradingEntry[] = [];
  private readonly dispositions: Disposition[] = [];
  private readonly transfers: EmbryoTransfer[] = [];
  private readonly mediaApplications: MediaApplication[] = [];

  async saveOocyte(o: Oocyte): Promise<void> {
    this.oocytes.push(o);
  }
  async oocytesForCycle(cycleId: string): Promise<readonly Oocyte[]> {
    return this.oocytes.filter((o) => o.cycleId === cycleId);
  }
  async saveInsemination(i: Insemination): Promise<void> {
    this.inseminations.push(i);
  }
  async inseminationsForCycle(cycleId: string): Promise<readonly Insemination[]> {
    return this.inseminations.filter((i) => i.cycleId === cycleId);
  }
  async saveFertilisationCheck(f: FertilisationCheck): Promise<void> {
    this.checks.push(f);
  }
  async checksForCycle(cycleId: string): Promise<readonly FertilisationCheck[]> {
    return this.checks.filter((c) => c.cycleId === cycleId);
  }
  async saveEmbryo(e: Embryo): Promise<void> {
    this.embryos.push(e);
  }
  async embryosForCycle(cycleId: string): Promise<readonly Embryo[]> {
    return this.embryos.filter((e) => e.cycleId === cycleId);
  }
  async embryoById(id: EmbryoId): Promise<Embryo | undefined> {
    return this.embryos.find((e) => e.id === id);
  }
  async saveGrading(g: GradingEntry): Promise<void> {
    this.gradings.push(g);
  }
  async gradingsForEmbryo(embryoId: EmbryoId): Promise<readonly GradingEntry[]> {
    return this.gradings.filter((g) => g.embryoId === embryoId);
  }
  async saveDisposition(d: Disposition): Promise<void> {
    this.dispositions.push(d);
  }
  async dispositionsForCycle(cycleId: string): Promise<readonly Disposition[]> {
    return this.dispositions.filter((d) => d.cycleId === cycleId);
  }
  async saveTransfer(t: EmbryoTransfer): Promise<void> {
    this.transfers.push(t);
  }
  async transfersForCycle(cycleId: string): Promise<readonly EmbryoTransfer[]> {
    return this.transfers.filter((t) => t.cycleId === cycleId);
  }
  async saveMediaApplication(m: MediaApplication): Promise<void> {
    this.mediaApplications.push(m);
  }
  async mediaApplicationsForLot(itemId: string, lotNo: string): Promise<readonly MediaApplication[]> {
    return this.mediaApplications.filter((m) => m.itemId === itemId && m.lotNo === lotNo);
  }
  async mediaApplicationsForCycle(cycleId: string): Promise<readonly MediaApplication[]> {
    return this.mediaApplications.filter((m) => m.cycleId === cycleId);
  }
}
