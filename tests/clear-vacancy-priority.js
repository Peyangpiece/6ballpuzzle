const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js",
  "app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js","app-wall-gap-invariant.js",
  "app-wall-direct-support-fill.js","app-wall-flow-vacancy-sync.js","app-clear-vacancy-priority.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){
  expect(valid(x,y),"invalid test cell "+x+","+y);
  const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;
}
function clearCell(g,x,y,c=4){
  const removed=put(g,x,y,c);
  g.clearing={ids:new Set([removed.id]),cells:[[x,y,c,removed.id]],waza:[],committed:true,ghosts:[]};
  g.board[y][x]=null;
  return removed;
}
function findBall(g,id){
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]?.id===id)return{x,y,ball:g.board[y][x]};
  return null;
}
function expectConserved(g,label){
  expect(g._lastClearVacancyCountNeverIncreased===true,label+": live vacancy count increased during collapse");
  expect(g._lastClearMaxLiveVacancyCount<=g._lastClearInitialVacancyCount,label+": max live vacancies exceeded initial clear vacancies");
  expect(g._lastClearRemainingInternalVacancyCount===0,label+": internal vacancy remained after collapse: "+JSON.stringify([...(g._lastClearRemainingInternalVacancies||[])]));
}
function runFork(label,{x,y,vx,vy,supportX,supportY,stableCells,momentum}){
  const g=createEngine(91000+x+y);g.state="RESOLVING";g.phase="CLEAR";
  const mover=put(g,x,y,1);mover.momentumX=momentum;mover.rollDir=momentum;mover.subCellBias=momentum;
  put(g,supportX,supportY,2);
  for(const [fx,fy] of stableCells)if(!g.board[fy][fx])put(g,fx,fy,3);
  clearCell(g,vx,vy,4);
  clearBoardEquilibriumLocks(g.board);
  const flow=prepareContinuousPileFlow(g,"clear_support_loss");
  const pos=findBall(g,mover.id);
  expect(flow.moved,label+": clear produced no pile motion");
  expect(pos&&pos.x===vx&&pos.y===vy,label+": mover did not fill the cleared vacancy; ended at "+JSON.stringify(pos&&[pos.x,pos.y]));
  expect(g.board[vy][vx]===mover,label+": cleared cell stayed empty");
  const seg=(mover.fallPath||[]).find(s=>s?.to&&s.to[0]===vx&&s.to[1]===vy);
  expect(seg,label+": authored path did not target the cleared cell");
  expect(seg.clearVacancyPriority===true,label+": vacancy-priority branch was not used");
  expect(seg.clearVacancyConserved===true,label+": conserved-vacancy marker missing");
  expect(!hasLegalGravityMove(g.board),label+": board retained an unresolved gravity move");
  expectConserved(g,label);
}
function runFloorFork(label,{x,vx,momentum}){
  const y=ROWS-2,vy=ROWS-1;
  const g=createEngine(92000+x+vx);g.state="RESOLVING";g.phase="CLEAR";
  const mover=put(g,x,y,1);mover.momentumX=momentum;mover.rollDir=momentum;mover.subCellBias=momentum;
  clearCell(g,vx,vy,4);
  clearBoardEquilibriumLocks(g.board);
  const flow=prepareContinuousPileFlow(g,"clear_support_loss");
  const pos=findBall(g,mover.id);
  expect(flow.moved,label+": floor clear produced no pile motion");
  expect(pos&&pos.x===vx&&pos.y===vy,label+": floor mover chose the opposite open floor cell; ended at "+JSON.stringify(pos&&[pos.x,pos.y]));
  expect(g.board[vy][vx]===mover,label+": cleared floor cell stayed empty");
  const seg=(mover.fallPath||[]).find(s=>s?.to&&s.to[0]===vx&&s.to[1]===vy);
  expect(seg&&seg.kind==="FLOOR_DROP",label+": floor vacancy was not filled by the canonical floor drop");
  expect(seg.clearVacancyPriority===true,label+": floor vacancy-priority branch was not used");
  expect(seg.clearFloorVacancyPriority===true,label+": floor-specific vacancy branch marker missing");
  expect(seg.clearVacancyConserved===true,label+": floor conserved-vacancy marker missing");
  expectConserved(g,label);
}

expect(window.__hexClearVacancyPriority===true,"clear vacancy priority adapter was not installed");
expect(window.__hexClearVacancyPriorityVersion==="clear-vacancy-v3","clear vacancy priority version mismatch");
expect(window.__hexClearFloorVacancyPriority===true,"floor-side clear vacancy priority missing");
expect(window.__hexClearVacancyLiveSet===true,"live clear vacancy set missing");
expect(window.__hexClearCollapseNoNewGaps===true,"no-new-gap collapse invariant missing");

runFork("interior left vacancy",{x:8,y:9,vx:7,vy:10,supportX:8,supportY:11,stableCells:[[6,11]],momentum:1});
runFork("interior right vacancy",{x:8,y:9,vx:9,vy:10,supportX:8,supportY:11,stableCells:[[10,11]],momentum:-1});
runFork("left-wall interior vacancy",{x:1,y:8,vx:2,vy:9,supportX:1,supportY:10,stableCells:[[3,10],[0,11],[2,11],[4,11]],momentum:-1});
runFork("right-wall interior vacancy",{x:17,y:8,vx:16,vy:9,supportX:17,supportY:10,stableCells:[[15,10],[14,11],[16,11],[18,11]],momentum:1});
runFloorFork("floor left vacancy",{x:9,vx:8,momentum:1});
runFloorFork("floor right vacancy",{x:9,vx:10,momentum:-1});

// Multi-stage cascade: the original vacancy is filled, then the filler origin
// becomes the ONLY live vacancy, and the next ball fills that. The vacancy must
// migrate to the pile surface without ever branching into a second internal gap.
{
  const g=createEngine(930041);g.state="RESOLVING";g.phase="CLEAR";
  const top=put(g,9,8,3);
  const upper=put(g,8,9,2);
  put(g,10,9,4);
  const removed=put(g,7,10,3);
  put(g,9,10,1);
  put(g,11,10,2);
  for(const [x,c] of [[6,4],[8,0],[10,1],[12,2]])put(g,x,11,c);
  g.clearing={ids:new Set([removed.id]),cells:[[7,10,removed.c,removed.id]],waza:[],committed:true,ghosts:[]};
  g.board[10][7]=null;
  clearBoardEquilibriumLocks(g.board);
  const flow=prepareContinuousPileFlow(g,"clear_support_loss");
  expect(flow.moved,"multi-stage: clear produced no motion");
  expect(g.board[10][7]===upper,"multi-stage: original vacancy was not filled");
  expect(g.board[9][8]===top,"multi-stage: secondary vacancy was not filled");
  expect(g._lastClearInitialVacancyCount===1,"multi-stage: expected one initial vacancy");
  expect(g._lastClearMaxLiveVacancyCount===1,"multi-stage: collapse branched one vacancy into multiple gaps");
  expectConserved(g,"multi-stage");
}

console.log("post-clear no-new-gap vacancy conservation PASS");
`;

vm.runInNewContext(runtime+checks,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
