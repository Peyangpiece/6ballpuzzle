function createEngine(seed,opts={}){
 const g={
  seed,rng:mulberry32(seed),aiRng:mulberry32((seed^0x41A7C15D)>>>0),fxRng:mulberry32((seed^0x9E3779B9)>>>0),
  board:newBoard(),nextId:1,queue:[],piece:null,pieceVX:SPAWN_X,pieceVY:-2,
  rotAnim:{p:1,dir:1,dx:0,dy:0},freeX:null,dragging:false,
  physicsWatch:{lastSig:"",repeats:0,steps:0,fallbacks:0},ver:0,state:"READY",phase:null,stateT:0,
  dropT:0,dropInterval:opts.dropInterval??DROP_INTERVAL,soft:false,fastForward:false,fastForwardCarry:0,
  lockT:0,hardDropAnim:null,lockResets:0,
  incoming:0,incomingShapes:[],sendBuffer:0,sendShapes:[],garbShapes:[],garbBlocked:false,garbDone:false,garbLeft:0,
  garbageBatchPrepared:false,garbageAnimDuration:2.45,garbageSeq:0,garbagePlans:[],activeGarbagePacks:[],garbageClock:0,garbageMaterializeIndex:0,garbageNextBallAt:0,garbageWatchdogLimit:6,
  chain:0,clearing:null,holdT:0,pileFlowClock:0,vis:new Map(),events:[],
  stats:{maxChain:0,cleared:0,score:0,waza:{STRAIGHT:0,PYRAMID:0,HEXAGON:0}},scoreDisp:0,
  fx:{toasts:[],shake:0,sink:0,warn:0,fastPulse:0,sparks:[],rings:[]},
  gameOverOverflow:[],gameOverReason:null,ai:null,alive:true,offset:opts.offset??false
 };
 for(let i=0;i<3;i++)g.queue.push(makeSet(g));
 return g;
}
const mkBall=(g,c)=>({id:g.nextId++,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0});
const setVis=(g,ball,x,y,vy=0)=>g.vis.set(ball.id,{x,y,vy,sq:0});
const emit=(g,e)=>g.events.push(e);

function spawn(g){
 const colors=g.queue.shift();g.queue.push(makeSet(g));
 g.piece={x:SPAWN_X,y:-2,rot:0,colors};g.pieceVX=SPAWN_X;g.pieceVY=-2;
 g.rotAnim={p:1,dir:1,dx:0,dy:0};g.freeX=null;g.dragging=false;
 g.physicsWatch={lastSig:"",repeats:0,steps:0,fallbacks:g.physicsWatch?.fallbacks||0};
 g.dropT=0;g.lockT=0;g.lockResets=0;g.garbDone=false;g.garbLeft=0;g.garbShapes=[];
 g.garbagePlans=[];g.activeGarbagePacks=[];g.garbageClock=0;g.garbageMaterializeIndex=0;g.garbageNextBallAt=0;g.garbageWatchdogLimit=6;g.garbBlocked=false;g.garbageBatchPrepared=false;g.garbageSeq=0;
 g.chain=0;g.state="PLAYING";g.phase=null;
 if(g.ai){const lv=Math.max(1,Math.min(5,Number(g.ai.level)||1));g.ai.level=lv;g.ai.target=null;g.ai.thinkT=AI_PARAMS[lv].think*(.7+g.aiRng()*.6);g.ai.actT=0;}
}
function die(g,overflowCells=null,reason="LIMIT"){
 g.state="GAMEOVER";g.alive=false;g.gameOverOverflow=Array.isArray(overflowCells)?overflowCells.map(v=>Array.isArray(v)?[...v]:v):[];g.gameOverReason=reason;
 g.piece=null;g.hardDropAnim=null;g.fx.shake=0;g.fx.sink=0;
}
function legalXRange(g){
 const p=g.piece;let lo=null,hi=null;
 for(let x=0;x<W2;x++){if(((x-p.x)&1)!==0)continue;if(!pieceFits(g.board,{...p,x}))continue;if(lo===null)lo=x;hi=x;}
 return[lo===null?p.x:lo,hi===null?p.x:hi];
}
function setColumn(g,targetX){
 if(g.state!=="PLAYING"||!g.piece)return false;
 const want=Math.round((targetX-g.piece.x)/2)*2+g.piece.x;if(want===g.piece.x)return false;
 const dir=Math.sign(want-g.piece.x);let moved=false;
 while(g.piece.x!==want){const q={...g.piece,x:g.piece.x+dir*2};if(!pieceFits(g.board,q))break;g.piece=q;moved=true;}
 if(moved){emit(g,{t:"move"});if(g.lockT>0&&g.lockResets<12){g.lockT=0;g.lockResets++;}}
 return moved;
}
const move=(g,d)=>{if(!g.piece)return false;const r=setColumn(g,g.piece.x+d*2);g.freeX=g.piece.x;return r;};
function setFreeX(g,fx){if(g.state!=="PLAYING"||!g.piece)return;const[lo,hi]=legalXRange(g);g.freeX=Math.max(lo,Math.min(hi,fx));setColumn(g,g.freeX);}

