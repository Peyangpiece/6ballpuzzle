/* Late settled-garbage tangent priority.
 *
 * app-23 can discover a newly-settled garbage pivot at render time. Some long
 * clear/settle chains still carry an older inferred followSupportIds relation,
 * which caused that repair to be skipped even though the segment's two lattice
 * endpoints are both exactly tangent to the now-settled garbage ball.
 *
 * A fixed ball occupying that equilateral-corner position is a hard geometric
 * constraint: the moving centre must travel on its unit circle and may not cut
 * the chord through the ball. Prefer that exact fixed constraint and discard
 * only the stale inferred support relation for this segment.
 */
hexGarbageAttachLateSettledPivot=function(g,cell,seg){
    if(!g||!cell||!seg?.pileFlow||seg.pivot||seg.topPivot)return false;
    if(!seg.from||!seg.to)return false;
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(dy!==1||Math.abs(dx)!==1)return false;

    const candidates=[
        [seg.from[0]+2*dx,seg.from[1]],
        [seg.from[0]-dx,seg.from[1]+1]
    ];
    for(const [px,py]of candidates){
        if(!valid(px,py))continue;
        const support=g.board[py][px];
        if(!support||support===cell||!support.isGarbage||hexGarbageBallStillMoving(support))continue;
        const d0=hexGarbageContinuousDist(seg.from,[px,py]);
        const d1=hexGarbageContinuousDist(seg.to,[px,py]);
        if(Math.abs(d0-1)>1e-6||Math.abs(d1-1)>1e-6)continue;

        // This fixed tangent obstacle is physically authoritative. Old inferred
        // moving-support metadata can otherwise make pileFlowPointForBall ignore
        // seg.pivot and drive the centre through the settled garbage ball.
        seg.followSupportIds=[];
        seg.movingSupportId=0;
        delete seg.pileFlowInferredSupport;
        delete seg.pileFlowStaticContact;
        seg.pivot=[px,py];
        seg.pileFlowLateGarbagePivot=true;
        seg.pileFlowSettledGarbagePriority=true;

        delete seg._hexGravityLinear;
        if(typeof hexBuildPileGravityArcProfile==="function"){
            const v0=Math.max(
                typeof HEX_PILE_GRAVITY_MIN_SPEED==="number"?HEX_PILE_GRAVITY_MIN_SPEED:0.35,
                Number(seg._hexGravityEntrySpeed)||0.35
            );
            const profile=hexBuildPileGravityArcProfile(seg,v0);
            if(profile)seg._hexGravityProfile=profile;
        }
        return true;
    }
    return false;
};
