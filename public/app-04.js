/* Canonical motion-group cleanup. No legacy rigidity metadata exists here. */
function normalizePileBallPhysics(ball){
 if(!ball||typeof ball!=="object")return;
 hexPhysClearGroupBall(ball);ball.fixedGarbage=false;ball.forceSplit=false;ball.fallBias=0;ball.fallBiasTTL=0;
 ball.visualTripletId=0;ball.visualTripletOrientation="";ball.visualTripletRole=-1;
 ball.visualReleaseGroupId=0;ball.visualReleaseOrientation="";ball.visualReleaseGateRoles=[];ball.visualPreReleaseRemaining=0;ball.visualSyncSplitGroup=0;ball.visualSyncSplitStage=0;
}
function stripFinishedTripletRigidity(g){
 for(const members of hexPhysGroups(g.board).values()){
  const inFlight=members.some(m=>Array.isArray(m.ball.fallPath)&&m.ball.fallPath.length);
  if(inFlight)continue;
  // A group is active only while it has a legal next motion. Once it becomes
  // part of the accumulated pile, its rigidity is always exactly zero.
  if(!hexPhysPlanGroup(g.board,members,true).length)for(const m of members){hexPhysClearGroupBall(m.ball);m.ball.rigid=false;}
 }
}
function normalizeAllNonActivePileBalls(g){
 stripFinishedTripletRigidity(g);
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;
  if(ball.isGarbage){hexPhysClearGroupBall(ball);ball.isGarbage=true;}
  else if(!ball.motionGroupId)ball.rigid=false;
  ball.fixedGarbage=false;
 }
}
function releaseSettledConstraints(g,reason="clear_release"){
 normalizeAllNonActivePileBalls(g);
 if(g.physicsWatch){g.physicsWatch.lastSig="";g.physicsWatch.repeats=0;g.physicsWatch.steps=0;}
 return reason;
}
function releaseAllRigidity(g,reason="safety_release"){
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const v=valid(x,y)?g.board[y][x]:null;if(v)hexPhysClearGroupBall(v);}
 if(!g.physicsWatch)g.physicsWatch={lastSig:"",repeats:0,steps:0,fallbacks:0};
 g.physicsWatch.lastSig="";g.physicsWatch.repeats=0;g.physicsWatch.steps=0;g.physicsWatch.fallbacks=(g.physicsWatch.fallbacks||0)+1;return reason;
}
function physicsSafetyCheck(g,moved,context="SETTLE"){
 if(!g.physicsWatch)g.physicsWatch={lastSig:"",repeats:0,steps:0,fallbacks:0};
 const w=g.physicsWatch,sig=physicsSignature(g);w.repeats=sig===w.lastSig?w.repeats+1:0;w.lastSig=sig;w.steps++;
 const stalled=moved&&w.repeats>=3,runaway=w.steps>ROWS*W2*2;
 if(stalled||runaway){releaseAllRigidity(g,context+":safety");return true;}
 if(!moved){w.steps=0;w.repeats=0;w.lastSig=sig;}return false;
}

