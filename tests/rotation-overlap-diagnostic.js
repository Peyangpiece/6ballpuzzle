const fs=require('fs');
const vm=require('vm');

const runtime=[
  'app-01.js','app-02.js','app-03.js','app-04.js','app-05.js','app-06.js',
  'app-07.js','app-08.js','app-09.js','app-10.js','app-14.js','app-17.js','app-18.js'
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,'utf8')).join('\n');

const assertions=String.raw`
function renderedActivePoints(g){
  if(g.state!=="PLAYING"||!g.piece)return[];
  const cells=pieceCells(g.piece),dx=g.pieceVX-g.piece.x;
  let dOff=dispOff(g.piece.rot);
  const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2});
  const align=blocked?Math.max(0,1-Math.min(1,g.lockT/LANDING_ALIGN_DURATION)):1;
  dOff*=align;
  const frac=safeActiveFallOffset(g,cells,dx,dOff,activeDropFraction(g));
  const pts=cells.map(([x,y],i)=>({i,logical:[x,y],p:[latticeRealX(x+dx),cellCenterYNorm(y+frac+dOff)]}));
  const gx=pts.reduce((n,q)=>n+q.p[0],0)/3,gy=pts.reduce((n,q)=>n+q.p[1],0)/3;
  const k=g.rotAnim.p<1?1-smoothRotationT(g.rotAnim.p):0,ang=-k*g.rotAnim.dir*(TAU/6),ca=Math.cos(ang),sa=Math.sin(ang),ox=k*(g.rotAnim.dx||0)*.5,oy=k*(g.rotAnim.dy||0)*HEX_ROW_H;
  return pts.map(q=>{const ax=q.p[0]-gx,ay=q.p[1]-gy;return{...q,p:[gx+ax*ca-ay*sa+ox,gy+ax*sa+ay*ca+oy]};});
}
function firstActiveOverlap(g){
  const active=renderedActivePoints(g);if(!active.length)return null;
  let best={d:Infinity};
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;
    const v=g.vis.get(ball.id),bp=v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?[latticeRealX(v.x),cellCenterYNorm(v.y)]:normPoint(x,y);
    for(const a of active){const d=Math.hypot(a.p[0]-bp[0],a.p[1]-bp[1]);if(d<best.d)best={d,a,ball:{id:ball.id,logical:[x,y],visual:v?{x:v.x,y:v.y}:null},bp};}
  }
  return best.d<.999999?best:null;
}
const seed=37,g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
let found=null;
for(let step=0;step<6500&&g.alive;step++){
  if(step===120*7)g.incomingShapes.push('PYRAMID');
  if(step===120*14)g.incomingShapes.push('HEXAGON');
  if(step===120*23)g.incomingShapes.push('STRAIGHT');
  if(step===120*31)g.incoming+=8;
  stepEngine(g,PHYSICS_FRAME);
  const q=firstActiveOverlap(g);
  if(q&&q.d<.98){
    found={step,d:q.d,piece:g.piece?{...g.piece}:null,pieceVX:g.pieceVX,pieceVY:g.pieceVY,freeX:g.freeX,dropT:g.dropT,dropInterval:g.dropInterval,lockT:g.lockT,rotAnim:{...g.rotAnim},fastForward:g.fastForward,active:q.a,board:q.ball,state:g.state,phase:g.phase};
    break;
  }
}
if(!found)throw new Error('diagnostic did not reproduce active overlap');
console.log('ROTATION_OVERLAP_DIAGNOSTIC '+JSON.stringify(found));
`;

const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
