// Gameplay motion invariants over deterministic CPU-vs-CPU matches in the
// production physics stack (tests/physics-stack.js), with attacks exchanged:
// - two ordinary balls on the board are never drawn more than 3% inside each
//   other;
// - an ordinary ball on the board never moves up by more than 0.05 rows from
//   one frame to the next;
// - no resolve phase (clear / settle / garbage) lasts longer than 15 s;
// - nothing throws.
// - where a match sets garbageMin, no two balls, garbage included, are drawn
//   closer than that.
// The seeds are matches that showed each defect before it was fixed (balls
// stepping off a wall cutting through their neighbour, a ball shoved up by the
// contact correction, mass-fall separation pushing a ball up, garbage dropped
// into a cell before the ball passing through it had left, a ball coming to
// rest beside the column another ball was still falling down, a wave left
// unscheduled and then planned through, garbage and ordinary balls of one
// falling group drifting apart).
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const { files } = require("./physics-stack.js");
const PUBLIC = path.join(__dirname, "..", "public");

let rs = 1, clk = 1000;
const rand = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const math = Object.create(Math); math.random = rand;
const now = () => (clk += 0.013);
const ctx = {
  console: { log() {}, warn() {}, error: console.error }, Math: math, Date: { now: () => Math.floor(1.7e12 + now()) },
  performance: { now }, setTimeout, clearTimeout, Map, Set, WeakMap, Array, Object, Number, String, Boolean, JSON, Error, TypeError, RangeError, Float64Array, Int32Array, Uint32Array, Uint8Array, Promise, Symbol, Infinity, NaN, isFinite, parseInt, parseFloat,
  navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null }) },
  React: { useRef: i => ({ current: i }), useEffect() {}, useState: i => [i, () => {}], useCallback: f => f, useMemo: f => f(), createElement: () => null },
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(PUBLIC, f), "utf8"), ctx, { filename: f });
ctx.__sixBallAiWorkerDisabled = true; ctx.__sixBallAiSyncBudgetMs = 1e9; ctx.__sixBallAiSyncMaxSims = 40;
ctx.__reset = s => { rs = s | 0; clk = 1000; };

