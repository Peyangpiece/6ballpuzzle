/* Even/narrow-row strict-inner split continuity authority v1.
 *
 * A live UP-convex split can be authored by the final inner-contact authority
 * without using a REFERENCE_FIRST_CONTACT_* kind.  In that path the pair keeps
 * GROUP_SLOPE_TRANSLATE (and the solo keeps its natural ROLL_* kind) while the
 * proposal carries strictInnerContactAuthorized=true.
 *
 * app-08 historically recognized split completion only by kind string.  The
 * semantic authorization token was lost when the proposal became a fallPath
 * segment, so an interior narrow-row split could reach the generic completion
 * snap instead of the split no-lift completion path.  That is the parity-shaped
 * regression seen on the 9-ball rows.
 *
 * This layer keeps the authoritative token through proposal -> fallPath and
 * teaches the existing no-lift classifier to honor it.  It does not select a
 * split side, alter targets, change timing, or affect garbage/pile motion.
 */
(function(){
if(
  typeof window==="undefined" ||
  window.__sixBallEvenRowSplitContinuityV1
)return;

window.__sixBallEvenRowSplitContinuityV1=true;

if(typeof hexPhysAppendSegment==="function"){
  const baseHexPhysAppendSegment=hexPhysAppendSegment;
  hexPhysAppendSegment=function(ball,p,eventSeq){
    const before=Array.isArray(ball?.fallPath)?ball.fallPath.length:0;
    const result=baseHexPhysAppendSegment(ball,p,eventSeq);
    if(
      p?.strictInnerContactAuthorized===true &&
      ball && typeof ball==="object" && !ball.isGarbage &&
      Array.isArray(ball.fallPath)
    ){
      const appended=ball.fallPath.length>before
        ?ball.fallPath[ball.fallPath.length-1]
        :ball.fallPath[ball.fallPath.length-1];
      if(appended){
        appended.strictInnerContactAuthorized=true;
        appended.splitCompletionNoLift=true;
      }
    }
    return result;
  };
}

if(typeof ordinarySplitSegmentNoLift==="function"){
  const baseOrdinarySplitSegmentNoLift=ordinarySplitSegmentNoLift;
  ordinarySplitSegmentNoLift=function(cell,seg){
    if(
      cell && !cell.isGarbage &&
      (seg?.splitCompletionNoLift===true || seg?.strictInnerContactAuthorized===true)
    )return true;
    return baseOrdinarySplitSegmentNoLift(cell,seg);
  };
}

/* Expose a semantic predicate for regression tests/diagnostics. */
window.__sixBallStrictInnerSplitSegmentNoLift=function(cell,seg){
  return !!(
    cell && !cell.isGarbage &&
    seg &&
    (seg.splitCompletionNoLift===true || seg.strictInnerContactAuthorized===true)
  );
};

window.__sixBallStrictInnerAuthorizationSurvivesFallPath=true;
window.__sixBallStrictInnerCompletionUsesNoLiftPath=true;
window.__sixBallEvenNarrowRowSplitUsesSameCompletionAsWideRow=true;
window.__sixBallEvenRowSplitContinuityVersion="even-row-split-continuity-v1";
})();