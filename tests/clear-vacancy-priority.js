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
  expect(!hasLegalGravityMove(g.board),label+": board retained an unresolved gravity move");
}
function runFloorFork(label,{x,vx,momentum}){
  const y=ROWS-2,vy=ROWS-1;
  const g=createEngine(92000+x+vx);g.state="RESOLVING";g.phase="CLEAR";
  const mover=put(g,x,y,1);mover.momentumX=momentum;mover.rollDir=momentum;mover.subCellBias=momentum;
  // Keep both floor diagonals open so the core FLOOR_DROP branch would normally
  // follow residual momentum. Only one of them is an actual clear vacancy.
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
}

expect(window.__hexClearVacancyPriority===true,"clear vacancy priority adapter was not installed");
expect(window.__hexClearVacancyPriorityVersion==="clear-vacancy-v2","clear vacancy priority version mismatch");
expect(window.__hexClearFloorVacancyPriority===true,"floor-side clear vacancy priority missing");

// Interior symmetric fork. The ball is directly supported, both lower diagonals
// are open, and residual momentum points AWAY from the cleared cell. The target
// vacancy itself is a stable two-support pocket, so a correct collapse must end
// with the mover in that exact cell rather than choosing the other open side.
runFork("interior left vacancy",{x:8,y:9,vx:7,vy:10,supportX:8,supportY:11,stableCells:[[6,11]],momentum:1});
runFork("interior right vacancy",{x:8,y:9,vx:9,vy:10,supportX:8,supportY:11,stableCells:[[10,11]],momentum:-1});

// Wall regression. The wall-packing invariant normally prefers the exposed wall
// cell when both diagonals are open. During a clear, however, a real cleared
// interior cell has priority; otherwise the wall fix can recreate an internal
// hole. Both side walls are covered, and each target vacancy has two real lower
// supports so the filler legitimately comes to rest there.
runFork("left-wall interior vacancy",{x:1,y:8,vx:2,vy:9,supportX:1,supportY:10,stableCells:[[3,10],[0,11],[2,11],[4,11]],momentum:-1});
runFork("right-wall interior vacancy",{x:17,y:8,vx:16,vy:9,supportX:17,supportY:10,stableCells:[[15,10],[14,11],[16,11],[18,11]],momentum:1});

// Floor regression. A row-10 ball has no valid y+2 support cell; previously the
// vacancy-priority adapter therefore skipped it and the core floor tie-break
// could follow stale momentum into the opposite open floor cell. Verify both
// directions: the actual cleared floor-side cavity must win.
runFloorFork("floor left vacancy",{x:9,vx:8,momentum:1});
runFloorFork("floor right vacancy",{x:9,vx:10,momentum:-1});

console.log("post-clear cleared-cell + floor vacancy priority PASS");
`;

vm.runInNewContext(runtime+checks,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
