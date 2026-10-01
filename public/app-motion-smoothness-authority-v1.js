/* Motion smoothness authority v1.
 * Scope: ordinary non-pile motion only.
 * Garbage and accumulated-pile presentation intentionally retain the exact
 * pre-smoothness timing/projection path.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallMotionSmoothnessAuthorityV1)return;
window.__sixBallMotionSmoothnessAuthorityV1=true;

// Ordinary contact chains must not lose an entire display frame at every
// segment boundary on 30/60 Hz screens. Advance their existing 120 Hz physics
// clock in bounded substeps; legacy accumulated/garbage animation is unchanged.
if(typeof updateVisuals==="function"){
  const baseUpdateVisuals=updateVisuals;
  updateVisuals=function(g,dt){
    if(!(dt>PHYSICS_FRAME+1e-9)||!g?.board)return baseUpdateVisuals(g,dt);
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const b=valid(x,y)?g.board[y][x]:null;
      if(b&&(b.isGarbage||(b.fallPath||[]).some(s=>s.pileFlow||s.pileGravityFall)))return baseUpdateVisuals(g,dt);
    }
    let remaining=dt,result;
    while(remaining>1e-9){const step=Math.min(PHYSICS_FRAME,remaining);result=baseUpdateVisuals(g,step);remaining-=step;}
    return result;
  };
}

if(typeof liveBatchPointAt==="function"){
  const baseLiveBatchPointAt=liveBatchPointAt;

  function isReferenceSplitBatch(batch){
    const members=batch?.members||[];
    return members.some(m=>Number(m.seg?.groupSize)===2) &&
           members.some(m=>Number(m.seg?.groupSize)===0) &&
           !members.some(m=>m.seg?.kind==="FOLLOW_SUPPORT");
  }
  function hasSupportDependency(batch){
    return (batch?.members||[]).some(m=>
      m.seg?.kind==="FOLLOW_SUPPORT" ||
      (Array.isArray(m.seg?.followSupportIds)&&m.seg.followSupportIds.length)
    );
  }
  function isLegacyPileOrGarbageBatch(batch){
    return (batch?.members||[]).some(m=>
      !!m?.cell?.isGarbage ||
      !!m?.seg?.pileFlow ||
      !!m?.seg?.pileGravityFall
    );
  }
  function naturalDuration(member,states){
    const state=states?.get(member?.cell?.id);
    return Math.max(1e-9,Number(state?.naturalDuration)||Number(member?.duration)||1/120);
  }

  liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
    if(
      !member ||
      isLegacyPileOrGarbageBatch(batch) ||
      isReferenceSplitBatch(batch) ||
      hasSupportDependency(batch)
    ){
      return baseLiveBatchPointAt(batch,member,t,states,memo,stack);
    }

    const elapsed=Math.max(0,Number(t)||0)*
      Math.max(1e-9,Number(batch?.duration)||naturalDuration(member,states));
    const size=Number(member.seg?.groupSize)||0;
    const bundle=Number(member.seg?.bundleId)||0;
    let cohortDuration=naturalDuration(member,states);

    if(size>=2&&bundle){
      const cohort=(batch?.members||[]).filter(m=>
        (Number(m.seg?.groupSize)||0)===size &&
        (Number(m.seg?.bundleId)||0)===bundle
      );
      cohortDuration=Math.max(cohortDuration,...cohort.map(m=>naturalDuration(m,states)));
    }

    const localT=Math.max(0,Math.min(1,elapsed/cohortDuration));
    return baseLiveBatchPointAt(batch,member,localT,states,memo,stack);
  };
}

window.__sixBallIndependentLiveBatchUsesNaturalTime=true;
window.__sixBallRigidCohortClockPreserved=true;
window.__sixBallReferenceSplitTimingPreserved=true;
window.__sixBallFollowSupportTimingPreserved=true;
window.__sixBallPileMotionPreservesPreSmoothnessPath=true;
window.__sixBallGarbageMotionPreservesPreSmoothnessPath=true;
window.__sixBallMotionSmoothnessScope="ordinary-non-pile-only";
})();
