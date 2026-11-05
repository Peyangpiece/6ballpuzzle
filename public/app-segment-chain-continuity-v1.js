/* Segment chain continuity v1.
 *
 * A ball that rolls or slides over several cells moves one segment at a
 * time. Segment clocks are not whole numbers of visual substeps, so a segment
 * usually ends early in a substep; the rest of that step then has no segment
 * to show, because the next one is only planned by the physics that runs
 * after the visual pass (app-09.js stepEngine). The ball therefore stood
 * still for one whole frame at every cell boundary (a visible stutter in
 * multi-cell rolls and slides), then went on.
 *
 * This layer measures the time left unused after a segment completes within a
 * step and, once that step's physics has planned the next segment, advances
 * the new segment by exactly that time through the same visual integrator,
 * then runs the usual contact pass. Total motion time and every path are
 * unchanged; only the idle frame between segments is removed. Pile flow and
 * garbage are not live-batch motion and are not affected.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallSegmentChainContinuityV1)return;
if(typeof stepEngine!=="function"||typeof updateVisuals!=="function"||typeof collectLiveMotionBatch!=="function")return;
window.__sixBallSegmentChainContinuityV1=true;

const baseUpdateVisuals=updateVisuals;
updateVisuals=function(g,dt){
  if(!g?._chainGap)return baseUpdateVisuals.apply(this,arguments);
  const c=g._liveBatchClock,seq=c?.seq||0,elapsed=Number(c?.elapsed)||0,duration=Number(c?.duration)||0;
  const r=baseUpdateVisuals.apply(this,arguments);
  const after=g._liveBatchClock?.seq||0;
  const step=Math.max(0,Number(dt)||0);
  if(seq&&!after){
    // Completed during this call: the part of dt beyond the segment's end.
    g._chainGap.t+=Math.max(0,Math.min(step,elapsed+step-duration));
    g._chainGap.open=true;
  }else if(!seq&&!after&&g._chainGap.open){
    g._chainGap.t+=step;
  }else if(after){
    g._chainGap.open=false;g._chainGap.t=0;
  }
  return r;
};

const baseStepEngine=stepEngine;
stepEngine=function(g,dt){
  if(!g||typeof g!=="object")return baseStepEngine.apply(this,arguments);
  g._chainGap={t:0,open:false};
  let r;
  try{r=baseStepEngine.apply(this,arguments);}
  finally{
    const gap=g._chainGap;g._chainGap=null;
    const frame=typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120;
    const t=gap&&gap.open?Math.min(gap.t,frame):0;
    if(t>1e-9&&g.state==="RESOLVING"&&!g.matchFrozen&&!(g._liveBatchClock?.seq)){
      const next=collectLiveMotionBatch(g);
      if(next){
        updateVisuals(g,t);
        if(typeof resolveVisualContacts==="function")resolveVisualContacts(g);
        window.__sixBallLastChainGapFill={t,seq:next.seq};
      }
    }
  }
  return r;
};

window.__sixBallSegmentChainContinuityVersion="segment-chain-continuity-v1";
})();
