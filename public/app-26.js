/* Parallel garbage pile-flow coherence.
 *
 * Two adjacent garbage balls can enter SETTLE with the same scheduled start,
 * end and translation vector but different inherited entry speeds. app-21 then
 * builds slightly different gravity-progress profiles for each ball. Even
 * though both paths are individually valid, the pair no longer translates as
 * one contact-preserving row and can briefly approach closer than one diameter.
 *
 * For support-free garbage segments that are genuinely the same translation
 * wave, use one deterministic representative's continuous progress for every
 * member. This does not snap to the lattice: centres still move continuously
 * between their own from/to points. It only keeps parallel neighbours phase-
 * locked so their relative vector, and therefore their separation, is exact.
 */
const __hexPileFlowPointForBallBeforeParallelGarbageCoherence=pileFlowPointForBall;

function hexGarbageParallelWaveKey(seg){
    if(!seg?.pileFlow||!seg.from||!seg.to)return null;
    if(seg.pivot||seg.topPivot||pileFlowSupportIds(seg).length)return null;
    if(!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))return null;
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(Math.abs(dx)<1e-10&&Math.abs(dy)<1e-10)return null;
    return[
        seg.pileFlowStart.toFixed(9),seg.pileFlowEnd.toFixed(9),
        dx.toFixed(9),dy.toFixed(9)
    ].join('|');
}

function hexGarbageParallelWaveRepresentative(g,ball,seg){
    const key=hexGarbageParallelWaveKey(seg);
    if(!key||!ball?.isGarbage)return null;
    let bestBall=ball,bestSeg=seg,count=1;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const other=valid(x,y)?g.board[y][x]:null;
        if(!other||other===ball||!other.isGarbage||!Array.isArray(other.fallPath)||!other.fallPath.length)continue;
        const s=other.fallPath[0];
        if(hexGarbageParallelWaveKey(s)!==key)continue;
        // Synchronize only members whose start positions belong to the same
        // local row/cluster. This avoids coupling distant coincidental motions.
        const startDist=pileFlowPhysicalDist(seg.from,s.from);
        if(startDist>4.000001)continue;
        count++;
        if((other.id||0)<(bestBall.id||0)){bestBall=other;bestSeg=s;}
    }
    return count>1?{ball:bestBall,seg:bestSeg,key}:null;
}

pileFlowPointForBall=function(g,ball,seg,q,t,depth=0,seen=null){
    const rep=hexGarbageParallelWaveRepresentative(g,ball,seg);
    if(rep){
        // Shared scalar progress + each member's own endpoints = exact parallel
        // translation. Gravity remains continuous; only relative phase is tied.
        const s=typeof hexPileGravityFraction==="function"
            ?hexPileGravityFraction(rep.seg,Math.max(0,Math.min(1,q)))
            :Math.max(0,Math.min(1,q));
        return[
            seg.from[0]+(seg.to[0]-seg.from[0])*s,
            seg.from[1]+(seg.to[1]-seg.from[1])*s
        ];
    }
    return __hexPileFlowPointForBallBeforeParallelGarbageCoherence(g,ball,seg,q,t,depth,seen);
};
