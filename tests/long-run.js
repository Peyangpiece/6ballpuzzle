const fs = require("fs");
const vm = require("vm");

const seed = Math.max(1, Number(process.argv[2]) || 1);
const seconds = Math.max(10, Number(process.argv[3]) || 60);
const runtime = [
  "app-01.js", "app-02.js", "app-03.js", "app-04.js", "app-05.js",
  "app-06.js", "app-07.js", "app-08.js", "app-09.js"
].map((name) => fs.readFileSync(`${__dirname}/../public/${name}`, "utf8")).join("\n");

const exercise = `
const g=createEngine(${seed});
g.ai={level:${1 + seed % 5},target:null,thinkT:0,actT:0};
let elapsed=0,lastProgress=0,lastSig="";
for(let step=0;step<120*${seconds}&&g.alive;step++){
  if(step===120*8)g.incomingShapes.push("PYRAMID");
  if(step===120*18)g.incomingShapes.push("HEXAGON");
  if(step===120*34)g.incoming+=7;
  stepEngine(g,PHYSICS_FRAME);elapsed+=PHYSICS_FRAME;
  const sig=g.state+"|"+g.phase+"|"+g.ver+"|"+(g.piece?g.piece.x+","+g.piece.y:"-")+"|"+pendingFallPathCount(g);
  if(sig!==lastSig){lastSig=sig;lastProgress=elapsed;}
  if(elapsed-lastProgress>8)throw new Error("long run stalled: "+sig);
}
let balls=0;
for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x])balls++;
globalThis.result={seed:${seed},seconds:+elapsed.toFixed(2),alive:g.alive,state:g.state,phase:g.phase,score:g.stats.score,balls,fallbacks:g.physicsWatch.fallbacks};
`;

const context = {
  React: { useRef() {}, useEffect() {}, useState() {}, useCallback() {} },
  window: {}, navigator: {}, console, Math, Map, Set, Array, Number, Object,
  String, Boolean, JSON, Date
};
vm.runInNewContext(runtime + exercise, context, { timeout: 120000 });
console.log(JSON.stringify(context.result));
