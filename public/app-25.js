/* Authoritative scheduled pile-flow positions.
 *
 * pileFlow is an analytic absolute-time animation. Its scheduler has already
 * chosen collision-safe start/end times, so a ball whose segment has not yet
 * started must stay at the position implied by that schedule. The generic
 * visual contact solver used to classify every ball with fallPath as moving and
 * could therefore push future-scheduled balls a little on every frame. Those
 * tiny pushes accumulated until a waiting ball visibly entered settled garbage.
 *
 * Re-evaluate every currently scheduled pileFlow ball from the shared
 * pileFlowClock immediately before the generic contact solver. The solver is
 * still retained for sub-pixel residual precision; because the authoritative
 * position is restored every frame, its tiny numerical correction cannot
 * accumulate into a new trajectory or an intermediate lattice lock.
 */
function hexRestoreAuthoritativePileFlowPositions(g){
    if(!g||g.state!=="RESOLVING"||!g.board||!g.vis)return 0;
    const phaseAllows=g.phase==="SETTLE"||(g.phase==="CLEAR"&&g.clearing?.committed);
    if(!phaseAllows)return 0;
    let restored=0;
    const clock=Number(g.pileFlowClock)||0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const seg=ball.fallPath[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))continue;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        // A late-settled garbage support can become authoritative after the
        // original schedule was compiled. Repair that geometry before asking
        // pileFlowPositionAt() for the absolute-time centre.
        if(typeof hexGarbageAttachLateSettledPivot==="function"){
            hexGarbageAttachLateSettledPivot(g,ball,seg);
        }
        const p=pileFlowPositionAt(g,ball,clock);
        if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;
        v.x=p[0];
        v.y=p[1];
        restored++;
    }
    return restored;
}

const __hexResolveVisualContactsBeforeAuthoritativePileFlow=resolveVisualContacts;
resolveVisualContacts=function(g){
    hexRestoreAuthoritativePileFlowPositions(g);
    return __hexResolveVisualContactsBeforeAuthoritativePileFlow(g);
};
