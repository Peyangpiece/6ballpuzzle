/* Future pileFlow waiters are fixed contact obstacles.
 *
 * The base visual contact solver decides mobility from _visualMovingIds OR the
 * mere presence of fallPath. A future-scheduled pileFlow ball therefore used to
 * receive half of a penetration correction even though its scheduled motion had
 * not started. Re-locking that waiter afterwards discarded its half and left
 * the active ball still inside it.
 *
 * During the contact solve only, hide future waiters' fallPath and moving flag.
 * The established 48-pass base solver then treats them as fixed obstacles and
 * applies the entire correction to active balls. Restore every logical path
 * immediately afterwards. No lattice snap is introduced: the waiter simply
 * remains at its scheduler-approved continuous start centre until start time.
 */
const __hexResolveVisualContactsBeforeFixedWaiters=resolveVisualContacts;

function hexWithFuturePileFlowWaitersFixed(g,fn){
    if(typeof hexPileFlowPhaseAllowsAuthoritativeRestore!=="function"||
       !hexPileFlowPhaseAllowsAuthoritativeRestore(g)||!g?.board)return fn();
    const clock=Number(g.pileFlowClock)||0;
    const held=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const seg=ball.fallPath[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart))continue;
        if(clock>=seg.pileFlowStart-1e-10)continue;
        held.push({ball,path:ball.fallPath,wasMoving:!!g._visualMovingIds?.has(ball.id)});
        delete ball.fallPath;
        g._visualMovingIds?.delete(ball.id);
    }
    try{return fn();}
    finally{
        for(const h of held){
            h.ball.fallPath=h.path;
            if(h.wasMoving)g._visualMovingIds?.add(h.ball.id);
        }
    }
}

resolveVisualContacts=function(g){
    if(typeof hexPileFlowPhaseAllowsAuthoritativeRestore==="function"&&
       hexPileFlowPhaseAllowsAuthoritativeRestore(g)){
        // Regenerate the non-accumulating continuous frame first.
        hexRestorePileFlowFrame(g);
        const baseSolve=typeof __hexResolveVisualContactsBeforeResidualPrecision==="function"
            ?__hexResolveVisualContactsBeforeResidualPrecision
            :__hexResolveVisualContactsBeforeAuthoritativePileFlow;
        const result=hexWithFuturePileFlowWaitersFixed(g,()=>baseSolve(g));
        // Both-fixed reservations should already be non-overlapping by schedule;
        // restore exact starts defensively without changing any active centre.
        if(typeof hexRestoreFuturePileFlowWaiters==="function")hexRestoreFuturePileFlowWaiters(g);
        if(typeof hexCanonicalizeFinishedPileVisuals==="function")hexCanonicalizeFinishedPileVisuals(g);
        return result;
    }
    return __hexResolveVisualContactsBeforeFixedWaiters(g);
};
