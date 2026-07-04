// CLI entrypoint for the synthetic-patient simulation harness (staging /
// synthetic data ONLY — it drives the dev/staging HTTP host, which refuses
// production boot). Runs whole-EMR couple journeys over real HTTP in loops,
// never stops on a step failure, prints a summary table and writes the full
// JSON report. Exit code 1 when any step failed, 0 when the run was clean.
//
//   node dist/simulate.js --url http://127.0.0.1:8060 --couples 3 --loops 2 \
//     --seed 7 --report ./simulation-report.json
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runSimulation, type SimulationReport } from "./journeys.js";

function intArg(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`simulate: --${name} must be a non-negative integer (got "${raw}")`);
    process.exit(2);
  }
  return n;
}

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:8060" },
    couples: { type: "string", default: "3" },
    loops: { type: "string", default: "1" },
    seed: { type: "string", default: "1" },
    report: { type: "string", default: "./simulation-report.json" },
  },
});

const opts = {
  url: values.url.replace(/\/$/, ""),
  couples: intArg("couples", values.couples),
  loops: intArg("loops", values.loops),
  seed: intArg("seed", values.seed),
};

function printSummary(report: SimulationReport): void {
  const rows: readonly [string, string][] = [
    ["target", report.url],
    ["couples × loops", `${report.couples} × ${report.loops} (seed ${report.seed})`],
    ["steps run", String(report.stepsRun)],
    ["passed", String(report.stepsPassed)],
    ["failed", String(report.stepsFailed)],
    ["audit chain", report.auditChainIntact ? "intact" : "BROKEN"],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  console.log("── simulation summary ─────────────────────────────");
  for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}  ${v}`);
  if (report.errors.length > 0) {
    const byStep = new Map<string, number>();
    for (const e of report.errors) byStep.set(`${e.step} (${e.procedure})`, (byStep.get(`${e.step} (${e.procedure})`) ?? 0) + 1);
    console.log("── distinct failing steps ─────────────────────────");
    for (const [step, count] of byStep) console.log(`  ${count}× ${step}`);
    for (const e of report.errors.slice(0, 10)) {
      console.log(`     loop ${e.loop} couple ${e.couple} [${e.code}] ${e.step}: ${e.message}`);
    }
    if (report.errors.length > 10) console.log(`     … and ${report.errors.length - 10} more (see the JSON report)`);
  }
  console.log("── router gaps (skipped by design, not failures) ──");
  for (const gap of report.routerGaps) console.log(`  • ${gap}`);
}

const report = await runSimulation(opts);
writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
printSummary(report);
console.log(`simulate: report written to ${values.report}`);
process.exitCode = report.stepsFailed > 0 ? 1 : 0;
