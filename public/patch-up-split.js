/* HEXDROP patch: ▲ convex 2:1 split, 2026-08-16 */

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
    // Normal active piece = 3-ball rigid triangle.
    // After an ▲ convex split, the two balls on the same side remain one
    // temporary rigid pair until geometry genuinely separates/stops them.
    return !!members && (members.length===3 || isUpSplitRigidPair(members));
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
            rigidTriplet:members.length===3,
            rigidPair:isUpSplitRigidPair(members),
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
    if(nextMembers&&isSupportedSlopeRigidGroup(nextMembers)){
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

function upTriangleConvexSplitInfo(members,continuation){
    if(!members||members.length!==3||!continuation?.breakRequired)
        return null;

    if(slopeRigidOrientationOf(members)!=="up")
        return null;

    // Only a real pile-ball contact may trigger this 2:1 split. A flat/floor
    // landing or a symmetric valley remains handled by the ordinary solver.
    const contacts=(continuation.ballContacts||continuation.contacts||[])
        .filter(c=>c&&c.kind==="ball");
    if(!contacts.length)
        return null;

    const cx=members.reduce((n,m)=>n+m.x,0)/members.length;
    const uniqueSupports=new Map();
    for(const c of contacts){
        const key=c.supportId ?? (c.x+","+c.y);
        if(!uniqueSupports.has(key))uniqueSupports.set(key,c);
    }

    const sides=[...uniqueSupports.values()]
        .map(c=>Math.sign(c.x-cx))
        .filter(Boolean);
    if(!sides.length)
        return null;

    // A true single-sided convexity must lie wholly on one side of the
    // falling triangle's horizontal center. Contacts spanning both sides are
    // a shelf/valley/mixed support, not the requested convex split.
    const bumpSide=sides[0];
    if(!sides.every(v=>v===bumpSide))
        return null;

    // ▲ roles: 0=top, 1=right lower, 2=left lower.
    // bump right  -> left pair (top+left) + right singleton
    // bump left   -> right pair (top+right) + left singleton
    const pairRoles=bumpSide>0 ? [0,2] : [0,1];
    const loneRole=bumpSide>0 ? 1 : 2;
    const pairDir=-bumpSide;
    const loneDir=bumpSide;

    const pair=pairRoles.map(role=>members.find(m=>m.role===role)).filter(Boolean);
    const lone=members.find(m=>m.role===loneRole);
    if(pair.length!==2||!lone)
        return null;

    return {bumpSide,pairDir,loneDir,pair,lone,cx};
}

function applyUpTriangleConvexSplit(members,info){
    const oldGroupId=members[0]?.ball?.slopeRigidGroupId ||
        members[0]?.ball?.id || 0;
    const pairOrientation=info.pairDir<0 ? "up_pair_left" : "up_pair_right";

    // Release only the singleton. The two balls on the opposite side of the
    // convex peak continue as one rigid body, preserving the requested 2:1
    // composition instead of destroying all three bonds at once.
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
        m.ball.rigid=true;
        m.ball.fixedGarbage=false;
        m.ball.forceSplit=false;
        m.ball.fallBias=0;
        m.ball.fallBiasTTL=0;
        m.ball.rollDir=info.pairDir;
        m.ball.momentumX=info.pairDir;
        m.ball.subCellBias=info.pairDir;
        m.ball.rigiditySplitReason="up_convex_2_to_1";
    }

    return info.pair;
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
        // A normal group has 3 members. The only legal 2-member rigid group is
        // the pair intentionally preserved by an ▲ convex 2:1 split.
        if(!isSupportedSlopeRigidGroup(members)){
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

        // ▲ + one-sided convex pile contact: split 2:1 instead of dropping
        // all three rigidity links. The convex side gets one ball; the
        // opposite side keeps a two-ball rigid pair.
        const convexSplit=upTriangleConvexSplitInfo(members,continuation);
        if(convexSplit){
            if(preview)
                return {moved:true,heldIds,released:true};

            const pair=applyUpTriangleConvexSplit(members,convexSplit);
            released=true;
            for(const m of members)heldIds.delete(m.ball.id);
            for(const m of pair)heldIds.add(m.ball.id);
            continue;
        }

        // If common rigid motion no longer exists, this group has joined the
        // pile (or hit a genuine differential constraint). Ordinary triplets
        // and already-split rigid pairs both release here when appropriate.
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
        // A partial old triplet is invalid, except for the explicit ▲ convex
        // split pair. That pair is allowed to remain rigid while still moving.
        if(!isSupportedSlopeRigidGroup(members)){
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

        // Common rigid motion still exists -> this is still an active
        // falling/rolling rigid body (3-ball triangle or preserved 2-ball pair).
        if(c.move)
            continue;

        // No common rigid displacement means the group has reached pile state
        // (or a real differential break). From here it becomes ordinary pile.
        for(const m of members)
            normalizePileBallPhysics(m.ball);
    }
}
