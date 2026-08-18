const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-clear-gap-collapse.js","app-08.js","app-09.js",
  "app-10.js","app-14.js","app-17.js","app-garbage-normal-physics.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){
  expect(valid(x,y),"invalid test cell "+x+","+y);
  const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;
}
function asGarbage(ball,type="PYRAMID"){
  ball.isGarbage=true;ball.garbageType=type;ball.rigid=false;hexPhysClearGroupBall(ball);return ball;
}
function phys(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

expect(window.__hexGarbageFinalizesIntoAccumulatedPile===true,"garbage finalizer marker missing");
expect(window.__hexPostClearGarbageSupportArc===true,"post-clear garbage support arc adapter missing");
expect(window.__hexPostClearDynamicVacancyClosure===true,"secondary-vacancy collapse closure missing");

// Two-stage support-loss chain near the floor:
//
//                 top (9,8)
//          upper (8,9)   shoulder (10,9)
//      removed (7,10)  right (9,10)  far (11,10)
//      floor 6,11  8,11  10,11  12,11
//
// Clearing 7,10 first moves upper into that cell. That move itself vacates 8,9,
// so top must immediately continue into 8,9 instead of leaving a SECONDARY gap.
{
  const g=createEngine(730041);g.state="RESOLVING";g.phase="GARBAGE";
  const top=asGarbage(put(g,9,8,3));
  const upper=asGarbage(put(g,8,9,2));
  const shoulder=asGarbage(put(g,10,9,4));
  const removed=put(g,7,10,3);
  const right=asGarbage(put(g,9,10,1));
  const far=asGarbage(put(g,11,10,2));
  const floorL=asGarbage(put(g,6,11,4));
  const floorM=asGarbage(put(g,8,11,0));
  const floorR=asGarbage(put(g,10,11,1));
  const floorRR=asGarbage(put(g,12,11,2));
  const garbage=[top,upper,shoulder,right,far,floorL,floorM,floorR,floorRR];

  upper.garbagePhaseFrozen=true;
  right.garbageBubbleHold=true;
  finishGarbageVisuals(g);
  for(const b of garbage){
    expect(b.garbagePileSettled===true,"settled garbage was not promoted to accumulated pile: "+b.id);
    expect(b.garbageInitialRestReached===true,"settled garbage missing rest marker: "+b.id);
    expect(!b.garbagePhaseFrozen&&!b.garbageBubbleHold,"transient garbage state survived finalization: "+b.id);
    expect(!b.rigid&&!b.motionGroupId,"settled garbage retained rigidity: "+b.id);
  }

  g.phase="CLEAR";
  g.clearing={ids:new Set([removed.id]),cells:[[7,10,removed.c,removed.id]],waza:[],committed:true,ghosts:[]};
  g.board[10][7]=null;
  clearBoardEquilibriumLocks(g.board);

  const upperStart=[g.vis.get(upper.id).x,g.vis.get(upper.id).y];
  const topStart=[g.vis.get(top.id).x,g.vis.get(top.id).y];
  const flow=prepareContinuousPileFlow(g,"clear_support_loss");
  expect(flow.moved,"post-garbage clear produced no collapse motion");
  expect(g.board[10][7]===upper,"original cleared vacancy remained open instead of being filled");
  expect(g.board[9][8]===top,"secondary vacancy created by pile movement remained open");
  expect(!hasLegalGravityMove(g.board),"post-clear board still had an unresolved legal gravity move");
  expect(flow.clearDynamicVacancyCount>g._lastClearVacancyCount,"collapse did not track movement-created vacancies");
  expect(g._lastClearCollapseVacancies instanceof Set&&g._lastClearCollapseVacancies.has("8,9"),"upper ball origin was not retained as a secondary vacancy");

  const upperSeg=upper.fallPath.find(s=>s?.to&&s.to[0]===7&&s.to[1]===10);
  const topSeg=top.fallPath.find(s=>s?.to&&s.to[0]===8&&s.to[1]===9);
  expect(upperSeg,"collapse path did not include the original cleared vacancy");
  expect(topSeg,"secondary collapse path did not fill the vacated support cell");
  expect(upperSeg.pileFlow===true&&topSeg.pileFlow===true,"multi-stage collapse was not converted to continuous pile flow");
  expect(Array.isArray(upperSeg.pivot)&&upperSeg.pivot[0]===9&&upperSeg.pivot[1]===10,"upper collapse lost the real garbage pivot");
  expect((upperSeg.followSupportIds||[]).includes(right.id),"settled garbage support was not bound to the first collapse arc");
  expect(Array.isArray(topSeg.pivot)&&topSeg.pivot[0]===10&&topSeg.pivot[1]===9,"secondary collapse lost the shoulder pivot");
  expect((topSeg.followSupportIds||[]).includes(shoulder.id),"secondary collapse was not bound to its real support");

  let upperMoved=false,topMoved=false;
  for(let frame=0;frame<360&&((upper.fallPath?.length||0)||(top.fallPath?.length||0));frame++){
    updateVisuals(g,PHYSICS_FRAME);
    const uv=g.vis.get(upper.id),tv=g.vis.get(top.id);
    if(uv&&phys(upperStart,[uv.x,uv.y])>1e-4)upperMoved=true;
    if(tv&&phys(topStart,[tv.x,tv.y])>1e-4)topMoved=true;
  }
  const upperEnd=g.vis.get(upper.id),topEnd=g.vis.get(top.id);
  expect(upperMoved&&topMoved,"multi-stage pile collapse stayed visually staged/frozen");
  expect(upperEnd&&Math.abs(upperEnd.x-7)<0.01&&Math.abs(upperEnd.y-10)<0.01,"upper ball did not visually fill the original vacancy");
  expect(topEnd&&Math.abs(topEnd.x-8)<0.01&&Math.abs(topEnd.y-9)<0.01,"top ball did not visually fill the secondary vacancy");
}

console.log("post-garbage internal + secondary-clear collapse PASS");
`;

vm.runInNewContext(runtime+checks,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
