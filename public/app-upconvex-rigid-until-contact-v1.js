/* ============================================================
 * 6ball UP-CONVEX RIGID UNTIL CONTACT v1
 *
 * Ordinary UP triplets stay as one 3-ball rigid body while they
 * are still travelling on a smooth slope toward a later bump.
 * A protrusion is allowed to split the triplet only after the
 * protruding pile ball is in the CURRENT centre-contact envelope.
 *
 * This wrapper does not change the locked split side. That is
 * owned by app-upconvex-contact-priority-v1.js.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexRigidUntilContactV1
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

    window.__sixBallUpConvexRigidUntilContactV1 = true;

    const basePlanGroup = hexPhysPlanGroup;
    const EPS = 1e-9;

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

    function clampOffset(v){
        return Math.max(-1, Math.min(1, v));
    }

    function geometry(members){
        if(!isOrdinaryUpTriplet(members))
            return null;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x - b.x);
        const top = members.find(m => m.y < lowerY);

        if(
            lower.length !== 2 ||
            !top ||
            lower[1].x - lower[0].x !== 2
        ){
            return null;
        }

        let offset = Number(top?.ball?.impactOffsetX);
        if(!Number.isFinite(offset)){
            const values = members
                .map(m => Number(m?.ball?.impactOffsetX))
                .filter(Number.isFinite)
                .map(clampOffset)
                .sort((a,b) => a-b);
            offset = values.length
                ? values[Math.floor(values.length / 2)]
                : 0;
        }
        offset = clampOffset(offset);

        const leftX = lower[0].x + offset;
        const rightX = lower[1].x + offset;
        const px = (lower[0].x + lower[1].x) / 2;
        const py = lowerY + 1;
        const width = rightX - leftX;
        const hitFraction = Math.abs(width) > EPS
            ? (px - leftX) / width
            : 0.5;

        return {
            lowerY,
            lower,
            top,
            offset,
            px,
            py,
            hitFraction
        };
    }

    function currentCentreProtrusionContact(board, members){
        const g = geometry(members);
        if(!g || !valid(g.px, g.py))
            return false;

        const support = board?.[g.py]?.[g.px];
        if(
            !support ||
            members.some(m => m.ball.id === support.id)
        ){
            return false;
        }

        return (
            g.hitFraction >= 0.25 - EPS &&
            g.hitFraction <= 0.75 + EPS
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
            rigidUntilProtrusionContact:true
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

        if(isThreeBallRigidPlan(plan, members))
            return plan;

        /*
         * Once the current protrusion is actually in the canonical
         * centre-contact envelope, do not interfere. The existing
         * separator + pre-arc side lock own the real split.
         */
        if(currentCentreProtrusionContact(board, members))
            return plan;

        const motions = memberMotions(board, members);
        const rigid = rigidSlopePlan(
            board,
            members,
            motions,
            plan
        );

        if(rigid){
            if(!preview){
                window.__sixBallLastUpConvexRigidUntilContactV1 = {
                    ids: members.map(m => m.ball.id),
                    dx: rigid[0].tx - rigid[0].x,
                    dy: rigid[0].ty - rigid[0].y,
                    reason: "slope-before-protrusion-contact",
                    at: Date.now()
                };
            }
            return rigid;
        }

        return plan;
    };

    window.__sixBallUpConvexRigidUntilContactVersion =
        "upconvex-rigid-until-contact-v1";
})();
