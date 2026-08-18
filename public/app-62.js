/* Final garbage-side boundary convergence after the complete physics frame.
 *
 * This layer predates app-64.  Its original fallback measured the final
 * garbage-related contact distance and could invoke the global final solver up
 * to four extra times.  app-64 now owns the stronger final invariant: it runs
 * the global solve once and then a dedicated 64-pass unilateral garbage solver
 * that preserves monotone Y and synchronises continuous-rest authority.
 *
 * Therefore, on the current production stack, repeating the old app-62 global
 * solve is both redundant and expensive.  Keep the legacy fallback available
 * for builds without app-64, but delegate entirely to app-64 when that final
 * solver is present.
 */
const HEX_GARBAGE_FRAME_SAFE_DIST=1-1e-7;
const HEX_GARBAGE_FRAME_EXTRA_SOLVES=4;

function hexGarbageFrameMinDistance(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2||!items.some(q=>q.ball?.isGarbage))return Infinity;
    const buckets=typeof hexFinalBuckets==="function"?hexFinalBuckets(items):null;
    const pairs=buckets&&typeof hexFinalPairs==="function"?hexFinalPairs(items,buckets):[];
    let min=Infinity;
    for(const [a,b] of pairs){
        if(!a.ball?.isGarbage&&!b.ball?.isGarbage)continue;
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

    // app-64 is loaded after this file in the production stack. At runtime its
    // dedicated final garbage solver is therefore available and is the single
    // authority for end-of-frame garbage convergence. Do not run the obsolete
    // four global solves before it.
    if(typeof hex64ResolveFinalGarbageContacts==="function")return result;

    let min=hexGarbageFrameMinDistance(g);
    for(let i=0;i<HEX_GARBAGE_FRAME_EXTRA_SOLVES&&min<HEX_GARBAGE_FRAME_SAFE_DIST;i++){
        hexEnforceFinalVisualNonOverlap(g);
        min=hexGarbageFrameMinDistance(g);
    }
    return result;
};
