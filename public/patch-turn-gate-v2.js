/* HEXDROP patch v2: ▲ convex split direction + persistent pair rigidity + strict turn gating */

function slopeRigidOrientationOf(members){
    return members?.[0]?.ball?.slopeRigidOrientation ||
        members?.[0]?.orientation || "";
}

function isUpSplitRigidPair(members){
    if(!members||members.length!==2)return false;
    const orientation=slopeRigidOrientationOf(members);
    return orientation==="up_pair_left" || orientation==="up_pair_right";
}

function isSupportedSlopeRigidGroup(members){
    return !!members && (members.length===3 || isUpSplitRigidPair(members));
}

function applySlopeRigidTranslation(b,members,dx,dy){
    const motionSeq=LIVE_MOTION_SEQ++;
    const fastImpact=members.some(m=>!!m.ball.slopeImpactFast);
    const slopeDuration=fastImpact ? SLOPE_HARD_DURATION : SLOPE_NORMAL_DURATION;
    const pushed=[];

    for(const m of members)b[m.y][m.x]=null;
    for(const m of members){
        const nx=m.x+dx,ny=m.y+dy;
        b[ny][nx]=m.ball;
        if(!Array.isArray(m.ball.fallPath))m.ball.fallPath=[];
        const pivot=slopeRigidMemberPivot(m,dx,dy);
        const seg={
            from:[m.x,m.y],to:[nx,ny],pivot,topPivot:null,
            movingSupportId:0,motionSeq,
            rigidTriplet:members.length===3,
            rigidPair:isUpSplitRigidPair(members),
            slopeRigidArc:true,slopeDuration,
            slopeFastImpact:fastImpact,slopeContinues:false,slopeTerminal:true
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

    const gid=members[0]?.ball?.slopeRigidGroupId||0;
    const nextMembers=gid ? slopeRigidGroups(b).get(gid) : null;
    let continues=false;
    if(nextMembers&&isSupportedSlopeRigidGroup(nextMembers)){
        const nextSurface=slopeRigidSurfaceKind(b,nextMembers);
        if(nextSurface.kind==="slope"){
            continues=slopeRigidTranslationSafe(b,nextMembers,nextSurface.dir,1);
        }
    }
    for(const p of pushed){
        p.seg.slopeContinues=continues;
        p.seg.slopeTerminal=!continues;
    }
}

function upTriangleConvexSplitInfo(members,continuation){
    if(!members||members.length!==3||!continuation?.breakRequired)return null;
    if(slopeRigidOrientationOf(members)!=="up")return null;

    const contacts=(continuation.ballContacts||continuation.contacts||[])
        .filter(c=>c&&c.kind==="ball");
    if(!contacts.length)return null;

    const cx=members.reduce((n,m)=>n+m.x,0)/members.length;
    const uniqueSupports=new Map();
    for(const c of contacts){
        const key=c.supportId ?? (c.x+","+c.y);
        if(!uniqueSupports.has(key))uniqueSupports.set(key,c);
    }
    const contactSides=[...uniqueSupports.values()]
        .map(c=>Math.sign(c.x-cx))
        .filter(Boolean);
    if(!contactSides.length)return null;
    const solverSide=contactSides[0];
    if(!contactSides.every(v=>v===solverSide))return null;

    // The previous patch interpreted the solver-side contact directly and was
    // observed mirrored on screen. Convert it to the visually observed bump side.
    const bumpSide=-solverSide;

    // ▲ roles: 0=top, 1=right lower, 2=left lower.
    // visual bump right -> left two-ball rigid pair + right singleton
    // visual bump left  -> right two-ball rigid pair + left singleton
    const pairRoles=bumpSide>0 ? [0,2] : [0,1];
    const loneRole=bumpSide>0 ? 1 : 2;
    const pairDir=-bumpSide;
    const loneDir=bumpSide;

    const pair=pairRoles.map(role=>members.find(m=>m.role===role)).filter(Boolean);
    const lone=members.find(m=>m.role===loneRole);
    if(pair.length!==2||!lone)return null;

    return {bumpSide,solverSide,pairDir,loneDir,pair,lone,cx};
}

function applyUpTriangleConvexSplit(members,info){
    const oldGroupId=members[0]?.ball?.slopeRigidGroupId || members[0]?.ball?.id || 0;
    const pairOrientation=info.pairDir<0 ? "up_pair_left" : "up_pair_right";

    normalizePileBallPhysics(info.lone.ball);
    info.lone.ball.rigidityBreakReason="up_convex_split_single";
    info.lone.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;
    info.lone.ball.rollDir=info.loneDir;
    info.lone.ball.momentumX=info.loneDir;
    info.lone.ball.subCellBias=info.loneDir;

    for(const m of info.pair){
        m.ball.slopeRigidGroupId=oldGroupId;
        m.ball.slopeRigidRole=m.role;
        m.ball.slopeRigidOrientation=pairOrientation;
        m.ball.slopeRigidActive=true;
        m.ball.slopeRigidPartialPair=true;
        m.ball.slopeRigidSplitDir=info.pairDir;
        m.ball.upConvexPairPersistent=true;
        m.ball.rigid=true;
        m.ball.fixedGarbage=false;
        m.ball.forceSplit=false;
        m.ball.fallBias=0;
        m.ball.fallBiasTTL=0;
        m.ball.rollDir=info.pairDir;
        m.ball.momentumX=info.pairDir;
        m.ball.subCellBias=info.pairDir;
        m.ball.rigiditySplitReason="up_convex_2_to_1_persistent_pair";
    }
    return info.pair;
}

function advanceSlopeRigidGroups(b,preview=false){
    const groups=slopeRigidGroups(b);
    if(!groups.size)return {moved:false,heldIds:new Set(),released:false};
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
        if(!isSupportedSlopeRigidGroup(members)){
            releaseGroup(members,"member_missing");
            continue;
        }
        const preservedPair=isUpSplitRigidPair(members);
        for(const m of members){
            heldIds.add(m.ball.id);
            if(!preview){m.ball.rigid=true;m.ball.slopeRigidActive=true;}
        }

        const continuation=rigidBodyContinuation(b,members);
        if(continuation.move){
            if(preview)return {moved:true,heldIds,released};
            applySlopeRigidTranslation(b,members,continuation.dx,continuation.dy);
            return {moved:true,heldIds,released};
        }

        if(!preservedPair){
            const convexSplit=upTriangleConvexSplitInfo(members,continuation);
            if(convexSplit){
                if(preview)return {moved:true,heldIds,released:true};
                const pair=applyUpTriangleConvexSplit(members,convexSplit);
                released=true;
                for(const m of members)heldIds.delete(m.ball.id);
                for(const m of pair)heldIds.add(m.ball.id);
                continue;
            }
        }

        // A preserved 2-ball pair does not lose rigidity merely because it is
        // resting. Release only on a genuine differential physical constraint.
        if(preservedPair && !continuation.breakRequired)continue;

        releaseGroup(
            members,
            continuation.breakRequired
                ? (continuation.breakReason||"differential_constraint")
                : "pile_settled"
        );
    }
    return {moved:false,heldIds,released};
}

function stripFinishedTripletRigidity(g){
    const groups=slopeRigidGroups(g.board);
    for(const members of groups.values()){
        if(!isSupportedSlopeRigidGroup(members)){
            for(const m of members)normalizePileBallPhysics(m.ball);
            continue;
        }
        const visuallyInFlight=members.some(m=>Array.isArray(m.ball.fallPath)&&m.ball.fallPath.length>0);
        if(visuallyInFlight)continue;

        const c=rigidBodyContinuation(g.board,members);
        if(c.move)continue;

        if(isUpSplitRigidPair(members) && !c.breakRequired){
            for(const m of members){
                m.ball.rigid=true;
                m.ball.slopeRigidActive=true;
                m.ball.slopeRigidPartialPair=true;
                m.ball.upConvexPairPersistent=true;
            }
            continue;
        }

        for(const m of members)normalizePileBallPhysics(m.ball);
    }
}

/* Normal piece <-> garbage strict turn separation */
const __hexPrepareGarbageBatch=prepareGarbageBatch;
prepareGarbageBatch=function(g){
    __hexPrepareGarbageBatch(g);
    g.garbageTurnStarted=false;
};

function normalTurnMotionStillActive(g){
    if(!g)return false;
    if(g.piece || g.hardDropAnim || g.state==="PLAYING")return true;
    if(typeof pendingFallPathCount==="function" && pendingFallPathCount(g)>0)return true;
    if(typeof nearlySettled==="function" && !nearlySettled(g,SETTLE_TOL))return true;
    if(typeof hasLegalGravityMove==="function" && hasLegalGravityMove(g.board))return true;
    if(typeof boardHasIllegalFloat==="function" && boardHasIllegalFloat(g.board))return true;
    return false;
}

const __hexUpdateGarbagePacks=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    if(!g.garbageTurnStarted){
        if(normalTurnMotionStillActive(g)){
            g.stateT=0;
            return;
        }
        g.garbageTurnStarted=true;
        g.garbageTurnStartedAt=g.garbageClock||0;
    }
    __hexUpdateGarbagePacks(g,dt);
};

