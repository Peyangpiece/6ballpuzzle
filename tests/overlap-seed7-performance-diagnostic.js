const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function diagVisualBalls(g){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
  if(ball&&v)out.push([v.x,v.y]);
 }
 if(g.state==='PLAYING'&&g.piece){
  const cells=pieceCells(g.piece),dx=g.pieceVX-g.piece.x;
  let dOff=dispOff(g.piece.rot);
  const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2});
  const align=blocked?Math.max(0,1-Math.min(1,g.lockT/LANDING_ALIGN_DURATION)):1;
  dOff*=align;
  const frac=safeActiveFallOffset(g,cells,dx,dOff,activeDropFraction(g));
  const pts=cells.map(([x,y])=>[latticeRealX(x+dx),cellCenterYNorm(y+frac+dOff)]);
  const gx=pts.reduce((n,p)=>n+p[0],0)/3,gy=pts.reduce((n,p)=>n+p[1],0)/3;
  const k=g.rotAnim.p<1?1-smoothRotationT(g.rotAnim.p):0,ang=-k*g.rotAnim.dir*(TAU/6),ca=Math.cos(ang),sa=Math.sin(ang),ox=k*(g.rotAnim.dx||0)*.5,oy=k*(g.rotAnim.dy||0)*HEX_ROW_H;
  for(const p of pts){const ax=p[0]-gx,ay=p[1]-gy,px=gx+ax*ca-ay*sa+ox,py=gy+ax*sa+ay*ca+oy;out.push([px/.5,(py-BOARD_TOP_CENTER_N)/HEX_ROW_H]);}
 }
 return out;
}
function diagMinDistance(g){
 const a=diagVisualBalls(g);let min=Infinity;
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)min=Math.min(min,hexPhysDist(a[i][0],a[i][1],a[j][0],a[j][1]));
 return{min,count:a.length};
}
function boardStats(g){
 let balls=0,garbage=0,paths=0,relax=0,frozen=0,groups=new Set();
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;balls++;
  if(b.isGarbage)garbage++;
  if(Array.isArray(b.fallPath)&&b.fallPath.length)paths++;
  const r=b._hexGarbageRelax;if(r){relax++;if(r.groupFrozen)frozen++;if(r.groupKey)groups.add(r.groupKey);}
 }
 return{balls,garbage,paths,relax,frozen,groups:groups.size,activePacks:g.activeGarbagePacks?.length||0,plans:g.garbagePlans?.length||0,garbLeft:g.garbLeft||0,incoming:g.incoming||0,incomingShapes:g.incomingShapes?.length||0};
}
const seed=7,g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
let engineMs=0,distMs=0,maxEngine=0,maxDist=0,worstEngine=null,worstDist=null,globalMin=Infinity;
const wall0=Date.now();
for(let step=0;step<120*60&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 let t=Date.now();stepEngine(g,PHYSICS_FRAME);let e=Date.now()-t;engineMs+=e;
 if(e>maxEngine){maxEngine=e;worstEngine={step,state:g.state,phase:g.phase,stats:boardStats(g)};}
 t=Date.now();const q=diagMinDistance(g);let d=Date.now()-t;distMs+=d;
 if(d>maxDist){maxDist=d;worstDist={step,state:g.state,phase:g.phase,count:q.count,stats:boardStats(g)};}
 globalMin=Math.min(globalMin,q.min);
 if(step%600===0||e>100||d>100){
  console.log('SEED7_PERF '+JSON.stringify({step,simSec:+(step/120).toFixed(3),wallSec:+((Date.now()-wall0)/1000).toFixed(3),engineMs,distMs,maxEngine,maxDist,min:globalMin,state:g.state,phase:g.phase,stats:boardStats(g)}));
 }
 if(Date.now()-wall0>45000){
  console.log('SEED7_PERF_STOP '+JSON.stringify({step,simSec:step/120,wallSec:(Date.now()-wall0)/1000,engineMs,distMs,maxEngine,maxDist,worstEngine,worstDist,min:globalMin,state:g.state,phase:g.phase,stats:boardStats(g)}));
  break;
 }
}
console.log('SEED7_PERF_FINAL '+JSON.stringify({wallSec:(Date.now()-wall0)/1000,engineMs,distMs,maxEngine,maxDist,worstEngine,worstDist,min:globalMin,state:g.state,phase:g.phase,stats:boardStats(g)}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:60000});
