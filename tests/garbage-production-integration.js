const fs=require("fs");
const vm=require("vm");

const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");

// Physics/runtime order mirrors public/index.html for every layer that can affect
// garbage motion, collision, settling, rigidity, or finalization. UI/audio/net
// layers are intentionally omitted because they do not participate in board
// physics and make the headless VM unnecessarily brittle.
const runtimeNames=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js",
  "app-clear-vacancy-priority.js","app-release-parity-settle.js","app-08.js","app-09.js",
  "app-10.js","app-14.js","app-clear-all-ball-fx.js","app-gameover-garbage-fade.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js","app-garbage-deep-settle.js",
  "app-garbage-simultaneous-motion.js","app-garbage-render-overlap-guard.js",
  "app-runtime-performance.js","app-physics-safety-invariants.js","app-mass-motion-safety.js",
  "app-gravity-priority-v1.js","app-garbage-performance-v1.js",
  "app-post-clear-two-stage-v1.js","app-simultaneous-collapse-v1.js",
  "app-garbage-continuous-v1.js","app-contact-separation-v1.js",
  "app-floor-bridge-collapse-v1.js","app-lattice-finalize-v2.js",
  "app-coherent-collapse-v1.js","app-wall-boundary-authoritative-v1.js",
  "app-slope-upconvex-authoritative-v3.js","app-intentional-hexagon-stability-v1.js",
  "app-rigidity-resolver-authoritative-v3.js","app-upconvex-contact-priority-v1.js",
  "app-upconvex-pocket-capture-v1.js","app-upconvex-rigid-until-contact-v1.js",
  "app-collapse-timing-authoritative-v2.js","app-runtime-performance-v3.js"
];

for(const name of runtimeNames){
  if(!fs.existsSync(`${__dirname}/../public/${name}`))throw new Error(`missing production runtime file: ${name}`);
}
const runtime=runtimeNames.map(read).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){
  if(!valid(x,y)||g.board[y][x])return null;
  const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;
}
function entries(g){
  const out=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);
    if(b)out.push({b,x,y,v});
  }
  return out;
}
function phys(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
function floor(g){for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,x%5);}
function terrain(g,type){
  floor(g);
  if(type===1){put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,5,ROWS-4,3);}
  if(type===2){put(g,1,ROWS-2,1);put(g,3,ROWS-2,2);put(g,5,ROWS-2,3);put(g,3,ROWS-4,4);put(g,7,ROWS-2,0);}
  if(type===3){put(g,11,ROWS-2,1);put(g,9,ROWS-2,2);put(g,7,ROWS-2,3);put(g,9,ROWS-4,4);put(g,5,ROWS-2,0);}
  if(type===4){put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,11,ROWS-2,3);put(g,5,ROWS-4,4);put(g,9,ROWS-4,0);}
  if(type===5){put(g,1,ROWS-2,1);put(g,11,ROWS-2,2);put(g,3,ROWS-4,3);put(g,9,ROWS-4,4);put(g,5,ROWS-6,0);put(g,7,ROWS-6,1);}
  if(type===6){put(g,1,ROWS-2,1);put(g,3,ROWS-2,2);put(g,9,ROWS-2,3);put(g,11,ROWS-2,4);put(g,5,ROWS-4,0);put(g,7,ROWS-4,1);}
}
function duplicateRefs(g){
  const seenObj=new Map(),seenId=new Map(),dups=[];
  for(const q of entries(g)){
    if(seenObj.has(q.b))dups.push({kind:"object",id:q.b.id,a:seenObj.get(q.b),b:[q.x,q.y]});
    else seenObj.set(q.b,[q.x,q.y]);
    const key=String(q.b.id);
    if(seenId.has(key)&&seenId.get(key).ball!==q.b)dups.push({kind:"id",id:key,a:seenId.get(key).cell,b:[q.x,q.y]});
    else if(!seenId.has(key))seenId.set(key,{ball:q.b,cell:[q.x,q.y]});
  }
  return dups;
}
function currentGarbage(g,originalIds){return entries(g).filter(q=>q.b.isGarbage&&!originalIds.has(q.b.id));}
function assertFiniteVisuals(g,label){
  for(const q of entries(g))if(q.v){
    expect(Number.isFinite(q.v.x)&&Number.isFinite(q.v.y),label+": non-finite visual "+q.b.id);
  }
}
function minDistanceAgainstBoard(g,originalIds){
  const all=entries(g).filter(q=>q.v),incoming=currentGarbage(g,originalIds).filter(q=>q.v);
  let min=Infinity,pair=null;
  const incomingIds=new Set(incoming.map(q=>q.b.id));
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    if(!incomingIds.has(all[i].b.id)&&!incomingIds.has(all[j].b.id))continue;
    const d=phys([all[i].v.x,all[i].v.y],[all[j].v.x,all[j].v.y]);
    if(d<min){min=d;pair=[all[i].b.id,all[j].b.id];}
  }
  return{min,pair};
}

