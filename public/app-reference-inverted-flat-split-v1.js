/* Nintendo-reference inverted flat split v1.
 *
 * Absolute source frames from the 2026-08-14 Nintendo capture show a DOWN
 * triangle reaching a stable lower-centre contact on F567.  The lower centre
 * stays fixed while the two upper balls begin rolling outward immediately and
 * complete their 60-degree pivot arcs on F571: four 30 fps frame intervals.
 *
 * This authority fixes two separate things without changing unrelated motion:
 * 1. A genuinely stable DOWN lower-centre contact releases both upper balls in
 *    the SAME physics event.  There is no empty settle pass between contact and
 *    visible separation.
 * 2. Only a hard-drop hand-off (the live release speed used by hardDrop()) gets
 *    the measured 4/30 s arc. Normal arrival keeps the canonical slide timing.
 *
 * Safety remains canonical: both outward targets must be free and both pivot
 * arcs must pass the existing stationary-ball sweep check. Preview is read-only.
 */
(function(){
if(
  typeof window==="undefined" ||
  window.__sixBallReferenceInvertedFlatSplitV1 ||
  typeof hexPhysPlanGroup!=="function" ||
  typeof hexPhysPathHitsStationary!=="function"
)return;

window.__sixBallReferenceInvertedFlatSplitV1=true;
const basePlanGroup=hexPhysPlanGroup;
const baseHexMotionDuration=typeof hexMotionDuration==="function"?hexMotionDuration:null;
const liveEngineByBoard=new WeakMap();
const baseCreateEngine=typeof createEngine==="function"?createEngine:null;
const HARD_SPLIT_FRAMES=4;
const HARD_SPLIT_FPS=30;
const HARD_SPLIT_DURATION=(typeof SLOPE_HARD_DURATION==="number"&&Number.isFinite(SLOPE_HARD_DURATION))
  ?SLOPE_HARD_DURATION
  :HARD_SPLIT_FRAMES/HARD_SPLIT_FPS;
const HARD_RELEASE_SPEED_MIN=4.75;

if(baseCreateEngine){
  createEngine=function(...args){
    const game=baseCreateEngine(...args);
    if(game?.board&&typeof game.board==="object")liveEngineByBoard.set(game.board,game);
    return game;
  };
}

function ordinaryDownTriplet(members){
  return !!(
    Array.isArray(members)&&members.length===3&&
    members.every(m=>m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage)&&
    (members[0]?.orientation||members[0]?.ball?.motionGroupOrientation)==="down"
  );
}

function downLayout(members){
  if(!ordinaryDownTriplet(members))return null;
  const topY=Math.min(...members.map(m=>Number(m.y)));
  const tops=members.filter(m=>Number(m.y)===topY).sort((a,b)=>a.x-b.x);
  const lower=members.filter(m=>Number(m.y)!==topY);
  if(tops.length!==2||lower.length!==1)return null;
  const bottom=lower[0];
  if(Number(bottom.y)!==topY+1)return null;
  if(Number(tops[1].x)-Number(tops[0].x)!==2)return null;
  if(Number(bottom.x)!==(Number(tops[0].x)+Number(tops[1].x))/2)return null;
  return{left:tops[0],right:tops[1],bottom};
}

function lowerCentreFinal(board,bottom){
  if(!bottom)return false;
  if(typeof touchesFloorRow==="function"&&touchesFloorRow(bottom.y))return true;
  if(typeof hexPhysSupportInfo!=="function")return false;
  const s=hexPhysSupportInfo(board,bottom.x,bottom.y);
  return Number(s?.realCount||0)>=2;
}

function targetFree(board,x,y,ownIds){
  if(typeof valid!=="function"||!valid(x,y))return false;
  const q=board?.[y]?.[x]||null;
  return !q||ownIds.has(q.id);
}

function isLiveHardRelease(board,members){
  const game=liveEngineByBoard.get(board);
  if(!game?.vis)return false;
  let peak=0;
  for(const m of members){
    const v=game.vis.get(m.ball.id);
    if(!v?.justReleased)return false;
    peak=Math.max(peak,Number(v.motionSpeed)||0,Number(v.vy)||0);
  }
  return peak>=HARD_RELEASE_SPEED_MIN;
}

function proposal(member,bottom,dir,bundleId,hard){
  return{
    x:member.x,y:member.y,
    tx:member.x+dir,ty:member.y+1,
    ball:member.ball,
    kind:hard
      ?(dir<0?"REFERENCE_INVERTED_HARD_SPLIT_LEFT":"REFERENCE_INVERTED_HARD_SPLIT_RIGHT")
      :(dir<0?"INVERTED_FLAT_SPLIT_LEFT":"INVERTED_FLAT_SPLIT_RIGHT"),
    pivot:[bottom.x,bottom.y],
    topPivot:null,
    followSupportIds:[],
    bundleId,
    groupSize:0,
    referenceInvertedFlatSplit:true,
    referenceInvertedHardSplit:hard
  };
}

function safeImmediateSplit(board,members){
  const layout=downLayout(members);
  if(!layout||!lowerCentreFinal(board,layout.bottom))return null;

  const ownIds=new Set(members.map(m=>m.ball.id));
  const leftTarget=[layout.left.x-1,layout.left.y+1];
  const rightTarget=[layout.right.x+1,layout.right.y+1];
  if(!targetFree(board,leftTarget[0],leftTarget[1],ownIds))return null;
  if(!targetFree(board,rightTarget[0],rightTarget[1],ownIds))return null;

  const hard=isLiveHardRelease(board,members);
  const bundleId=Number(members[0]?.ball?.motionGroupId)||0;
  const left=proposal(layout.left,layout.bottom,-1,bundleId,hard);
  const right=proposal(layout.right,layout.bottom,1,bundleId,hard);

  if(hexPhysPathHitsStationary(left,board,ownIds))return null;
  if(hexPhysPathHitsStationary(right,board,ownIds))return null;

  return{layout,hard,plan:[left,right]};
}

hexPhysPlanGroup=function(board,members,preview=false){
  if(!ordinaryDownTriplet(members))return basePlanGroup(board,members,preview);
  const split=safeImmediateSplit(board,members);
  if(!split)return basePlanGroup(board,members,preview);

  if(!preview){
    const {left,right,bottom}=split.layout;
    if(typeof hexPhysClearGroupBall==="function"){
      for(const m of members)hexPhysClearGroupBall(m.ball);
    }else{
      for(const m of members){m.ball.motionGroupId=0;m.ball.motionGroupSize=0;m.ball.rigid=false;}
    }
    left.ball.momentumX=-1;left.ball.rollDir=-1;left.ball.subCellBias=-1;
    right.ball.momentumX=1;right.ball.rollDir=1;right.ball.subCellBias=1;
    bottom.ball.momentumX=0;bottom.ball.rollDir=0;bottom.ball.subCellBias=0;

    window.__sixBallLastReferenceInvertedFlatSplitV1={
      ids:{left:left.ball.id,right:right.ball.id,bottom:bottom.ball.id},
      hardDropTiming:split.hard,
      duration:split.hard?HARD_SPLIT_DURATION:null,
      sourceFrames:[567,571],
      at:Date.now()
    };
  }
  return split.plan;
};

if(baseHexMotionDuration){
  hexMotionDuration=function(seg,state={vy:0,speed:0}){
    const hard=/^REFERENCE_INVERTED_HARD_SPLIT_(LEFT|RIGHT)$/.test(String(seg?.kind||""));
    if(!hard)return baseHexMotionDuration(seg,state);

    // Keep the same endpoint and constant-angle interpolation, but use the
    // measured four-frame collision budget and pass its tangential speed into
    // any legal continuation instead of the slower five-frame default.
    const natural=baseHexMotionDuration(seg,state);
    if(Array.isArray(seg?.pivot)&&Array.isArray(seg?.from)&&Array.isArray(seg?.to)){
      const H=HEX_ROW_H,[px,py]=seg.pivot;
      const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*.5);
      const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*.5);
      let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
      const speed=Math.abs(da)/Math.max(1e-9,HARD_SPLIT_DURATION);
      state.speed=speed;
      state.vy=Math.max(0,speed*Math.abs(Math.cos(a1))/H);
    }
    void natural;
    return HARD_SPLIT_DURATION;
  };
}

window.__sixBallReferenceInvertedFlatSplitVersion="reference-inverted-flat-split-v1";
window.__sixBallReferenceInvertedFlatSplitImmediate=true;
window.__sixBallReferenceInvertedHardSplitFrames=HARD_SPLIT_FRAMES;
window.__sixBallReferenceInvertedHardSplitFps=HARD_SPLIT_FPS;
window.__sixBallReferenceInvertedHardSplitDuration=HARD_SPLIT_DURATION;
window.__sixBallReferenceInvertedNormalTimingUnchanged=true;
})();
