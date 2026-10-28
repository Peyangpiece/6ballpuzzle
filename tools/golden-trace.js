#!/usr/bin/env node
// Behaviour-equivalence trace for refactoring the layered runtime.
//
// Plays 12 CPU-vs-CPU matches (all levels, with attacks exchanged and the
// gravity ramp on in half of them) straight through the engine in the real
// page, with Math.random, performance.now and Date.now made deterministic and
// the AI worker replaced by its synchronous path with a fixed search size.
// Every frame it hashes both boards, every ball's rendered position, the
// active piece and the garbage packs; every 15 frames it renders the scene at
// half size and hashes the pixels. Two versions that print the same digests
// behave identically on these matches.
//
//   node tools/serve.js public                    # this checkout, port 8018
//   (set CHROME_PATH to use a Chromium other than Playwright's own)
//   node tools/golden-trace.js http://127.0.0.1:8018/ after.json
//   (same for the base version, e.g. a git worktree of main on another port)
//   node tools/golden-trace.js --compare before.json after.json
const fs = require('fs');
if (process.argv[2] === '--compare') {
  const a = JSON.parse(fs.readFileSync(process.argv[3])), b = JSON.parse(fs.readFileSync(process.argv[4]));
  let ok = a.results.length === b.results.length && !a.errs.length && !b.errs.length;
  a.results.forEach((r, i) => { const s = b.results[i] || {}; const same = r.hash === s.hash && r.frames === s.frames && r.render === s.render && !r.err && !s.err; ok = ok && same; console.log(`seed ${r.seed}: ${r.frames} frames, ${r.renders} renders ${same ? 'same' : 'DIFFERENT'}${r.err || s.err ? ' error: ' + (r.err || s.err) : ''}`); });
  console.log(ok ? 'IDENTICAL' : 'DIFFERENT'); process.exit(ok ? 0 : 1);
}
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8018/', out = process.argv[3];
const INIT = `(()=>{let s=1;const rnd=()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
 Math.random=rnd;let clk=1000;const now=()=>(clk+=0.013);
 try{Object.defineProperty(performance,'now',{value:now,configurable:true});}catch(_){} const D=Date.now;Date.now=()=>Math.floor(1.7e12+now());
 window.__goldenReset=(seed)=>{s=seed|0;clk=1000;};})();`;
const TRACE = (cfg) => {
  window.__sixBallAiWorkerDisabled = true; window.__sixBallAiSyncBudgetMs = 1e9; window.__sixBallAiSyncMaxSims = cfg.sims;
  const results = [];
  const fnv = (h, s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const WZ = typeof WAZA !== 'undefined' ? WAZA : {};
  for (const m of cfg.matches) {
    window.__goldenReset(m.seed);
    const a = createEngine(m.seed, { gravityRamp: m.ramp }), b = createEngine(m.seed, { gravityRamp: m.ramp });
    a.ai = { level: m.la, target: null, thinkT: 0, actT: 0 }; b.ai = { level: m.lb, target: null, thinkT: 0, actT: 0 };
    const orbs = []; let h = 2166136261, frames = 0, err = null, rh = 2166136261, renders = 0;
    const snap = g => { const parts = [g.state, g.phase, g.ver, g.alive, g.incoming, g.garbLeft, g.chain, g.stats.cleared, g.stats.score, g.stats.maxChain, JSON.stringify(g.piece), g.pieceVX, g.dropT, g.dropInterval];
      for (let y = 0; y < g.board.length; y++) for (let x = 0; x < g.board[y].length; x++) { const q = g.board[y][x]; if (q) parts.push(x + ',' + y + ':' + q.id + '/' + q.c); }
      for (const [id, v] of g.vis) parts.push(id + '@' + v.x + ',' + v.y + ',' + v.vy);
      for (const p of g.activeGarbagePacks || []) parts.push('G' + p.seq + ':' + p.y);
      return parts.join('|'); };
    try {
      for (let f = 0; f < m.frames && a.alive && b.alive; f++) {
        stepEngine(a, PHYSICS_FRAME); stepEngine(b, PHYSICS_FRAME); frames++;
        [a, b].forEach((g, i) => { if (g.sendBuffer > 0 || g.sendShapes.length > 0) { orbs.push({ side: i, t: 0, dur: .6, n: g.sendBuffer, shapes: g.sendShapes.splice(0) }); g.sendBuffer = 0; } });
        for (let k = orbs.length - 1; k >= 0; k--) { const o = orbs[k]; o.t += PHYSICS_FRAME; if (o.t >= o.dur) { const tgt = o.side === 0 ? b : a; if (o.shapes && o.shapes.length) tgt.incomingShapes.push(...o.shapes.filter(w => WZ[w])); else tgt.incoming += o.n; orbs.splice(k, 1); } }
        h = fnv(h, snap(a)); h = fnv(h, snap(b));
        if (cfg.render && f % cfg.render === 0) {
          const cv = window.__goldenCanvas || (window.__goldenCanvas = Object.assign(document.createElement('canvas'), { width: VW / 2, height: VH / 2 }));
          const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.setTransform(.5, 0, 0, .5, 0, 0);
          renderScene(ctx, a, b, [], f * PHYSICS_FRAME, { me: 'A', meSub: '', foe: 'B', foeSub: '' }, 0, 0, 0);
          const px = new Uint32Array(ctx.getImageData(0, 0, cv.width, cv.height).data.buffer);
          let r = rh; for (let i = 0; i < px.length; i++) { r ^= px[i]; r = Math.imul(r, 16777619) >>> 0; } rh = r; renders++;
        }
      }
    } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
    results.push({ seed: m.seed, frames, hash: h.toString(16), render: rh.toString(16), renders, aAlive: a.alive, bAlive: b.alive, cleared: [a.stats.cleared, b.stats.cleared], err });
  }
  return results;
};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }); const ctx = await b.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.addInitScript(INIT); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(2500);
  const lv = [[1, 2], [3, 4], [5, 3], [2, 5], [4, 4], [5, 5], [3, 5], [5, 1], [4, 2], [2, 4], [5, 4], [3, 3]];
  const matches = lv.map(([la, lb], i) => ({ seed: 1000 + i * 7919, la, lb, ramp: i % 2 === 0, frames: 120 * 150 }));
  const results = await p.evaluate(TRACE, { matches, sims: 40, render: 15 });
  const outp = { results, errs };
  for (const r of results) console.log(`seed ${r.seed}: ${r.frames} frames ${r.hash} render ${r.render}${r.err ? ' error: ' + r.err : ''}`);
  if (out) fs.writeFileSync(out, JSON.stringify(outp));
  await b.close();
})();
