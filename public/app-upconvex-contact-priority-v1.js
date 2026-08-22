/* ============================================================
 * 6ball UP-CONVEX PRE-ARC SIDE LOCK v3.0
 *
 * Side is decided from the triplet position BEFORE the first
 * rigid circular/slope step around the protruding pile ball.
 * Split timing stays owned by the existing canonical resolver.
 *
 * protrusion RIGHT of pre-arc triangle centre -> LEFT pair + RIGHT solo
 * protrusion LEFT  of pre-arc triangle centre -> RIGHT pair + LEFT solo
 * ============================================================ */
(function(){
    if(typeof window === "undefined" || window.__sixBallUpConvexPreArcSideLockV30)
        return;

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysUpConvexSeparator !== "function" ||
        typeof hexPhysIndependentMemberMotion !== "function" ||
        typeof hexPhysEmpty !== "function" ||
        typeof valid !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexPreArcSideLockV30 = true;

    const basePlanGroup = hexPhysPlanGroup;
    const baseSeparator = hexPhysUpConvexSeparator;
    const STORE = "_upConvexPreArcSideLocksV30";
    let activeLocks = null;

    function isUpTriplet(members){
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

    function pieceKey(members){
        return members
            .map(m => String(m.ball.id))
            .sort()
            .join(":");
    }

    function continuousOffset(members){
        const values = members
            .map(m => Number(m?.ball?.impactOffsetX))
            .filter(Number.isFinite)
            .map(v => Math.max(-1, Math.min(1, v)))
            .sort((a,b) => a-b);

        return values.length
            ? values[Math.floor(values.length / 2)]
            : 0;
    }

    function tripletBase(members){
        if(!isUpTriplet(members))
            return null;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x - b.x);
        const top = members.find(m => m.y < lowerY);

        if(lower.length !== 2 || !top || lower[1].x - lower[0].x !== 2)
            return null;

        const offset = continuousOffset(members);
        const leftX = lower[0].x + offset;
        const rightX = lower[1].x + offset;

        return {
            lowerY,
            lower,
            top,
            offset,
            triangleCenter: (leftX + rightX) / 2,
            key: pieceKey(members)
        };
    }

    function makeLock(base, support, px, py, source){
        if(!base || !support || !Number.isFinite(px) || !Number.isFinite(py))
            return null;

        const delta = base.triangleCenter - px;
        if(Math.abs(delta) <= 1e-9)
            return null;

        return {
            supportId: support.id,
            supportX: px,
            supportY: py,
            pieceKey: base.key,
            triangleCenter: base.triangleCenter,
            protrusionCenter: px,
            delta,
            pairDir: delta > 0 ? 1 : -1,
            source
        };
    }

    function directCentreLock(board, members, base){
        const px = (base.lower[0].x + base.lower[1].x) / 2;
        const py = base.lowerY + 1;

        if(!valid(px, py))
            return null;

        const support = board?.[py]?.[px];
        if(!support || members.some(m => m.ball.id === support.id))
            return null;

        return makeLock(base, support, px, py, "direct-centre");
    }

    function externalPivotLocks(board, members, base){
        const own = new Set(members.map(m => m.ball.id));
        const found = new Map();

        for(const member of members){
            let motion = null;
            try{
                motion = hexPhysIndependentMemberMotion(board, members, member);
            }catch(_){
                motion = null;
            }

            if(!motion)
                continue;

            for(const field of ["pivot", "topPivot"]){
                const pv = motion[field];
                if(!Array.isArray(pv) || pv.length < 2)
                    continue;

                const px = Number(pv[0]);
                const py = Number(pv[1]);
                if(!Number.isFinite(px) || !Number.isFinite(py) || !valid(px, py))
                    continue;

                const support = board?.[py]?.[px];
                if(!support || own.has(support.id))
                    continue;

                const lock = makeLock(base, support, px, py, "pre-arc-member-pivot");
                if(lock && !found.has(String(lock.supportId)))
                    found.set(String(lock.supportId), lock);
            }
        }

        return [...found.values()];
    }

    function observeLocks(board, members){
        const base = tripletBase(members);
        if(!base)
            return new Map();

        const out = new Map();
        const direct = directCentreLock(board, members, base);
        if(direct)
            out.set(String(direct.supportId), direct);

        for(const lock of externalPivotLocks(board, members, base)){
            const key = String(lock.supportId);
            if(!out.has(key))
                out.set(key, lock);
        }

        return out;
    }

    function getStore(ball){
        if(!ball || typeof ball !== "object")
            return null;

        if(!ball[STORE] || typeof ball[STORE] !== "object")
            ball[STORE] = Object.create(null);

        return ball[STORE];
    }

    function persistLocks(members, locks){
        for(const lock of locks.values()){
            const key = String(lock.supportId);

            for(const m of members){
                const store = getStore(m.ball);
                if(store && !store[key])
                    store[key] = {...lock};
            }

            window.__sixBallLastUpConvexPreArcObservedV30 = {
                ...lock,
                pairSide: lock.pairDir > 0 ? "right" : "left",
                soloSide: lock.pairDir > 0 ? "left" : "right",
                ids: members.map(m => m.ball.id),
                at: Date.now()
            };
        }
    }

    function readPersistentLock(members, supportId){
        if(!isUpTriplet(members) || supportId == null)
            return null;

        const key = String(supportId);
        const pkey = pieceKey(members);
        const locks = members
            .map(m => m?.ball?.[STORE]?.[key])
            .filter(Boolean);

        if(locks.length !== 3)
            return null;

        const first = locks[0];
        if(
            first.pieceKey !== pkey ||
            !locks.every(l =>
                l.supportId === first.supportId &&
                l.pieceKey === first.pieceKey &&
                l.pairDir === first.pairDir
            )
        ){
            return null;
        }

        return first;
    }

    function activeLockFor(members, supportId){
        if(!activeLocks || supportId == null || !isUpTriplet(members))
            return null;

        const lock = activeLocks.get(String(supportId));
        return lock && lock.pieceKey === pieceKey(members)
            ? lock
            : null;
    }

    function outwardSoloMotion(board, solo, direction, info, members){
        const tx = solo.x + direction;
        const ty = solo.y + 1;
        const ignore = new Set(
            members
                .filter(m => m.ball.id !== solo.ball.id)
                .map(m => m.ball.id)
        );

        if(!valid(tx, ty) || !hexPhysEmpty(board, tx, ty, ignore))
            return null;

        return {
            x: solo.x,
            y: solo.y,
            tx,
            ty,
            ball: solo.ball,
            kind: direction < 0 ? "ROLL_LEFT" : "ROLL_RIGHT",
            pivot: Number.isFinite(info?.px) && Number.isFinite(info?.py)
                ? [info.px, info.py]
                : null,
            topPivot: null,
            followSupportIds: []
        };
    }

    /*
     * IMPORTANT: side observation happens before basePlanGroup.
     * Therefore a subsequent rigid arc cannot rewrite the side.
     * We do not force a split here; canonical timing is unchanged.
     */
    hexPhysPlanGroup = function(board, members, preview=false){
        if(!isUpTriplet(members))
            return basePlanGroup(board, members, preview);

        const observed = observeLocks(board, members);
        if(!preview)
            persistLocks(members, observed);

        const previousActive = activeLocks;
        activeLocks = observed;

        try{
            return basePlanGroup(board, members, preview);
        }finally{
            activeLocks = previousActive;
        }
    };

    /*
     * Canonical resolver still decides WHEN splitting is legal.
     * Once it returns a real protrusion, only the pair/solo side
     * is restored from the pre-arc observation of that support.
     */
    hexPhysUpConvexSeparator = function(board, members, motions){
        const info = baseSeparator(board, members, motions);
        if(!info || !isUpTriplet(members))
            return info;

        const supportId = info?.support?.id;
        const lock =
            readPersistentLock(members, supportId) ||
            activeLockFor(members, supportId);

        if(!lock)
            return info;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x - b.x);
        const top = members.find(m => m.y < lowerY);

        if(lower.length !== 2 || !top)
            return info;

        const pairDir = lock.pairDir > 0 ? 1 : -1;
        const pairLower = pairDir > 0 ? lower[1] : lower[0];
        const solo = pairDir > 0 ? lower[0] : lower[1];
        const soloDirection = -pairDir;

        let soloMotion = motions?.[members.indexOf(solo)] || null;

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

        /* Wait rather than flip to the wrong side. */
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
            triangleCenterAtSideDecision: lock.triangleCenter,
            protrusionCenterAtSideDecision: lock.protrusionCenter,
            sideDecisionDelta: lock.delta,
            sideDecisionSource: lock.source,
            preArcSideLocked: true,
            pairSide: pairDir > 0 ? "right" : "left",
            soloSide: pairDir > 0 ? "left" : "right"
        };

        window.__sixBallLastUpConvexAppliedPreArcLockV30 = {
            supportId,
            source: lock.source,
            triangleCenter: lock.triangleCenter,
            protrusionCenter: lock.protrusionCenter,
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
        "upconvex-pre-arc-side-lock-v3.0";
    window.__sixBallUpConvexPreArcSideAuthoritative = true;
    window.__sixBallUpConvexSplitTimingOwnedByCanonicalResolver = true;
    window.__sixBallUpConvexPreviewIsReadOnly = true;
})();
