const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function diagBoardItems(g){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
  if(ball&&v)out.push({ball,v,x,y});
 }
 return out;
}
function diagMinDistance(g){
 const a=diagBoardItems(g);let min=Infinity;
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
  min=Math.min(min,hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y));
 }
 return{min,count:a.length};
}
function diagStats(g){
 let balls=0,garbage=0,paths=0,rests=0,relax=0;
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;balls++;
  if(b.isGarbage)garbage++;
  if(b.fallPath?.length)paths++;
  if(b._hexGarbageContinuousRest)rests++;
  if(b._hexGarbageRelax)relax++;
 }
 return{balls,garbage,paths,rests,relax,visualMoving:g._visualMovingIds?.size||0,activePacks:g.activeGarbagePacks?.length||0,plans:g.garbagePlans?.length||0,incoming:g.incoming||0,incomingShapes:g.incomingShapes?.length||0};
}
const perf={solverCalls:0,solverMs:0,solverCorrections:0,solverMaxMs:0,solverMaxCorrections:0,solverMaxBalls:0,restApplyCalls:0};
const oldSolver=hexEnforceFinalVisualNonOverlap;
hexEnforceFinalVisualNonOverlap=function(g){
 const n=diagBoardItems(g).length,t=Date.now();
 const r=oldSolver(g);const ms=Date.now()-t;
 perf.solverCalls++;perf.solverMs+=ms;perf.solverCorrections+=r||0;
 perf.solverMaxMs=Math.max(perf.solverMaxMs,ms);perf.solverMaxCorrections=Math.max(perf.solverMaxCorrections,r||0);perf.solverMaxBalls=Math.max(perf.solverMaxBalls,n);
 return r;
};
const oldRestApply=hexGarbageApplyContinuousRests;
hexGarbageApplyContinuousRests=function(g){perf.restApplyCalls++;return oldRestApply(g);};
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
let engineMs=0,distMs=0,maxEngine=0,maxDist=0,globalMin=Infinity;
const wall0=Date.now();
for(let step=0;step<120*60&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 const c0=perf.solverCalls,m0=perf.solverMs,k0=perf.solverCorrections;
 let t=Date.now();stepEngine(g,PHYSICS_FRAME);const em=Date.now()-t;engineMs+=em;maxEngine=Math.max(maxEngine,em);
 t=Date.now();const q=diagMinDistance(g);const dm=Date.now()-t;distMs+=dm;maxDist=Math.max(maxDist,dm);globalMin=Math.min(globalMin,q.min);
 if(step%120===0||em>250||Date.now()-wall0>55000){
  console.log('SEED1_CONTACT_PERF '+JSON.stringify({step,simSec:+(step/120).toFixed(3),wallSec:+((Date.now()-wall0)/1000).toFixed(3),state:g.state,phase:g.phase,frameEngineMs:em,frameDistMs:dm,frameSolverCalls:perf.solverCalls-c0,frameSolverMs:perf.solverMs-m0,frameCorrections:perf.solverCorrections-k0,engineMs,distMs,maxEngine,maxDist,min:globalMin,perf:{...perf},stats:diagStats(g)}));
 }
 if(Date.now()-wall0>60000){
  console.log('SEED1_CONTACT_PERF_STOP '+JSON.stringify({step,simSec:step/120,wallSec:(Date.now()-wall0)/1000,engineMs,distMs,maxEngine,maxDist,min:globalMin,perf,stats:diagStats(g)}));break;
 }
}
console.log('SEED1_CONTACT_PERF_FINAL '+JSON.stringify({wallSec:(Date.now()-wall0)/1000,engineMs,distMs,maxEngine,maxDist,min:globalMin,perf,stats:diagStats(g),state:g.state,phase:g.phase}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:90000});
