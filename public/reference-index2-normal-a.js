/* index-2 exact normal motion A: copied verbatim from user-provided index-2.html */
function normalizePileBallPhysics(ball){
    if(!ball||typeof ball!=="object")return;

    ball.rigid=false;
    ball.fixedGarbage=false;

    ball.shapeHeld=false;
    ball.shapeGroupId=0;
    ball.shapeOrientation="";
    ball.shapeRole=-1;

    ball.slopeRigidGroupId=0;
    ball.slopeRigidRole=-1;
    ball.slopeRigidOrientation="";
    ball.slopeRigidActive=false;

    ball.forceSplit=false;
    ball.fallBias=0;
    ball.fallBiasTTL=0;

    // All landing-triplet visual gates are also invalid after a ball joins the
    // pile. Leaving any of these alive can create a one-segment wait even
    // though the physical ball itself is already independent.
    ball.visualTripletId=0;
    ball.visualTripletOrientation="";
    ball.visualTripletRole=-1;
    ball.visualReleaseGroupId=0;
    ball.visualReleaseOrientation="";
    ball.visualReleaseGateRoles=[];
    ball.visualPreReleaseRemaining=0;
    ball.visualSyncSplitGroup=0;
    ball.visualSyncSplitStage=0;

    // Pile motion is determined only by the live contact solver.
    // Keep momentum/rollDir because these describe ordinary single-ball motion,
    // not rigidity.
}

function applySlopeRigidTranslation(b,members,dx,dy){
    const motionSeq=LIVE_MOTION_SEQ++;
    const fastImpact=members.some(m=>!!m.ball.slopeImpactFast);
    const slopeDuration=fastImpact
        ? SLOPE_HARD_DURATION
        : SLOPE_NORMAL_DURATION;

    const pushed=[];

    for(const m of members)b[m.y][m.x]=null;

    for(const m of members){
        const nx=m.x+dx,ny=m.y+dy;
        b[ny][nx]=m.ball;

        if(!Array.isArray(m.ball.fallPath))
            m.ball.fallPath=[];

        const pivot=slopeRigidMemberPivot(m,dx,dy);

        const seg={
            from:[m.x,m.y],
            to:[nx,ny],
            pivot,
            topPivot:null,
            movingSupportId:0,
            motionSeq,
            rigidTriplet:true,
            slopeRigidArc:true,
            slopeDuration,
            slopeFastImpact:fastImpact,
            slopeContinues:false,
            slopeTerminal:true
        };

        m.ball.fallPath.push(seg);
        pushed.push({ball:m.ball,seg});

        m.ball.rigid=true;
        m.ball.slopeRigidActive=true;

        if(dx){
            m.ball.rollDir=Math.sign(dx);
            m.ball.momentumX=Math.sign(dx);
            m.ball.subCellBias=Math.sign(dx);
        }else if(dy>=2){
            m.ball.rollDir=0;
        }
    }

    // Inspect the NEW rigid pose without advancing it. If the same true
    // straight slope continues, do not ease out at this lattice boundary:
    // reference footage flows through the middle of a slope continuously.
    const gid=members[0]?.ball?.slopeRigidGroupId||0;
    const nextMembers=gid ? slopeRigidGroups(b).get(gid) : null;

    let continues=false;
    if(nextMembers&&nextMembers.length===3){
        const nextSurface=slopeRigidSurfaceKind(b,nextMembers);
        if(nextSurface.kind==="slope"){
            continues=slopeRigidTranslationSafe(
                b,nextMembers,nextSurface.dir,1
            );
        }
    }

    for(const p of pushed){
        p.seg.slopeContinues=continues;
        p.seg.slopeTerminal=!continues;
    }
}

function advanceSlopeRigidGroups(b,preview=false){
    const groups=slopeRigidGroups(b);
    if(!groups.size)
        return {moved:false,heldIds:new Set(),released:false};

    const heldIds=new Set();
    let released=false;

    const releaseGroup=(members,reason)=>{
        released=true;
        for(const m of members)
            heldIds.delete(m.ball.id);

        if(!preview){
            for(const m of members){
                m.ball.rigidityBreakReason=reason||"blocked";
                m.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;
                normalizePileBallPhysics(m.ball);
            }
        }
    };

    for(const members of groups.values()){
        // A missing member means the original three-ball body has already
        // been physically broken (cleared/removed/etc.).
        if(members.length!==3){
            releaseGroup(members,"member_missing");
            continue;
        }

        for(const m of members){
            heldIds.add(m.ball.id);
            if(!preview){
                m.ball.rigid=true;
                m.ball.slopeRigidActive=true;
            }
        }

        const continuation=rigidBodyContinuation(
            b,members
        );

        if(continuation.move){
            if(preview)
                return {moved:true,heldIds,released};

            applySlopeRigidTranslation(
                b,members,
                continuation.dx,
                continuation.dy
            );

            return {moved:true,heldIds,released};
        }

        // If common rigid motion no longer exists, this is no longer the
        // active falling triplet. Whether the cause is a differential catch or
        // a fully blocked rest, it has joined the pile and rigidity ends here.
        releaseGroup(
            members,
            continuation.breakRequired
                ? (continuation.breakReason||"differential_constraint")
                : "pile_settled"
        );
        continue;
    }

    return {moved:false,heldIds,released};
}

function stripFinishedTripletRigidity(g){
    const groups=slopeRigidGroups(g.board);

    for(const members of groups.values()){
        // A partial old group can never remain a rigid pile object.
        if(members.length!==3){
            for(const m of members)
                normalizePileBallPhysics(m.ball);
            continue;
        }

        // Logical board positions are committed before their visual path
        // finishes. A group with any pending fallPath is still an in-flight
        // falling object, never accumulated pile.
        const visuallyInFlight=members.some(m=>
            Array.isArray(m.ball.fallPath) &&
            m.ball.fallPath.length>0
        );

        if(visuallyInFlight)
            continue;

        const c=rigidBodyContinuation(
            g.board,members
        );

        // Common rigid motion still exists -> this is still the currently
        // falling/rolling 3-ball piece, not accumulated pile.
        if(c.move)
            continue;

        // No common rigid displacement means the triplet has reached pile
        // state (or a real differential break). From this exact point onward
        // the three balls are permanently ordinary independent pile balls.
        for(const m of members)
            normalizePileBallPhysics(m.ball);
    }
}