const MATCHES = [
  { seed: 1000 + 1 * 7919, la: 3, lb: 4, ramp: false },
  { seed: 1000 + 2 * 7919, la: 5, lb: 3, ramp: true, garbageMin: 0.9 },
  { seed: 1000 + 3 * 7919, la: 2, lb: 5, ramp: false, garbageMin: 0.9 },
  // 40595: the board lets a ball step down between two balls only 1.73
  // diameters apart, which no path does without about 13% overlap.
  { seed: 1000 + 5 * 7919, la: 5, lb: 5, ramp: false, garbageMin: 0.85 },
  { seed: 1000 + 6 * 7919, la: 3, lb: 5, ramp: true },
  { seed: 1000 + 11 * 7919, la: 3, lb: 3, ramp: false, garbageMin: 0.9 }
];
const result = JSON.parse(vm.runInContext(`(${(matches) => {
  const out = [];
  for (const m of matches) {
    __reset(m.seed);
    const a = createEngine(m.seed, { gravityRamp: m.ramp }), b = createEngine(m.seed, { gravityRamp: m.ramp });
    a.ai = { level: m.la, target: null, thinkT: 0, actT: 0 }; b.ai = { level: m.lb, target: null, thinkT: 0, actT: 0 };
    const orbs = [], st = [a, b].map(() => ({ prev: new Map(), minD: 9, worst: null, minAll: 9, worstAll: null, upMax: 0, worstUp: null, resolving: 0, maxResolving: 0 }));
    let f = 0, err = null;
    try {
      for (; f < 120 * 60 && a.alive && b.alive; f++) {
        stepEngine(a, PHYSICS_FRAME); stepEngine(b, PHYSICS_FRAME);
        [a, b].forEach((g, i) => { if (g.sendBuffer > 0 || g.sendShapes.length > 0) { orbs.push({ side: i, t: 0, n: g.sendBuffer, shapes: g.sendShapes.splice(0) }); g.sendBuffer = 0; } });
        for (let k = orbs.length - 1; k >= 0; k--) { const o = orbs[k]; o.t += PHYSICS_FRAME; if (o.t >= .6) { const t = o.side ? a : b; if (o.shapes.length) t.incomingShapes.push(...o.shapes.filter(w => WAZA[w])); else t.incoming += o.n; orbs.splice(k, 1); } }
        [a, b].forEach((g, gi) => {
          const S = st[gi], pts = [], now = new Map(), clearing = g.clearing && g.clearing.ids;
          for (let y = 0; y < g.board.length; y++) for (let x = 0; x < g.board[y].length; x++) {
            const q = g.board[y][x]; if (!q || (clearing && clearing.has(q.id))) continue;
            const v = g.vis.get(q.id); if (!v) continue;
            pts.push([v.x * .5, v.y * HEX_ROW_H, q.id, !!q.isGarbage]); if (!q.isGarbage) now.set(q.id, v.y);
          }
          for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d2 = dx * dx + dy * dy;
            if (d2 < S.minAll * S.minAll) { S.minAll = Math.sqrt(d2); S.worstAll = { frame: f, ids: [pts[i][2], pts[j][2]], phase: g.phase }; }
            if (pts[i][3] || pts[j][3] || d2 >= S.minD * S.minD) continue;
            S.minD = Math.sqrt(d2); S.worst = { frame: f, ids: [pts[i][2], pts[j][2]], phase: g.phase };
          }
          for (const [id, y] of now) { const p = S.prev.get(id); if (p !== undefined && p - y > S.upMax) { S.upMax = p - y; S.worstUp = { frame: f, id, phase: g.phase }; } }
          S.prev = now;
          if (g.state === "RESOLVING") S.maxResolving = Math.max(S.maxResolving, ++S.resolving); else S.resolving = 0;
        });
      }
    } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
    out.push({ seed: m.seed, garbageMin: m.garbageMin, frames: f, err, sides: st.map(S => ({ minDist: +S.minD.toFixed(4), worst: S.worst, minAll: +S.minAll.toFixed(4), worstAll: S.worstAll, upMax: +S.upMax.toFixed(4), worstUp: S.worstUp, longestResolveSec: +(S.maxResolving / 120).toFixed(2) })) });
  }
  return JSON.stringify(out);
}})(${JSON.stringify(MATCHES)})`, ctx));

const problems = [];
for (const r of result) {
  if (r.err) problems.push(`seed ${r.seed}: threw ${r.err}`);
  r.sides.forEach((s, i) => {
    if (s.minDist < 0.97) problems.push(`seed ${r.seed} side ${i}: ordinary balls ${s.worst.ids} drawn ${(100 * (1 - s.minDist)).toFixed(1)}% inside each other at frame ${s.worst.frame} (${s.worst.phase})`);
    if (r.garbageMin && s.minAll < r.garbageMin) problems.push(`seed ${r.seed} side ${i}: balls ${s.worstAll.ids} (garbage included) drawn ${(100 * (1 - s.minAll)).toFixed(1)}% inside each other at frame ${s.worstAll.frame} (${s.worstAll.phase})`);
    if (s.upMax > 0.05) problems.push(`seed ${r.seed} side ${i}: ball ${s.worstUp.id} moved up ${s.upMax.toFixed(3)} rows at frame ${s.worstUp.frame} (${s.worstUp.phase})`);
    if (s.longestResolveSec > 15) problems.push(`seed ${r.seed} side ${i}: a resolve phase lasted ${s.longestResolveSec} s`);
  });
}
assert.deepStrictEqual(problems, [], "motion invariants");
console.log("motion invariants PASS", JSON.stringify(result.map(r => ({ seed: r.seed, frames: r.frames, minDist: Math.min(...r.sides.map(s => s.minDist)), minAll: Math.min(...r.sides.map(s => s.minAll)), upMax: Math.max(...r.sides.map(s => s.upMax)), resolve: Math.max(...r.sides.map(s => s.longestResolveSec)) }))));
