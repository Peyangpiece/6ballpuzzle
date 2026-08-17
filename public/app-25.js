/* Authoritative scheduled pile-flow positions.
 *
 * pileFlow is an analytic absolute-time animation. Its scheduler has already
 * chosen collision-safe start/end times, so generic visual contact projection
 * must never become a second trajectory generator. In particular, future
 * scheduled balls previously drifted a little on every frame and could appear
 * to lock into / cut through lattice geometry before their motion actually
 * started.
 *
 * Restore analytic pileFlow centres both before AND after the generic contact
 * solver. The solver may still correct legacy/non-pileFlow motion, but it cannot
 * deform an absolute-time pileFlow path. Quiescent balls whose paths have
 * already ended are allowed a tiny canonical snap to their final logical cell;
 * that is the only place where lattice position is authoritative visually.
 */
const HEX_PILEFLOW_FINAL_SNAP_EPS=0.002;

function hexPileFlowPhaseAllowsAuthoritativeRestore(g){
    return !!g&&g.state==="RESOLVING"&&(
        g.phase==="SETTLE"||(g.phase==="CLEAR"&&g.clearing?.committed)
    );
}

function hexRestoreAuthoritativePileFlowPositions(g){
    if(!hexPileFlowPhaseAllowsAuthoritativeRestore(g)||!g.board||!g.vis)return 0;
    let restored=0;
    const clock=Number(g.pileFlowClock)||0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const seg=ball.fallPath[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))continue;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
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

function hexCanonicalizeFinishedPileVisuals(g){
    if(!hexPileFlowPhaseAllowsAuthoritativeRestore(g)||!g.board||!g.vis)return 0;
    let snapped=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||(Array.isArray(ball.fallPath)&&ball.fallPath.length))continue;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        if(pileFlowPhysicalDist([v.x,v.y],[x,y])>HEX_PILEFLOW_FINAL_SNAP_EPS)continue;
        v.x=x;
        v.y=y;
        v.vy=0;
        v.motionSpeed=0;
        snapped++;
    }
    return snapped;
}

function hexRestorePileFlowFrame(g){
    if(!hexPileFlowPhaseAllowsAuthoritativeRestore(g))return;
    hexRestoreAuthoritativePileFlowPositions(g);
    hexCanonicalizeFinishedPileVisuals(g);
}

const __hexResolveVisualContactsBeforeAuthoritativePileFlow=resolveVisualContacts;
resolveVisualContacts=function(g){
    hexRestorePileFlowFrame(g);
    const result=__hexResolveVisualContactsBeforeAuthoritativePileFlow(g);
    // Do not render the contact solver's displacement of an analytic path.
    // Any legitimate non-pileFlow correction has already been applied above.
    hexRestorePileFlowFrame(g);
    return result;
};
