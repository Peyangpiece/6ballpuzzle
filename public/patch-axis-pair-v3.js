/* HEXDROP patch v3: ▲ convex split follows falling-axis side; two-ball side stays bonded */

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

    const supportSides=[...uniqueSupports.values()]
        .map(c=>Math.sign(c.x-cx))
        .filter(Boolean);
    if(!supportSides.length)return null;

    // A real convex split must be supported from one side only. Mixed left/right
    // supports are a shelf/valley and are handled by the normal rigid solver.
    const bumpSide=supportSides[0];
    if(!supportSides.every(v=>v===bumpSide))return null;

    // Requested rule by the falling-triangle axis:
    // axis right of convex peak -> right two-ball side remains bonded
    // axis left  of convex peak -> left  two-ball side remains bonded
    // A one-sided support lies on the opposite side of that axis.
    const axisSide=-bumpSide;

    // ▲ roles: 0=top, 1=right lower, 2=left lower.
    const pairRoles=axisSide>0 ? [0,1] : [0,2];
    const loneRole=axisSide>0 ? 2 : 1;
    const pairDir=axisSide;
    const loneDir=-axisSide;

    const pair=pairRoles.map(role=>members.find(m=>m.role===role)).filter(Boolean);
    const lone=members.find(m=>m.role===loneRole);
    if(pair.length!==2||!lone)return null;

    return {bumpSide,axisSide,pairDir,loneDir,pair,lone,cx};
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
            // If one member of a saved pair was actually removed/cleared, the
            // remaining singleton is no longer a two-ball object.
            releaseGroup(members,"member_missing");
            continue;
        }

        const preservedPair=isUpSplitRigidPair(members);
        for(const m of members){
            heldIds.add(m.ball.id);
            if(!preview){
                m.ball.rigid=true;
                m.ball.slopeRigidActive=true;
                if(preservedPair){
                    m.ball.slopeRigidPartialPair=true;
                    m.ball.upConvexPairPersistent=true;
                }
            }
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

        // Critical rule: the two-ball side is ONE bonded object. Do not feed
        // it back into independent-ball release merely because the two members
        // currently have different single-ball proposals. If no legal common
        // rigid translation exists, it simply rests as a two-ball rigid pair.
        if(preservedPair){
            if(!preview){
                for(const m of members){
                    m.ball.rigid=true;
                    m.ball.slopeRigidActive=true;
                    m.ball.slopeRigidPartialPair=true;
                    m.ball.upConvexPairPersistent=true;
                }
            }
            continue;
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

function stripFinishedTripletRigidity(g){
    const groups=slopeRigidGroups(g.board);
    for(const members of groups.values()){
        if(!isSupportedSlopeRigidGroup(members)){
            for(const m of members)normalizePileBallPhysics(m.ball);
            continue;
        }

        const visuallyInFlight=members.some(m=>
            Array.isArray(m.ball.fallPath)&&m.ball.fallPath.length>0
        );
        if(visuallyInFlight)continue;

        const c=rigidBodyContinuation(g.board,members);
        if(c.move)continue;

        // A finished visual path or a resting state never dissolves the saved
        // two-ball side. It remains bonded until one member is actually gone.
        if(isUpSplitRigidPair(members)){
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
