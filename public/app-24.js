/* Late settled-garbage tangent priority.
 *
 * A pile-flow segment may have been planned before a garbage ball reached its
 * final lattice cell. Once that garbage is settled, if the segment's start and
 * end are both exactly tangent to it, the fixed garbage circle is a hard
 * geometric constraint. It must outrank stale inferred supports AND a stale
 * topPivot/free-fall plan; otherwise the rendered centre can cut through the
 * settled garbage while the logical destination remains valid.
 */
hexGarbageAttachLateSettledPivot=function(g,cell,seg){
    if(!g||!cell||!seg?.pileFlow)return false;
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

        const alreadyExact=
            Array.isArray(seg.pivot)&&seg.pivot[0]===px&&seg.pivot[1]===py&&
            !seg.topPivot&&pileFlowSupportIds(seg).length===0;
        if(alreadyExact)return false;

        // The settled garbage ball is physically present for the whole move.
        // A previously compiled topPivot path can describe free fall through
        // this circle, so replace it rather than merely adding another hint.
        seg.followSupportIds=[];
        seg.movingSupportId=0;
        delete seg.pileFlowInferredSupport;
        delete seg.pileFlowStaticContact;
        seg.topPivot=null;
        seg.pivot=[px,py];
        seg.pileFlowLateGarbagePivot=true;
        seg.pileFlowSettledGarbagePriority=true;

        delete seg._hexGravityLinear;
        delete seg._hexGravityProfile;
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
