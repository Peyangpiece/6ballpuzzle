/* ============================================================
 * 6ball UP-CONVEX RIGID UNTIL IMPOSSIBLE v2
 *
 * Ordinary UP triplets stay as one 3-ball rigid body for as long
 * as one genuine common rigid slope step is physically possible.
 *
 * IMPORTANT:
 * merely touching / entering the centre envelope of a protrusion
 * is NOT a split condition.  The triplet may ride around that
 * protrusion as one rigid body.  Split is allowed only at the
 * first step where the same 3-ball rigid motion is impossible.
 *
 * Split side remains owned by app-upconvex-contact-priority-v1.js.
 * This wrapper owns only the "keep 3 balls rigid while possible"
 * rule.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexRigidUntilImpossibleV2
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysIndependentMemberMotion !== "function" ||
        typeof valid !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexRigidUntilImpossibleV2 = true;

    const basePlanGroup = hexPhysPlanGroup;

    function isOrdinaryUpTriplet(members){
        return !!(
            Array.isArray(members) &&
            members.length === 3 &&
            members.every(m => m?.ball && !m.ball.isGarbage) &&
            (
                members[0]?.orientation ||
                members[0]?.ball?.motionGroupOrientation ||
                ""
            ) === "up"
        );
    }

    function isThreeBallRigidPlan(plan, members){
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

    function memberMotions(board, members){
        return members.map(m => {
            try{
                return hexPhysIndependentMemberMotion(
                    board,
                    members,
                    m
                );
            }catch(_){
                return null;
            }
        });
    }

    function slopeDirection(motions, members, plan){
        const votes = new Map();

        function add(dx,dy,weight){
            if(Math.abs(dx) !== 1 || dy !== 1)
                return;
            const key = dx + "," + dy;
            votes.set(key, (votes.get(key) || 0) + weight);
        }

        for(const p of motions){
            if(p)
                add(p.tx - p.x, p.ty - p.y, 3);
        }

        /*
         * A split plan may still preserve the physical slope direction
         * that the body was trying to follow.  It is only a weak vote;
         * actual independent member motion has priority.
         */
        for(const p of plan || []){
            if(p)
                add(p.tx - p.x, p.ty - p.y, 1);
        }

        let momentum = 0;
        if(typeof hexPhysBias === "function"){
            for(const m of members)
                momentum += Math.sign(hexPhysBias(m.ball) || 0);
        }
        if(momentum)
            add(Math.sign(momentum), 1, 2);

        let best = null;
        for(const [key,score] of votes){
            const [dx,dy] = key.split(",").map(Number);
            if(!best || score > best.score)
                best = {dx,dy,score};
        }

        return best;
    }

    function rigidSlopePlan(board, members, motions, originalPlan){
        const dir = slopeDirection(
            motions,
            members,
            originalPlan
        );

        if(!dir)
            return null;

        /*
         * This is the authoritative split gate:
         * if the exact same vector is still safe for all 3 members,
         * they MUST remain rigid, even if a protrusion is already in
         * contact with the centre of the triangle.
         */
        if(
            typeof hexPhysTranslationSafe === "function" &&
            !hexPhysTranslationSafe(
                board,
                members,
                dir.dx,
                dir.dy
            )
        ){
            return null;
        }

        if(typeof hexPhysGroupTranslationPlan === "function"){
            const p = hexPhysGroupTranslationPlan(
                board,
                members,
                dir.dx,
                dir.dy,
                "GROUP_SLOPE_TRANSLATE"
            );
            if(Array.isArray(p) && p.length === 3)
                return p;
        }

        const own = new Set(members.map(m => m.ball.id));
        const targets = new Set();

        for(const m of members){
            const tx = m.x + dir.dx;
            const ty = m.y + dir.dy;
            const key = tx + "," + ty;
            const q = valid(tx,ty) ? board?.[ty]?.[tx] : null;

            if(
                !valid(tx,ty) ||
                targets.has(key) ||
                (q && !own.has(q.id))
            ){
                return null;
            }
            targets.add(key);
        }

        const bundle =
            members[0]?.ball?.motionGroupId ||
            0;

        return members.map(m => ({
            x:m.x,
            y:m.y,
            tx:m.x + dir.dx,
            ty:m.y + dir.dy,
            ball:m.ball,
            kind:"GROUP_SLOPE_TRANSLATE",
            pivot:null,
            topPivot:null,
            followSupportIds:[],
            bundleId:bundle,
            groupSize:3,
            rigidUntilCommonMotionImpossible:true
        }));
    }

    hexPhysPlanGroup = function(
        board,
        members,
        preview=false
    ){
        const plan = basePlanGroup(
            board,
            members,
            preview
        ) || [];

        if(!isOrdinaryUpTriplet(members))
            return plan;

        /* Existing canonical planner already found a valid 3-ball move. */
        if(isThreeBallRigidPlan(plan, members))
            return plan;

        /*
         * DO NOT split simply because a protrusion is being touched.
         * Re-test the current physical step as one common rigid move.
         */
        const motions = memberMotions(board, members);
        const rigid = rigidSlopePlan(
            board,
            members,
            motions,
            plan
        );

        if(rigid){
            if(!preview){
                for(const m of members){
                    m.ball.rigid = true;
                    m.ball.motionGroupSize = 3;
                    m.ball.motionGroupOrientation = "up";
                    m.ball._upConvexRigidUntilImpossibleV2 = true;
                }

                window.__sixBallLastUpConvexRigidUntilImpossibleV2 = {
                    ids: members.map(m => m.ball.id),
                    dx: rigid[0].tx - rigid[0].x,
                    dy: rigid[0].ty - rigid[0].y,
                    reason: "common-rigid-slope-still-possible",
                    at: Date.now()
                };
            }
            return rigid;
        }

        /*
         * Only here is common 3-ball motion impossible NOW.
         * The canonical resolver may finally decide 1+2 split/pinning.
         */
        return plan;
    };

    window.__sixBallUpConvexRigidUntilContactV1 = true;
    window.__sixBallUpConvexRigidUntilContactVersion =
        "upconvex-rigid-until-impossible-v2";
    window.__sixBallUpConvexRigidUntilImpossibleVersion =
        "upconvex-rigid-until-impossible-v2";
    window.__sixBallUpConvexContactAloneDoesNotSplit = true;
    window.__sixBallUpConvexSplitRequiresCommonMotionFailure = true;
})();