function findGroups(b){
 const seen=newHexGrid(false),out=[];
 for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){
  if(!valid(x,y)||b[y][x]===null||seen[y][x])continue;const color=getC(b[y][x]),st=[[x,y]],cells=[];seen[y][x]=true;
  while(st.length){const[cx,cy]=st.pop();cells.push([cx,cy]);for(const[dx,dy]of DIRS){const nx=cx+dx,ny=cy+dy;if(valid(nx,ny)&&!seen[ny][nx]&&getC(b[ny][nx])===color){seen[ny][nx]=true;st.push([nx,ny]);}}}
  if(cells.length>=CLEAR_MIN)out.push({color,cells});
 }
 return out;
}
function classify(cells){
 if(cells.length<6)return null;const key=new Set(cells.map(([x,y])=>x+","+y)),has=(x,y)=>key.has(x+","+y),hasPatternAt=(ax,ay,pat)=>pat.every(([dx,dy])=>has(ax+dx,ay+dy));
 for(const w of WAZA_PRIORITY){
  if(w==="STRAIGHT"){for(const[x,y]of cells)for(const[dx,dy]of[[2,0],[1,1],[1,-1]]){let ok=true;for(let i=0;i<6;i++)if(!has(x+dx*i,y+dy*i)){ok=false;break;}if(ok)return w;}continue;}
  const pat=GARBAGE_SHAPES[w];if(!pat)continue;for(const[x,y]of cells)for(const[px,py]of pat)if(hasPatternAt(x-px,y-py,pat))return w;
 }
 return null;
}
function resolveInstant(b){
 let chain=0,garbage=0;
 for(let guard=0;guard<40;guard++){
  settleAll(b);const groups=findGroups(b);if(!groups.length)break;chain++;const kill=new Set(),killColors=new Set();
  for(const g of groups){const w=classify(g.cells);if(w){garbage+=WAZA[w].garbage;killColors.add(g.color);}for(const[x,y]of g.cells)kill.add(x+","+y);}
  if(killColors.size)for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&b[y][x]!==null&&killColors.has(getC(b[y][x])))kill.add(x+","+y);
  for(const k of kill){const[x,y]=k.split(",").map(Number);b[y][x]=null;}
 }
 return{chain,garbage};
}

function pieceSlots(rot,x,y){return(rot&1)===0?[[x,y],[x+2,y],[x+1,y+1]]:[[x+1,y-1],[x+2,y],[x,y]];}
function pieceCells(p){const{x,y,rot,colors}=p;return pieceSlots(rot,x,y).map(([cx,cy],i)=>[cx,cy,colors[(i-(rot>>1)+3)%3]]);}
const dispOff=rot=>((rot&1)===0?-1/3:1/3);
function centroidOf(p){return[p.x+1,p.y];}
function pieceFits(board,p){for(const[x,y]of pieceCells(p)){if(!valid(x,y))return false;if(board[y][x]!==null)return false;}return true;}
const KICKS=[[0,0],[2,0],[-2,0],[1,1],[-1,1],[1,-1],[-1,-1],[0,2],[4,0],[-4,0]];
function dropPiece(board,p){const q={...p};while(pieceFits(board,{...q,y:q.y+2}))q.y+=2;return q;}
function landingShadowCells(g){if(!g||g.state!=="PLAYING"||!g.piece)return null;const p=dropPiece(g.board,g.piece),cs=pieceCells(p);return cs.length===3&&!cs.some(([x,y])=>y<0||!valid(x,y))?cs:null;}
function landingShadowVisualCells(g){
 const cs=landingShadowCells(g);if(!cs||!g?.piece)return null;const dxGrid=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;let constrained=false;
 for(const[sx0,sy]of cs){const sxN=latticeRealX(sx0+dxGrid),syN=cellCenterYNorm(sy);for(let by=boardScanMin(g.board);by<ROWS&&!constrained;by++)for(let bx=0;bx<W2;bx++){if(!valid(bx,by)||!g.board[by][bx])continue;const ddx=Math.abs(sxN-latticeRealX(bx));if(ddx>=1-1e-9)continue;const contact=(cellCenterYNorm(by)-syN)-Math.sqrt(Math.max(0,1-ddx*ddx)),floor=FLOOR_CENTER_N-syN;if(contact>=-1e-8&&contact<floor-1e-8){constrained=true;break;}}if(constrained)break;}
 if(!constrained){let lowest=-Infinity;for(const[,sy]of cs)lowest=Math.max(lowest,cellCenterYNorm(sy));const rowOffset=(FLOOR_CENTER_N-lowest)/HEX_ROW_H;return cs.map(([x,y,c])=>[x,y+rowOffset,c]);}
 let maxDown=Infinity;for(const[,sy]of cs)maxDown=Math.min(maxDown,FLOOR_CENTER_N-cellCenterYNorm(sy));
 for(const[sx0,sy]of cs){const sxN=latticeRealX(sx0+dxGrid),syN=cellCenterYNorm(sy);for(let by=boardScanMin(g.board);by<ROWS;by++)for(let bx=0;bx<W2;bx++){if(!valid(bx,by)||!g.board[by][bx])continue;const ddx=Math.abs(sxN-latticeRealX(bx));if(ddx>=1-1e-9)continue;const d=(cellCenterYNorm(by)-syN)-Math.sqrt(Math.max(0,1-ddx*ddx));if(d>=-1e-8)maxDown=Math.min(maxDown,Math.max(0,d));}}
 if(!Number.isFinite(maxDown))maxDown=0;const rowOffset=Math.max(0,maxDown)/HEX_ROW_H;return cs.map(([x,y,c])=>[x+dxGrid,y+rowOffset,c]);
}

