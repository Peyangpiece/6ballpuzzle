/* Keep future-scheduled pileFlow waiters exact while active motion may project.
 *
 * A segment whose pileFlowStart is still in the future is not a moving contact
 * body. Its scheduler-approved start centre is a fixed reservation. Generic
 * contact projection may correct currently active analytic paths for this frame,
 * but it must not displace future waiters and render them as if they had begun
 * moving early.
 */
const __hexResolveVisualContactsBeforeFutureWaiterLock=resolveVisualContacts;
const HEX_PILEFLOW_WAITER_EPS=1e-10;

function hexRestoreFuturePileFlowWaiters(g){
    if(typeof hexPileFlowPhaseAllowsAuthoritativeRestore!=="function"||
       !hexPileFlowPhaseAllowsAuthoritativeRestore(g)||!g?.board||!g?.vis)return 0;
    const clock=Number(g.pileFlowClock)||0;
    let restored=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const seg=ball.fallPath[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart))continue;
        if(clock>=seg.pileFlowStart-HEX_PILEFLOW_WAITER_EPS)continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        const p=pileFlowPositionAt(g,ball,clock);
        if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;
        v.x=p[0];v.y=p[1];v.vy=0;v.motionSpeed=0;
        restored++;
    }
    return restored;
}

resolveVisualContacts=function(g){
    const result=__hexResolveVisualContactsBeforeFutureWaiterLock(g);
    // app-31 already regenerates the analytic frame before solving. Re-lock only
    // not-yet-started segments afterwards; active segments keep the instantaneous
    // non-penetration correction and will be regenerated next physics frame.
    hexRestoreFuturePileFlowWaiters(g);
    return result;
};
