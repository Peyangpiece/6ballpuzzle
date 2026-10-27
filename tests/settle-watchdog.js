// A dense board on which the render-only contact correction never converges:
// replaying these 25 hard drops (seed 4) used to freeze the match in SETTLE
// forever, each step running the full 128-pass correction. The settle
// watchdog must put the balls on their cells once, and play must continue.
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
const r = JSON.parse(vm.runInContext(`(()=>{
 const g=createEngine(4),moves=${JSON.stringify(MOVES)};let t=0,i=0,fires=0,last=null,afterFire=null,longest=0,run=0;
 while(t<40&&g.alive){
  if(g.state==="PLAYING"&&g.piece){
   if(i>=moves.length){if(fires)break;hardDrop(g);}
   else{const[x,rot]=moves[i++];g.piece={...g.piece,x,rot};g.pieceVX=x;g.freeX=null;hardDrop(g);}
  }
  stepEngine(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;
  if(g.state==="RESOLVING"&&g.phase==="SETTLE"){run+=PHYSICS_FRAME;longest=Math.max(longest,run);}else run=0;
  const w=window.__sixBallLastSettleWatchdog;if(w&&w!==last){last=w;fires++;afterFire=t;}
  if(afterFire!==null&&g.state==="PLAYING"&&t>afterFire)return JSON.stringify({fires,resumedAfter:+(t-afterFire).toFixed(2),longest:+longest.toFixed(2),drops:i,stuck:w&&w.stuck});
 }
 return JSON.stringify({fires,resumedAfter:null,longest:+longest.toFixed(2),drops:i,t:+t.toFixed(1),state:g.state,phase:g.phase});})()`, ctx));
assert.strictEqual(r.drops, MOVES.length, "replay did not reach the frozen board: " + JSON.stringify(r));
assert.strictEqual(r.fires, 1, "the watchdog must fire exactly once on this board: " + JSON.stringify(r));
assert(r.resumedAfter !== null && r.resumedAfter < 3, "play must resume after the watchdog: " + JSON.stringify(r));
assert(r.longest < 3, "no settle may last 3 s: " + JSON.stringify(r));
console.log("settle watchdog PASS", JSON.stringify(r));
