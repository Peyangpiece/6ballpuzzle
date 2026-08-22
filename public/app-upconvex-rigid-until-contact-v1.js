/* ============================================================
 * 6ball UP-CONVEX RIGID UNTIL IMPOSSIBLE v2.2
 *
 * Priority for an ordinary UP triplet:
 *
 * 1. If exactly ONE member is physically pinned right now, that
 *    member alone releases from the 3-ball constraint immediately.
 *    The other TWO members keep the original rigid pair constraint.
 *
 * 2. Otherwise, preserve 3-ball rigidity only when the canonical
 *    current-contact slope solver itself proves one genuine common
 *    rigid 3-ball move.
 *
 * This restores the canonical one-member-pin rule that later v3.9
 * wrappers could accidentally hide behind GROUP_SLOPE_TRANSLATE.
 * It never chooses the pinned member by colour or by protrusion side;
 * the member whose independent physical motion is actually blocked
 * is the one that releases.
 *
 * Split side for true UP-convex 1+2 events remains owned by
 * app-upconvex-contact-priority-v1.js.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexRigidUntilImpossibleV22
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysIndependentMemberMotion !== "function" ||
        typeof hexPhysRigidSlopePlan !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexRigidUntilImpossibleV22 = true;

    const basePlanGroup = hexPhysPlanGroup;

    function exactOrdinaryUpTriangle(members){
        if(
            !Array.isArray(members) ||
            members.length !== 3 ||
            members.some(m => !m?.ball || m.ball.isGarbage)
        ){
            return false;
        }

        const orientation =
            members[0]?.orientation ||
            members[0]?.ball?.motionGroupOrientation ||
            "";

        if(orientation !== "up")
            return false;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x-b.x);
        const top = members.find(m => m.y < lowerY);

        return !!(
            lower.length === 2 &&
            top &&
            lower[1].x-lower[0].x === 2 &&
            top.x === lower[0].x+1 &&
            top.y === lowerY-1
        );
    }

    function isThreeBallRigidPlan(plan,members){
        if(!Array.isArray(plan) || plan.length !== 3)
            return false;

        const ids = new Set(members.map(m => m.ball.id));
        const bundleIds = new Set();

        for(const p of plan){
            if(!p?.ball || !ids.has(p.ball.id))
                return false;
            if((p.groupSize || 0) !== 3)
                return false;
            if(p.bundleId)
                bundleIds.add(p.bundleId);
        }

        return bundleIds.size <= 1;
    }

    function memberMotions(board,members){
        const motions=[];

        for(const m of members){
            try{
                motions.push(
                    hexPhysIndependentMemberMotion(
                        board,
                        members,
                        m
                    )
                );
            }catch(_){
                return null;
            }
        }

        return motions;
    }

    function singlePinnedIndex(motions){
        if(!Array.isArray(motions) || motions.length !== 3)
            return -1;

        const pinned=[];
        for(let i=0;i<3;i++){
            if(!motions[i])
                pinned.push(i);
        }

        return pinned.length === 1
            ? pinned[0]
            : -1;
    }

    function clearOneBall(ball){
        if(!ball)
            return;

        if(typeof hexPhysClearGroupBall === "function"){
            hexPhysClearGroupBall(ball);
            return;
        }

        ball.motionGroupId=0;
        ball.motionGroupRole=-1;
        ball.motionGroupOrientation="";
        ball.motionGroupSize=0;
        ball.rigid=false;
    }

    function releaseSinglePinnedMember(
        board,
        members,
        motions,
        pinnedIndex,
        preview
    ){
        if(pinnedIndex < 0)
            return null;

        const fixed = members[pinnedIndex];
        const pair = members.filter((_,i) => i !== pinnedIndex);

        if(pair.length !== 2)
            return null;

        if(preview){
            const fakePair = pair.map(m => ({
                ...m,
                ball:{
                    ...m.ball,
                    motionGroupSize:2,
                    rigid:true
                }
            }));

            const previewPlan = basePlanGroup(
                board,
                fakePair,
                true
            );

            return Array.isArray(previewPlan)
                ? previewPlan
                : [];
        }

        const originalGroupId =
            pair[0]?.ball?.motionGroupId ||
            pair[1]?.ball?.motionGroupId ||
            0;

        clearOneBall(fixed.ball);

        for(const m of pair){
            if(originalGroupId)
                m.ball.motionGroupId=originalGroupId;
            m.ball.motionGroupSize=2;
            m.ball.rigid=true;
            m.ball._upSinglePinnedPairV22=true;
        }

        window.__sixBallLastUpSinglePinnedReleaseV22={
            pinnedId:fixed.ball.id,
            pairIds:pair.map(m => m.ball.id),
            pinnedIndex,
            reason:"exactly-one-independent-member-pinned",
            at:Date.now()
        };

        const pairPlan = basePlanGroup(
            board,
            pair,
            false
        );

        return Array.isArray(pairPlan)
            ? pairPlan
            : [];
    }

    function hasRealCurrentPivot(board,members,motions){
        const own = new Set(members.map(m => m.ball.id));

        for(const p of motions || []){
            for(const key of ["pivot","topPivot"]){
                const pv=p?.[key];
                if(!Array.isArray(pv) || pv.length<2)
                    continue;

                const x=Number(pv[0]);
                const y=Number(pv[1]);
                if(!Number.isFinite(x) || !Number.isFinite(y))
                    continue;

                const support=board?.[y]?.[x];
                if(support && !own.has(support.id))
                    return true;
            }
        }

        return false;
    }

    function canonicalRigidSlope(board,members,motions){
        if(!motions || !hasRealCurrentPivot(board,members,motions))
            return null;

        let plan=null;

        try{
            plan=hexPhysRigidSlopePlan(
                board,
                members,
                motions
            );
        }catch(_){
            plan=null;
        }

        if(!Array.isArray(plan) || plan.length!==3)
            return null;

        const ids=new Set(members.map(m=>m.ball.id));
        const dx=plan[0].tx-plan[0].x;
        const dy=plan[0].ty-plan[0].y;

        if(Math.abs(dx)!==1 || dy!==1)
            return null;

        for(const p of plan){
            if(
                !p?.ball ||
                !ids.has(p.ball.id) ||
                p.kind!=="GROUP_SLOPE_TRANSLATE" ||
                (p.tx-p.x)!==dx ||
                (p.ty-p.y)!==dy
            ){
                return null;
            }
        }

        return plan;
    }

    hexPhysPlanGroup=function(
        board,
        members,
        preview=false
    ){
        if(!exactOrdinaryUpTriangle(members)){
            return basePlanGroup(
                board,
                members,
                preview
            ) || [];
        }

        /*
         * ONE real pin outranks every later 3-ball slope rescue.
         * This is the canonical physical event that breaks only the
         * constrained member while the unconstrained two stay paired.
         */
        const motions=memberMotions(board,members);
        const pinnedIndex=singlePinnedIndex(motions);

        if(pinnedIndex >= 0){
            const partial=releaseSinglePinnedMember(
                board,
                members,
                motions,
                pinnedIndex,
                preview
            );

            if(partial !== null)
                return partial;
        }

        const plan=basePlanGroup(
            board,
            members,
            preview
        ) || [];

        /* Canonical resolver already has a valid 3-ball move. */
        if(isThreeBallRigidPlan(plan,members))
            return plan;

        /*
         * With no single-member pin, only a physically proven CURRENT
         * slope contact may rescue 3-ball rigidity. No direction is
         * invented from a split plan, momentum, or empty space.
         */
        const rigid=canonicalRigidSlope(
            board,
            members,
            motions
        );

        if(!rigid)
            return plan;

        if(!preview){
            for(const m of members){
                m.ball.rigid=true;
                m.ball.motionGroupSize=3;
                m.ball.motionGroupOrientation="up";
                m.ball._upConvexRigidUntilImpossibleV22=true;
            }

            window.__sixBallLastUpConvexRigidUntilImpossibleV22={
                ids:members.map(m=>m.ball.id),
                dx:rigid[0].tx-rigid[0].x,
                dy:rigid[0].ty-rigid[0].y,
                reason:"canonical-current-contact-rigid-slope",
                at:Date.now()
            };
        }

        return rigid;
    };

    window.__sixBallUpConvexRigidUntilContactV1=true;
    window.__sixBallUpConvexRigidUntilContactVersion=
        "upconvex-rigid-until-impossible-v2.2";
    window.__sixBallUpConvexRigidUntilImpossibleVersion=
        "upconvex-rigid-until-impossible-v2.2";
    window.__sixBallUpConvexContactAloneDoesNotSplit=true;
    window.__sixBallUpConvexSplitRequiresCommonMotionFailure=true;
    window.__sixBallUpConvexNoSyntheticRigidTranslation=true;
    window.__sixBallUpConvexRequiresRealCurrentPivot=true;
    window.__sixBallUpSinglePinnedMemberHasPriority=true;
    window.__sixBallUpRemainingTwoKeepRigidity=true;
})();
