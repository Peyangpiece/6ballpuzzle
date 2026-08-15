/* 2026-08-16: ▲ convex-contact partial rigidity override.
   When an upward triangle actually tears on one protruding pile ball,
   preserve a 2-ball rigid pair on the opposite side instead of releasing all 3. */

function upTriangleConvexSplitInfo(b,members,continuation){
    if(!Array.isArray(members)||members.length!==3||!continuation?.breakRequired)
        return null;

    const orientation=
        members[0]?.orientation ||
        members[0]?.ball?.slopeRigidOrientation ||
        "";
    if(orientation!=="up"||continuation.floorContact)
        return null;

    const ballContacts=Array.isArray(continuation.ballContacts)
        ? continuation.ballContacts
        : (continuation.contacts||[]).filter(c=>c.kind==="ball");

    const supports=new Map();
    for(const c of ballContacts){
        if(c.kind!=="ball")continue;
        const supportId=c.supportId || b?.[c.y]?.[c.x]?.id || 0;
        const key=supportId || (c.x+","+c.y);
        if(!supports.has(key))
            supports.set(key,{id:supportId,x:c.x,y:c.y});
    }

    // One physical protruding support only. Shelves/valleys keep the generic solver.
    if(supports.size!==1)return null;

    const support=[...supports.values()][0];
    const centerX=members.reduce((n,m)=>n+m.x,0)/members.length;
    const delta=support.x-centerX;
    if(Math.abs(delta)<1e-9)return null;

    const side=delta>0?"right":"left";
    // ▲ roles: 0=top, 1=right lower, 2=left lower.
    return {
        side,
        support,
        centerX,
        pairRoles:side==="right"?[0,2]:[0,1],
        soloRole:side==="right"?1:2,
        pairDir:side==="right"?-1:1,
        soloDir:side==="right"?1:-1
    };
}

function applyUpTriangleConvexPartialSplit(members,info,heldIds,preview=false){
    if(!info)return false;
    const pair=members.filter(m=>info.pairRoles.includes(m.role));
    const solo=members.find(m=>m.role===info.soloRole);
    if(pair.length!==2||!solo)return false;

    for(const m of members)heldIds.delete(m.ball.id);
    for(const m of pair)heldIds.add(m.ball.id);
    if(preview)return true;

    const gid=pair[0]?.ball?.slopeRigidGroupId || pair[0]?.ball?.id || 0;
    const breakSeq=LIVE_MOTION_SEQ;

    solo.ball.rigidityBreakReason="up_convex_split_single_"+info.side;
    solo.ball.rigidityBreakSeq=breakSeq;
    normalizePileBallPhysics(solo.ball);
    solo.ball.rollDir=info.soloDir;
    solo.ball.momentumX=info.soloDir;
    solo.ball.subCellBias=info.soloDir;

    for(const m of pair){
        m.ball.slopeRigidGroupId=gid;
        m.ball.slopeRigidOrientation="up";
        m.ball.slopeRigidActive=true;
        m.ball.slopeRigidPartialPair=true;
        m.ball.slopeRigidSplitDir=info.pairDir;
        m.ball.rigid=true;
        m.ball.rollDir=info.pairDir;
        m.ball.momentumX=info.pairDir;
        m.ball.subCellBias=info.pairDir;
        m.ball.rigidityBreakReason="up_convex_partial_pair_"+info.side;
        m.ball.rigidityBreakSeq=breakSeq;
    }
    return true;
}

// Override the original group driver so an explicit 2-ball partial pair is legal.
function advanceSlopeRigidGroups(b,preview=false){
    const groups=slopeRigidGroups(b);
    if(!groups.size)
        return {moved:false,heldIds:new Set(),released:false};

    const heldIds=new Set();
    let released=false;

    const releaseGroup=(members,reason)=>{
        released=true;
        for(const m of members)heldIds.delete(m.ball.id);
        if(!preview){
            for(const m of members){
                m.ball.rigidityBreakReason=reason||"blocked";
                m.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;
                normalizePileBallPhysics(m.ball);
            }
        }
    };

    for(const members of groups.values()){
        const expectedCount=slopeRigidExpectedMemberCount(members);
        if(members.length!==expectedCount){
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

        const continuation=rigidBodyContinuation(b,members);
        if(continuation.move){
            if(preview)return {moved:true,heldIds,released};
            applySlopeRigidTranslation(b,members,continuation.dx,continuation.dy);
            return {moved:true,heldIds,released};
        }

        if(members.length===3 && continuation.breakRequired){
            const splitInfo=upTriangleConvexSplitInfo(b,members,continuation);
            if(splitInfo && applyUpTriangleConvexPartialSplit(
                members,splitInfo,heldIds,preview
            )){
                released=true;
                continue;
            }
        }

        releaseGroup(
            members,
            continuation.breakRequired
                ? (continuation.breakReason||"differential_constraint")
                : "pile_settled"
        );
    }

    return {moved:false,heldIds,released};
}

// Override normalization so partial-pair metadata cannot leak after the pair settles/breaks.
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
    ball.slopeRigidPartialPair=false;
    ball.slopeRigidSplitDir=0;
    ball.forceSplit=false;
    ball.fallBias=0;
    ball.fallBiasTTL=0;
    ball.visualTripletId=0;
    ball.visualTripletOrientation="";
    ball.visualTripletRole=-1;
    ball.visualReleaseGroupId=0;
    ball.visualReleaseOrientation="";
    ball.visualReleaseGateRoles=[];
    ball.visualPreReleaseRemaining=0;
    ball.visualSyncSplitGroup=0;
    ball.visualSyncSplitStage=0;
}

// Override pile cleanup: explicit 2-ball partial pairs are still active rigid bodies.
function stripFinishedTripletRigidity(g){
    const groups=slopeRigidGroups(g.board);
    for(const members of groups.values()){
        const expectedCount=slopeRigidExpectedMemberCount(members);
        if(members.length!==expectedCount){
            for(const m of members)normalizePileBallPhysics(m.ball);
            continue;
        }

        const visuallyInFlight=members.some(m=>
            Array.isArray(m.ball.fallPath) && m.ball.fallPath.length>0
        );
        if(visuallyInFlight)continue;

        const c=rigidBodyContinuation(g.board,members);
        if(c.move)continue;

        for(const m of members)normalizePileBallPhysics(m.ball);
    }
}
