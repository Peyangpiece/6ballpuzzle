const fs=require("fs");
const vm=require("vm");
const names=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-18.js","app-19.js","app-20.js","app-21.js","app-22.js"
];
const runtime=names.map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,"utf8")).join("\n");
const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,id,c){const b={id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
function renderedMin(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v});}let min=Infinity;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)min=Math.min(min,hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y));return min;}

const g=createEngine(910221);
let id=700000;
// Stable two-row normal pile gives a broad simultaneous contact surface for a
// STRAIGHT packet without relying on airborne/gridified garbage as support.
for(let y=ROWS-2;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y))put(g,x,y,id++,(x+y)%COLORS.length);
g.state="RESOLVING";g.phase="GARBAGE";g.stateT=0;g.garbDone=true;g.garbShapes=["STRAIGHT"];

let maxObstacleBuilds=0,maxFrameResolves=0,maxDeferred=0,minDist=Infinity;
let sawGarbage=false;
for(let step=0;step<720&&g.alive;step++){
  const p0={...(g._hexGarbagePerf||{})};
  stepEngine(g,PHYSICS_FRAME);
  const p1=g._hexGarbagePerf||{};
  const db=(p1.obstacleBuilds||0)-(p0.obstacleBuilds||0);
  const dr=(p1.frameResolves||0)-(p0.frameResolves||0);
  const dd=(p1.deferredResolves||0)-(p0.deferredResolves||0);
  maxObstacleBuilds=Math.max(maxObstacleBuilds,db);
  maxFrameResolves=Math.max(maxFrameResolves,dr);
  maxDeferred=Math.max(maxDeferred,dd);
  expect(db<=1,"garbage performance: rebuilt settled obstacle list more than once in one physics frame");
  expect(dr<=1,"garbage performance: ran more than one full deferred contact solve in one physics frame");
  const d=renderedMin(g);if(Number.isFinite(d))minDist=Math.min(minDist,d);
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage){sawGarbage=true;expect(!b.rigid&&!b.motionGroupId,"garbage performance: optimized contact restored garbage rigidity");}}
  if(sawGarbage&&g.phase!=="GARBAGE")break;
}

const perf=g._hexGarbagePerf||{};
expect(sawGarbage,"garbage performance: STRAIGHT packet never materialized");
expect(maxObstacleBuilds===1,"garbage performance: obstacle cache was never exercised");
expect((perf.contactCacheHits||0)>0,"garbage performance: per-packet contact cache was never reused");
expect(maxDeferred>=2,"garbage performance: simultaneous contact did not exercise deferred solver batching");
expect(maxFrameResolves===1,"garbage performance: deferred solves were not collapsed to one final solve");
expect((perf.deferredResolves||0)>(perf.frameResolves||0),"garbage performance: nested contact solves were not reduced");
expect(g.phase!=="GARBAGE","garbage performance: optimized STRAIGHT packet failed to finish");
expect(minDist>=0.999999-1e-7,"garbage performance: optimized packet introduced visible overlap: "+minDist);
console.log("garbage performance regressions PASS",JSON.stringify({maxObstacleBuilds,maxFrameResolves,maxDeferred,minDist,perf}));
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