const REFERENCE_FALL_PX_PER_SEC=36.239736692842548;
const REFERENCE_BALL_PX=63.4;
const REFERENCE_ACTIVE_STEP_PX=2*REFERENCE_BALL_PX*HEX_ROW_H;
const DROP_INTERVAL=REFERENCE_ACTIVE_STEP_PX/REFERENCE_FALL_PX_PER_SEC;
const FAST_DROP_MULTIPLIER=5.8;
const LONG_PRESS_MS=260;
const GRAV=24.329692506794245;
const RELEASE_INITIAL_VY=3.788971974109861;
const REFERENCE_SLIDE_FRAMES=5,REFERENCE_VIDEO_FPS=30,GAME_FPS=120,GAME_FRAME=1/GAME_FPS,PHYSICS_HZ=120,PHYSICS_FRAME=1/PHYSICS_HZ;
const READY_DURATION=3.25,READY_RULE_END=1.30,READY_START_BEGIN=1.65,READY_START_END=2.72;
const SLIDE_60_DURATION=REFERENCE_SLIDE_FRAMES/REFERENCE_VIDEO_FPS;
const SLIDE_SPEED=(Math.PI/3)/SLIDE_60_DURATION;
const REFERENCE_SLOPE_HARD_FRAMES=4,SLOPE_HARD_DURATION=REFERENCE_SLOPE_HARD_FRAMES/REFERENCE_VIDEO_FPS,SLOPE_NORMAL_DURATION=SLIDE_60_DURATION;
const LANDING_ALIGN_DURATION=4/60;
const PIECE_SNAP_SPEED=14.0,CONTACT_LOCK_DELAY=LANDING_ALIGN_DURATION,ROTATE_VISUAL_TIME=.10;
const smoothRotationT=t=>t*t*(3-2*t);
const activeDropFraction=(g,renderLead=0)=>{if(!g||!g.piece||!pieceFits(g.board,{...g.piece,y:g.piece.y+2}))return 0;const scale=g.fastForward?FAST_DROP_MULTIPLIER:1,pred=g.dropT+Math.max(0,renderLead)*scale;return Math.min(.999,pred/g.dropInterval)*2;};
const CLEAR_SUPPORT_RELEASE_RATIO=.90;
const LEGACY_VISUAL_SUBSTEPS=4,MAX_PHYSICS_CATCHUP_STEPS=8;
const clearVisualState=k=>{k=Math.max(0,Math.min(1,k));const scale=Math.max(.04,1+Math.sin(Math.min(1,k/.5)*Math.PI*.5)*.3-Math.max(0,(k-.6)/.4)*1.1),alpha=k<.62?1:Math.max(0,1-(k-.62)/.38);return{scale,alpha};};
const GARBAGE_VISUAL_MAX=4.2,SETTLE_VISUAL_WATCHDOG=1.25,SPAWN_X=9;
const makeSet=g=>[0,1,2].map(()=>Math.floor(g.rng()*COLORS.length));
