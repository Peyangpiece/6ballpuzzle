/* Garbage-affected parallel support-chain coherence.
 *
 * app-27 keeps parallel garbage siblings phase-locked, but a garbage member can
 * itself FOLLOW_SUPPORT on a normal pile ball. If that normal support belongs to
 * the corresponding parallel chain yet is evaluated independently, the garbage
 * sibling spacing is preserved at the cost of a tiny penetration into its own
 * support. Keep the entire support ancestry of currently moving garbage in one
 * coherent parallel family instead.
 *
 * Only balls reachable from a garbage ball through current pileFlow support
 * links are eligible. Unrelated normal pile motion is untouched.
 */
function hexParallelGarbageSupportClosure(g){
    const affected=new Set(),byId=new Map(),queue=[];
    if(!g?.board)return affected;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;
        byId.set(ball.id,ball);
        const seg=Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
        if(ball.isGarbage&&seg?.pileFlow){affected.add(ball.id);queue.push(ball);}
    }
    for(let qi=0;qi<queue.length;qi++){
        const ball=queue[qi],seg=Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
        if(!seg?.pileFlow)continue;
        for(const sid of pileFlowSupportIds(seg)){
            if(!sid||affected.has(sid))continue;
            const support=byId.get(sid)||pileFlowBallById(g,sid);
            if(!support)continue;
            affected.add(sid);
            queue.push(support);
        }
    }
    return affected;
}

hexGarbageParallelWaveRepresentative=function(g,ball,seg){
    const key=hexGarbageParallelWaveKey(seg);
    if(!key||!ball)return null;
    const affected=hexParallelGarbageSupportClosure(g);
    if(!affected.has(ball.id))return null;
    let bestBall=ball,bestSeg=seg,count=1;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const other=valid(x,y)?g.board[y][x]:null;
        if(!other||other===ball||!affected.has(other.id)||!Array.isArray(other.fallPath)||!other.fallPath.length)continue;
        const s=other.fallPath[0];
        if(hexGarbageParallelWaveKey(s)!==key)continue;
        if(pileFlowPhysicalDist(seg.from,s.from)>4.000001)continue;
        count++;
        if((other.id||0)<(bestBall.id||0)){bestBall=other;bestSeg=s;}
    }
    return count>1?{ball:bestBall,seg:bestSeg,key}:null;
};
