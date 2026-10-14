#!/usr/bin/env node
// Single entry point for the deployment gate (`npm test`).
// Runs every node-level regression in parallel workers, prints PASS/FAIL with
// timing, and exits non-zero if anything fails.  The list below is the
// authoritative gate; .github/workflows/validate.yml just calls this script.
const { spawn } = require("child_process");
const os = require("os"), path = require("path");
const root = path.join(__dirname, "..");

const GATE = [
  // structural
  "tests/build-output.js",
  "tests/menu-ui-regression.js",
  "tests/ui-ux-regression.js",
  "tests/ai-core.js",
  "tests/settle-watchdog.js",
  "tests/brand-bgm.js",
  "tests/bgm-local.js",
  "tests/landscape-startup.js",
  "tests/online-attack-sanitize.js",
  "tests/rating-settlement.js",
  "tests/rules-elo-table.js",
  // production planner / contracts
  "tests/v1303-plan-group-smoke.js",
  "tests/runtime-performance-v4-parity.js",
  "tests/v1303-current-oracle-suite.js",
  "tests/v1303-upconvex-production-guard.js",
  "tests/v1303-upconvex-live-pocket-v24.js",
  // Nintendo motion regressions
  "tests/reference-20260826-upconvex-dynamic-split.js",
  "tests/reference-20260826-rendered-pair-rigidity.js",
  "tests/reference-20260826-solo-continuity-diagnostic.js",
  "tests/reference-20260826-solo-pivot-arc.js",
  "tests/reference-20260814-inverted-flat-split-diagnostic.js",
  "tests/reference-rigidity-state-machine-v1.js",
  "tests/reference-rigidity-release-bounce-v1.js",
  "tests/reference-gameover-motion-parity.js",
  "tests/reference-clear-timing-parity.js",
  "tests/post-clear-causal-paths.js",
  "tests/reference-post-clear-capture-diagnostic.js",
  "tests/reference-clear-20261013-collapse.js",
  "tests/reference-technique-collapse-20261013.js",
  "tests/reference-chain-collapse-20261013.js",
  "tests/reference-floor-slide-clock.js",
  "tests/reference-inverted-pocket-motion.js",
  "tests/reference-garbage-flight.js",
  "tests/instant-drop-progress.js",
  "tests/instant-drop-contact-integrity.js",
  "tests/online-clear-render-parity.js",
  "tests/motion-smoothness-regression-v1.js",
  "tests/no-upward-bounce-split-continuity-v1.js",
  "tests/even-row-strict-inner-split-continuity-v1.js",
  "tests/split-visual-state-integrity.js",
  "tests/clear-all-ball-fx.js",
  // unified garbage
  "tests/garbage-normal-physics.js",
  "tests/garbage-presentation.js",
  "tests/pile-arc-motion.js",
  "tests/garbage-zero-rigidity.js",
  "tests/garbage-diagonal-settle.js",
  "tests/garbage-chain-settle.js",
  "tests/garbage-post-clear-collapse.js",
  "tests/gameover-garbage-fade.js",
  "tests/garbage-render-overlap-guard.js"
];
const FPS_SWEEP = [
  "tests/no-upward-bounce-split-continuity-v1.js",
  "tests/reference-video-motion.js",
  "tests/reference-capture-motion-parity.js",
  "tests/reference-inverted-pocket-motion.js",
  "tests/reference-garbage-flight.js"
];

module.exports = { GATE, FPS_SWEEP };
if (require.main !== module) return;
// CPU-heavy simulations go first so they overlap with the many sub-second
// tests instead of piling up at the end of the run.
const HEAVY = ["tests/v1303-upconvex-live-pocket-v24.js", "tests/instant-drop-progress.js", "tests/v1303-current-oracle-suite.js", "tests/instant-drop-contact-integrity.js", "tests/runtime-performance-v4-parity.js"];
const jobs = [...HEAVY.filter(f => GATE.includes(f)), ...GATE.filter(f => !HEAVY.includes(f))].map(file => ({ file }));
for (const fps of [30, 60, 120, 240]) for (const file of FPS_SWEEP) jobs.push({ file, fps });
const only = process.argv.slice(2);
const queue = only.length ? jobs.filter(j => only.some(o => j.file.includes(o))) : jobs;
const workers = Math.max(1, Math.min(Number(process.env.TEST_WORKERS) || os.cpus().length, 6));
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS) || 600000;
const results = []; let cursor = 0;

function runOne(job) {
  return new Promise(resolve => {
    const started = Date.now();
    // Heavy tests run concurrently here, so their internal vm timeouts get the same budget as the job timeout.
    const child = spawn(process.execPath, [job.file], { cwd: root, env: { TEST_VM_TIMEOUT_MS: String(timeoutMs), ...process.env, ...(job.fps ? { TEST_FPS: String(job.fps) } : {}) } });
    let output = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.stdout.on("data", d => output += d); child.stderr.on("data", d => output += d);
    child.on("error", e => output += e.stack);
    child.on("close", code => { clearTimeout(timer); resolve({ ...job, code, timedOut, seconds: (Date.now() - started) / 1000, output }); });
  });
}
async function worker() {
  while (cursor < queue.length) {
    const job = queue[cursor++];
    const r = await runOne(job);
    results.push(r);
    const label = job.file.replace(/^tests\//, "") + (job.fps ? ` @${job.fps}fps` : "");
    console.log(`${r.code === 0 && !r.timedOut ? "PASS" : "FAIL"} ${label.padEnd(60)} ${r.seconds.toFixed(1)}s`);
    if (r.code !== 0 || r.timedOut) console.log(r.output.split("\n").slice(-25).join("\n"));
  }
}
(async () => {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, worker));
  const bad = results.filter(r => r.code !== 0 || r.timedOut);
  console.log(`\n${results.length - bad.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s with ${workers} workers`);
  if (bad.length) { console.log("failed: " + bad.map(b => b.file + (b.fps ? "@" + b.fps : "")).join(", ")); process.exit(1); }
})();
