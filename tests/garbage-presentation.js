const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
expect(window.__hexGarbageSpawnEffectPreserved===true,"garbage spawn effect layer missing");
expect(Math.abs(window.__hexGarbageUnitInterval-.6)<1e-12,"garbage unit interval is not 0.600 s");
const g=createEngine(66119);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;g.garbShapes=["PYRAMID","PYRAMID"];g.garbLeft=0;
prepareGarbageBatch(g);
const starts=[];let firstIds=[];let firstMoved=false;let prevY=new Map();
for(let frame=0;frame<1600;frame++){
 updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);updateGarbagePacks(g,PHYSICS_FRAME);
 for(const p of g.garbagePlans){
  if(p._started&&!starts.some(q=>q.seq===p.seq)){
   starts.push({seq:p.seq,t:p.actualStartTime,ids:[...(p.ballIds||[])]});
   if(p.seq===0)firstIds=[...(p.ballIds||[])];
  }
 }
 if(firstIds.length){
  for(const id of firstIds){
   const v=g.vis.get(id);expect(v&&Number.isFinite(v.garbageBubbleT),"spawn effect age missing on PYRAMID ball "+id);
   let ball=null;for(let y=boardScanMin(g.board);y<ROWS&&!ball;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q?.id===id){ball=q;break;}}
   expect(ball&&!ball.garbageBubbleHold&&!ball.garbageSpawnHold,"spawn effect incorrectly freezes ordinary fall: "+id);
   const py=prevY.get(id);if(py!=null&&Math.abs(v.y-py)>1e-4)firstMoved=true;prevY.set(id,v.y);
  }
 }
 if(starts.length>=2&&firstMoved)break;
}
expect(starts.length===2,"two PYRAMID units did not start");
const delta=starts[1].t-starts[0].t;
expect(Math.abs(delta-.6)<=PHYSICS_FRAME*1.1,"PYRAMID unit starts are not 0.600 s apart: "+delta);
expect(starts[0].ids.length===6&&starts[1].ids.length===6,"PYRAMID was not treated as one six-ball unit");
expect(firstMoved,"spawn effect held the ordinary falling balls still");
console.log("garbage spawn effect + 0.600 s PYRAMID cadence PASS",JSON.stringify({starts,delta}));
`;
vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
