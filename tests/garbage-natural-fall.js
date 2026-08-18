const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-garbage-contact.js","app-garbage-rigidity.js","app-garbage-settle-state.js",
  "app-garbage-no-impact.js","app-garbage-sweep-guard.js","app-garbage-visible-overlap.js",
  "app-garbage-hard-separation.js","app-garbage-natural-fall.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
function boardGarbage(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;const v=g.vis.get(b.id);if(v)out.push({b,v,x,y});}return out;}
function physical(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
function densePile(g,variant){
 for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,(x+variant)%5);
 const extra=variant===0?[[3,ROWS-2],[7,ROWS-2],[5,ROWS-4]]:[[1,ROWS-2],[5,ROWS-2],[9,ROWS-2],[4,ROWS-3],[6,ROWS-3]];
 for(let i=0;i<extra.length;i++)put(g,extra[i][0],extra[i][1],(i+2)%5);
}
function actualPathCanAdvance(g,q){
 if(!Array.isArray(q.b.fallPath)||!q.b.fallPath.length)return false;
 if(window.__hexGarbageLocalConflictIds(g).has(q.b.id))return false;
 const seg=q.b.fallPath[0],now=Math.max(0,g.pileFlowClock||0),start=Number(seg?.pileFlowStart),end=Number(seg?.pileFlowEnd);
 if(!Array.isArray(seg?.to))return false;
 if(Number.isFinite(start)&&start>now+1e-7&&seg.garbageRealCollisionDelay)return false;
 let sampleT;
 if(Number.isFinite(start)&&Number.isFinite(end)){
   const base=Math.max(now,start),span=Math.max(1e-5,Math.min(PHYSICS_FRAME*.25,(end-base)*.15));
   sampleT=Math.min(end,base+span);
 }else sampleT=now+PHYSICS_FRAME*.25;
 const next=pileFlowPositionAt(g,q.b,sampleT);
 if(!Array.isArray(next)||!Number.isFinite(next[0])||!Number.isFinite(next[1]))return false;
 if(next[1]<q.v.y-1e-7)return false;
 if(physical([q.v.x,q.v.y],next)<1e-4)return Number.isFinite(start)&&start>now+1e-7&&!seg.garbageRealCollisionDelay;
 return visualPointSafe(g,q.b.id,next[0],next[1],HEX_MIN_DIST-1e-5);
}

expect(window.__hexNaturalGarbageFall===true,"natural garbage fall override missing");
expect(window.__hexGarbageLocalConflictQueue===true,"local garbage conflict queue missing");
expect(window.__hexGarbageGlobalQueueDisabled===true,"legacy visual queue still enabled");
expect(typeof window.__hexGarbageLocalConflictIds==="function","local conflict API missing");

let globalMaxStall=0,globalConcurrent=0,globalMin=Infinity,totalMovedFrames=0;
const caseStats=[];
for(const [variant,type] of [[0,"PYRAMID"],[1,"HEXAGON"],[1,"STRAIGHT"]]){
 const g=createEngine(120000+variant*31+type.length);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;
 densePile(g,variant);g.garbShapes=[type];prepareGarbageBatch(g);
 const prev=new Map(),stall=new Map();let maxConcurrent=0,maxStall=0,movedFrames=0;
 for(let frame=0;frame<240;frame++){
  updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);window.__hexRefreshGarbagePileState(g);
  const list=boardGarbage(g);let concurrent=0;
  for(const q of list){
   const p=prev.get(q.b.id),now=[q.v.x,q.v.y];
   if(p){
    expect(q.v.y>=p[1]-1e-7,"garbage moved upward: "+JSON.stringify({type,variant,frame,id:q.b.id,from:p,to:now}));
    const moved=physical(p,now);if(moved>0.001)concurrent++;
    if(actualPathCanAdvance(g,q)&&moved<1e-5){
      const n=(stall.get(q.b.id)||0)+1;stall.set(q.b.id,n);maxStall=Math.max(maxStall,n);
      expect(n<=6,"unsupported garbage froze in air: "+JSON.stringify({type,variant,frame,id:q.b.id,local:[...window.__hexGarbageLocalConflictIds(g)],visual:now,logical:[q.x,q.y],path:q.b.fallPath?.[0]}));
    }else stall.set(q.b.id,0);
   }
   prev.set(q.b.id,now);
  }
  if(concurrent>0)movedFrames++;
  maxConcurrent=Math.max(maxConcurrent,concurrent);
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
   const d=physical([list[i].v.x,list[i].v.y],[list[j].v.x,list[j].v.y]);globalMin=Math.min(globalMin,d);
   expect(d>=HEX_MIN_DIST-5e-4,"garbage overlap during natural fall: "+JSON.stringify({type,variant,frame,d,local:[...window.__hexGarbageLocalConflictIds(g)],a:list[i].b.id,b:list[j].b.id}));
  }
 }
 // Each fixture must actually animate and must contain no unsupported freeze.
 // Whether two balls can legally move on the SAME frame depends on support
 // geometry; forcing concurrency per fixture would manufacture non-reference
 // motion. Concurrency is required across the suite instead.
 expect(movedFrames>0,"garbage never moved in fixture: "+JSON.stringify({type,variant,maxConcurrent,maxStall}));
 caseStats.push({type,variant,maxConcurrent,maxStall,movedFrames});
 globalConcurrent=Math.max(globalConcurrent,maxConcurrent);globalMaxStall=Math.max(globalMaxStall,maxStall);totalMovedFrames+=movedFrames;
}
expect(globalConcurrent>=2,"no fixture demonstrated independent concurrent garbage fall: "+JSON.stringify(caseStats));
console.log("natural concurrent garbage fall PASS",JSON.stringify({maxConcurrent:globalConcurrent,maxUnsupportedStallFrames:globalMaxStall,minDistance:globalMin,totalMovedFrames,caseStats}));
`;

vm.runInNewContext(runtime+checks,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
