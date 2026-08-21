/* ============================================================
 * 6ball UP-CONVEX FIRST-CONTACT SIDE LOCK v2.1
 *
 * This patch never starts the split early.
 * It only remembers the protrusion side at the first encounter.
 * The existing v3.9 resolver remains authoritative for WHEN the
 * split is physically legal.  When that canonical split occurs,
 * the remembered side is restored so a prior rigid-slope step
 * cannot reverse the intended 2+1 direction.
 *
 * protrusion RIGHT of triangle centre -> LEFT pair + RIGHT solo
 * protrusion LEFT  of triangle centre -> RIGHT pair + LEFT solo
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexFirstContactSideLockV21
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

    window.__sixBallUpConvexFirstContactSideLockV21 = true;

    const basePlanGroup = hexPhysPlanGroup;
    const baseSeparator = hexPhysUpConvexSeparator;

    /* Synchronous preview-only observation used during one planner call. */
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

    function tripletGeometry(board, members){
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

        const px = (lower[0].x + lower[1].x) / 2;
        const py = lowerY + 1;
        const support = valid(px,py) ? board?.[py]?.[px] : null;

        if(
            !support ||
            members.some(m => m.ball.id === support.id)
        ){
            return null;
        }

        const offset = continuousOffset(members);
        const baseLeft = lower[0].x + offset;
        const baseRight = lower[1].x + offset;
        const width = baseRight - baseLeft;

        if(Math.abs(width) <= 1e-9)
            return null;

        const hitFraction = (px - baseLeft) / width;

        if(
            hitFraction < 0.25 - 1e-9 ||
            hitFraction > 0.75 + 1e-9
        ){
            return null;
        }

        const triangleCenter = (baseLeft + baseRight) / 2;
        const delta = triangleCenter - px;

        /* Exact centre keeps the canonical tie-break. */
        if(Math.abs(delta) <= 1e-9)
            return null;

        return {
            lower,
            top,
            support,
            px,
            py,
            hitFraction,
            triangleCenter,
            protrusionCenter: px,
            delta,
            pairDir: delta > 0 ? 1 : -1,
            groupId: Number(members[0]?.ball?.motionGroupId) || 0
        };
    }

    function readSideLock(members, supportId){
        if(!isUpTriplet(members) || !supportId)
            return null;

        const locks = members
            .map(m => m?.ball?._upConvexFirstContactSideLockV21)
            .filter(Boolean)
            .filter(l => l.supportId === supportId);

        /* A persistent lock is valid only if all 3 members agree. */
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
        if(!g)
            return null;

        return {
            supportId: g.support.id,
            groupId: g.groupId,
            pairDir: g.pairDir,
            triangleCenter: g.triangleCenter,
            protrusionCenter: g.protrusionCenter,
            delta: g.delta,
            hitFraction: g.hitFraction
        };
    }

    function persistFirstSide(members, g){
        if(!g)
            return null;

        const existing = readSideLock(members, g.support.id);
        if(existing)
            return existing;

        const lock = geometryAsLock(g);

        for(const m of members){
            m.ball._upConvexFirstContactSideLockV21 = {...lock};
        }

        window.__sixBallLastUpConvexFirstContactObserved = {
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

    function outwardSoloMotion(board, solo, direction, info, members){
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
            kind: direction < 0 ? "ROLL_LEFT" : "ROLL_RIGHT",
            pivot: [info.px, info.py],
            topPivot: null,
            followSupportIds: []
        };
    }

    /*
     * Observe first-contact geometry BEFORE v3.9 can translate the
     * triplet past the protrusion.  Preview calls stay read-only:
     * activeObservation exists only on the synchronous call stack.
     */
    hexPhysPlanGroup = function(board, members, preview=false){
        const observed = isUpTriplet(members)
            ? tripletGeometry(board, members)
            : null;

        if(!preview && observed){
            persistFirstSide(members, observed);
        }

        const previousObservation = activeObservation;
        activeObservation = observed;

        try{
            return basePlanGroup(board, members, preview);
        }finally{
            activeObservation = previousObservation;
        }
    };

    /*
     * Canonical v3.9 still owns split timing.  Only after it returns
     * a real separator do we restore the first-contact side.
     */
    hexPhysUpConvexSeparator = function(board, members, motions){
        const info = baseSeparator(board, members, motions);

        if(!info || !isUpTriplet(members))
            return info;

        const supportId = info?.support?.id;

        const lock =
            readSideLock(members, supportId) ||
            currentObservationLock(members, supportId);

        if(!lock)
            return info;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x-b.x);
        const top = members.find(m => m.y < lowerY);

        if(lower.length !== 2 || !top)
            return info;

        const pairDir = lock.pairDir > 0 ? 1 : -1;
        const pairLower = pairDir > 0 ? lower[1] : lower[0];
        const solo = pairDir > 0 ? lower[0] : lower[1];
        const soloDirection = -pairDir;

        let soloMotion =
            motions?.[members.indexOf(solo)] || null;

        if(
            !soloMotion ||
            Math.sign(soloMotion.tx - solo.x) !== soloDirection
        ){
            soloMotion = outwardSoloMotion(
                board,
                solo,
                soloDirection,
                info,
                members
            );
        }

        /* Do not manufacture a path through an occupied target. */
        if(
            !soloMotion ||
            Math.sign(soloMotion.tx - solo.x) !== soloDirection
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
            triangleCenterAtFirstContact: lock.triangleCenter,
            protrusionCenterAtFirstContact: lock.protrusionCenter,
            firstContactDelta: lock.delta,
            firstContactSideLocked: true,
            pairSide: pairDir > 0 ? "right" : "left",
            soloSide: pairDir > 0 ? "left" : "right"
        };

        window.__sixBallLastUpConvexAppliedSideLock = {
            supportId,
            groupId: lock.groupId,
            delta: lock.delta,
            pairSide: corrected.pairSide,
            soloSide: corrected.soloSide,
            ids: {
                top: top.ball.id,
                pairLower: pairLower.ball.id,
                solo: solo.ball.id
            },
            at: Date.now()
        };

        return corrected;
    };

    window.__sixBallUpConvexContactPriorityVersion =
        "upconvex-first-contact-side-lock-v2.1";

    window.__sixBallUpConvexSplitTimingOwnedByCanonicalResolver = true;
    window.__sixBallUpConvexFirstContactOnlyLocksSide = true;
    window.__sixBallUpConvexPreviewIsReadOnly = true;
})();
