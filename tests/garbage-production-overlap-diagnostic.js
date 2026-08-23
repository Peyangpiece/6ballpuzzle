const fs=require("fs");
const vm=require("vm");
const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const files=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js",
  "app-clear-vacancy-priority.js","app-release-parity-settle.js","app-08.js","app-09.js",
  "app-10.js","app-14.js","app-clear-all-ball-fx.js","app-gameover-garbage-fade.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js","app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js",
  "app-garbage-render-overlap-guard.js","app-runtime-performance.js","app-physics-safety-invariants.js",
  "app-mass-motion-safety.js","app-gravity-priority-v1.js","app-garbage-performance-v1.js",
  "app-post-clear-two-stage-v1.js","app-simultaneous-collapse-v1.js","app-garbage-continuous-v1.js",
  "app-contact-separation-v1.js","app-garbage-temporal-safety-v2.js","app-floor-bridge-collapse-v1.js","app-lattice-finalize-v2.js",
  "app-coherent-collapse-v1.js","app-wall-boundary-authoritative-v1.js",
  "app-slope-upconvex-authoritative-v3.js","app-intentional-hexagon-stability-v1.js",
  "app-rigidity-resolver-authoritative-v3.js","app-upconvex-contact-priority-v1.js",
  "app-upconvex-pocket-capture-v1.js","app-upconvex-rigid-until-contact-v1.js",
  "app-collapse-timing-authoritative-v2.js","app-runtime-performance-v3.js",
  "app-garbage-freeze-authoritative-v1.js","app-garbage-min-displacement-crossing-v1.js"
];
const runtime=files.map(read).join("\n");
const checks=String.raw`
function put(g,x,y,c=0){if(!valid(x,y)||g.board[y][x])return null;const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
function entries(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,x,y,v});}return a;}
function dist(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*HEX_ROW_H);}
function segSummary(seg){if(!seg)return null;return{from:seg.from,to:seg.to,kind:seg.kind,pivot:seg.pivot,topPivot:seg.topPivot,followSupportIds:seg.followSupportIds,movingSupportId:seg.movingSupportId,start:seg.pileFlowStart,end:seg.pileFlowEnd,duration:seg.pileFlowDuration,seq:seg.motionSeq,originalSeq:seg.pileFlowOriginalSeq,temporalSeparated:!!seg.pileFlowTemporalSeparated,waveDelay:seg.pileFlowWaveDelay,safeV2:!!seg.__garbageTemporalSafeV2,deferredV2:!!seg.__garbageTemporalDeferredV2,continuous:!!seg.__garbageContinuous};}
function ballSummary(q){return{id:q.b.id,isGarbage:!!q.b.isGarbage,type:q.b.garbageType||null,sourceSeq:q.b.garbageSourceSeq,sourceRole:q.b.garbageSourceRole,splitReleased:!!q.b.garbageSplitReleased,frozen:!!q.b.garbagePhaseFrozen,cell:[q.x,q.y],vis:[q.v.x,q.v.y],vy:q.v.vy,speed:q.v.motionSpeed,pileFlow:!!q.v.pileFlow,pathLen:Array.isArray(q.b.fallPath)?q.b.fallPath.length:0,path:(q.b.fallPath||[]).slice(0,5).map(segSummary)};}
function worst(g,originalIds){
 const all=entries(g),incoming=new Set(all.filter(q=>q.b.isGarbage&&!originalIds.has(q.b.id)).map(q=>q.b.id));let best=null;
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
   if(!incoming.has(all[i].b.id)&&!incoming.has(all[j].b.id))continue;
   const d=dist(all[i],all[j]);if(!best||d<best.d)best={d,a:all[i],b:all[j]};
 }
 return best;
}
function neighborhood(g,originalIds,best){
 const all=entries(g),ids=new Set([best.a.b.id,best.b.b.id]),out=[];
 for(const q of all){
   const da=dist(q,best.a),db=dist(q,best.b);
   if(!ids.has(q.b.id)&&Math.min(da,db)>2.25)continue;
   out.push({
     ...ballSummary(q),
     original:originalIds.has(q.b.id),
     liveGarbage:!!q.b.isGarbage&&!q.b.garbagePhaseFrozen&&Array.isArray(q.b.fallPath)&&q.b.fallPath.length>0,
     da:Number(da.toFixed(6)),db:Number(db.toFixed(6))
   });
 }
 return out.sort((a,b)=>Math.min(a.da,a.db)-Math.min(b.da,b.db));
}
function liveAll(g,originalIds){
 return entries(g).filter(q=>q.b.isGarbage&&!originalIds.has(q.b.id)&&!q.b.garbagePhaseFrozen&&Array.isArray(q.b.fallPath)&&q.b.fallPath.length>0).map(q=>({id:q.b.id,type:q.b.garbageType||null,sourceSeq:q.b.garbageSourceSeq,sourceRole:q.b.garbageSourceRole,cell:[q.x,q.y],vis:[q.v.x,q.v.y],pathLen:q.b.fallPath.length})).sort((a,b)=>a.vis[1]-b.vis[1]||a.vis[0]-b.vis[0]||a.id-b.id);
}
function report(g,originalIds,frame,stage,best){
 if(!best||best.d>=0.9995)return null;
 const q={
   frame,stage,d:best.d,pileClock:g.pileFlowClock,garbageClock:g.garbageClock,
   pending:pendingFallPathCount(g),moving:[...(g._visualMovingIds||[])],
   temporalSafetyV2:window.__sixBallLastGarbageTemporalSafetyV2||null,
   deferredRetryV2:window.__sixBallLastGarbageTemporalDeferredRetryV2||null,
   temporalSchedule:window.__sixBallLastGarbageTemporalScheduleV1||null,
   presentationSchedule:window.__sixBallLastGarbagePresentationSchedule||null,
   continuousSchedule:window.__sixBallLastGarbageSchedule||null,
   activePath:window.__sixBallLastGarbageActivePathReservationV1||null,
   constraintSolve:window.__sixBallLastGarbageConstraintSolve||null,
   minDisplacement:window.__sixBallLastGarbageMinDisplacementRepair||null,
   segmentRepairs:window.__sixBallGarbageSegmentEndRepairs||0,
   constraintCorrections:window.__sixBallGarbageConstraintCorrections||0,
   a:ballSummary(best.a),b:ballSummary(best.b),nearby:neighborhood(g,originalIds,best),liveAll:liveAll(g,originalIds)
 };
 console.log("GARBAGE_OVERLAP_DIAGNOSTIC "+JSON.stringify(q));return q;
}
const g=createEngine(91100);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;
for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,x%5);
put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,5,ROWS-4,3);
const originalIds=new Set(entries(g).map(q=>q.b.id));
g.garbShapes=["PYRAMID","HEXAGON","STRAIGHT"];g.garbLeft=0;prepareGarbageBatch(g);
let firstTransient=null;
for(let frame=0;frame<500;frame++){
  updateVisuals(g,PHYSICS_FRAME);
  const u=worst(g,originalIds);if(!firstTransient&&u&&u.d<0.9995)firstTransient=report(g,originalIds,frame,"after-updateVisuals-transient",u);

  resolveVisualContacts(g);
  const r=worst(g,originalIds);if(r&&r.d<0.9995){report(g,originalIds,frame,"after-resolveVisualContacts",r);throw new Error("garbage overlap survived contact resolution at frame "+frame+" d="+r.d);}

  updateGarbagePacks(g,PHYSICS_FRAME);
  const p=worst(g,originalIds);if(p&&p.d<0.9995){report(g,originalIds,frame,"after-updateGarbagePacks",p);throw new Error("garbage overlap introduced after pack update at frame "+frame+" d="+p.d);}
  if(garbageBatchDone(g))break;
}
console.log("garbage production overlap diagnostic PASS "+JSON.stringify({firstTransient:firstTransient&&{frame:firstTransient.frame,d:firstTransient.d,a:firstTransient.a.id,b:firstTransient.b.id},temporalSafetyV2:window.__sixBallLastGarbageTemporalSafetyV2||null,deferredRetryV2:window.__sixBallLastGarbageTemporalDeferredRetryV2||null}));
`;
const context={React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}};
vm.runInNewContext(runtime+checks,context,{timeout:180000});
