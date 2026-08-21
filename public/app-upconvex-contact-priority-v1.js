/* ============================================================
 * 6ball UP-CONVEX PRE-ARC SIDE LOCK v2.2
 *
 * A normal UP triplet may first perform a rigid circular/slope
 * motion around a pile support and only split on the following
 * resolver step.  The arc can carry the triplet centre across
 * the support centre, so deciding the 2+1 side after that arc can
 * reverse the reference result.
 *
 * Rule:
 *   - BEFORE a rigid arc/slope step is committed, remember the
 *     triplet-centre side relative to the actual external pivot.
 *   - Do NOT split early.
 *   - When the canonical v3.9 separator later says the split is
 *     physically legal on that same support, restore the stored
 *     pre-arc side.
 *
 * protrusion RIGHT of pre-arc triangle centre
 *      -> LEFT pair + RIGHT solo
 *
 * protrusion LEFT of pre-arc triangle centre
 *      -> RIGHT pair + LEFT solo
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexPreArcSideLockV22
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysUpConvexSeparator !== "function" ||
        typeof hexPhysEmpty !== "function" ||
        typeof valid !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexPreArcSideLockV22 = true;

    const basePlanGroup = hexPhysPlanGroup;
    const baseSeparator = hexPhysUpConvexSeparator;

    /*
     * Preview must stay read-only.  This synchronous observation
     * is visible only while the current planner call is executing.
     */
    let activeObservation = null;

    function isUpTriplet(members){
        if(!Array.isArray(members) || members.length !== 3)
            return false;

        if(members.some(m => !m?.ball || m.ball.isGarbage))
            return false;

        const orientation =
            members[0]?.orientation ||
            members[0]?.ball?.motionGroupOrientation ||
            "";

        return orientation === "up";
    }

    function continuousOffset(members){
        const values = members
            .map(m => Number(m?.ball?.impactOffsetX))
            .filter(Number.isFinite)
            .map(v => Math.max(-1, Math.min(1, v)))
            .sort((a,b) => a-b);

        if(!values.length)
            return 0;

        return values[Math.floor(values.length / 2)];
    }

    function tripletBase(members){
        if(!isUpTriplet(members))
            return null;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x-b.x);
        const top = members.find(m => m.y < lowerY);

        if(
            lower.length !== 2 ||
            !top ||
            lower[1].x - lower[0].x !== 2
        ){
            return null;
        }

        const offset = continuousOffset(members);
        const baseLeft = lower[0].x + offset;
        const baseRight = lower[1].x + offset;
        const triangleCenter = (baseLeft + baseRight) / 2;

        return {
            lowerY,
            lower,
            top,
            offset,
            baseLeft,
            baseRight,
            triangleCenter,
            groupId: Number(members[0]?.ball?.motionGroupId) || 0
        };
    }

    /*
     * Current direct-centre protrusion observation.
     * This is also used when there was no prior arc.
     */
    function directSeparatorGeometry(board, members){
        const base = tripletBase(members);
        if(!base)
            return null;

        const px = (base.lower[0].x + base.lower[1].x) / 2;
        const py = base.lowerY + 1;
        const support = valid(px,py) ? board?.[py]?.[px] : null;

        if(
            !support ||
            members.some(m => m.ball.id === support.id)
        ){
            return null;
        }

        const width = base.baseRight - base.baseLeft;
        if(Math.abs(width) <= 1e-9)
            return null;

        const hitFraction = (px - base.baseLeft) / width;

        /*
         * Direct separator is central-half only.
         * Outer-quarter contact is still an ordinary rigid slope.
         */
        if(
            hitFraction < 0.25 - 1e-9 ||
            hitFraction > 0.75 + 1e-9
        ){
            return null;
        }

        const delta = base.triangleCenter - px;

        /* Exact centre keeps the canonical tie-break. */
        if(Math.abs(delta) <= 1e-9)
            return null;

        return {
            ...base,
            support,
            px,
            py,
            hitFraction,
            protrusionCenter: px,
            delta,
            pairDir: delta > 0 ? 1 : -1,
            source: "direct-centre"
        };
    }

    function lockStore(ball){
        if(!ball || typeof ball !== "object")
            return null;

        if(
            !ball._upConvexPreArcSideLocksV22 ||
            typeof ball._upConvexPreArcSideLocksV22 !== "object"
        ){
            ball._upConvexPreArcSideLocksV22 =
                Object.create(null);
        }

        return ball._upConvexPreArcSideLocksV22;
    }

    function readSideLock(members, supportId){
        if(!isUpTriplet(members) || !supportId)
            return null;

        const key = String(supportId);
        const locks = members
            .map(m => m?.ball?._upConvexPreArcSideLocksV22?.[key])
            .filter(Boolean);

        /*
         * A persistent lock is valid only when all three members
         * agree. This also blocks stale partial metadata.
         */
        if(locks.length !== 3)
            return null;

        const first = locks[0];

        if(
            !locks.every(l =>
                l.supportId === first.supportId &&
                l.groupId === first.groupId &&
                l.pairDir === first.pairDir
            )
        ){
            return null;
        }

        return first;
    }

    function geometryAsLock(g){
        if(!g || !g.support?.id)
            return null;

        return {
            supportId: g.support.id,
            groupId: g.groupId,
            pairDir: g.pairDir,
            triangleCenter: g.triangleCenter,
            protrusionCenter: g.protrusionCenter,
            delta: g.delta,
            hitFraction:
                Number.isFinite(g.hitFraction)
                    ? g.hitFraction
                    : null,
            source: g.source || "unknown"
        };
    }

    function persistSide(members, g){
        if(!g)
            return null;

        const existing = readSideLock(
            members,
            g.support.id
        );

        /*
         * Same physical support: the earliest observation wins.
         * In particular, a later post-arc centre crossing may NOT
         * overwrite the pre-arc side.
         */
        if(existing)
            return existing;

        const lock = geometryAsLock(g);
        if(!lock)
            return null;

        const key = String(lock.supportId);

        for(const m of members){
            const store = lockStore(m.ball);
            if(store)
                store[key] = {...lock};
        }

        window.__sixBallLastUpConvexSideLockObserved = {
            ...lock,
            pairSide: lock.pairDir > 0 ? "right" : "left",
            soloSide: lock.pairDir > 0 ? "left" : "right",
            ids: members.map(m => m.ball.id),
            at: Date.now()
        };

        return lock;
    }

    function currentObservationLock(members, supportId){
        if(
            !activeObservation ||
            !supportId ||
            activeObservation.support?.id !== supportId ||
            !isUpTriplet(members)
        ){
            return null;
        }

        return geometryAsLock(activeObservation);
    }

    /*
     * Locate the actual external pivot that caused a rigid group
     * arc. hexPhysRigidSlidePlanFromContact marks copied pivots on
     * the other members as virtualPivot, so only a non-virtual
     * pivot/topPivot is authoritative.
     */
    function externalPivotFromRigidPlan(board, members, plan){
        if(
            !isUpTriplet(members) ||
            !Array.isArray(plan) ||
            plan.length !== 3
        ){
            return null;
        }

        /*
         * Split plans contain a 2-ball branch plus a solo.  We only
         * capture a side while all three are still one rigid body.
         */
        if(!plan.every(p => Number(p?.groupSize) === 3))
            return null;

        const own = new Set(members.map(m => m.ball.id));

        for(const p of plan){
            if(!p || p.virtualPivot)
                continue;

            const pv =
                Array.isArray(p.topPivot)
                    ? p.topPivot
                    : Array.isArray(p.pivot)
                        ? p.pivot
                        : null;

            if(!pv || pv.length < 2)
                continue;

            const px = Number(pv[0]);
            const py = Number(pv[1]);

            if(
                !Number.isFinite(px) ||
                !Number.isFinite(py) ||
                !valid(px,py)
            ){
                continue;
            }

            const support = board?.[py]?.[px];

            if(!support || own.has(support.id))
                continue;

            return {
                support,
                px,
                py,
                proposal: p
            };
        }

        return null;
    }

    /*
     * Side geometry taken BEFORE the rigid circular/slope step.
     * No central-half restriction is used here: an outer-quarter
     * contact is precisely the case that can roll around the same
     * support and become a true separator one step later.
     */
    function preArcGeometry(board, members, plan){
        const base = tripletBase(members);
        if(!base)
            return null;

        const pivot =
            externalPivotFromRigidPlan(
                board,
                members,
                plan
            );

        if(!pivot)
            return null;

        /*
         * Require an actual horizontal arc component. Vertical
         * rigid gravity has no pivot and never reaches this path.
         */
        const p = pivot.proposal;
        const dx = Number(p?.tx) - Number(p?.x);

        if(!Number.isFinite(dx) || Math.abs(dx) <= 1e-9)
            return null;

        const delta =
            base.triangleCenter -
            pivot.px;

        if(Math.abs(delta) <= 1e-9)
            return null;

        return {
            ...base,
            support: pivot.support,
            px: pivot.px,
            py: pivot.py,
            protrusionCenter: pivot.px,
            delta,
            pairDir: delta > 0 ? 1 : -1,
            hitFraction: null,
            source: "pre-arc"
        };
    }

    function outwardSoloMotion(
        board,
        solo,
        direction,
        info,
        members
    ){
        const tx = solo.x + direction;
        const ty = solo.y + 1;

        const ignore = new Set(
            members
                .filter(m => m.ball.id !== solo.ball.id)
                .map(m => m.ball.id)
        );

        if(
            !valid(tx,ty) ||
            !hexPhysEmpty(board, tx, ty, ignore)
        ){
            return null;
        }

        return {
            x: solo.x,
            y: solo.y,
            tx,
            ty,
            ball: solo.ball,
            kind:
                direction < 0
                    ? "ROLL_LEFT"
                    : "ROLL_RIGHT",
            pivot: [info.px, info.py],
            topPivot: null,
            followSupportIds: []
        };
    }

    /*
     * 1) Observe direct separator geometry before the inner
     *    planner can move the group.
     * 2) Let canonical physics decide the actual motion.
     * 3) If that motion is a rigid arc, store its PRE-ARC side
     *    before the event is committed.
     *
     * Preview stays read-only.
     */
    hexPhysPlanGroup = function(
        board,
        members,
        preview=false
    ){
        const observed =
            isUpTriplet(members)
                ? directSeparatorGeometry(
                    board,
                    members
                  )
                : null;

        if(!preview && observed){
            persistSide(
                members,
                observed
            );
        }

        const previousObservation =
            activeObservation;

        activeObservation =
            observed;

        let plan;

        try{
            plan =
                basePlanGroup(
                    board,
                    members,
                    preview
                );
        }finally{
            activeObservation =
                previousObservation;
        }

        /*
         * CRITICAL FIX:
         * capture the side before a committed arc changes the
         * logical group position and before app-03 resets
         * impactOffsetX after horizontal motion.
         */
        if(
            !preview &&
            isUpTriplet(members) &&
            Array.isArray(plan) &&
            plan.length
        ){
            const beforeArc =
                preArcGeometry(
                    board,
                    members,
                    plan
                );

            if(beforeArc){
                persistSide(
                    members,
                    beforeArc
                );

                window.__sixBallLastUpConvexPreArcDecision = {
                    supportId: beforeArc.support.id,
                    groupId: beforeArc.groupId,
                    triangleCenter: beforeArc.triangleCenter,
                    protrusionCenter:
                        beforeArc.protrusionCenter,
                    delta: beforeArc.delta,
                    pairSide:
                        beforeArc.pairDir > 0
                            ? "right"
                            : "left",
                    soloSide:
                        beforeArc.pairDir > 0
                            ? "left"
                            : "right",
                    ids:
                        members.map(
                            m => m.ball.id
                        ),
                    at: Date.now()
                };
            }
        }

        return plan;
    };

    /*
     * Canonical v3.9 remains the sole authority for WHEN a split
     * is physically legal. We only replace its side assignment.
     */
    hexPhysUpConvexSeparator = function(
        board,
        members,
        motions
    ){
        const info =
            baseSeparator(
                board,
                members,
                motions
            );

        if(!info || !isUpTriplet(members))
            return info;

        const supportId =
            info?.support?.id;

        const lock =
            readSideLock(
                members,
                supportId
            ) ||
            currentObservationLock(
                members,
                supportId
            );

        if(!lock)
            return info;

        const lowerY =
            Math.max(
                ...members.map(m => m.y)
            );

        const lower =
            members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x-b.x);

        const top =
            members.find(
                m => m.y < lowerY
            );

        if(lower.length !== 2 || !top)
            return info;

        const pairDir =
            lock.pairDir > 0
                ? 1
                : -1;

        const pairLower =
            pairDir > 0
                ? lower[1]
                : lower[0];

        const solo =
            pairDir > 0
                ? lower[0]
                : lower[1];

        const soloDirection =
            -pairDir;

        let soloMotion =
            motions?.[
                members.indexOf(
                    solo
                )
            ] || null;

        if(
            !soloMotion ||
            Math.sign(
                soloMotion.tx -
                solo.x
            ) !== soloDirection
        ){
            soloMotion =
                outwardSoloMotion(
                    board,
                    solo,
                    soloDirection,
                    info,
                    members
                );
        }

        /*
         * Never manufacture a split through an occupied target.
         * If the remembered-side split is not physically possible
         * yet, wait; do not silently flip to the opposite side.
         */
        if(
            !soloMotion ||
            Math.sign(
                soloMotion.tx -
                solo.x
            ) !== soloDirection
        ){
            return null;
        }

        const corrected = {
            ...info,
            dir: pairDir,
            top,
            pairLower,
            solo,
            soloMotion,

            triangleCenterAtSideDecision:
                lock.triangleCenter,

            protrusionCenterAtSideDecision:
                lock.protrusionCenter,

            sideDecisionDelta:
                lock.delta,

            sideDecisionSource:
                lock.source,

            firstContactSideLocked:
                true,

            pairSide:
                pairDir > 0
                    ? "right"
                    : "left",

            soloSide:
                pairDir > 0
                    ? "left"
                    : "right"
        };

        window.__sixBallLastUpConvexAppliedSideLock = {
            supportId,
            groupId: lock.groupId,
            source: lock.source,
            delta: lock.delta,
            pairSide: corrected.pairSide,
            soloSide: corrected.soloSide,
            ids: {
                top:
                    top.ball.id,

                pairLower:
                    pairLower.ball.id,

                solo:
                    solo.ball.id
            },
            at: Date.now()
        };

        return corrected;
    };

    window.__sixBallUpConvexContactPriorityVersion =
        "upconvex-pre-arc-side-lock-v2.2";

    window.__sixBallUpConvexSplitTimingOwnedByCanonicalResolver =
        true;

    window.__sixBallUpConvexFirstContactOnlyLocksSide =
        true;

    window.__sixBallUpConvexPreviewIsReadOnly =
        true;

    window.__sixBallUpConvexPreArcSideAuthoritative =
        true;
})();