function rotationPosePoints(fromPiece,toPiece,dir,t){
 t=Math.max(0,Math.min(1,t));const cells=pieceCells(toPiece),dOff=dispOff(toPiece.rot);
 const pts=cells.map(([x,y])=>[latticeRealX(x),cellCenterYNorm(y+dOff)]),gx=(pts[0][0]+pts[1][0]+pts[2][0])/3,gy=(pts[0][1]+pts[1][1]+pts[2][1])/3;
 const before=centroidOf(fromPiece),after=centroidOf(toPiece),k=1-smoothRotationT(t),ang=-k*(dir>0?1:-1)*(TAU/6),ca=Math.cos(ang),sa=Math.sin(ang),ox=k*(before[0]-after[0])*.5,oy=k*(before[1]-after[1])*HEX_ROW_H;
 return pts.map(([px,py])=>{const ax=px-gx,ay=py-gy;return[gx+ax*ca-ay*sa+ox,gy+ax*sa+ay*ca+oy];});
}
function rotationSweepSafe(board,fromPiece,toPiece,dir){
 if(centroidOf(toPiece)[1]<centroidOf(fromPiece)[1]-1e-9)return false;
 const right=latticeRealX(W2-1);
 for(let i=0;i<=48;i++){
  const pts=rotationPosePoints(fromPiece,toPiece,dir,i/48);
  for(const[px,py]of pts){
   if(px<-1e-8||px>right+1e-8||py>FLOOR_CENTER_N+1e-8)return false;
   for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){if(!valid(x,y)||!board[y][x])continue;const q=normPoint(x,y);if(Math.hypot(px-q[0],py-q[1])<HEX_MIN_DIST)return false;}
  }
  for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++)if(Math.hypot(pts[a][0]-pts[b][0],pts[a][1]-pts[b][1])<HEX_MIN_DIST)return false;
 }
 return true;
}
function rotate(g,dir){
 if(g.state!=="PLAYING"||!g.piece)return false;const nr=(g.piece.rot+(dir>0?1:5))%6,from={...g.piece},before=centroidOf(from);
 for(const[kx,ky]of KICKS){const q={...from,rot:nr,x:from.x+kx,y:from.y+ky};if(!pieceFits(g.board,q)||!rotationSweepSafe(g.board,from,q,dir))continue;const after=centroidOf(q);g.piece=q;g.rotAnim={p:0,dir:dir>0?1:-1,dx:before[0]-after[0],dy:before[1]-after[1]};emit(g,{t:"rotate"});if(g.lockT>0&&g.lockResets<12){g.lockT=0;g.lockResets++;}return true;}
 return false;
}
const HARD_DROP_FRAMES=5,HARD_DROP_FPS=30,HARD_DROP_VISUAL_TIME=HARD_DROP_FRAMES/HARD_DROP_FPS;
function hardDrop(g){
 if(g.state!=="PLAYING"||!g.piece||g.hardDropAnim)return;const target=dropPiece(g.board,g.piece);
 if(target.y===g.piece.y){emit(g,{t:"drop"});lock(g,5);return;}
 g.hardDropAnim={t:0,dur:HARD_DROP_VISUAL_TIME,fromY:g.piece.y+activeDropFraction(g),target:{...target}};g.dropT=0;emit(g,{t:"drop"});
}

function lock(g,vy=2){
 if(!g.piece)return;
 const preSnapX=g.freeX!=null?g.freeX:g.piece.x,splitOffset=preSnapX-g.piece.x,splitRot=g.piece.rot;
 if(g.freeX!=null)setColumn(g,g.freeX);
 let cells=pieceCells(g.piece);
 let invalid=cells.some(([x,y])=>y<0||!valid(x,y)||g.board[y][x]!==null);
 if(invalid){
  const before=physicsSignature(g);settleAll(g.board);if(physicsSignature(g)!==before||boardHasIllegalFloat(g.board))g.piece=dropPiece(g.board,g.piece);
  cells=pieceCells(g.piece);invalid=cells.some(([x,y])=>y<0||!valid(x,y)||g.board[y][x]!==null);
  if(invalid){die(g,cells.map(([x,y,c])=>[x,y,c]),"LIMIT");return;}
 }
 const made=[];
 for(let role=0;role<cells.length;role++){
  const[x,y,c]=cells[role],ball=mkBall(g,c);
  ball.subCellBias=Math.abs(splitOffset)>1e-5?Math.sign(splitOffset):0;ball.momentumX=ball.subCellBias;
  g.board[y][x]=ball;made.push({ball,role,x,y});setVis(g,ball,x,y,Math.max(RELEASE_INITIAL_VY,vy||0));
  const vv=g.vis.get(ball.id);vv.motionSpeed=Math.max(RELEASE_INITIAL_VY,vy||0);vv.justReleased=true;
 }
 const gid=made.length?HEX_PHYS_GROUP_SEQ++:0,orientation=((splitRot&1)===0)?"down":"up";
 for(const m of made){
  m.ball.motionGroupId=gid;m.ball.motionGroupRole=m.role;m.ball.motionGroupOrientation=orientation;m.ball.motionGroupSize=3;m.ball.rigid=true;
  m.ball.visualTripletId=gid;m.ball.visualTripletOrientation=orientation;m.ball.visualTripletRole=m.role;
 }
 const immediateMoved=settlePass(g.board);if(immediateMoved)g.ver++;
 g.piece=null;g.hardDropAnim=null;g.freeX=null;g.dragging=false;g.ver++;emit(g,{t:"land"});g.state="RESOLVING";g.phase="SETTLE";g.stateT=0;
 if(immediateMoved&&g.physicsWatch){g.physicsWatch.lastSig=physicsSignature(g);g.physicsWatch.repeats=0;g.physicsWatch.steps=0;}
}

