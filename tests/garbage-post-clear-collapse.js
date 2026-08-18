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

// Stable pre-clear geometry near the floor:
//
//            upper garbage (8,9)
//        removed (7,10)   right garbage support (9,10)
//        floor 6,11   floor 8,11   floor 10,11
//
// Before the clear the upper ball has two supports. After (7,10) disappears it
// must roll into that exact vacancy around the remaining garbage support.
{
  const g=createEngine(730041);g.state="RESOLVING";g.phase="GARBAGE";
  const upper=asGarbage(put(g,8,9,2));
  const removed=put(g,7,10,3);
  const right=asGarbage(put(g,9,10,1));
  const floorL=asGarbage(put(g,6,11,4));
  const floorM=asGarbage(put(g,8,11,0));
  const floorR=asGarbage(put(g,10,11,1));
  const garbage=[upper,right,floorL,floorM,floorR];

  // Incoming garbage intentionally starts without the accumulated-pile marker.
  // Finishing the garbage phase must establish that marker for every surviving
  // garbage ball and remove every transient freeze/hold state.
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

  const start=[g.vis.get(upper.id).x,g.vis.get(upper.id).y];
  const flow=prepareContinuousPileFlow(g,"clear_support_loss");
  expect(flow.moved,"post-garbage clear produced no collapse motion");
  expect(g.board[10][7]===upper,"cleared internal vacancy remained open instead of being filled");
  expect(!hasLegalGravityMove(g.board),"post-clear board still had an unresolved legal gravity move");
  expect(Array.isArray(upper.fallPath)&&upper.fallPath.length>0,"collapsed garbage ball received no visual fall path");

  const seg=upper.fallPath.find(s=>s?.to&&s.to[0]===7&&s.to[1]===10);
  expect(seg,"collapse path did not include the cleared vacancy");
  expect(seg.pileFlow===true,"post-clear garbage collapse was not converted to continuous pile flow");
  expect(Array.isArray(seg.pivot)&&seg.pivot[0]===9&&seg.pivot[1]===10,"collapse lost the real garbage pivot");
  expect((seg.followSupportIds||[]).includes(right.id),"settled garbage support was not bound to the collapse arc");

  let movedVisual=false;
  for(let frame=0;frame<240&&Array.isArray(upper.fallPath)&&upper.fallPath.length;frame++){
    updateVisuals(g,PHYSICS_FRAME);
    const v=g.vis.get(upper.id);
    if(v&&phys(start,[v.x,v.y])>1e-4)movedVisual=true;
  }
  const end=g.vis.get(upper.id);
  expect(movedVisual,"garbage pile collapse stayed visually frozen after support loss");
  expect(end&&Math.abs(end.x-7)<0.01&&Math.abs(end.y-10)<0.01,"collapsed garbage ball did not visually fill the vacancy");
}

console.log("post-garbage internal-clear collapse PASS");
`;

vm.runInNewContext(runtime+checks,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
