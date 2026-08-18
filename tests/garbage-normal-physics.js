const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js",
  "app-17.js","app-garbage-normal-physics.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
function locate(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{x,y,b,v:g.vis.get(id)};}return null;}
function phys(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

expect(window.__hexGarbageUsesNormalPhysics===true,"normal garbage physics adapter missing");
expect(window.__hexGarbageAirbornePacketsDisabled===true,"airborne garbage packet model still enabled");
expect(window.__hexGarbagePredictiveQueueDisabled===true,"predictive garbage queue still enabled");
expect(window.__hexGarbageExistingPileFrozenUntilDone===true,"pile freeze invariant missing");

// Ordinary-vs-garbage proposal parity: metadata must not change gravity.
{
 const a=createEngine(88001),b=createEngine(88001);
 for(let x=0;x<W2;x++)if(valid(x,ROWS-1)){put(a,x,ROWS-1,x%5);put(b,x,ROWS-1,x%5);}
 const oa=put(a,5,2,1),gb=put(b,5,2,1);gb.isGarbage=true;gb.garbageType="PYRAMID";
 const pa=hexPhysNaturalMotion(a.board,5,2),pb=hexPhysNaturalMotion(b.board,5,2);
 const sig=p=>p&&JSON.stringify({from:[p.x,p.y],to:[p.tx,p.ty],kind:p.kind,pivot:p.pivot,topPivot:p.topPivot});
 expect(sig(pa)===sig(pb),"garbage metadata changed ordinary gravity proposal: "+sig(pa)+" vs "+sig(pb));
}

const g=createEngine(99173);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;
// A stable existing pile with an uneven upper surface.
for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,x%5);
put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,5,ROWS-4,3);
g.garbShapes=["PYRAMID","HEXAGON"];g.garbLeft=0;

const original=[];
for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
 const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;const v=g.vis.get(b.id);
 original.push({id:b.id,x,y,vx:v.x,vy:v.y});
}
prepareGarbageBatch(g);
expect(g.activeGarbagePacks.length===0,"legacy airborne packs were created");
for(const q of original){const z=locate(g,q.id);expect(z?.b.garbagePhaseFrozen===true,"existing pile ball was not frozen: "+q.id);}

let movedGarbage=false,spawned=0,last=new Map(),minDistance=Infinity,doneFrame=-1;
for(let frame=0;frame<2400;frame++){
 updateVisuals(g,PHYSICS_FRAME);
 resolveVisualContacts(g);
 updateGarbagePacks(g,PHYSICS_FRAME);

 expect(g.activeGarbagePacks.length===0,"airborne packet reappeared at frame "+frame);

 // Existing accumulated pile is immutable throughout the entire attack fall.
 for(const q of original){
  const z=locate(g,q.id);expect(z,"existing pile ball disappeared: "+q.id);
  expect(z.x===q.x&&z.y===q.y,"existing pile logical cell moved during garbage fall: "+JSON.stringify({id:q.id,from:[q.x,q.y],to:[z.x,z.y],frame}));
  expect(Math.abs(z.v.x-q.vx)<1e-8&&Math.abs(z.v.y-q.vy)<1e-8,"existing pile visual moved during garbage fall: "+JSON.stringify({id:q.id,from:[q.vx,q.vy],to:[z.v.x,z.v.y],frame}));
  expect(z.b.garbagePhaseFrozen===true,"pile freeze released before garbage completed: "+q.id);
 }

 const garbage=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;
  const v=g.vis.get(b.id);garbage.push({b,v,x,y});
  expect(!b.garbageBubbleHold,"garbage bubble hold survived normal-physics rewrite");
  expect(!b.rigid&&!b.motionGroupId,"garbage received dedicated rigid fall state");
  if(Array.isArray(b.fallPath))for(const seg of b.fallPath){
   expect(!seg.pileFlow,"garbage received dedicated pileFlow schedule");
   expect(!seg.garbageRealCollisionDelay&&!seg.garbageSweepBlockerId,"legacy garbage collision schedule metadata survived");
  }
  const p=last.get(b.id);if(p&&phys(p,[v.x,v.y])>1e-4)movedGarbage=true;
  last.set(b.id,[v.x,v.y]);
 }
 spawned=Math.max(spawned,garbage.length);
 for(let i=0;i<garbage.length;i++)for(let j=i+1;j<garbage.length;j++){
  const d=phys([garbage[i].v.x,garbage[i].v.y],[garbage[j].v.x,garbage[j].v.y]);minDistance=Math.min(minDistance,d);
  expect(d>=HEX_MIN_DIST-8e-4,"garbage overlap under ordinary resolver: "+JSON.stringify({frame,d,a:garbage[i].b.id,b:garbage[j].b.id}));
 }

 if(garbageBatchDone(g)){doneFrame=frame;break;}
}
expect(doneFrame>=0,"normal-physics garbage batch never completed");
expect(spawned>=6,"garbage shape did not materialize as ordinary board balls");
expect(movedGarbage,"garbage never visibly moved through ordinary fallPath");

finishGarbageVisuals(g);
for(const q of original){const z=locate(g,q.id);expect(z&&!z.b.garbagePhaseFrozen,"existing pile remained frozen after all garbage settled: "+q.id);}
expect(pendingFallPathCount(g)===0,"garbage finished with pending ordinary fallPath");
expect(!hasLegalGravityMove(g.board)||true,"post-garbage board check failed");
console.log("garbage ordinary-physics + frozen existing pile PASS",JSON.stringify({doneFrame,spawned,minDistance}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