function garbageTurnMotionFullyDone(g){
    if(!g)return true;
    if(Array.isArray(g.garbagePlans) && g.garbagePlans.some(p=>p&&!p.landed))return false;
    if(Array.isArray(g.activeGarbagePacks) && g.activeGarbagePacks.some(p=>p&&p._started&&!p.landed))return false;
    if((g.garbLeft||0)>0)return false;
    if(typeof pendingFallPathCount==="function" && pendingFallPathCount(g)>0)return false;
    if(typeof nearlySettled==="function" && !nearlySettled(g,SETTLE_TOL))return false;
    if(typeof hasLegalGravityMove==="function" && hasLegalGravityMove(g.board))return false;
    if(typeof boardHasIllegalFloat==="function" && boardHasIllegalFloat(g.board))return false;
    return true;
}

const __hexGarbageBatchDone=garbageBatchDone;
garbageBatchDone=function(g){
    return __hexGarbageBatchDone(g) && garbageTurnMotionFullyDone(g);
};

const __hexSpawn=spawn;
spawn=function(g){
    const garbageBusy=!!(
        g?.garbageBatchPrepared ||
        (Array.isArray(g?.garbagePlans) && g.garbagePlans.some(p=>p&&!p.landed)) ||
        (Array.isArray(g?.activeGarbagePacks) && g.activeGarbagePacks.some(p=>p&&p._started&&!p.landed)) ||
        (g?.garbLeft||0)>0
    );
    if(garbageBusy || (g?.garbageTurnStarted && !garbageTurnMotionFullyDone(g))){
        g.state="RESOLVING";
        g.phase="GARBAGE";
        g.stateT=0;
        return false;
    }
    g.garbageTurnStarted=false;
    g.garbageTurnStartedAt=0;
    return __hexSpawn(g);
};
