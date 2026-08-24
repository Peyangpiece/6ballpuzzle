/* ============================================================
 * 6ball UP-CONVEX PRE-ARC SIDE LOCK v3.3
 *
 * The split side is decided from the continuous UP-triplet
 * position BEFORE the first rigid arc around the protruding pile
 * ball.  The top member's impactOffsetX is authoritative because
 * the canonical v3.9 separator uses that exact release offset.
 *
 * protrusion RIGHT of pre-arc triangle centre -> LEFT pair + RIGHT solo
 * protrusion LEFT  of pre-arc triangle centre -> RIGHT pair + LEFT solo
 *
 * Split timing is NOT changed here.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexPreArcSideLockV33
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysUpConvexSeparator !== "function" ||
        typeof hexPhysIndependentMemberMotion !== "function" ||
        typeof hexPhysEmpty !== "function" ||
        typeof valid !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexPreArcSideLockV33 = true;
    /* Compatibility markers for diagnostics written against v3.1/v3.2. */
    window.__sixBallUpConvexPreArcSideLockV32 = true;
    window.__sixBallUpConvexPreArcSideLockV31 = true;

    const basePlanGroup = hexPhysPlanGroup;
    const baseSeparator = hexPhysUpConvexSeparator;
    const STORE = "_upConvexPreArcSideLocksV31";
    const PIECE_GEOMETRY_STORE =
        "_upConvexFirstPieceGeometryV33";
    const APPROACH_STORE = "_upConvexRigidApproachDirectionV32";

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

    function clampOffset(v){
        return Math.max(-1, Math.min(1, v));
    }

    /*
     * IMPORTANT:
     * v3.0 used the median of all 3 impactOffsetX values.
     * In the live game the two lower members can already be 0
     * while the TOP member still carries the true continuous
     * release offset.  Median(0,0,realOffset) destroys the sign
     * and turns a slightly-left / slightly-right contact into a
     * false exact-centre tie.  The following arc then crosses the
     * support and the later position decides the opposite side.
     *
     * Canonical v3.9 already treats top.ball.impactOffsetX as the
     * authoritative continuous release coordinate, so mirror it.
     */
    function continuousOffset(members, top){
        const topOffset = Number(top?.ball?.impactOffsetX);

        if(Number.isFinite(topOffset))
            return clampOffset(topOffset);

        const values = members
            .map(m => Number(m?.ball?.impactOffsetX))
            .filter(Number.isFinite)
            .map(clampOffset)
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

        if(
            lower.length !== 2 ||
            !top ||
            lower[1].x - lower[0].x !== 2
        ){
            return null;
        }

        const offset = continuousOffset(members, top);
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
        if(
            !base ||
            !support ||
            !Number.isFinite(px) ||
            !Number.isFinite(py)
        ){
            return null;
        }

        const delta = base.triangleCenter - px;

        /*
         * Never invent a side for a true exact-centre contact.
         * With v3.1, a real sub-cell release offset no longer
         * collapses to zero merely because the lower members are 0.
         */
        if(Math.abs(delta) <= 1e-9)
            return null;

        return {
            supportId: support.id,
            supportX: px,
            supportY: py,
            pieceKey: base.key,
            releaseOffsetX: base.offset,
            triangleCenter: base.triangleCenter,
            protrusionCenter: px,
            delta,

            // centre right of support -> RIGHT pair
            // centre left  of support -> LEFT pair
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

        if(
            !support ||
            members.some(m => m.ball.id === support.id)
        ){
            return null;
        }

        return makeLock(
            base,
            support,
            px,
            py,
            "pre-arc-direct-centre"
        );
    }

    /*
     * Read the actual support pivots from the members BEFORE the
     * group planner commits its rigid arc.  This is earlier and
     * more reliable than reading the completed GROUP_SLOPE plan.
     */
    function externalPivotLocks(board, members, base){
        const own = new Set(members.map(m => m.ball.id));
        const found = new Map();

        for(const member of members){
            let motion = null;

            try{
                motion = hexPhysIndependentMemberMotion(
                    board,
                    members,
                    member
                );
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

                if(
                    !Number.isFinite(px) ||
                    !Number.isFinite(py) ||
                    !valid(px, py)
                ){
                    continue;
                }

                const support = board?.[py]?.[px];

                if(
                    !support ||
                    own.has(support.id)
                ){
                    continue;
                }

                const lock = makeLock(
                    base,
                    support,
                    px,
                    py,
                    "pre-arc-member-pivot"
                );

                if(
                    lock &&
                    !found.has(String(lock.supportId))
                ){
                    found.set(
                        String(lock.supportId),
                        lock
                    );
                }
            }
        }

        return [...found.values()];
    }

    function observeLocks(board, members){
        const base = tripletBase(members);

        if(!base)
            return new Map();

        const out = new Map();

        const direct = directCentreLock(
            board,
            members,
            base
        );

        if(direct)
            out.set(String(direct.supportId), direct);

        for(
            const lock
            of externalPivotLocks(board, members, base)
        ){
            const key = String(lock.supportId);

            if(!out.has(key))
                out.set(key, lock);
        }

        return out;
    }

    function getStore(ball){
        if(!ball || typeof ball !== "object")
            return null;

        if(
            !ball[STORE] ||
            typeof ball[STORE] !== "object"
        ){
            ball[STORE] = Object.create(null);
        }

        return ball[STORE];
    }

    function persistLocks(members, locks){
        for(const lock of locks.values()){
            const key = String(lock.supportId);

            /*
             * Earliest observation for the same support wins.
             * A post-arc crossing may never overwrite it.
             */
            for(const m of members){
                const store = getStore(m.ball);

                if(store && !store[key])
                    store[key] = {...lock};
            }

            window.__sixBallLastUpConvexPreArcObservedV31 = {
                ...lock,
                pairSide:
                    lock.pairDir > 0
                        ? "right"
                        : "left",
                soloSide:
                    lock.pairDir > 0
                        ? "left"
                        : "right",
                ids: members.map(m => m.ball.id),
                at: Date.now()
            };
        }

        /*
         * A triplet may complete a common slope step and meet a different
         * support before the canonical split becomes legal.  Keep the first
         * unambiguous CONTACT GEOMETRY for the whole piece as well as the
         * support-id lock.  The common slope direction is only motion; it must
         * never swap which coloured member is the solo ball.
         */
        const observed = [...locks.values()];
        const directions = new Set(
            observed
                .map(lock => Math.sign(lock.pairDir))
                .filter(Boolean)
        );

        if(directions.size === 1 && observed.length){
            const geometry =
                observed.find(lock =>
                    lock.source ===
                    "pre-arc-direct-centre"
                ) || observed[0];

            const record = {
                ...geometry,
                pieceKey: pieceKey(members),
                geometrySource: geometry.source
            };

            for(const m of members){
                if(!m.ball[PIECE_GEOMETRY_STORE])
                    m.ball[PIECE_GEOMETRY_STORE] =
                        {...record};
            }

            const firstRecord =
                members[0]?.ball?.[
                    PIECE_GEOMETRY_STORE
                ] || record;

            window.__sixBallLastUpConvexPieceGeometryV33 = {
                ...firstRecord,
                pairSide:
                    firstRecord.pairDir > 0
                        ? "right"
                        : "left",
                soloSide:
                    firstRecord.pairDir > 0
                        ? "left"
                        : "right",
                ids: members.map(m => m.ball.id),
                at: Date.now()
            };
        }
    }

    /*
     * The final rigid-until-impossible wrapper may complete a common slope
     * step without delegating to this wrapper.  Expose the same pre-arc
     * observation path so that early rigid continuation still records the
     * side decision before the triangle crosses its support.
     */
    window.__sixBallRememberUpConvexPreArcSideV31 = function(
        board,
        members
    ){
        const observed = observeLocks(
            board,
            members
        );

        persistLocks(
            members,
            observed
        );

        return [...observed.values()]
            .map(lock => ({...lock}));
    };

    /*
     * A rigid slope can move from one support ball to the next before the
     * canonical separator becomes legal.  Support-id locks cannot cover that
     * hand-off, so also retain the direction of the last common rigid step.
     * This never decides split timing; it is only a side fallback after the
     * canonical separator has already confirmed a real 1+2 event.
     */
    window.__sixBallRememberUpConvexRigidApproachV32 = function(
        members,
        plan
    ){
        const base = tripletBase(members);

        if(
            !base ||
            !Array.isArray(plan) ||
            plan.length !== 3
        ){
            return null;
        }

        const pairDir = Math.sign(
            Number(plan[0]?.tx) -
            Number(plan[0]?.x)
        );

        if(
            !pairDir ||
            !plan.every(p =>
                Math.sign(
                    Number(p?.tx) -
                    Number(p?.x)
                ) === pairDir
            )
        ){
            return null;
        }

        const record = {
            pieceKey: base.key,
            pairDir,
            releaseOffsetX: base.offset,
            triangleCenter: base.triangleCenter,
            source: "last-common-rigid-slope-direction"
        };

        for(const m of members)
            m.ball[APPROACH_STORE] = {...record};

        window.__sixBallLastUpConvexRigidApproachV32 = {
            ...record,
            pairSide:
                pairDir > 0
                    ? "right"
                    : "left",
            soloSide:
                pairDir > 0
                    ? "left"
                    : "right",
            ids: members.map(m => m.ball.id),
            at: Date.now()
        };

        return {...record};
    };

    function readPersistentLock(members, supportId){
        if(
            !isUpTriplet(members) ||
            supportId == null
        ){
            return null;
        }

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
        if(
            !activeLocks ||
            supportId == null ||
            !isUpTriplet(members)
        ){
            return null;
        }

        const lock = activeLocks.get(
            String(supportId)
        );

        return(
            lock &&
            lock.pieceKey === pieceKey(members)
        )
            ? lock
            : null;
    }

    function firstPieceGeometryLockFor(members, supportId){
        if(
            supportId == null ||
            !isUpTriplet(members)
        ){
            return null;
        }

        const pkey = pieceKey(members);
        const records = members
            .map(m =>
                m?.ball?.[PIECE_GEOMETRY_STORE]
            )
            .filter(Boolean);

        if(records.length !== 3)
            return null;

        const first = records[0];
        const pairDir = Math.sign(
            Number(first.pairDir)
        );

        if(
            !pairDir ||
            first.pieceKey !== pkey ||
            !records.every(record =>
                record.pieceKey === pkey &&
                Math.sign(
                    Number(record.pairDir)
                ) === pairDir
            )
        ){
            return null;
        }

        return {
            ...first,
            supportId,
            source:
                "first-pre-arc-piece-geometry"
        };
    }

    function rigidApproachLockFor(
        members,
        supportId,
        info
    ){
        if(
            supportId == null ||
            !isUpTriplet(members)
        ){
            return null;
        }

        const pkey = pieceKey(members);
        const records = members
            .map(m => m?.ball?.[APPROACH_STORE])
            .filter(Boolean);

        if(records.length !== 3)
            return null;

        const first = records[0];
        const pairDir = Math.sign(
            Number(first.pairDir)
        );

        if(
            !pairDir ||
            first.pieceKey !== pkey ||
            !records.every(record =>
                record.pieceKey === pkey &&
                Math.sign(
                    Number(record.pairDir)
                ) === pairDir
            )
        ){
            return null;
        }

        return {
            supportId,
            pieceKey: pkey,
            pairDir,
            releaseOffsetX:
                first.releaseOffsetX,
            triangleCenter:
                first.triangleCenter,
            protrusionCenter:
                Number(info?.px),
            /* Only the sign is authoritative for this cross-support lock. */
            delta: pairDir,
            source:
                first.source ||
                "last-common-rigid-slope-direction"
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
                .filter(
                    m =>
                        m.ball.id !==
                        solo.ball.id
                )
                .map(m => m.ball.id)
        );

        if(
            !valid(tx, ty) ||
            !hexPhysEmpty(
                board,
                tx,
                ty,
                ignore
            )
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
            pivot:
                Number.isFinite(info?.px) &&
                Number.isFinite(info?.py)
                    ? [info.px, info.py]
                    : null,
            topPivot: null,
            followSupportIds: []
        };
    }

    /*
     * Observe BEFORE basePlanGroup.
     * This is the state shown immediately before the rigid arc.
     * Preview remains read-only.
     */
    hexPhysPlanGroup = function(
        board,
        members,
        preview=false
    ){
        if(!isUpTriplet(members))
            return basePlanGroup(
                board,
                members,
                preview
            );

        const observed = observeLocks(
            board,
            members
        );

        if(!preview)
            persistLocks(
                members,
                observed
            );

        const previousActive = activeLocks;
        activeLocks = observed;

        try{
            return basePlanGroup(
                board,
                members,
                preview
            );
        }finally{
            activeLocks = previousActive;
        }
    };

    /*
     * Canonical resolver remains the sole authority for WHEN the
     * split is legal.  We only restore WHICH side gets the pair.
     */
    hexPhysUpConvexSeparator = function(
        board,
        members,
        motions
    ){
        const info = baseSeparator(
            board,
            members,
            motions
        );

        if(
            !info ||
            !isUpTriplet(members)
        ){
            return info;
        }

        const supportId = info?.support?.id;

        const lock =
            readPersistentLock(
                members,
                supportId
            ) ||
            activeLockFor(
                members,
                supportId
            ) ||
            firstPieceGeometryLockFor(
                members,
                supportId
            ) ||
            rigidApproachLockFor(
                members,
                supportId,
                info
            );

        if(!lock)
            return info;

        const lowerY = Math.max(
            ...members.map(m => m.y)
        );

        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x - b.x);

        const top = members.find(
            m => m.y < lowerY
        );

        if(
            lower.length !== 2 ||
            !top
        ){
            return info;
        }

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

        const soloDirection = -pairDir;

        let soloMotion =
            motions?.[
                members.indexOf(solo)
            ] || null;

        if(
            !soloMotion ||
            Math.sign(
                soloMotion.tx -
                solo.x
            ) !== soloDirection
        ){
            soloMotion = outwardSoloMotion(
                board,
                solo,
                soloDirection,
                info,
                members
            );
        }

        /*
         * Do not flip to the opposite side merely because the
         * correct side is temporarily blocked.  Wait instead.
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

            releaseOffsetAtSideDecision:
                lock.releaseOffsetX,

            triangleCenterAtSideDecision:
                lock.triangleCenter,

            protrusionCenterAtSideDecision:
                lock.protrusionCenter,

            sideDecisionDelta:
                lock.delta,

            sideDecisionSource:
                lock.source,

            preArcSideLocked:
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

        window.__sixBallLastUpConvexAppliedPreArcLockV31 = {
            supportId,
            source: lock.source,
            releaseOffsetX:
                lock.releaseOffsetX,
            triangleCenter:
                lock.triangleCenter,
            protrusionCenter:
                lock.protrusionCenter,
            delta:
                lock.delta,
            pairSide:
                corrected.pairSide,
            soloSide:
                corrected.soloSide,
            ids: {
                top: top.ball.id,
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
        "upconvex-pre-arc-side-lock-v3.3";

    window.__sixBallUpConvexPreArcObserverExposed = true;

    window.__sixBallUpConvexRigidApproachObserverExposed = true;

    window.__sixBallUpConvexCrossSupportSideLock = true;

    window.__sixBallUpConvexCrossSupportUsesContactGeometry =
        true;

    window.__sixBallUpConvexCrossSupportUsesFirstContactGeometry =
        true;

    window.__sixBallUpConvexRigidApproachIsLastResort =
        true;

    window.__sixBallUpConvexPreArcSideAuthoritative =
        true;

    window.__sixBallUpConvexUsesTopReleaseOffset =
        true;

    window.__sixBallUpConvexSplitTimingOwnedByCanonicalResolver =
        true;

    window.__sixBallUpConvexPreviewIsReadOnly =
        true;
})();
