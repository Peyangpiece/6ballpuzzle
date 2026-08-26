/* Nintendo-reference inverted flat split v1.
 * DOWN triangle: stable lower-centre contact immediately releases both uppers.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallReferenceInvertedFlatSplitV1||typeof hexPhysPlanGroup!=="function"||typeof hexPhysPathHitsStationary!=="function")return;
window.__sixBallReferenceInvertedFlatSplitV1=true;
const basePlanGroup=hexPhysPlanGroup;
const baseHexMotionDuration=typeof hexMotionDuration==="function"?hexMotionDuration:null;
const liveEngineByBoard=new WeakMap();
const baseCreateEngine=typeof createEngine==="function"?createEngine:null;
const HARD_SPLIT_FRAMES=4,HARD_SPLIT_FPS=30;
const HARD_SPLIT_DURATION=(typeof SLOPE_HARD_DURATION==="number"&&Number.isFinite(SLOPE_HARD_DURATION))?SLOPE_HARD_DURATION:HARD_SPLIT_FRAMES/HARD_SPLIT_FPS;
const HARD_RELEASE_SPEED_MIN=4.75;
if(baseCreateEngine){createEngine=function(...args){const game=baseCreateEngine(...args);if(game?.board&&typeof game.board==="object")liveEngineByBoard.set(game.board,game);return game;};}
function ordinaryDownTriplet(members){return!!(Array.isArray(members)&&members.length===3&&members.every(m=>m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage)&&(members[0]?.orientation||members[0]?.ball?.motionGroupOrientation)==="down");}
function downLayout(members){
 if(!ordinaryDownTriplet(members))return null;
 const topY=Math.min(...members.map(m=>Number(m.y))),tops=members.filter(m=>Number(m.y)===topY).sort((a,b)=>a.x-b.x),lower=members.filter(m=>Number(m.y)!==topY);
 if(tops.length!==2||lower.length!==1)return null;
 const bottom=lower[0];
 if(Number(bottom.y)!==topY+1)return null;
 if(Number(tops[1].x)-Number(tops[0].x)!==2)return null;
 if(Number(bottom.x)!==(Number(tops[0].x)+Number(tops[1].x))/2)return null;
 return{left:tops[0],right:tops[1],bottom};
}
function lowerCentreFinal(board,bottom){if(!bottom)return false;if(typeof touchesFloorRow==="function"&&touchesFloorRow(bottom.y))return true;if(typeof hexPhysSupportInfo!=="function")return false;const s=hexPhysSupportInfo(board,bottom.x,bottom.y);return Number(s?.realCount||0)>=2;}
function targetFree(board,x,y,ownIds){if(typeof valid!=="function"||!valid(x,y))return false;const q=board?.[y]?.[x]||null;return!q||ownIds.has(q.id);}
function isLiveHardRelease(board,members){const game=liveEngineByBoard.get(board);if(!game?.vis)return false;let peak=0;for(const m of members){const v=game.vis.get(m.ball.id);if(!v?.justReleased)return false;peak=Math.max(peak,Number(v.motionSpeed)||0,Number(v.vy)||0);}return peak>=HARD_RELEASE_SPEED_MIN;}
function proposal(member,bottom,dir,bundleId,hard){return{x:member.x,y:member.y,tx:member.x+dir,ty:member.y+1,ball:member.ball,kind:hard?(dir<0?"REFERENCE_INVERTED_HARD_SPLIT_LEFT":"REFERENCE_INVERTED_HARD_SPLIT_RIGHT"):(dir<0?"INVERTED_FLAT_SPLIT_LEFT":"INVERTED_FLAT_SPLIT_RIGHT"),pivot:[bottom.x,bottom.y],topPivot:null,followSupportIds:[],bundleId,groupSize:0,referenceInvertedFlatSplit:true,referenceInvertedHardSplit:hard};}
function safeImmediateSplit(board,members){
 const diag={ordinary:ordinaryDownTriplet(members),ids:(members||[]).map(m=>m?.ball?.id),cells:(members||[]).map(m=>[m?.x,m?.y]),orientation:members?.[0]?.orientation||members?.[0]?.ball?.motionGroupOrientation||null};
 const layout=downLayout(members);diag.layout=layout?{left:[layout.left.x,layout.left.y],right:[layout.right.x,layout.right.y],bottom:[layout.bottom.x,layout.bottom.y]}:null;
 if(!layout){diag.reject="layout";window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;return null;}
 diag.lowerFinal=lowerCentreFinal(board,layout.bottom);
 if(!diag.lowerFinal){diag.reject="lower-not-final";window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;return null;}
 const ownIds=new Set(members.map(m=>m.ball.id)),leftTarget=[layout.left.x-1,layout.left.y+1],rightTarget=[layout.right.x+1,layout.right.y+1];
 diag.leftTarget={cell:leftTarget,valid:typeof valid==="function"?valid(...leftTarget):null,occupied:board?.[leftTarget[1]]?.[leftTarget[0]]?.id||null,free:targetFree(board,...leftTarget,ownIds)};
 diag.rightTarget={cell:rightTarget,valid:typeof valid==="function"?valid(...rightTarget):null,occupied:board?.[rightTarget[1]]?.[rightTarget[0]]?.id||null,free:targetFree(board,...rightTarget,ownIds)};
 if(!diag.leftTarget.free||!diag.rightTarget.free){diag.reject="target";window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;return null;}
 const hard=isLiveHardRelease(board,members),bundleId=Number(members[0]?.ball?.motionGroupId)||0,left=proposal(layout.left,layout.bottom,-1,bundleId,hard),right=proposal(layout.right,layout.bottom,1,bundleId,hard);
 diag.hard=hard;diag.bundleId=bundleId;diag.leftHit=hexPhysPathHitsStationary(left,board,ownIds);diag.rightHit=hexPhysPathHitsStationary(right,board,ownIds);
 if(diag.leftHit||diag.rightHit){diag.reject="path";window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;return null;}
 diag.reject=null;diag.accept=true;window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;
 return{layout,hard,plan:[left,right]};
}
hexPhysPlanGroup=function(board,members,preview=false){
 if(!ordinaryDownTriplet(members))return basePlanGroup(board,members,preview);
 const split=safeImmediateSplit(board,members);if(!split)return basePlanGroup(board,members,preview);
 if(!preview){
  const{left,right,bottom}=split.layout;
  if(typeof hexPhysClearGroupBall==="function")for(const m of members)hexPhysClearGroupBall(m.ball);else for(const m of members){m.ball.motionGroupId=0;m.ball.motionGroupSize=0;m.ball.rigid=false;}
  left.ball.momentumX=-1;left.ball.rollDir=-1;left.ball.subCellBias=-1;right.ball.momentumX=1;right.ball.rollDir=1;right.ball.subCellBias=1;bottom.ball.momentumX=0;bottom.ball.rollDir=0;bottom.ball.subCellBias=0;
  window.__sixBallLastReferenceInvertedFlatSplitV1={ids:{left:left.ball.id,right:right.ball.id,bottom:bottom.ball.id},hardDropTiming:split.hard,duration:split.hard?HARD_SPLIT_DURATION:null,sourceFrames:[567,571],at:Date.now()};
 }
 return split.plan;
};
if(baseHexMotionDuration){hexMotionDuration=function(seg,state={vy:0,speed:0}){const hard=/^REFERENCE_INVERTED_HARD_SPLIT_(LEFT|RIGHT)$/.test(String(seg?.kind||""));if(!hard)return baseHexMotionDuration(seg,state);const natural=baseHexMotionDuration(seg,state);if(Array.isArray(seg?.pivot)&&Array.isArray(seg?.from)&&Array.isArray(seg?.to)){const H=HEX_ROW_H,[px,py]=seg.pivot,a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*.5),a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*.5);let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;const speed=Math.abs(da)/Math.max(1e-9,HARD_SPLIT_DURATION);state.speed=speed;state.vy=Math.max(0,speed*Math.abs(Math.cos(a1))/H);}void natural;return HARD_SPLIT_DURATION;};}
window.__sixBallReferenceInvertedFlatSplitVersion="reference-inverted-flat-split-v1";
window.__sixBallReferenceInvertedFlatSplitImmediate=true;
window.__sixBallReferenceInvertedHardSplitFrames=HARD_SPLIT_FRAMES;
window.__sixBallReferenceInvertedHardSplitFps=HARD_SPLIT_FPS;
window.__sixBallReferenceInvertedHardSplitDuration=HARD_SPLIT_DURATION;
window.__sixBallReferenceInvertedNormalTimingUnchanged=true;
})();