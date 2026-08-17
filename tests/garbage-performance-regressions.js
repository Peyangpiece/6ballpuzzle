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
function nearestVisual(g,x,y){let best={d:Infinity,id:null,garbage:false,p:null};for(const[id,v]of g.vis.entries()){if(!v)continue;const d=hexPhysDist(x,y,v.x,v.y);if(d<best.d){const b=hexGarbageBoardBallById(g,id);best={d,id,garbage:!!b?.isGarbage,p:[v.x,v.y]};}}return best;}
function diagnose(g){
 const packs=(g.activeGarbagePacks||[]).map(p=>({seq:p.seq,landed:p.landed,pat:p.pat?.length,y:p.y,vy:p.vy,bubbleT:p.bubbleT,landedCount:p.landedCount,totalBalls:p.totalBalls,entryBalls:p.entryBalls?.length,splitTriggered:!!p._hexSplitTriggered}));
 const balls=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;const v=g.vis.get(b.id);balls.push({id:b.id,logical:[x,y],visual:v?[v.x,v.y]:null,path:b.fallPath?.map(s=>({from:s.from,to:s.to,kind:s.kind,pileFlow:s.pileFlow,start:s.pileFlowStart,end:s.pileFlowEnd}))||[]});}
 const p=g.activeGarbagePacks?.find(q=>!q.landed&&q.pat?.length);
 const remaining=p?p.pat.map(([dx,dy],i)=>{const cy=hexGarbageBallContactY(g,p,i),x=p.ax+dx,visualY=cy+dy,cell=hexGarbageSingleLogicalCell(g,x,visualY);const column=[];for(let y=BOARD_MIN_ROW;y<ROWS;y++)if(valid(x,y)){const b=g.board[y][x];if(b)column.push({y,id:b.id,garbage:!!b.isGarbage});}return{slot:[dx,dy],x,cy,visualY,cell,column,contactSafe:cell?visualPointSafe(g,-1,cell.x,visualY,HEX_MIN_DIST):false,centerSafe:cell?visualPointSafe(g,-1,cell.x,cell.y,HEX_MIN_DIST):false,nearestContact:nearestVisual(g,x,visualY),nearestCenter:cell?nearestVisual(g,cell.x,cell.y):null};}):[];
 return{state:g.state,phase:g.phase,stateT:g.stateT,garbageClock:g.garbageClock,batchDone:garbageBatchDone(g),visualDone:garbageVisualsDone(g),pending:pendingFallPathCount(g),legal:hasLegalGravityMove(g.board),packs,remaining,balls,perf:g._hexGarbagePerf};
}

// Regression for the visual bug reported in production: a gridified garbage
// member above the real pile must not make the still-airborne packet split.
// Only after the packet first reaches a normal accumulated ball/floor may that
// gridified member become a support for later siblings.
{
 const tg=createEngine(910220);
 const earlyGarbage=put(tg,2,3,800000,1);earlyGarbage.isGarbage=true;
 put(tg,0,7,800001,2);
 const probe={pat:[[1,0]],colors:[0],ax:0,type:"PYRAMID",seq:0,totalBalls:1,landedCount:0,entryBalls:[],vy:0,bubbleT:1,landed:false};
 tg._hexGarbageObstacleFrame=null;
 const before=hexGarbageBallContactY(tg,probe,0);
 expect(Math.abs(before-6)<1e-7,"garbage split gate: airborne packet reacted to garbage before pile contact: "+before);
 probe._hexSplitTriggered=true;
 const after=hexGarbageBallContactY(tg,probe,0);
 expect(Math.abs(after-2)<1e-7,"garbage split gate: gridified garbage did not become support after pile contact: "+after);

 const tg2=createEngine(910219);
 const earlyGarbage2=put(tg2,2,3,800010,1);earlyGarbage2.isGarbage=true;
 put(tg2,0,7,800011,2);
 const pack={pat:[[1,0]],colors:[0],ax:0,type:"PYRAMID",seq:0,totalBalls:1,landedCount:0,entryBalls:[],vy:0,bubbleT:1,landed:false};
 tg2._hexGarbageObstacleFrame=null;
 const pre=materializeGarbageContactsThrough(tg2,pack,5.99);
 expect(pre===0&&!pack._hexSplitTriggered&&pack.pat.length===1,"garbage split gate: packet split before touching accumulated pile");
 const at=materializeGarbageContactsThrough(tg2,pack,6.0);
 expect(pack._hexSplitTriggered,"garbage split gate: first real pile contact did not release packet rigidity");
 expect(at===1&&pack.pat.length===0,"garbage split gate: contacted member did not materialize at the split trigger");
}

const g=createEngine(910221);
let id=700000;
for(let y=ROWS-2;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y))put(g,x,y,id++,(x+y)%COLORS.length);
g.state="RESOLVING";g.phase="GARBAGE";g.stateT=0;g.garbDone=true;g.garbShapes=["STRAIGHT"];

let maxObstacleBuilds=0,maxFrameResolves=0,maxDeferred=0,minDist=Infinity;
let sawGarbage=false,sawSplitTrigger=false;
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
  for(const p of g.activeGarbagePacks||[])if(p._hexSplitTriggered)sawSplitTrigger=true;
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage){sawGarbage=true;expect(!b.rigid&&!b.motionGroupId,"garbage performance: optimized contact restored garbage rigidity");}}
  if(sawGarbage&&g.phase!=="GARBAGE")break;
}

const perf=g._hexGarbagePerf||{};
expect(sawGarbage,"garbage performance: STRAIGHT packet never materialized");
expect(sawSplitTrigger,"garbage split gate: STRAIGHT never transitioned from rigid flight to pile contact");
expect(maxObstacleBuilds===1,"garbage performance: obstacle cache was never exercised");
expect((perf.contactCacheHits||0)>0,"garbage performance: per-packet contact cache was never reused");
expect(maxDeferred>=2,"garbage performance: simultaneous contact did not exercise deferred solver batching");
expect(maxFrameResolves===1,"garbage performance: deferred solves were not collapsed to one final solve");
expect((perf.deferredResolves||0)>(perf.frameResolves||0),"garbage performance: nested contact solves were not reduced");
if(g.phase==="GARBAGE")console.log("GARBAGE_STALL_DIAGNOSTIC",JSON.stringify(diagnose(g)));
expect(g.phase!=="GARBAGE","garbage performance: optimized STRAIGHT packet failed to finish");
expect(minDist>=0.999999-1e-7,"garbage performance: optimized packet introduced visible overlap: "+minDist);
console.log("garbage performance regressions PASS",JSON.stringify({maxObstacleBuilds,maxFrameResolves,maxDeferred,minDist,perf}));
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
