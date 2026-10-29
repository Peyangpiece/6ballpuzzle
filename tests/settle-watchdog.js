// The settle watchdog puts the rendered balls on their cells when the
// render-only contact correction stops converging, so a match cannot freeze in
// SETTLE. Replaying these 25 hard drops (seed 4) used to reach such a board
// naturally; the pile-flow scheduler now keeps it apart, so the replay must
// settle on its own, and a correction that never converges is simulated to
// check that the watchdog fires once and play continues.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");
const MOVES = [[7,0],[9,4],[1,0],[11,0],[1,1],[11,0],[1,3],[11,5],[13,0],[13,0],[15,0],[15,0],[1,1],[15,1],[3,2],[1,0],[1,0],[11,0],[13,1],[1,5],[9,3],[7,1],[9,0],[13,0],[1,0]];

const files = JSON.parse(/var AI_WORKER_FILES=(\[[\s\S]*?\]);/.exec(read("ai-worker.js"))[1]);
assert(files.includes("app-settle-watchdog-v1.js"), "the watchdog layer must be loaded with the physics layers");
const noop = () => {};
const ctx = { console, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: noop, navigator: {}, postMessage: noop };
ctx.self = ctx; ctx.__sixBallAiWorkerBundled = true;
vm.createContext(ctx);
vm.runInContext(read("ai-worker.js"), ctx);
for (const f of files) vm.runInContext(read(f), ctx, { filename: f });

// The replay reaches the frozen board through the batched SETTLE animation;
// a mass collapse on the way is shown by app-mass-fall-v1.js instead and
// leaves a different (converging) board, so keep the batched animation here.
ctx.__sixBallMassFallDisabled = true;
const replay = stall => JSON.parse(vm.runInContext(`(()=>{
 const g=createEngine(4),moves=${JSON.stringify(MOVES)},stall=${stall};let t=0,i=0,fires=0,last=null,afterFire=null,longest=0,run=0;
 window.__sixBallLastSettleWatchdog=null;
 const baseResolve=resolveVisualContacts;
 // Simulated non-converging correction: from the 10th drop on, every SETTLE
 // contact pass leaves one ball off its cell and reports no convergence.
 resolveVisualContacts=function(g2){
  const r=baseResolve.apply(this,arguments);
  if(stall&&!fires&&i>=10&&g2===g&&g.state==="RESOLVING"&&g.phase==="SETTLE"){
   for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(v){v.x=x+0.3;g._contactNonConvergent=(g._contactNonConvergent||0)+1;return r;}}
  }
  return r;
 };
 try{
 while(t<40&&g.alive){
  if(g.state==="PLAYING"&&g.piece){
   if(i>=moves.length)break;
   const[x,rot]=moves[i++];g.piece={...g.piece,x,rot};g.pieceVX=x;g.freeX=null;hardDrop(g);
  }
  stepEngine(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;
  if(g.state==="RESOLVING"&&g.phase==="SETTLE"){run+=PHYSICS_FRAME;longest=Math.max(longest,run);}else run=0;
  const w=window.__sixBallLastSettleWatchdog;if(w&&w!==last){last=w;fires++;afterFire=t;}
  if(stall&&afterFire!==null&&g.state==="PLAYING"&&t>afterFire)return JSON.stringify({fires,resumedAfter:+(t-afterFire).toFixed(2),longest:+longest.toFixed(2),drops:i,stuck:w&&w.stuck});
 }
 return JSON.stringify({fires,resumedAfter:null,longest:+longest.toFixed(2),drops:i,t:+t.toFixed(1),state:g.state,phase:g.phase});
 }finally{resolveVisualContacts=baseResolve;}})()`, ctx));

const natural = replay(false);
assert.strictEqual(natural.drops, MOVES.length, "replay did not finish: " + JSON.stringify(natural));
assert.strictEqual(natural.fires, 0, "the replay must settle without the watchdog: " + JSON.stringify(natural));
assert(natural.longest < 3, "no settle may last 3 s: " + JSON.stringify(natural));

const r = replay(true);
assert.strictEqual(r.fires, 1, "the watchdog must fire exactly once on a non-converging settle: " + JSON.stringify(r));
assert(r.stuck, "the watchdog must fire on the non-convergence count: " + JSON.stringify(r));
assert(r.resumedAfter !== null && r.resumedAfter < 3, "play must resume after the watchdog: " + JSON.stringify(r));
assert(r.longest < 3, "no settle may last 3 s: " + JSON.stringify(r));
console.log("settle watchdog PASS", JSON.stringify({ natural, stalled: r }));
