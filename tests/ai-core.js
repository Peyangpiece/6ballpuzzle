// CPU AI core (app-ai-core.js + ai-worker.js):
// - the worker loads the production physics layers in index.html order;
// - its simulation predicts the real engine's board after a hard drop;
// - level 5 takes a technique that is available now; every level plays.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");

// --- Worker file list: the physics layers of the page plus the AI core, in page order.
const pageFiles = JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(read("index.html"))[1]);
const workerSrc = read("ai-worker.js");
const workerFiles = JSON.parse(/var AI_WORKER_FILES=(\[[\s\S]*?\]);/.exec(workerSrc)[1]);
const physicsFiles = JSON.parse(/const files = (\[[\s\S]*?\]);/.exec(fs.readFileSync(path.join(__dirname, "v1303-plan-group-smoke.js"), "utf8"))[1]);
assert.deepStrictEqual(workerFiles, pageFiles.filter(f => physicsFiles.includes(f) || f === "app-ai-core.js"),
  "ai-worker.js must load exactly the tested physics layers and the AI core, in index.html order");

// --- Load the worker as the browser would (bundled form) into one context.
const posted = [];
const noop = () => {};
const ctx = { console, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: noop, navigator: {}, postMessage: m => posted.push(m) };
ctx.self = ctx; ctx.__sixBallAiWorkerBundled = true;
vm.createContext(ctx);
vm.runInContext(workerSrc, ctx, { filename: "ai-worker.js" });
for (const f of workerFiles) vm.runInContext(read(f), ctx, { filename: f });
assert.strictEqual(ctx.__sixBallAiCoreVersion, "ai-core-v1-engine-accurate");
assert.strictEqual(typeof ctx.onmessage, "function", "worker message handler missing");
assert.strictEqual(ctx.__sixBallAiPlayerV1, true, "outside a real worker the main-thread player installs");

const run = src => vm.runInContext(src, ctx);

// --- Worker protocol answers with a legal move.
run(`var __g0=createEngine(4242);spawn(__g0);`);
ctx.onmessage({ data: { id: 7, req: run(`({board:__sixBallAiBoardFrom(__g0.board),colors:__g0.piece.colors,queue:__g0.queue,level:5,nextId:__g0.nextId,seed:1,maxSims:12})`) } });
assert.strictEqual(posted.length, 1); assert.strictEqual(posted[0].id, 7); assert(!posted[0].error, posted[0].error);
assert(posted[0].move && Number.isInteger(posted[0].move.x) && Number.isInteger(posted[0].move.rot), "worker returned no move");

// --- A colour-0 ball falls in the simulation (bare colour numbers never moved it).
const fell = run(`(()=>{const s=__sixBallAiSimulateMove(__sixBallAiBoardFrom(newBoard()),{x:9,y:2,rot:1,colors:[0,0,0]},1);let low=0,n=0;for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&s.b[y][x]){n++;low=Math.max(low,y);}return{low,n,floor:ROWS-1};})()`);
assert.strictEqual(fell.n, 3);
assert.strictEqual(fell.low, fell.floor, "colour-0 balls must fall to the floor in the AI simulation");

// --- Prediction matches the real engine after hard drops.
const parity = run(`(()=>{
 const colorsOf=b=>{const a=[];for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&b[y][x]!=null)a.push(x+","+y+":"+getC(b[y][x]));return a.sort().join(" ");};
 let n=0,same=0,chainsSame=0;
 for(const seed of [31,57]){const g=createEngine(seed);spawn(g);const rnd=mulberry32(seed);
  for(let turn=0;turn<14&&g.alive&&g.state==="PLAYING"&&g.piece;turn++){
   const moves=enumerateMoves(g.board,g.piece.colors);if(!moves.length)break;const m=moves[Math.floor(rnd()*moves.length)];
   const pred=__sixBallAiSimulateMove(__sixBallAiBoardFrom(g.board),m,g.nextId);
   g.piece={...g.piece,x:m.x,rot:m.rot,y:-2};g.pieceVX=m.x;g.freeX=null;let chains=0;hardDrop(g);
   for(let k=0;k<4800;k++){g.events.length=0;stepEngine(g,PHYSICS_FRAME);for(const e of g.events)if(e.t==="clear")chains++;if((g.state==="PLAYING"&&g.piece)||!g.alive)break;}
   if(!g.alive||!pred)break;n++;if(colorsOf(pred.b)===colorsOf(g.board))same++;if(pred.chain===chains)chainsSame++;g.sendBuffer=0;g.sendShapes=[];
  }}
 return{n,same,chainsSame};})()`);
assert(parity.n >= 20, "too few parity samples: " + JSON.stringify(parity));
assert(parity.same / parity.n >= 0.9, "AI prediction no longer matches the engine: " + JSON.stringify(parity));
assert(parity.chainsSame / parity.n >= 0.95, "AI chain prediction no longer matches the engine: " + JSON.stringify(parity));

// --- Level 5 completes a technique that one move makes available now.
const tech = run(`(()=>{
 const b=newBoard(),y=ROWS-1;let id=1;for(let n=0;n<5;n++)b[y][n*2]={id:id++,c:0,motionGroupId:0};
 const board=__sixBallAiBoardFrom(b);
 const r=__sixBallAiDecide({board,colors:[0,1,2],queue:[[3,4,1],[1,2,3]],level:5,nextId:100,seed:3,maxSims:400});
 const s=__sixBallAiSimulateMove(board,{...r.move,colors:[0,1,2]},100);
 return{type:s&&s.best&&s.best.type,sims:r.stats.sims};})()`);
assert.strictEqual(tech.type, "STRAIGHT", "level 5 must complete the available STRAIGHT: " + JSON.stringify(tech));

// --- Same request, same decision.
const decide = () => run(`JSON.stringify(__sixBallAiDecide({board:__sixBallAiBoardFrom(__g0.board),colors:__g0.piece.colors,queue:__g0.queue,level:3,nextId:__g0.nextId,seed:99,maxSims:15}).move)`);
assert.strictEqual(decide(), decide(), "decisions must be deterministic for a fixed simulation count");

// --- Every level plays a piece through the main-thread player (no Worker here: sync fallback).
ctx.__sixBallAiSyncMaxSims = 6;
for (let level = 1; level <= 5; level++) {
  const played = run(`(()=>{const g=createEngine(${700 + level});spawn(g);g.ai={level:${level},target:null,thinkT:0,actT:0};let f=0;while(g.state==="PLAYING"&&f++<1200)stepAI(g,PHYSICS_FRAME);return g.state==="RESOLVING"&&!g.piece;})()`);
  assert(played, "level " + level + " CPU did not play its piece");
}
console.log("ai core PASS", JSON.stringify({ parity, tech }));
