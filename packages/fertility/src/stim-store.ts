import type { StimulationDay } from "./stimulation.js";

export interface StimStore {
  saveDay(day: StimulationDay): Promise<void>;
  daysForCycle(cycleId: string): Promise<readonly StimulationDay[]>;
}

export class InMemoryStimStore implements StimStore {
  private readonly days: StimulationDay[] = [];

  async saveDay(day: StimulationDay): Promise<void> {
    const idx = this.days.findIndex((d) => d.cycleId === day.cycleId && d.day === day.day);
    if (idx >= 0) this.days[idx] = day;
    else this.days.push(day);
  }
  async daysForCycle(cycleId: string): Promise<readonly StimulationDay[]> {
    return this.days.filter((d) => d.cycleId === cycleId).sort((a, b) => a.day - b.day);
  }
}
