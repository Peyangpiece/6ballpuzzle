const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js","app-garbage-deep-settle.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
function locate(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{x,y,b,v:g.vis.get(id)};}return null;}
function findSpot(xMin=2){
 for(let y=1;y<ROWS-3;y++)for(let x=xMin;x<W2-2;x++){
  if(valid(x,y)&&valid(x-1,y+1)&&valid(x+1,y+1)&&valid(x,y+2))return{x,y};
 }
 throw new Error("no diagonal test spot");
}
expect(window.__hexGarbageDeepSettle===true,"deep-settle layer missing");
expect(window.__hexGarbageFrozenScopeIsPreBatchSnapshot===true,"pre-batch freeze scope invariant missing");

const g=createEngine(731991);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;
const a=findSpot(2),b=findSpot(Math.min(W2-4,a.x+6));

// Case A: a garbage ball that already became pile during THIS batch must remain
// dynamic. It is resting upper-left of a frozen support with the lower-left
// lattice cell open, so it must roll into that lower cell before finalizing.
const support=put(g,a.x+1,a.y+1,4);
const incoming=put(g,a.x,a.y,1);incoming.isGarbage=true;incoming.garbageType="PYRAMID";incoming.garbageSplitReleased=true;incoming.garbagePileSettled=true;
hexPhysClearGroupBall(incoming);

// Case B: a garbage-looking ball that existed BEFORE the batch is part of the
// frozen snapshot and must not move, even with the same open diagonal geometry.
const oldSupport=put(g,b.x+1,b.y+1,3);
const oldGarbage=put(g,b.x,b.y,2);oldGarbage.isGarbage=true;oldGarbage.garbagePileSettled=true;

g.garbageFrozenPileIds=new Set([support.id,oldSupport.id,oldGarbage.id]);
support.garbagePhaseFrozen=true;oldSupport.garbagePhaseFrozen=true;oldGarbage.garbagePhaseFrozen=true;

expect(window.__hexGarbageHasOpenDiagonal(g)===true,"dynamic landed garbage was incorrectly treated as final");
const moved=window.__hexGarbageContinueDownhill(g);
expect(moved>=1,"open lower diagonal did not continue");

const now=locate(g,incoming.id);
expect(now&&now.x===a.x-1&&now.y===a.y+1,"incoming garbage did not move into lower diagonal: "+JSON.stringify(now&&[now.x,now.y]));
expect(!incoming.garbagePileSettled,"incoming garbage stayed finalized while moving downhill");
expect(!incoming.garbagePhaseFrozen,"same-batch settled garbage inherited pre-batch freeze");
expect(incoming.rigid===false&&!incoming.motionGroupId&&!incoming.motionGroupSize,"downhill garbage regained rigidity");
expect(Array.isArray(incoming.fallPath)&&incoming.fallPath.length>0,"downhill continuation did not append ordinary fallPath");
const seg=incoming.fallPath[0];
expect(seg.to[0]===a.x-1&&seg.to[1]===a.y+1,"wrong downhill segment target");
expect(Array.isArray(seg.pivot)||Array.isArray(seg.topPivot),"downhill move lost ordinary support-arc geometry");

const frozenNow=locate(g,oldGarbage.id);
expect(frozenNow&&frozenNow.x===b.x&&frozenNow.y===b.y,"pre-batch frozen garbage moved during incoming batch");
expect(oldGarbage.garbagePhaseFrozen===true,"pre-batch frozen marker was removed");

console.log("garbage lower-diagonal before final settle PASS",JSON.stringify({from:[a.x,a.y],to:[now.x,now.y],frozen:[b.x,b.y],kind:seg.kind,pivot:seg.pivot,topPivot:seg.topPivot}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
