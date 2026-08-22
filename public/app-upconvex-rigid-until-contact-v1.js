/* ============================================================
 * 6ball UP-CONVEX RIGID UNTIL IMPOSSIBLE v2.1
 *
 * Keep an ordinary UP triplet rigid only while the canonical
 * current-contact slope solver itself proves one genuine common
 * 3-ball rigid move.
 *
 * v2 was too permissive: it inferred a direction from one member,
 * an already-split plan, or momentum and then used only collision
 * safety to manufacture GROUP_SLOPE_TRANSLATE. That could keep a
 * ball floating / attached after the physical event that should
 * have released rigidity.
 *
 * Split side remains owned by app-upconvex-contact-priority-v1.js.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexRigidUntilImpossibleV21
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

    window.__sixBallUpConvexRigidUntilImpossibleV21 = true;

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
        const plan=basePlanGroup(
            board,
            members,
            preview
        ) || [];

        if(!exactOrdinaryUpTriangle(members))
            return plan;

        /* Canonical resolver already has a valid 3-ball move. */
        if(isThreeBallRigidPlan(plan,members))
            return plan;

        /*
         * Only a physically proven CURRENT slope contact may rescue
         * 3-ball rigidity. No direction is invented from a split plan,
         * momentum, or collision-safe empty space.
         */
        const motions=memberMotions(board,members);
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
                m.ball._upConvexRigidUntilImpossibleV21=true;
            }

            window.__sixBallLastUpConvexRigidUntilImpossibleV21={
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
        "upconvex-rigid-until-impossible-v2.1";
    window.__sixBallUpConvexRigidUntilImpossibleVersion=
        "upconvex-rigid-until-impossible-v2.1";
    window.__sixBallUpConvexContactAloneDoesNotSplit=true;
    window.__sixBallUpConvexSplitRequiresCommonMotionFailure=true;
    window.__sixBallUpConvexNoSyntheticRigidTranslation=true;
    window.__sixBallUpConvexRequiresRealCurrentPivot=true;
})();
