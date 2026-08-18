/* Post-split garbage rigidity invariant.
 *
 * Garbage still uses the ordinary gravity/path solver. This layer only enforces
 * the requested structural invariant: once a garbage member is independent
 * after a split/release, it must remain a single ball (rigid = false,
 * motionGroupId = 0, motionGroupSize = 0) until and after it reaches rest.
 * Contact geometry (pivot/topPivot/followSupportIds) is intentionally preserved
 * so ordinary arc/sliding motion is unchanged.
 */
(function installGarbageZeroRigidity(){
    if(typeof window==="undefined"||window.__hexGarbageZeroRigidity)return;
    window.__hexGarbageZeroRigidity=true;

    function releasedGarbage(ball){
        return !!ball?.isGarbage&&ball.garbageSplitReleased===true;
    }
    function clearReleasedBall(ball){
        if(!releasedGarbage(ball))return;
        hexPhysClearGroupBall(ball);
        ball.rigid=false;
        ball.motionGroupId=0;
        ball.motionGroupSize=0;
        if(Array.isArray(ball.fallPath))for(const seg of ball.fallPath){
            if(!seg)continue;
            seg.bundleId=0;
            seg.groupSize=0;
            seg.garbageIndependentAfterSplit=true;
        }
    }
    function markCurrentIncoming(g){
        if(!g?.board)return;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage||ball.garbagePhaseFrozen)continue;
            // The current incoming-garbage runtime releases each shaped member
            // into ordinary single-ball physics. Treat that release as the
            // split boundary and never allow a later two-ball re-rigidification.
            ball.garbageSplitReleased=true;
            clearReleasedBall(ball);
        }
    }
    function releaseSplitMembers(members,plan){
        for(const m of members||[]){
            const ball=m?.ball;
            if(!ball?.isGarbage)continue;
            ball.garbageSplitReleased=true;
            clearReleasedBall(ball);
        }
        for(const p of plan||[])if(p?.ball?.isGarbage){
            p.bundleId=0;
            p.groupSize=0;
            p.garbageIndependentAfterSplit=true;
        }
    }

    // Detect every canonical group split, including the one-pinned-member path
    // and the up-convex 2+1 separator. A full three-ball rigid continuation is
    // left untouched; only a true reduction/split releases rigidity.
    const basePlanGroup=hexPhysPlanGroup;
    hexPhysPlanGroup=function(board,members,preview=false){
        const originalSize=Array.isArray(members)?members.length:0;
        const hasGarbage=Array.isArray(members)&&members.some(m=>m?.ball?.isGarbage);
        const plan=basePlanGroup(board,members,preview);
        if(preview||!hasGarbage||!plan?.length)return plan;
        const split=
            plan.length!==originalSize||
            plan.some(p=>p?.ball?.isGarbage&&((p.groupSize||0)!==originalSize||!p.bundleId))||
            members.some(m=>m?.ball?.isGarbage&&((m.ball.motionGroupSize||0)!==originalSize||!m.ball.motionGroupId));
        if(split)releaseSplitMembers(members,plan);
        return plan;
    };

    // Once released, no later helper may rebuild a rigid pair/group from those
    // garbage members. Ordinary balls continue to use the original function.
    const baseSetGroup=hexPhysSetGroup;
    hexPhysSetGroup=function(members,size,orientation=""){
        if(Array.isArray(members)&&members.some(m=>releasedGarbage(m?.ball))){
            for(const m of members)clearReleasedBall(m?.ball);
            return 0;
        }
        return baseSetGroup(members,size,orientation);
    };

    // Sanitize group metadata immediately after each logical event so a split
    // cannot survive even for one 120 Hz frame. Do not touch motionSeq,
    // pivot/topPivot or followSupportIds: those are ordinary motion geometry,
    // not rigidity.
    const baseApplyEvent=hexPhysApplyEvent;
    hexPhysApplyEvent=function(board,accepted){
        const moved=baseApplyEvent(board,accepted);
        if(moved&&board){
            for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
                const ball=valid(x,y)?board[y][x]:null;
                clearReleasedBall(ball);
            }
        }
        return moved;
    };

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        markCurrentIncoming(g);
        const r=baseUpdateGarbagePacks(g,dt);
        markCurrentIncoming(g);
        return r;
    };

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        markCurrentIncoming(g);
        const r=baseUpdateVisuals(g,dt);
        markCurrentIncoming(g);
        return r;
    };

    window.__hexGarbageSplitRigidityZero=true;
})();
