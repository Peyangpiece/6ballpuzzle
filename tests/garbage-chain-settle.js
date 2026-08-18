const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js","app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){if(!valid(x,y)||g.board[y][x])return null;const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
function entries(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)a.push({b,x,y,v:g.vis.get(b.id)});}return a;}
function phys(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
function floor(g){for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,x%5);}
function terrain(g,type){
 floor(g);
 if(type===1){put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,5,ROWS-4,3);}
 if(type===2){put(g,1,ROWS-2,1);put(g,3,ROWS-2,2);put(g,5,ROWS-2,3);put(g,3,ROWS-4,4);put(g,7,ROWS-2,0);}
 if(type===3){put(g,11,ROWS-2,1);put(g,9,ROWS-2,2);put(g,7,ROWS-2,3);put(g,9,ROWS-4,4);put(g,5,ROWS-2,0);}
 if(type===4){put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,11,ROWS-2,3);put(g,5,ROWS-4,4);put(g,9,ROWS-4,0);}
}
function stateOf(gs){const m=new Map();for(const q of gs)m.set(q.b.id,{cell:[q.x,q.y],visual:[q.v.x,q.v.y],path:Array.isArray(q.b.fallPath)?q.b.fallPath.length:0});return m;}
function changed(prev,now){if(!prev)return true;if(prev.size!==now.size)return true;for(const[id,n]of now){const p=prev.get(id);if(!p)return true;if(p.cell[0]!==n.cell[0]||p.cell[1]!==n.cell[1]||p.path!==n.path||phys(p.visual,n.visual)>1e-6)return true;}return false;}
function rawDown(g,q){if(Array.isArray(q.b.fallPath)&&q.b.fallPath.length)return null;const p=hexPhysNaturalMotion(g.board,q.x,q.y);return p&&p.ty>p.y?p:null;}
function safeRawDown(g,q){const p=rawDown(g,q);if(!p)return null;return hexPhysPathHitsStationary(p,g.board,new Set([q.b.id]))?null:p;}
function pathBlockers(g,p){
 if(!p)return[];const pv=p.topPivot||p.pivot,out=[];
 for(const q of entries(g)){
  if(q.b.id===p.ball.id)continue;
  if(pv&&pv[0]===q.x&&pv[1]===q.y&&!p.virtualPivot)continue;
  let min=Infinity,minT=0;
  for(let i=1;i<=96;i++){const t=i/96,pt=proposalPointAt(p,t),qp=normPoint(q.x,q.y),d=Math.hypot(pt[0]-qp[0],pt[1]-qp[1]);if(d<min){min=d;minT=t;}}
  if(min<1.02)out.push({id:q.b.id,garbage:!!q.b.isGarbage,frozen:!!q.b.garbagePhaseFrozen,cell:[q.x,q.y],min,minT});
 }
 return out.sort((a,b)=>a.min-b.min);
}
expect(window.__hexGarbageNoChainFreeze===true,"chain-free garbage settle layer missing");
expect(window.__hexGarbageMovingPeersAreSimultaneous===true,"garbage contact layer missing");
expect(window.__hexGarbageCanonicalPositionRollbackDisabled===true,"obsolete canonical-position rollback is still active");
expect(window.__hexGarbageUnitLocalTimeline===true,"unit-local ordinary timeline missing");
expect(window.__hexGarbageDeepSettleUsesCanonicalEventResolver===true,"canonical deep settle resolver missing");
expect(window.__hexGarbageRawFallbackAfterFailedFollow===true,"failed FOLLOW_SUPPORT raw-gravity fallback missing");
const reports=[];
for(let type=1;type<=4;type++){
 const g=createEngine(72000+type);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;terrain(g,type);
 g.garbShapes=["PYRAMID","HEXAGON","PYRAMID"];g.garbLeft=0;
 const original=new Map(entries(g).map(q=>[q.b.id,{x:q.x,y:q.y,vx:q.v.x,vy:q.v.y}]));prepareGarbageBatch(g);
 let prevState=null,globalStall=0,maxGlobalStall=0,done=-1,minDistance=Infinity,spawned=0;
 for(let frame=0;frame<4000;frame++){
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);updateGarbagePacks(g,PHYSICS_FRAME);
  for(const[id,o]of original){const q=entries(g).find(z=>z.b.id===id);expect(q,"original pile disappeared "+id);expect(q.x===o.x&&q.y===o.y,"original pile logical move during attack");expect(Math.abs(q.v.x-o.vx)<1e-8&&Math.abs(q.v.y-o.vy)<1e-8,"original pile visual move during attack");expect(q.b.garbagePhaseFrozen===true,"original pile lost freeze during attack");}
  const gs=entries(g).filter(q=>q.b.isGarbage&&!original.has(q.b.id));spawned=Math.max(spawned,gs.length);for(const q of gs)expect(!q.b.garbagePhaseFrozen,"current-batch garbage was promoted into frozen snapshot: "+q.b.id);
  for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){const d=phys([gs[i].v.x,gs[i].v.y],[gs[j].v.x,gs[j].v.y]);minDistance=Math.min(minDistance,d);expect(d>=HEX_MIN_DIST-9e-4,"garbage overlap in chain settle stress: "+JSON.stringify({type,frame,d,a:gs[i].b.id,b:gs[j].b.id}));}

  const now=stateOf(gs),progress=changed(prevState,now);prevState=now;
  const hasPath=gs.some(q=>Array.isArray(q.b.fallPath)&&q.b.fallPath.length),safeRaw=gs.map(q=>({q,p:safeRawDown(g,q)})).filter(z=>z.p),accepted=window.__hexGarbageNextReadyGravityEvent(g,true)||[];
  const unfinished=hasPath||safeRaw.length>0||accepted.length>0||(g.garbagePlans||[]).some(p=>!p._started);
  if(unfinished&&!progress)globalStall++;else globalStall=0;maxGlobalStall=Math.max(maxGlobalStall,globalStall);
  expect(globalStall<72,"whole garbage system chain-froze with reachable gravity: "+JSON.stringify({type,frame,safeRaw:safeRaw.slice(0,8).map(z=>({id:z.q.b.id,cell:[z.q.x,z.q.y],to:[z.p.tx,z.p.ty],kind:z.p.kind,pivot:z.p.pivot,blockers:pathBlockers(g,z.p)})),accepted:(accepted||[]).map(p=>({id:p.ball?.id,from:[p.x,p.y],to:[p.tx,p.ty],kind:p.kind,follow:p.followSupportIds||[]})),active:gs.filter(q=>q.b.fallPath?.length).slice(0,8).map(q=>({id:q.b.id,cell:[q.x,q.y],visual:[q.v.x,q.v.y],seg:q.b.fallPath[0]}))}));
  if(garbageBatchDone(g)){done=frame;break;}
 }
 expect(done>=0,"garbage batch never completed on terrain "+type);expect(spawned>=12,"too few garbage balls spawned on terrain "+type+": "+spawned);
 const finalGarbage=entries(g).filter(z=>z.b.isGarbage&&!original.has(z.b.id));
 for(const q of finalGarbage){
  expect(!(Array.isArray(q.b.fallPath)&&q.b.fallPath.length),"finished garbage retained fallPath: "+q.b.id);
  const p=safeRawDown(g,q);
  expect(!p,"finished garbage retained a reachable downward/open-gap move: "+JSON.stringify({type,id:q.b.id,cell:[q.x,q.y],to:p&&[p.tx,p.ty],kind:p&&p.kind,pivot:p&&p.pivot,topPivot:p&&p.topPivot,blockers:p&&pathBlockers(g,p)}));
 }
 reports.push({type,done,spawned,maxGlobalStall,minDistance});
}
console.log("garbage chain-free dense settle PASS",JSON.stringify(reports));
`;
vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});