expect(window.__hexGarbageUsesNormalPhysics===true,"normal garbage physics adapter missing");
expect(window.__hexGarbageUnitLocalTimeline===true,"unit-local garbage timeline missing");
expect(window.__hexGarbageNoChainFreeze===true,"deep-settle layer missing");
expect(window.__sixBallGarbageContinuousV1===true,"continuous garbage layer missing");
expect(window.__sixBallGarbageCollisionReservationV1===true,"garbage collision reservation missing");

const shapes=["PYRAMID","HEXAGON","STRAIGHT"];
const reports=[];
for(let type=1;type<=6;type++)for(let variant=0;variant<3;variant++){
  const seed=91000+type*100+variant;
  const g=createEngine(seed);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;terrain(g,type);
  const original=entries(g).map(q=>({id:q.b.id,x:q.x,y:q.y,vx:q.v?.x,vy:q.v?.y}));
  const originalIds=new Set(original.map(q=>q.id));
  g.garbShapes=[shapes[variant],shapes[(variant+1)%3],shapes[(variant+2)%3]];g.garbLeft=0;
  prepareGarbageBatch(g);

  let done=-1,minDistance=Infinity,minPair=null,maxPending=0,maxMoving=0;
  for(let frame=0;frame<4800;frame++){
    updateVisuals(g,PHYSICS_FRAME);
    resolveVisualContacts(g);
    updateGarbagePacks(g,PHYSICS_FRAME);

    assertFiniteVisuals(g,"terrain "+type+" variant "+variant+" frame "+frame);
    const dups=duplicateRefs(g);
    expect(dups.length===0,"duplicate logical ball reference: "+JSON.stringify({type,variant,frame,dups:dups.slice(0,4)}));

    for(const o of original){
      const q=entries(g).find(z=>z.b.id===o.id);
      expect(q,"original pile ball disappeared: "+o.id);
      expect(q.x===o.x&&q.y===o.y,"original pile logical cell moved during GARBAGE: "+JSON.stringify({type,variant,frame,id:o.id,from:[o.x,o.y],to:[q.x,q.y]}));
      if(q.v&&Number.isFinite(o.vx)&&Number.isFinite(o.vy)){
        expect(Math.abs(q.v.x-o.vx)<1e-7&&Math.abs(q.v.y-o.vy)<1e-7,"original pile visual moved during GARBAGE: "+JSON.stringify({type,variant,frame,id:o.id}));
      }
    }

    const md=minDistanceAgainstBoard(g,originalIds);
    if(md.min<minDistance){minDistance=md.min;minPair=md.pair;}
    // Production invariant: no visually meaningful penetration. 0.9995 leaves
    // only sub-pixel floating tolerance while rejecting the previously observed
    // 0.996-class chain-settle overlap.
    expect(!Number.isFinite(md.min)||md.min>=0.9995,"production garbage overlap: "+JSON.stringify({type,variant,frame,d:md.min,pair:md.pair}));

    const incoming=currentGarbage(g,originalIds);
    maxPending=Math.max(maxPending,pendingFallPathCount(g));
    maxMoving=Math.max(maxMoving,incoming.filter(q=>Array.isArray(q.b.fallPath)&&q.b.fallPath.length).length);

    if(garbageBatchDone(g)){done=frame;break;}
  }

  expect(done>=0,"production garbage batch did not converge: "+JSON.stringify({type,variant,maxPending,maxMoving}));
  expect(pendingFallPathCount(g)===0,"production garbage finished with pending fallPath");
  const incoming=currentGarbage(g,originalIds);
  for(const q of incoming){
    const p=hexPhysNaturalMotion(g.board,q.x,q.y);
    expect(!(p&&p.ty>p.y&&!hexPhysPathHitsStationary(p,g.board,new Set([q.b.id]))),"finished garbage retained safe downward motion: "+JSON.stringify({type,variant,id:q.b.id,cell:[q.x,q.y],to:p&&[p.tx,p.ty],kind:p&&p.kind}));
  }

  reports.push({type,variant,done,balls:incoming.length,minDistance,minPair,maxPending,maxMoving});
}

globalThis.__garbageProductionReports=reports;
`;

const context={
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
};

vm.runInNewContext(runtime+checks,context,{timeout:180000});
const reports=context.__garbageProductionReports||[];
if(reports.length!==18)throw new Error(`expected 18 production garbage scenarios, got ${reports.length}`);
const min=Math.min(...reports.map(r=>r.minDistance).filter(Number.isFinite));
const maxDone=Math.max(...reports.map(r=>r.done));
console.log(`garbage production integration ${reports.length}/18 PASS`,JSON.stringify({minDistance:min,maxDone,reports}));
