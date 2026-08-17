/* Preserve spacing for parallel garbage support-follow chains. */
const HEX_GARBAGE_PARALLEL_SUPPORT_TOL_V2=0.0025;

hexGarbageParallelWaveKey=function(seg){
    if(!seg?.pileFlow||!seg.from||!seg.to||seg.pivot||seg.topPivot)return null;
    if(!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))return null;
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(Math.abs(dx)<1e-10&&Math.abs(dy)<1e-10)return null;
    return [
        seg.pileFlowStart.toFixed(9),seg.pileFlowEnd.toFixed(9),
        dx.toFixed(9),dy.toFixed(9),String(seg.kind||''),pileFlowSupportIds(seg).length
    ].join('|');
};

hexGarbageParallelWaveRepresentative=function(g,ball,seg){
    const key=hexGarbageParallelWaveKey(seg);
    if(!key||!ball?.isGarbage)return null;
    let bestBall=ball,bestSeg=seg,count=1;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const other=valid(x,y)?g.board[y][x]:null;
        if(!other||other===ball||!other.isGarbage||!Array.isArray(other.fallPath)||!other.fallPath.length)continue;
        const s=other.fallPath[0];
        if(hexGarbageParallelWaveKey(s)!==key)continue;
        if(pileFlowPhysicalDist(seg.from,s.from)>4.000001)continue;
        count++;
        if((other.id||0)<(bestBall.id||0)){bestBall=other;bestSeg=s;}
    }
    return count>1?{ball:bestBall,seg:bestSeg,key}:null;
};

function hexGarbageTranslatedParallelPoint(g,ball,seg,rep,q,t,depth,seen){
    if(rep.ball===ball){
        return __hexPileFlowPointForBallBeforeParallelGarbageCoherence(g,ball,seg,q,t,depth,seen);
    }
    if(seen?.has?.(rep.ball.id))return null;
    const rp=__hexPileFlowPointForBallBeforeParallelGarbageCoherence(g,rep.ball,rep.seg,q,t,depth,seen);
    if(!rp||!Number.isFinite(rp[0])||!Number.isFinite(rp[1]))return null;
    const candidate=[
        rp[0]+seg.from[0]-rep.seg.from[0],
        rp[1]+seg.from[1]-rep.seg.from[1]
    ];
    const supportIds=pileFlowSupportIds(seg);
    if(!supportIds.length)return candidate;
    const nextSeen=seen?new Set(seen):new Set();
    if(ball?.id)nextSeen.add(ball.id);
    for(const sid of supportIds){
        const support=pileFlowBallById(g,sid);
        if(!support)return null;
        const sp=pileFlowPositionAt(g,support,t,depth+1,nextSeen);
        if(!sp||Math.abs(pileFlowPhysicalDist(candidate,sp)-1)>HEX_GARBAGE_PARALLEL_SUPPORT_TOL_V2)return null;
    }
    return candidate;
}

pileFlowPointForBall=function(g,ball,seg,q,t,depth=0,seen=null){
    const rep=hexGarbageParallelWaveRepresentative(g,ball,seg);
    if(rep){
        const p=hexGarbageTranslatedParallelPoint(g,ball,seg,rep,q,t,depth,seen);
        if(p)return p;
    }
    return __hexPileFlowPointForBallBeforeParallelGarbageCoherence(g,ball,seg,q,t,depth,seen);
};
