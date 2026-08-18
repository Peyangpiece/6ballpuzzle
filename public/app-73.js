/* HEXDROP garbage-boundary scope repair.
 * app-62's comment and intent are garbage-side convergence, but its minimum
 * distance included every normal-normal pair whenever any garbage existed.
 * A harmless normal-pile round-off could therefore trigger four extra global
 * solves on every GARBAGE frame.  Measure only pairs with at least one garbage
 * member, exactly matching the stated invariant and the solver's purpose.
 */
hexGarbageFrameMinDistance=function(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2)return Infinity;
    const garbageIds=new Set(items.filter(q=>q.ball?.isGarbage).map(q=>q.ball.id));
    if(!garbageIds.size)return Infinity;
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
};
