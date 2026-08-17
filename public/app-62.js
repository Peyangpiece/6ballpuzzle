/* Final garbage-side boundary convergence after the complete physics frame.
 *
 * Normal accumulated-pile centres remain authoritative (app-59).  A continuous
 * rest garbage ball may be displaced by a moving normal pile ball, and that
 * displacement can propagate through a dense garbage contact chain. One local
 * 72-pass solve is usually enough, but seed-7 proves that a long chain can still
 * end the frame a few 1e-3 diameters inside the boundary.
 *
 * Do NOT re-enable normal-pile projection. Instead, after app-61 has finished
 * the whole frame transaction, measure only garbage-related contacts. If a real
 * penetration remains, run the same garbage-side solver up to three additional
 * times. Normal pile centres stay fixed; only garbage/rest centres yield and
 * app-51 persists their new continuous resting coordinates.
 */
const HEX_GARBAGE_FRAME_SAFE_DIST=1-1e-7;
const HEX_GARBAGE_FRAME_EXTRA_SOLVES=3;

function hexGarbageFrameMinDistance(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2||!items.some(q=>q.ball?.isGarbage))return Infinity;
    const buckets=typeof hexFinalBuckets==="function"?hexFinalBuckets(items):null;
    const pairs=buckets&&typeof hexFinalPairs==="function"?hexFinalPairs(items,buckets):[];
    let min=Infinity;
    for(const [a,b] of pairs){
        const d=hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y);
        if(d<min)min=d;
    }
    for(const q of items){delete q._hfi;delete q._hfbx;delete q._hfby;}
    return min;
}

const __hexStepBeforeGarbageBoundaryConvergence=stepEngine;
stepEngine=function(g,dt){
    const result=__hexStepBeforeGarbageBoundaryConvergence(g,dt);
    if(!g||g.state!=="RESOLVING")return result;
    let min=hexGarbageFrameMinDistance(g);
    for(let i=0;i<HEX_GARBAGE_FRAME_EXTRA_SOLVES&&min<HEX_GARBAGE_FRAME_SAFE_DIST;i++){
        hexEnforceFinalVisualNonOverlap(g);
        min=hexGarbageFrameMinDistance(g);
    }
    return result;
};
