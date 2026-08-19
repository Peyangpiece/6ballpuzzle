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
function runFork(label,{x,y,vx,vy,supportX,supportY,floorCells,momentum}){
  const g=createEngine(91000+x+y);g.state="RESOLVING";g.phase="CLEAR";
  const mover=put(g,x,y,1);mover.momentumX=momentum;mover.rollDir=momentum;mover.subCellBias=momentum;
  put(g,supportX,supportY,2);
  for(const [fx,fy] of floorCells)put(g,fx,fy,3);
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

expect(window.__hexClearVacancyPriority===true,"clear vacancy priority adapter was not installed");
expect(window.__hexClearVacancyPriorityVersion==="clear-vacancy-v1","clear vacancy priority version mismatch");

// Interior symmetric fork. The ball is directly supported, both lower diagonals
// are open, and residual momentum points AWAY from the cleared cell. Post-clear
// compaction must fill the actual vacancy rather than obey stale momentum.
runFork("interior left vacancy",{x:8,y:9,vx:7,vy:10,supportX:8,supportY:11,floorCells:[],momentum:1});
runFork("interior right vacancy",{x:8,y:9,vx:9,vy:10,supportX:8,supportY:11,floorCells:[],momentum:-1});

// Wall regression. The wall-packing invariant normally prefers the exposed wall
// cell when both diagonals are open. During a clear, however, a real cleared
// interior cell has priority; otherwise the wall fix can recreate an internal
// hole. Both side walls are covered.
runFork("left-wall interior vacancy",{x:1,y:8,vx:2,vy:9,supportX:1,supportY:10,floorCells:[[0,11],[2,11]],momentum:-1});
runFork("right-wall interior vacancy",{x:17,y:8,vx:16,vy:9,supportX:17,supportY:10,floorCells:[[16,11],[18,11]],momentum:1});

console.log("post-clear cleared-cell vacancy priority PASS");
`;

vm.runInNewContext(runtime+checks,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
