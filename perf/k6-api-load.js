// k6 HTTP load script for the Oxford HIS API — hot read/write paths.
//
// STATUS: ready but not yet wired — the tRPC/REST HTTP host is deferred
// (ADR-0009); apps/api/src/index.ts is a composition root today. When the host
// is mounted, bind the procedure paths + input wire-format below to the tRPC
// httpBatchLink contract (GET for queries, POST for mutations) and run against
// STAGING ONLY (synthetic data — the DO VPS must never hold real PHI).
//
//   BASE_URL=https://staging.example  k6 run perf/k6-api-load.js
//
// See perf/README.md. The audit-append advisory lock is the tightest write
// bottleneck; a rising conflict/error rate under load is the signal to revisit
// the concurrency baseline (packages/audit/.../concurrency.integration.test.ts).
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const AUTH = __ENV.AUTH_TOKEN ? { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` } : {};
const errors = new Rate("app_errors");

export const options = {
  scenarios: {
    // Read-heavy steady state (portal reads, dashboards) with a write trickle.
    steady: { executor: "ramping-vus", startVUs: 0, stages: [
      { duration: "30s", target: 20 },
      { duration: "2m", target: 20 },
      { duration: "30s", target: 0 },
    ] },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95th percentile under 500ms
    app_errors: ["rate<0.01"],        // <1% application errors
  },
};

// tRPC httpBatchLink query: GET /trpc/<proc>?batch=1&input=<url-encoded batch>.
function trpcQuery(proc, input) {
  const q = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  return http.get(`${BASE_URL}/trpc/${proc}?batch=1&input=${q}`, { headers: AUTH });
}

// tRPC httpBatchLink mutation: POST /trpc/<proc>?batch=1 with a batch body.
function trpcMutation(proc, input) {
  return http.post(`${BASE_URL}/trpc/${proc}?batch=1`, JSON.stringify({ 0: { json: input } }), {
    headers: { "Content-Type": "application/json", ...AUTH },
  });
}

export default function () {
  // Hot read paths (bind proc names to the mounted router).
  const reads = [
    trpcQuery("portal.timeline", { patientId: "SYNTH-1" }),
    trpcQuery("dashboards.operational", {}),
  ];
  for (const r of reads) {
    check(r, { "read 2xx": (res) => res.status >= 200 && res.status < 300 }) || errors.add(1);
  }

  // Write trickle: one mutation per iteration (exercises the audit-append lock).
  const w = trpcMutation("scheduling.book", { patientId: "SYNTH-1", slotId: "SYNTH-SLOT" });
  check(w, { "write 2xx": (res) => res.status >= 200 && res.status < 300 }) || errors.add(1);

  sleep(1);
}