const TOPS=(()=>{const a=[];for(let x=0;x<W2;x++)if(valid(x,0))a.push(x);return a;})();
function armGarbageVisual(g,ball,startX,startY){const v=g.vis.get(ball.id);if(!v)return;v.x=startX;v.y=startY;v.vy=0;v.garbAnim=null;}
function garbageVisualsDone(g){return nearlySettled(g,.06);}
function garbageBall(g){
 const free=TOPS.filter(x=>g.board[0][x]===null);if(!free.length)return 0;const x=free[Math.floor(g.rng()*free.length)],ball=mkBall(g,Math.floor(g.rng()*COLORS.length));
 ball.isGarbage=true;hexPhysClearGroupBall(ball);g.board[0][x]=ball;setVis(g,ball,x,-4.2,0);armGarbageVisual(g,ball,x,-4.2);g.fx.shake=0;g.ver++;return 1;
}
const pendingIncomingCount=g=>g.incoming+g.incomingShapes.length+g.garbShapes.length+(g.garbagePlans||[]).filter(p=>!p.landed).length+g.garbLeft;
const GARBAGE_START_Y=-6.2;
function cloneBoardForGarbagePlan(board){return board.map(row=>row.map(v=>v?{id:v.id,c:getC(v)}:null));}
function shapeFitsAt(board,pat,ax,ay){for(const[dx,dy]of pat){const x=ax+dx,y=ay+dy;if(!valid(x,y)||board[y][x]!==null)return false;}return true;}
function deepestRigidAnchor(board,pat,ax){let ay=0;if(!shapeFitsAt(board,pat,ax,ay))return null;while(shapeFitsAt(board,pat,ax,ay+2))ay+=2;return ay;}
function chooseGarbagePlan(g,board,type,seq){
 const pat=GARBAGE_SHAPES[type];if(!pat||!WAZA[type])return null;const minX=Math.min(...pat.map(([x])=>x)),maxX=Math.max(...pat.map(([x])=>x)),candidates=[];
 for(let ax=-minX;ax<=W2-1-maxX;ax++){const ay=deepestRigidAnchor(board,pat,ax);if(ay!==null)candidates.push({ax,ay,shapeCenter:ax+(minX+maxX)/2});}
 if(!candidates.length)return null;const packCount=WAZA[type].packs||1,lane=seq%packCount,centers=candidates.map(c=>c.shapeCenter),minC=Math.min(...centers),maxC=Math.max(...centers),frac=packCount<=1?.5:.16+.68*(lane/(packCount-1)),wanted=minC+(maxC-minC)*frac;
 candidates.sort((a,b)=>Math.abs(a.shapeCenter-wanted)-Math.abs(b.shapeCenter-wanted)||a.ax-b.ax);const best=candidates[0];let colors;
 if(type==="STRAIGHT"){
  const offset=Math.floor(g.rng()*COLORS.length),upper=Array.from({length:12},(_,i)=>(offset+i)%COLORS.length);
  colors=pat.map(([dx,dy])=>dy===0?upper[Math.max(0,Math.min(11,Math.round(dx/2)))]:dy===1?upper[Math.max(0,Math.min(10,Math.round((dx-1)/2)))]:upper[0]);
 }else colors=pat.map((_,i)=>(Math.floor(g.rng()*COLORS.length)+i)%COLORS.length);
 return{type,pat,ax:best.ax,targetY:best.ay,startY:GARBAGE_START_Y,delay:0,colors,seq,y:GARBAGE_START_Y,vy:0,landed:false};
}
function reserveGarbagePlan(board,plan,tempIdBase){for(let i=0;i<plan.pat.length;i++){const[dx,dy]=plan.pat[i];board[plan.targetY+dy][plan.ax+dx]={id:tempIdBase-i,c:plan.colors[i]};}settleAll(board);}
