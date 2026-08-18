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
function nearby(g,q){
 return entries(g).filter(z=>z.b.id!==q.b.id).map(z=>({
  id:z.b.id,garbage:!!z.b.isGarbage,frozen:!!z.b.garbagePhaseFrozen,
  cell:[z.x,z.y],visual:[z.v.x,z.v.y],d:phys([q.v.x,q.v.y],[z.v.x,z.v.y]),
  path:Array.isArray(z.b.fallPath)&&z.b.fallPath.length?z.b.fallPath.slice(0,2).map(s=>({from:s.from,to:s.to,kind:s.kind,pivot:s.pivot,topPivot:s.topPivot})):[]
 })).filter(z=>z.d<1.35).sort((a,b)=>a.d-b.d).slice(0,6);
}
expect(window.__hexGarbageNoChainFreeze===true,"chain-free garbage settle layer missing");
expect(window.__hexGarbageMovingPeersAreSimultaneous===true,"simultaneous moving-garbage layer missing");
const reports=[];
for(let type=1;type<=4;type++){
 const g=createEngine(72000+type);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;terrain(g,type);
 g.garbShapes=["PYRAMID","HEXAGON","PYRAMID"];g.garbLeft=0;
 const original=new Map(entries(g).map(q=>[q.b.id,{x:q.x,y:q.y,vx:q.v.x,vy:q.v.y}]));
 prepareGarbageBatch(g);
 const last=new Map(),stall=new Map();let done=-1,minDistance=Infinity,maxStall=0,spawned=0;
 for(let frame=0;frame<3200;frame++){
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);updateGarbagePacks(g,PHYSICS_FRAME);
  for(const [id,o] of original){const q=entries(g).find(z=>z.b.id===id);expect(q,"original pile disappeared "+id);expect(q.x===o.x&&q.y===o.y,"original pile logical move during attack");expect(Math.abs(q.v.x-o.vx)<1e-8&&Math.abs(q.v.y-o.vy)<1e-8,"original pile visual move during attack");expect(q.b.garbagePhaseFrozen===true,"original pile lost freeze during attack");}
  const gs=entries(g).filter(q=>q.b.isGarbage&&!original.has(q.b.id));spawned=Math.max(spawned,gs.length);
  for(const q of gs){
   expect(!q.b.garbagePhaseFrozen,"current-batch garbage was promoted into frozen snapshot: "+q.b.id);
   const prev=last.get(q.b.id),now=[q.v.x,q.v.y],d=prev?phys(prev,now):Infinity;
   const path=Array.isArray(q.b.fallPath)&&q.b.fallPath.length>0;
   const p=path?null:hexPhysNaturalMotion(g.board,q.x,q.y);
   const shouldProgress=path||!!(p&&p.ty>p.y);
   let s=stall.get(q.b.id)||0;
   if(shouldProgress&&prev&&d<1e-6)s++;else s=0;
   stall.set(q.b.id,s);maxStall=Math.max(maxStall,s);
   expect(s<72,"garbage chain froze despite remaining gravity: "+JSON.stringify({type,frame,id:q.b.id,cell:[q.x,q.y],visual:now,path:q.b.fallPath||[],proposal:p&&{to:[p.tx,p.ty],kind:p.kind,pivot:p.pivot,topPivot:p.topPivot},nearby:nearby(g,q)}));
   last.set(q.b.id,now);
  }
  for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){const d=phys([gs[i].v.x,gs[i].v.y],[gs[j].v.x,gs[j].v.y]);minDistance=Math.min(minDistance,d);expect(d>=HEX_MIN_DIST-9e-4,"garbage overlap in chain settle stress: "+JSON.stringify({type,frame,d,a:gs[i].b.id,b:gs[j].b.id}));}
  if(garbageBatchDone(g)){done=frame;break;}
 }
 expect(done>=0,"garbage batch never completed on terrain "+type);
 expect(spawned>=12,"too few garbage balls spawned on terrain "+type+": "+spawned);
 for(const q of entries(g).filter(z=>z.b.isGarbage&&!original.has(z.b.id))){
  expect(!(Array.isArray(q.b.fallPath)&&q.b.fallPath.length),"finished garbage retained fallPath: "+q.b.id);
  const p=hexPhysNaturalMotion(g.board,q.x,q.y);
  expect(!p||p.ty<=p.y,"finished garbage still had downward space: "+JSON.stringify({type,id:q.b.id,cell:[q.x,q.y],to:p&&[p.tx,p.ty],kind:p&&p.kind}));
 }
 reports.push({type,done,spawned,maxStall,minDistance});
}
console.log("garbage chain-free dense settle PASS",JSON.stringify(reports));
`;
vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});