/* Nintendo-reference inverted flat split v1.
 * DOWN triangle: stable lower-centre contact immediately releases both uppers.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallReferenceInvertedFlatSplitV1||typeof hexPhysPlanGroup!=="function"||typeof hexPhysPathHitsStationary!=="function")return;
window.__sixBallReferenceInvertedFlatSplitV1=true;
const basePlanGroup=hexPhysPlanGroup;
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
function lowerCentreFinal(board,bottom){
 if(!bottom)return false;
 if(typeof touchesFloorRow==="function"&&touchesFloorRow(bottom.y))return true;
 if(typeof hexPhysSupportInfo!=="function")return false;
 const s=hexPhysSupportInfo(board,bottom.x,bottom.y);
 // Some late physics authorities intentionally expose only contact objects and
 // omit the derived realCount field. The physical rule is two REAL lower ball
 // supports, so inspect those contacts directly instead of treating a missing
 // convenience counter as zero. A wall alone never satisfies this condition.
 if(s?.left?.ball&&s?.right?.ball)return true;
 return Number.isFinite(Number(s?.realCount))&&Number(s.realCount)>=2;
}
function targetFree(board,x,y,ownIds){if(typeof valid!=="function"||!valid(x,y))return false;const q=board?.[y]?.[x]||null;return!q||ownIds.has(q.id);}
function proposal(member,bottom,dir,bundleId){return{x:member.x,y:member.y,tx:member.x+dir,ty:member.y+1,ball:member.ball,kind:dir<0?"INVERTED_FLAT_SPLIT_LEFT":"INVERTED_FLAT_SPLIT_RIGHT",pivot:[bottom.x,bottom.y],topPivot:null,followSupportIds:[],bundleId,groupSize:0,referenceInvertedFlatSplit:true,referenceInvertedHardSplit:false};}
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
 const bundleId=Number(members[0]?.ball?.motionGroupId)||0,left=proposal(layout.left,layout.bottom,-1,bundleId),right=proposal(layout.right,layout.bottom,1,bundleId);
 diag.hard=false;diag.bundleId=bundleId;diag.leftHit=hexPhysPathHitsStationary(left,board,ownIds);diag.rightHit=hexPhysPathHitsStationary(right,board,ownIds);
 if(diag.leftHit||diag.rightHit){diag.reject="path";window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;return null;}
 diag.reject=null;diag.accept=true;window.__sixBallReferenceInvertedFlatSplitDiagnostic=diag;
 return{layout,plan:[left,right]};
}
hexPhysPlanGroup=function(board,members,preview=false){
 if(!ordinaryDownTriplet(members))return basePlanGroup(board,members,preview);
 const split=safeImmediateSplit(board,members);if(!split)return basePlanGroup(board,members,preview);
 if(!preview){
  const{left,right,bottom}=split.layout;
  if(typeof hexPhysClearGroupBall==="function")for(const m of members)hexPhysClearGroupBall(m.ball);else for(const m of members){m.ball.motionGroupId=0;m.ball.motionGroupSize=0;m.ball.rigid=false;}
  left.ball.momentumX=-1;left.ball.rollDir=-1;left.ball.subCellBias=-1;right.ball.momentumX=1;right.ball.rollDir=1;right.ball.subCellBias=1;bottom.ball.momentumX=0;bottom.ball.rollDir=0;bottom.ball.subCellBias=0;
  window.__sixBallLastReferenceInvertedFlatSplitV1={ids:{left:left.ball.id,right:right.ball.id,bottom:bottom.ball.id},hardDropTiming:false,duration:null,at:Date.now()};
 }
 return split.plan;
};
window.__sixBallReferenceInvertedFlatSplitVersion="reference-inverted-flat-split-v1";
window.__sixBallReferenceInvertedFlatSplitImmediate=true;
window.__sixBallReferenceInvertedHardSplitFrames=0;
window.__sixBallReferenceInvertedHardSplitFps=0;
window.__sixBallReferenceInvertedHardSplitDuration=0;
window.__sixBallHardDropUsesNormalInvertedSlopeTiming=true;
window.__sixBallReferenceInvertedNormalTimingUnchanged=true;
})();
