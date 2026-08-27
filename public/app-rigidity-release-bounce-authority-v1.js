/* Nintendo rigidity release + no-bounce authority v1.
 * Final guard after the reference rigidity stack.
 * - never queues a second ordinary-ball move while the previous visual path is active
 * - rebases a fresh segment to the ball's current rendered centre, preventing snap-back
 * - releases rigidity when a member is externally pinned and the remaining body cannot
 *   continue as a physically valid pivoting rigid body
 */
(function(){
if(typeof window==="undefined"||window.__sixBallRigidityReleaseBounceAuthorityV1||typeof hexPhysPlanGroup!=="function")return;
window.__sixBallRigidityReleaseBounceAuthorityV1=true;

const basePlanGroup=hexPhysPlanGroup;
const baseResolveEvent=typeof hexPhysResolveEvent==="function"?hexPhysResolveEvent:null;
const baseApplyEvent=typeof hexPhysApplyEvent==="function"?hexPhysApplyEvent:null;
const gameByBoard=new WeakMap();
const baseCreateEngine=typeof createEngine==="function"?createEngine:null;
if(baseCreateEngine){
 createEngine=function(...args){const g=baseCreateEngine(...args);if(g?.board)gameByBoard.set(g.board,g);return g;};
}

const FIELDS=["motionGroupId","motionGroupRole","motionGroupOrientation","motionGroupSize","rigid","momentumX","rollDir","subCellBias"];
const EPS=2e-5;
function id(v){return v?.ball?.id;}
function vec(p){if(!p)return null;const dx=Number(p.tx)-Number(p.x),dy=Number(p.ty)-Number(p.y);return Number.isFinite(dx)&&Number.isFinite(dy)&&(dx||dy)?{dx,dy,key:dx+","+dy}:null;}
function ordinary(members){return Array.isArray(members)&&(members.length===2||members.length===3)&&members.every(m=>m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage);}
function snap(members){return members.map(m=>({ball:m.ball,v:Object.fromEntries(FIELDS.map(k=>[k,{has:Object.prototype.hasOwnProperty.call(m.ball,k),value:m.ball[k]}]))}));}
function restore(s){for(const e of s)for(const[k,q]of Object.entries(e.v)){if(q.has)e.ball[k]=q.value;else delete e.ball[k];}}
function previewBase(board,members){const s=snap(members);let out=[];try{out=basePlanGroup(board,members,true)||[];}catch(_){out=[];}finally{restore(s);}return out;}
function clearMember(m){if(typeof hexPhysClearGroupBall==="function")hexPhysClearGroupBall(m.ball);else{m.ball.motionGroupId=0;m.ball.motionGroupRole=-1;m.ball.motionGroupOrientation="";m.ball.motionGroupSize=0;m.ball.rigid=false;}}
function clearAll(members){for(const m of members)clearMember(m);}
function actualMotions(board,members){return members.map(m=>{try{return typeof hexPhysNaturalMotion==="function"?hexPhysNaturalMotion(board,m.x,m.y,null)||null:null;}catch(_){return null;}});}
function externalSupport(board,members,m){
 const own=new Set(members.map(id));
 try{
  if(typeof hexPhysSupportInfo==="function"){
   const s=hexPhysSupportInfo(board,m.x,m.y,own);
   return{floor:!!s?.floor,realCount:Number(s?.realCount)||0,wall:!!s?.wallContact};
  }
 }catch(_){}
 return{floor:false,realCount:0,wall:false};
}
function externallyPinned(board,members,actual){
 const out=[];
 for(let i=0;i<members.length;i++){
  if(actual[i])continue;
  const s=externalSupport(board,members,members[i]);
  if(s.floor||s.realCount>0)out.push({member:members[i],support:s,index:i});
 }
 return out;
}
function liveBusy(game,ball){
 if(!game||!ball)return false;
 const v=game.vis?.get?.(ball.id),clock=game._liveBatchClock;
 return!!(
  (Array.isArray(ball.fallPath)&&ball.fallPath.length)||
  (game._visualMovingIds instanceof Set&&game._visualMovingIds.has(ball.id))||
  (clock?.states instanceof Map&&clock.states.has(ball.id)&&Number(clock.elapsed)<Number(clock.duration)-1e-9)||
  v?.pileFlow||v?._pendingPathComplete
 );
}
function anyBusy(board,members){const game=gameByBoard.get(board);return!!game&&members.some(m=>liveBusy(game,m.ball));}
function splitPlan(plan,size){const moving=(plan||[]).filter(vec);return moving.some(p=>Number(p.groupSize)!==size);}
function rigidPlan(plan,size){const moving=(plan||[]).filter(vec);return moving.length>0&&moving.every(p=>Number(p.groupSize)===size);}
function pairPivotValid(members,actual,plan){
 if(members.length!==2)return false;
 const steps=(plan||[]).filter(vec).filter(p=>Number(p.groupSize)===2);
 if(steps.length!==1)return false;
 const step=steps[0],movingIndex=members.findIndex(m=>id(m)===id(step));
 if(movingIndex<0)return false;
 const fixedIndex=1-movingIndex,fixed=members[fixedIndex],natural=actual[movingIndex];
 if(actual[fixedIndex]||!natural||!Array.isArray(step.pivot))return false;
 if(Number(step.pivot[0])!==Number(fixed.x)||Number(step.pivot[1])!==Number(fixed.y))return false;
 if(Number(step.tx)!==Number(natural.tx)||Number(step.ty)!==Number(natural.ty))return false;
 return Math.abs(hexPhysDist(step.tx,step.ty,fixed.x,fixed.y)-hexPhysDist(step.x,step.y,fixed.x,fixed.y))<=EPS;
}
function targetSafeAgainstMembers(board,members,p){
 if(!vec(p)||typeof valid==="function"&&!valid(p.tx,p.ty))return false;
 for(const m of members)if(id(m)!==id(p)&&Number(m.x)===Number(p.tx)&&Number(m.y)===Number(p.ty))return false;
 const q=board?.[p.ty]?.[p.tx]||null;
 if(q&&q.id!==id(p)&&!members.some(m=>id(m)===q.id&&Number(m.x)!==Number(p.tx)&&Number(m.y)!==Number(p.ty)))return false;
 try{if(typeof hexPhysPathHitsStationary==="function"&&hexPhysPathHitsStationary(p,board,new Set([id(p)])))return false;}catch(_){}
 return true;
}
function safeReleasedMotions(board,members,actual){
 return actual.filter(Boolean).filter(p=>targetSafeAgainstMembers(board,members,p)).map(p=>({...p,bundleId:0,groupSize:0,kind:String(p.kind||"NATURAL")+"_RIGID_RELEASE"}));
}
function shouldBreak(board,members,actual,plan){
 const pinned=externallyPinned(board,members,actual);
 if(!pinned.length)return{break:false,pinned};
 if(splitPlan(plan,members.length))return{break:false,pinned};
 if(members.length===2&&pairPivotValid(members,actual,plan))return{break:false,pinned};
 if(rigidPlan(plan,members.length))return{break:true,pinned,reason:"externally-pinned-rigid-motion"};
 if(actual.some(Boolean))return{break:true,pinned,reason:"externally-pinned-differential-motion"};
 return{break:true,pinned,reason:"externally-supported-rest"};
}

hexPhysPlanGroup=function(board,members,preview=false){
 if(!ordinary(members))return basePlanGroup(board,members,preview)||[];
 if(anyBusy(board,members)){
  window.__sixBallLastRigidityNoBounceDecision={reason:"visual-path-in-flight",ids:members.map(id),at:Date.now()};
  return[];
 }
 const plan=previewBase(board,members),actual=actualMotions(board,members),decision=shouldBreak(board,members,actual,plan);
 if(decision.break){
  const released=safeReleasedMotions(board,members,actual);
  if(!preview){
   clearAll(members);
   window.__sixBallLastRigidityReleaseDecision={reason:decision.reason,pinnedIds:decision.pinned.map(q=>id(q.member)),releasedIds:members.map(id),movingIds:released.map(id),at:Date.now()};
  }
  return released;
 }
 if(preview)return plan;
 return basePlanGroup(board,members,false)||[];
};

function ordinaryVisualMotionBusy(board){
 const game=gameByBoard.get(board);
 if(!game)return false;
 for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?board[y][x]:null;
  if(!ball||typeof ball!=="object"||ball.isGarbage)continue;
  if(liveBusy(game,ball))return true;
 }
 return false;
}

/*
 * Several legacy resolver fallbacks run AFTER group planning. If the final
 * group planner returns [] because its current fallPath is still being drawn,
 * those fallbacks used to mistake the temporary visual wait for a broken
 * constraint and manufacture a second logical move. That creates snap-back,
 * double-booked slope cells and visible stair-step jitter.
 *
 * A live ordinary-ball path is the authoritative motion until it finishes.
 * Garbage uses its own pileFlow timeline and is intentionally not blocked here.
 */
if(baseResolveEvent){
 hexPhysResolveEvent=function(board,preview=false){
  if(ordinaryVisualMotionBusy(board)){
   window.__sixBallLastResolverNoBounceDecision={reason:"ordinary-visual-path-in-flight",preview:!!preview,at:Date.now()};
   return[];
  }
  return baseResolveEvent(board,preview)||[];
 };
}

if(baseApplyEvent){
 hexPhysApplyEvent=function(board,accepted){
  const game=gameByBoard.get(board),origins=new Map();
  if(game&&Array.isArray(accepted))for(const p of accepted){
   const ball=p?.ball;if(!ball||typeof ball!=="object"||ball.isGarbage)continue;
   const v=game.vis?.get?.(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
   origins.set(ball.id,{x:Number(v.x),y:Number(v.y),before:Array.isArray(ball.fallPath)?ball.fallPath.length:0});
  }
  const moved=baseApplyEvent(board,accepted);
  if(moved&&game)for(const p of accepted||[]){
   const ball=p?.ball,o=origins.get(ball?.id);if(!o||!Array.isArray(ball.fallPath))continue;
   const seg=ball.fallPath[o.before];if(!seg?.from||!seg?.to)continue;
   const dx=(Number(seg.from[0])-o.x)*.5,dy=(Number(seg.from[1])-o.y)*HEX_ROW_H;
   if(Math.hypot(dx,dy)<=1e-7)continue;
   if(Number(seg.to[1])+1e-7<o.y)continue;
   seg.from=[o.x,o.y];
   seg.noBounceRebased=true;
  }
  return moved;
 };
}

window.__sixBallRigidityReleaseBounceVersion="rigidity-release-bounce-authority-v1";
window.__sixBallRigidityBlocksReplanWhileVisualBusy=true;
window.__sixBallResolverBlocksReplanWhileVisualBusy=true;
window.__sixBallFreshSegmentsStartAtRenderedCentre=true;
window.__sixBallExternallyPinnedMemberBreaksTriplet=true;
window.__sixBallValidPairPivotMayRetainRigidity=true;
window.__sixBallReleasedConstraintUsesActualBoardMotion=true;
})();
