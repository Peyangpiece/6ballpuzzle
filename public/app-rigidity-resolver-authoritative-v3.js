/* ============================================================
 * 6ball RIGIDITY RESOLVER AUTHORITATIVE v3
 *
 * FINAL CONTRACT
 *
 * 1. Common rigid motion possible
 *      -> KEEP rigidity.
 *
 * 2. Common rigid motion impossible, but one or more members
 *    have real independent gravity motion
 *      -> this IS a physical split event.
 *
 * 3. 3 -> 1 + 2
 *      -> preserve the 2-ball branch whenever physically
 *         possible.
 *
 * 4. 2-ball branch
 *      -> stays rigid while it can move together.
 *      -> if members require different physical motions,
 *         the pair really splits.
 *
 * 5. No member has any independent motion
 *      -> stable/final structure, not illegal floating.
 *
 * 6. Preview and commit must agree.
 *      -> no "legalMove=true but CORE EVENT=[]" livelock.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallRigidityResolverAuthoritativeV3
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup!=="function" ||
        typeof hexPhysResolveEvent!=="function" ||
        typeof hexPhysIndependentMemberMotion!=="function" ||
        typeof settlePass!=="function"
    ){
        return;
    }

    window.__sixBallRigidityResolverAuthoritativeV3=true;


    const previousPlanGroup=
        hexPhysPlanGroup;

    const previousSettlePass=
        settlePass;

    const previousUnstableFrozenBalls=
        typeof unstableFrozenBalls==="function"
            ?unstableFrozenBalls
            :null;


    function normalGroup(members){

        return !!(
            Array.isArray(members) &&
            (members.length===2 || members.length===3) &&
            members.every(
                m=>
                    m?.ball &&
                    typeof m.ball==="object" &&
                    !m.ball.isGarbage
            )
        );
    }


    function orientationOf(members){

        return(
            members?.[0]?.orientation ||
            members?.[0]?.ball?.motionGroupOrientation ||
            ""
        );
    }


    function memberMotions(
        board,
        members
    ){

        return members.map(
            m=>
                hexPhysIndependentMemberMotion(
                    board,
                    members,
                    m
                )
        );
    }


    function vectorOf(p){

        if(!p)
            return null;

        return[
            p.tx-p.x,
            p.ty-p.y
        ];
    }


    function sameVector(a,b){

        const x=vectorOf(a);
        const y=vectorOf(b);

        return !!(
            x &&
            y &&
            x[0]===y[0] &&
            x[1]===y[1]
        );
    }


    function independentProposal(p){

        return{
            ...p,

            bundleId:0,
            groupSize:0,

            followSupportIds:
                Array.isArray(p.followSupportIds)
                    ?[...p.followSupportIds]
                    :[],

            physicalRigiditySplit:true
        };
    }


    function preservePair(
        pair,
        originalMembers
    ){

        if(pair.length!==2)
            return;


        let gid=
            pair[0].ball.motionGroupId ||
            pair[1].ball.motionGroupId ||
            originalMembers[0]?.ball?.motionGroupId ||
            0;


        if(!gid){

            if(
                typeof hexPhysSetGroup===
                    "function"
            ){

                gid=
                    hexPhysSetGroup(

                        pair.map(
                            m=>({

                                ball:m.ball,
                                x:m.x,
                                y:m.y,

                                role:
                                    Number.isFinite(
                                        m.ball.motionGroupRole
                                    )
                                        ?m.ball.motionGroupRole
                                        :-1,

                                orientation:
                                    orientationOf(
                                        originalMembers
                                    )
                            })
                        ),

                        2,

                        orientationOf(
                            originalMembers
                        )
                    );
            }
        }


        for(const m of pair){

            if(gid)
                m.ball.motionGroupId=gid;

            m.ball.motionGroupSize=2;
            m.ball.rigid=true;
        }
    }


    function separateSolo(
        solo
    ){

        if(
            solo?.ball &&
            typeof hexPhysClearGroupBall===
                "function"
        ){

            hexPhysClearGroupBall(
                solo.ball
            );
        }
    }


    /*
     * Find a pair that should survive a 3 -> 1+2 split.
     *
     * Priority:
     *
     * A. two members already share the same real motion
     * B. two members are both physically pinned while the
     *    third member separates
     * C. canonical 2-ball planner can continue them together
     */
    function bestPairCandidate(
        board,
        members,
        motions
    ){

        const combos=[
            [0,1,2],
            [0,2,1],
            [1,2,0]
        ];


        let best=null;


        for(
            const [a,b,s]
            of combos
        ){

            const pair=[
                members[a],
                members[b]
            ];

            const solo=
                members[s];

            const ma=
                motions[a];

            const mb=
                motions[b];

            const ms=
                motions[s];


            let previewPlan=[];


            try{

                previewPlan=
                    previousPlanGroup(
                        board,
                        pair,
                        true
                    )||[];

            }catch(e){

                previewPlan=[];
            }


            let score=0;


            if(
                ma &&
                mb &&
                sameVector(ma,mb)
            ){
                score+=100;
            }


            if(
                !ma &&
                !mb &&
                ms
            ){
                score+=90;
            }


            if(previewPlan.length)
                score+=60;


            /*
             * A surviving pair only makes sense when the
             * third ball is actually distinguishable from it.
             */
            if(
                ms &&
                (
                    !ma ||
                    !mb ||
                    !sameVector(ms,ma) ||
                    !sameVector(ms,mb)
                )
            ){
                score+=20;
            }


            if(
                !best ||
                score>best.score
            ){

                best={
                    score,
                    pair,
                    solo,
                    soloIndex:s,
                    previewPlan
                };
            }
        }


        return(
            best &&
            best.score>0
        )
            ?best
            :null;
    }


    hexPhysPlanGroup=
        function(
            board,
            members,
            preview=false
        ){

            /*
             * First allow all already-authoritative rules:
             *
             * - common vertical rigid fall
             * - completely smooth slope
             * - correct UP-convex protrusion split
             * - ordinary pair pivot
             */
            const base=
                previousPlanGroup(
                    board,
                    members,
                    preview
                )||[];


            if(base.length)
                return base;


            if(!normalGroup(members))
                return base;


            const motions=
                memberMotions(
                    board,
                    members
                );


            const moving=
                motions
                .map(
                    (p,i)=>({
                        p,
                        i
                    })
                )
                .filter(
                    q=>!!q.p
                );


            /*
             * Nobody has any independent physical motion.
             *
             * This is a stable/final structure.
             *
             * Do NOT manufacture movement.
             */
            if(!moving.length){

                return[];
            }


            /* =================================================
             * 2 BALLS
             *
             * Base rigid continuation has already failed.
             *
             * Therefore if any member can still physically
             * move, the pair itself has reached a TRUE split.
             * ================================================= */

            if(members.length===2){

                if(!preview){

                    for(const m of members){

                        if(
                            typeof hexPhysClearGroupBall===
                                "function"
                        ){

                            hexPhysClearGroupBall(
                                m.ball
                            );
                        }
                    }


                    window.__sixBallLastPairPhysicalSplit={

                        ids:
                            members.map(
                                m=>m.ball.id
                            ),

                        motions:
                            motions.map(
                                vectorOf
                            ),

                        at:
                            Date.now()
                    };
                }


                return moving.map(
                    q=>
                        independentProposal(
                            q.p
                        )
                );
            }


            /* =================================================
             * 3 BALLS
             *
             * Common 3-ball continuation failed.
             *
             * Try to preserve a legitimate 2-ball branch.
             * ================================================= */

            const candidate=
                bestPairCandidate(
                    board,
                    members,
                    motions
                );


            if(candidate){

                let pairPlan=
                    candidate.previewPlan;


                if(!preview){

                    separateSolo(
                        candidate.solo
                    );


                    preservePair(
                        candidate.pair,
                        members
                    );


                    try{

                        const committed=
                            previousPlanGroup(
                                board,
                                candidate.pair,
                                false
                            )||[];


                        if(committed.length)
                            pairPlan=committed;

                    }catch(e){}


                    window.__sixBallLastTripletPhysicalSplit={

                        originalIds:
                            members.map(
                                m=>m.ball.id
                            ),

                        pairIds:
                            candidate.pair.map(
                                m=>m.ball.id
                            ),

                        soloId:
                            candidate.solo.ball.id,

                        motions:
                            motions.map(
                                vectorOf
                            ),

                        at:
                            Date.now()
                    };
                }


                const out=[
                    ...(pairPlan||[])
                ];


                const soloMotion=
                    motions[
                        candidate.soloIndex
                    ];


                if(soloMotion){

                    out.push(
                        independentProposal(
                            soloMotion
                        )
                    );
                }


                /*
                 * If the pair is temporarily stationary but
                 * the solo can leave, moving only the solo is
                 * the correct first event.
                 */
                if(out.length)
                    return out;
            }


            /* =================================================
             * No legitimate 2-ball continuation exists.
             *
             * The triplet has physically fragmented.
             * ================================================= */

            if(!preview){

                for(const m of members){

                    if(
                        typeof hexPhysClearGroupBall===
                            "function"
                    ){

                        hexPhysClearGroupBall(
                            m.ball
                        );
                    }
                }


                window.__sixBallLastFullTripletSplit={

                    ids:
                        members.map(
                            m=>m.ball.id
                        ),

                    motions:
                        motions.map(
                            vectorOf
                        ),

                    at:
                        Date.now()
                };
            }


            return moving.map(
                q=>
                    independentProposal(
                        q.p
                    )
            );
        };


    /* ========================================================
     * ILLEGAL-FLOAT CONTRACT
     *
     * A rigid group with:
     *
     *   no legal rigid plan
     *   AND
     *   no independent member motion
     *
     * is simply STABLE.
     *
     * It must not be classified as an unresolved floating
     * error forever.
     * ======================================================== */

    if(previousUnstableFrozenBalls){

        unstableFrozenBalls=
            function(board){

                const raw=
                    previousUnstableFrozenBalls(
                        board
                    )||[];


                if(!raw.length)
                    return raw;


                const stableGroupIds=
                    new Set();


                if(
                    typeof hexPhysGroups===
                        "function"
                ){

                    for(
                        const members
                        of hexPhysGroups(
                            board
                        ).values()
                    ){

                        if(!normalGroup(members))
                            continue;


                        let plan=[];


                        try{

                            plan=
                                hexPhysPlanGroup(
                                    board,
                                    members,
                                    true
                                )||[];

                        }catch(e){

                            plan=[];
                        }


                        if(plan.length)
                            continue;


                        const motions=
                            memberMotions(
                                board,
                                members
                            );


                        if(
                            motions.some(Boolean)
                        ){
                            continue;
                        }


                        for(const m of members){

                            stableGroupIds.add(
                                m.ball.id
                            );
                        }
                    }
                }


                return raw.filter(
                    q=>
                        !stableGroupIds.has(
                            q.id
                        )
                );
            };


        boardHasIllegalFloat=
            function(board){

                return(
                    unstableFrozenBalls(
                        board
                    ).length>0
                );
            };
    }


    /* ========================================================
     * PREVIEW / COMMIT PARITY
     *
     * This is the direct fix for the captured contradiction:
     *
     * hasLegalGravityMove == true
     * but
     * CORE EVENT == []
     *
     * hasLegalGravityMove() calls settlePass(board,true), so
     * the final preview contract is enforced here.
     * ======================================================== */

    settlePass=
        function(
            board,
            preview=false
        ){

            const groups=
                typeof hexPhysGroups==="function"
                    ?[
                        ...hexPhysGroups(
                            board
                        ).values()
                     ]
                    :[];


            if(preview){

                /*
                 * When rigid groups exist, the canonical event
                 * resolver is the sole authority.
                 *
                 * This prevents older preview wrappers from
                 * reporting a move that commit cannot perform.
                 */
                if(groups.length){

                    try{

                        return(
                            hexPhysResolveEvent(
                                board,
                                true
                            ).length>0
                        );

                    }catch(e){

                        return false;
                    }
                }


                /*
                 * No rigid groups:
                 * preserve accumulated-pile / garbage special
                 * preview behaviour.
                 */
                return !!previousSettlePass(
                    board,
                    true
                );
            }


            /*
             * First let existing continuous-collapse logic
             * perform its ordinary commit.
             */
            const expected=
                groups.length
                    ?hexPhysResolveEvent(
                        board,
                        true
                     )
                    :[];


            const moved=
                !!previousSettlePass(
                    board,
                    false
                );


            if(moved)
                return true;


            /*
             * Absolute invariant:
             *
             * If preview produced a canonical event but an
             * older commit wrapper rejected it, commit exactly
             * that canonical event now.
             */
            if(expected.length){

                const accepted=
                    hexPhysResolveEvent(
                        board,
                        false
                    );


                if(
                    accepted.length &&
                    typeof hexPhysApplyEvent===
                        "function"
                ){

                    return !!hexPhysApplyEvent(
                        board,
                        accepted
                    );
                }
            }


            return false;
        };


    window.__sixBallRigidityResolverVersion=
        "rigidity-resolver-authoritative-v3";

    window.__sixBallPreviewCommitParity=
        true;

    window.__sixBallDifferentPhysicalMotionCausesSplit=
        true;

    window.__sixBallStableRigidGroupIsNotIllegalFloat=
        true;

    window.__sixBallTwoBallBranchPreserved=
        true;

})();


/* ============================================================
 * TERMINAL RIGID STABILITY v3.1
 *
 * Captured freeze condition:
 *
 * pending = 0
 * nearlySettled = true
 * legal gravity event = false
 * hexPhysResolveEvent = []
 * but boardHasIllegalFloat = true
 *
 * In this exact state a normal rigid 2/3-ball group is not
 * an illegal floating object. It is a terminal rigid body.
 *
 * This patch:
 * - does NOT move balls
 * - does NOT break rigidity
 * - does NOT fill holes
 * - does NOT change slope physics
 * - only fixes SETTLE completion classification
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallTerminalRigidStabilityV31
    ){
        return;
    }

    if(
        typeof unstableFrozenBalls !== "function" ||
        typeof hexPhysResolveEvent !== "function" ||
        typeof hexPhysGroups !== "function"
    ){
        return;
    }

    window.__sixBallTerminalRigidStabilityV31 = true;

    const baseUnstableFrozenBalls =
        unstableFrozenBalls;

    const baseHexPhysApplyEvent =
        typeof hexPhysApplyEvent === "function"
            ? hexPhysApplyEvent
            : null;

    const baseReleaseSettledConstraints =
        typeof releaseSettledConstraints === "function"
            ? releaseSettledConstraints
            : null;

    const basePrepareGarbageBatch =
        typeof prepareGarbageBatch === "function"
            ? prepareGarbageBatch
            : null;


    function boardBalls(board){

        const out = [];

        if(!board)
            return out;

        for(
            let y = boardScanMin(board);
            y < ROWS;
            y++
        ){
            for(let x = 0; x < W2; x++){

                if(!valid(x,y))
                    continue;

                const ball = board[y][x];

                if(ball && typeof ball === "object"){

                    out.push({
                        ball,
                        x,
                        y
                    });
                }
            }
        }

        return out;
    }


    function clearTerminalMarks(board){

        for(const q of boardBalls(board)){

            delete q.ball.__terminalRigidStableV31;
        }
    }


    function canonicalEventCount(board){

        try{

            const e =
                hexPhysResolveEvent(
                    board,
                    true
                );

            return Array.isArray(e)
                ? e.length
                : 0;

        }catch(err){

            return -1;
        }
    }


    function markTerminalRigidGroups(board){

        const eventCount =
            canonicalEventCount(board);

        /*
         * Any real accepted event means the board is not
         * terminal yet.
         */
        if(eventCount !== 0){

            clearTerminalMarks(board);

            return 0;
        }


        let marked = 0;


        for(
            const members
            of hexPhysGroups(board).values()
        ){

            if(
                !Array.isArray(members) ||
                members.length < 2 ||
                members.length > 3
            ){
                continue;
            }


            if(
                members.some(
                    m =>
                        !m?.ball ||
                        typeof m.ball !== "object" ||
                        m.ball.isGarbage
                )
            ){
                continue;
            }


            /*
             * Canonical resolver says:
             * there is NO accepted physical event.
             *
             * Therefore this still-rigid body has reached
             * its terminal position.
             */
            for(const m of members){

                m.ball.__terminalRigidStableV31 = true;

                marked++;
            }
        }


        if(marked){

            window.__sixBallLastTerminalRigidStable = {
                marked,
                eventCount: 0,
                at: Date.now()
            };
        }


        return marked;
    }


    function markedIds(board){

        const ids = new Set();


        for(const q of boardBalls(board)){

            if(q.ball.__terminalRigidStableV31){

                ids.add(q.ball.id);
            }
        }


        return ids;
    }


    unstableFrozenBalls =
        function(board){

            /*
             * Mark while motionGroup metadata still exists.
             *
             * The mark intentionally survives the ordinary
             * normalize step so CHECK sees the same result.
             */
            markTerminalRigidGroups(board);


            let raw = [];


            try{

                raw =
                    baseUnstableFrozenBalls(
                        board
                    ) || [];

            }catch(err){

                raw = [];
            }


            /*
             * If a new canonical event became possible,
             * terminal marks were already cleared above.
             */
            const stable =
                markedIds(board);


            if(!stable.size)
                return raw;


            return raw.filter(
                q =>
                    !stable.has(q.id)
            );
        };


    boardHasIllegalFloat =
        function(board){

            return(
                unstableFrozenBalls(
                    board
                ).length > 0
            );
        };


    /*
     * Any real board movement invalidates terminal status.
     */
    if(baseHexPhysApplyEvent){

        hexPhysApplyEvent =
            function(
                board,
                accepted
            ){

                if(
                    Array.isArray(accepted) &&
                    accepted.length
                ){

                    clearTerminalMarks(
                        board
                    );
                }


                return baseHexPhysApplyEvent(
                    board,
                    accepted
                );
            };
    }


    /*
     * A CLEAR changes support geometry even before the next
     * gravity event, so old terminal marks must be discarded.
     */
    if(baseReleaseSettledConstraints){

        releaseSettledConstraints =
            function(
                g,
                reason = ""
            ){

                if(
                    /^CLEAR/i.test(
                        String(reason || "")
                    )
                ){

                    clearTerminalMarks(
                        g?.board
                    );
                }


                return baseReleaseSettledConstraints(
                    g,
                    reason
                );
            };
    }


    if(basePrepareGarbageBatch){

        prepareGarbageBatch =
            function(g){

                clearTerminalMarks(
                    g?.board
                );


                return basePrepareGarbageBatch(
                    g
                );
            };
    }


    window.__sixBallTerminalRigidStabilityVersion =
        "terminal-rigid-stability-v3.1";

    window.__sixBallTerminalRigidBreaksRigidity =
        false;

    window.__sixBallTerminalRigidMovesBalls =
        false;

    window.__sixBallNoEventRigidBodyIsStable =
        true;

})();


/* ============================================================
 * TERMINAL STABILITY LIFETIME v3.2
 *
 * FIX:
 *
 * v3.1 cleared ALL terminal-stable marks whenever ANY ball
 * moved anywhere on the board.
 *
 * That caused:
 *
 * stable old pile
 * -> next piece moves
 * -> all old final marks disappear
 * -> old groups have already been normalized away
 * -> illegalFloat forever
 *
 * NEW:
 *
 * - finalized bodies survive ordinary future turns
 * - movement elsewhere does NOT invalidate them
 * - only a moved member or a body depending on a moved support
 *   loses terminal status
 * - before a finished rigid group is normalized away, its
 *   final state is recorded permanently
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallTerminalStabilityLifetimeV32
    ){
        return;
    }

    window.__sixBallTerminalStabilityLifetimeV32 = true;


    const baseApplyEventV32 =
        typeof hexPhysApplyEvent === "function"
            ? hexPhysApplyEvent
            : null;

    const basePrepareGarbageV32 =
        typeof prepareGarbageBatch === "function"
            ? prepareGarbageBatch
            : null;


    function scanV32(board){

        const out = [];

        if(!board)
            return out;


        for(
            let y = boardScanMin(board);
            y < ROWS;
            y++
        ){

            for(let x = 0; x < W2; x++){

                if(!valid(x,y))
                    continue;


                const ball = board[y][x];


                if(
                    ball &&
                    typeof ball === "object"
                ){

                    out.push({
                        ball,
                        x,
                        y
                    });
                }
            }
        }


        return out;
    }


    function terminalSnapshotV32(board){

        const map = new Map();


        for(const q of scanV32(board)){

            if(
                q.ball.__terminalRigidStableV31
            ){

                map.set(
                    q.ball.id,
                    {
                        ball:q.ball,
                        x:q.x,
                        y:q.y
                    }
                );
            }
        }


        return map;
    }


    function supportIdsV32(
        board,
        x,
        y
    ){

        const ids = new Set();


        /*
         * Real lower diagonal supports.
         */
        for(const dx of [-1,1]){

            const sx = x + dx;
            const sy = y + 1;


            if(!valid(sx,sy))
                continue;


            const s = board[sy][sx];


            if(s)
                ids.add(s.id);
        }


        /*
         * Direct-below pivot/support can also participate
         * in canonical rolling geometry.
         */
        if(
            valid(x,y+2) &&
            board[y+2][x]
        ){

            ids.add(
                board[y+2][x].id
            );
        }


        return ids;
    }


    function locallyInvalidatedV32(
        board,
        snapshot,
        accepted
    ){

        const moved = new Set(
            (accepted || [])
            .map(p => p?.ball?.id)
            .filter(Boolean)
        );


        const invalid = new Set();


        /*
         * A terminal member that itself moves is no longer
         * terminal.
         */
        for(const id of moved){

            if(snapshot.has(id))
                invalid.add(id);
        }


        /*
         * Capture support dependencies BEFORE movement.
         */
        const deps = new Map();


        for(
            const [id,q]
            of snapshot
        ){

            deps.set(
                id,
                supportIdsV32(
                    board,
                    q.x,
                    q.y
                )
            );
        }


        /*
         * If a supporting ball moves away, invalidate the
         * supported terminal body. Propagate upward through
         * finalized support chains.
         */
        let changed = true;


        while(changed){

            changed = false;


            for(
                const [id,supports]
                of deps
            ){

                if(invalid.has(id))
                    continue;


                for(const sid of supports){

                    if(
                        moved.has(sid) ||
                        invalid.has(sid)
                    ){

                        invalid.add(id);

                        changed = true;

                        break;
                    }
                }
            }
        }


        return invalid;
    }


    /* ========================================================
     * LOCAL INVALIDATION
     *
     * v3.1 internally clears every terminal mark.
     *
     * Snapshot before calling it, then restore all unrelated
     * finalized bodies afterward.
     * ======================================================== */

    if(baseApplyEventV32){

        hexPhysApplyEvent =
            function(
                board,
                accepted
            ){

                const snapshot =
                    terminalSnapshotV32(
                        board
                    );


                const invalid =
                    locallyInvalidatedV32(
                        board,
                        snapshot,
                        accepted
                    );


                const result =
                    baseApplyEventV32(
                        board,
                        accepted
                    );


                let restored = 0;


                for(
                    const [id,q]
                    of snapshot
                ){

                    if(invalid.has(id))
                        continue;


                    /*
                     * The same ball object remains valid.
                     * Movement elsewhere must not erase its
                     * confirmed final-state classification.
                     */
                    q.ball.__terminalRigidStableV31 =
                        true;

                    restored++;
                }


                if(
                    restored ||
                    invalid.size
                ){

                    window
                    .__sixBallLastTerminalLifetimeV32 = {

                        restored,
                        invalidated:
                            [...invalid],

                        moved:
                            (accepted || [])
                            .map(
                                p => p?.ball?.id
                            )
                            .filter(Boolean),

                        at:Date.now()
                    };
                }


                return result;
            };
    }


    /* ========================================================
     * FINALIZE BEFORE GROUP NORMALIZATION
     *
     * A rigid normal group whose:
     *
     * - fallPath is finished
     * - canonical group plan is empty
     * - every member has no independent physical move
     *
     * has reached its FINAL POSITION.
     *
     * Record that BEFORE clearing motionGroup metadata.
     * ======================================================== */

    if(
        typeof stripFinishedTripletRigidity ===
            "function"
    ){

        stripFinishedTripletRigidity =
            function(g){

                if(!g?.board)
                    return;


                const groups =
                    [
                        ...hexPhysGroups(
                            g.board
                        ).values()
                    ];


                for(const members of groups){

                    if(
                        !members?.length ||
                        members.length < 2 ||
                        members.length > 3
                    ){
                        continue;
                    }


                    const normal =
                        members.every(
                            m =>
                                m?.ball &&
                                typeof m.ball === "object" &&
                                !m.ball.isGarbage
                        );


                    if(!normal)
                        continue;


                    const inFlight =
                        members.some(
                            m =>
                                Array.isArray(
                                    m.ball.fallPath
                                ) &&
                                m.ball.fallPath.length
                        );


                    if(inFlight)
                        continue;


                    let plan = [];


                    try{

                        plan =
                            hexPhysPlanGroup(
                                g.board,
                                members,
                                true
                            ) || [];

                    }catch(e){

                        plan = [];
                    }


                    /*
                     * Still has a canonical rigid/split event.
                     */
                    if(plan.length)
                        continue;


                    let independent = [];


                    try{

                        independent =
                            members.map(
                                m =>
                                    hexPhysIndependentMemberMotion(
                                        g.board,
                                        members,
                                        m
                                    )
                            );

                    }catch(e){

                        independent = [];
                    }


                    /*
                     * If even one member has a real independent
                     * motion, v3 must resolve the physical
                     * split. Do NOT finalize it here.
                     */
                    if(
                        independent.some(Boolean)
                    ){
                        continue;
                    }


                    /*
                     * No rigid continuation.
                     * No independent continuation.
                     *
                     * Position is physically FINAL.
                     */
                    for(const m of members){

                        m.ball
                        .__terminalRigidStableV31 =
                            true;


                        if(
                            typeof hexPhysClearGroupBall ===
                                "function"
                        ){

                            hexPhysClearGroupBall(
                                m.ball
                            );
                        }


                        m.ball.rigid = false;
                    }


                    window
                    .__sixBallLastFinalizedRigidGroupV32 = {

                        ids:
                            members.map(
                                m => m.ball.id
                            ),

                        size:
                            members.length,

                        at:
                            Date.now()
                    };
                }
            };
    }


    /* ========================================================
     * GARBAGE PREPARATION
     *
     * Adding garbage does not remove the support beneath an
     * already-finalized pile.
     *
     * v3.1 cleared every mark here; restore them.
     * ======================================================== */

    if(basePrepareGarbageV32){

        prepareGarbageBatch =
            function(g){

                const snapshot =
                    terminalSnapshotV32(
                        g?.board
                    );


                const result =
                    basePrepareGarbageV32(
                        g
                    );


                for(
                    const q
                    of snapshot.values()
                ){

                    q.ball
                    .__terminalRigidStableV31 =
                        true;
                }


                return result;
            };
    }


    window.__sixBallTerminalRigidStabilityVersion =
        "terminal-rigid-stability-v3.2";

    window.__sixBallTerminalMarksLocalInvalidation =
        true;

    window.__sixBallTerminalMarksSurviveNextTurn =
        true;

    window.__sixBallFinalizeBeforeGroupClear =
        true;

})();


/* ============================================================
 * PERSISTENT COLLISION EQUILIBRIUM v3.3
 *
 * ROOT FIX
 *
 * Collision-balanced arches / holes are local physical
 * equilibria.
 *
 * Moving an unrelated ball elsewhere on the board must NOT
 * erase their equilibrium classification.
 *
 * OLD:
 * any event -> clearBoardEquilibriumLocks(entire board)
 *
 * NEW:
 * invalidate equilibrium only when:
 * - the stable ball itself moves
 * - one of its real supporting balls moves
 * - CLEAR changes support geometry
 *
 * No shape-specific exceptions.
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallPersistentCollisionEquilibriumV33
    ){
        return;
    }

    if(
        typeof unstableFrozenBalls !== "function" ||
        typeof markCollisionBalancedGaps !== "function"
    ){
        return;
    }

    window.__sixBallPersistentCollisionEquilibriumV33 = true;


    const baseUnstableV33 =
        unstableFrozenBalls;

    const baseMarkBalancedV33 =
        markCollisionBalancedGaps;

    const baseApplyEventV33 =
        typeof hexPhysApplyEvent === "function"
            ? hexPhysApplyEvent
            : null;

    const baseReleaseConstraintsV33 =
        typeof releaseSettledConstraints === "function"
            ? releaseSettledConstraints
            : null;


    function entriesV33(board){

        const out = [];

        if(!board)
            return out;


        for(
            let y = boardScanMin(board);
            y < ROWS;
            y++
        ){

            for(let x = 0; x < W2; x++){

                if(!valid(x,y))
                    continue;


                const ball = board[y][x];


                if(
                    ball &&
                    typeof ball === "object"
                ){

                    out.push({
                        ball,
                        x,
                        y
                    });
                }
            }
        }


        return out;
    }


    function byIdV33(board){

        const map = new Map();


        for(const q of entriesV33(board)){

            map.set(
                q.ball.id,
                q
            );
        }


        return map;
    }


    function supportIdsV33(
        board,
        x,
        y
    ){

        const ids = new Set();


        for(const dx of [-1,1]){

            const sx = x + dx;
            const sy = y + 1;


            if(!valid(sx,sy))
                continue;


            const b =
                board[sy][sx];


            if(b)
                ids.add(b.id);
        }


        /*
         * Direct-below pivot/support also matters for
         * canonical rolling geometry.
         */
        if(
            valid(x,y+2) &&
            board[y+2][x]
        ){

            ids.add(
                board[y+2][x].id
            );
        }


        return ids;
    }


    function persistentIdsV33(board){

        const ids = new Set();


        for(const q of entriesV33(board)){

            if(
                q.ball.__collisionBalancedStableV33
            ){

                ids.add(
                    q.ball.id
                );
            }
        }


        return ids;
    }


    function clearPersistentV33(board){

        for(const q of entriesV33(board)){

            delete q.ball
                .__collisionBalancedStableV33;
        }
    }


    /* ========================================================
     * RECORD TRUE COLLISION EQUILIBRIUM
     * ======================================================== */

    markCollisionBalancedGaps =
        function(board){

            let candidates = [];


            try{

                candidates =
                    baseUnstableV33(
                        board
                    ) || [];

            }catch(e){

                candidates = [];
            }


            const result =
                baseMarkBalancedV33(
                    board
                );


            const map =
                byIdV33(board);


            let marked = 0;


            for(const q of candidates){

                const live =
                    map.get(q.id);


                if(!live)
                    continue;


                /*
                 * Confirm that canonical natural motion is
                 * genuinely absent at the moment equilibrium
                 * is accepted.
                 */
                let motion = null;


                try{

                    motion =
                        hexPhysNaturalMotion(
                            board,
                            live.x,
                            live.y,
                            null
                        );

                }catch(e){}


                if(motion)
                    continue;


                live.ball
                    .__collisionBalancedStableV33 =
                        true;

                live.ball.equilibriumLocked =
                    true;

                marked++;
            }


            if(marked){

                window
                .__sixBallLastPersistentEquilibriumV33 = {

                    marked,

                    ids:
                        candidates
                        .map(q=>q.id),

                    at:
                        Date.now()
                };
            }


            return result;
        };


    /* ========================================================
     * STABLE ARCHES ARE NOT ILLEGAL FLOATS
     * ======================================================== */

    unstableFrozenBalls =
        function(board){

            let raw = [];


            try{

                raw =
                    baseUnstableV33(
                        board
                    ) || [];

            }catch(e){

                raw = [];
            }


            const stable =
                persistentIdsV33(
                    board
                );


            if(!stable.size)
                return raw;


            return raw.filter(
                q=>
                    !stable.has(
                        q.id
                    )
            );
        };


    boardHasIllegalFloat =
        function(board){

            return(
                unstableFrozenBalls(
                    board
                ).length > 0
            );
        };


    /* ========================================================
     * LOCAL INVALIDATION
     *
     * Core hexPhysApplyEvent() clears equilibriumLocked for
     * the entire board.
     *
     * Snapshot persistent stable bodies before that happens,
     * then restore every body whose own support geometry was
     * untouched by this event.
     * ======================================================== */

    if(baseApplyEventV33){

        hexPhysApplyEvent =
            function(
                board,
                accepted
            ){

                const map =
                    byIdV33(board);


                const stable =
                    persistentIdsV33(
                        board
                    );


                const moved =
                    new Set(
                        (accepted || [])
                        .map(
                            p=>p?.ball?.id
                        )
                        .filter(Boolean)
                    );


                const dependencies =
                    new Map();


                for(const id of stable){

                    const q =
                        map.get(id);


                    if(!q)
                        continue;


                    dependencies.set(
                        id,
                        supportIdsV33(
                            board,
                            q.x,
                            q.y
                        )
                    );
                }


                const invalid =
                    new Set();


                /*
                 * Stable member itself moved.
                 */
                for(const id of moved){

                    if(stable.has(id))
                        invalid.add(id);
                }


                /*
                 * Supporting member moved.
                 * Propagate through stable support chains.
                 */
                let changed = true;


                while(changed){

                    changed = false;


                    for(
                        const [id,deps]
                        of dependencies
                    ){

                        if(invalid.has(id))
                            continue;


                        for(const sid of deps){

                            if(
                                moved.has(sid) ||
                                invalid.has(sid)
                            ){

                                invalid.add(id);

                                changed = true;

                                break;
                            }
                        }
                    }
                }


                const result =
                    baseApplyEventV33(
                        board,
                        accepted
                    );


                const after =
                    byIdV33(board);


                let restored = 0;


                for(const id of stable){

                    const q =
                        after.get(id);


                    if(!q)
                        continue;


                    if(invalid.has(id)){

                        delete q.ball
                            .__collisionBalancedStableV33;

                        delete q.ball
                            .equilibriumLocked;

                        continue;
                    }


                    /*
                     * Unrelated movement elsewhere:
                     * keep this local equilibrium.
                     */
                    q.ball
                        .__collisionBalancedStableV33 =
                            true;

                    q.ball.equilibriumLocked =
                        true;

                    restored++;
                }


                if(
                    restored ||
                    invalid.size
                ){

                    window
                    .__sixBallLastEquilibriumInvalidationV33 = {

                        moved:
                            [...moved],

                        invalidated:
                            [...invalid],

                        restored,

                        at:
                            Date.now()
                    };
                }


                return result;
            };
    }


    /* ========================================================
     * CLEAR SUPPORT LOSS
     *
     * A clear really can change the foundation underneath an
     * old arch, therefore all persistent equilibrium must be
     * recalculated.
     * ======================================================== */

    if(baseReleaseConstraintsV33){

        releaseSettledConstraints =
            function(
                g,
                reason = ""
            ){

                if(
                    /^CLEAR/i.test(
                        String(reason || "")
                    )
                ){

                    clearPersistentV33(
                        g?.board
                    );
                }


                return baseReleaseConstraintsV33(
                    g,
                    reason
                );
            };
    }


    window.__sixBallPersistentEquilibriumVersion =
        "persistent-collision-equilibrium-v3.3";

    window.__sixBallEquilibriumIsLocal =
        true;

    window.__sixBallUnrelatedMoveClearsEquilibrium =
        false;

    window.__sixBallHoleShapeSpecificFreezeRules =
        false;

})();





/* ============================================================
 * UP TRIANGLE FLOOR APPROACH v3.7
 *
 * ROOT FIX
 *
 * The logical UP triplet stops one lattice phase above the
 * physical floor.
 *
 * OLD:
 * each member asks hexPhysNaturalMotion()
 * -> bottom members receive individual FLOOR_DROP
 * -> triplet fragments before floor landing
 *
 * NEW:
 * the FINAL floor transition is one common rigid-body move:
 *
 *      T                 T
 *    L   R       ->    L   R
 *  --------          --------
 *
 * translated by either:
 *   (-1,+1)
 * or
 *   (+1,+1)
 *
 * All three members use exactly the same vector.
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallUpTriangleFloorApproachV37
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysGroupTranslationPlan !== "function"
    ){
        return;
    }

    window.__sixBallUpTriangleFloorApproachV37 = true;


    const basePlanGroupV37 =
        hexPhysPlanGroup;


    const baseSeparatorV37 =
        typeof hexPhysUpConvexSeparator === "function"
            ? hexPhysUpConvexSeparator
            : null;


    function layoutV37(members){

        if(
            !Array.isArray(members) ||
            members.length !== 3
        ){
            return null;
        }


        if(
            members.some(
                m =>
                    !m?.ball ||
                    typeof m.ball !== "object" ||
                    m.ball.isGarbage
            )
        ){
            return null;
        }


        const orientation =
            members[0]?.orientation ||
            members[0]?.ball?.motionGroupOrientation ||
            "";


        if(orientation !== "up")
            return null;


        const lowerY =
            Math.max(
                ...members.map(
                    m => m.y
                )
            );


        const lower =
            members
            .filter(
                m => m.y === lowerY
            )
            .sort(
                (a,b) => a.x-b.x
            );


        const top =
            members.find(
                m => m.y < lowerY
            );


        if(
            lower.length !== 2 ||
            !top
        ){
            return null;
        }


        if(
            lower[1].x-lower[0].x !== 2 ||
            top.x !== lower[0].x+1 ||
            top.y !== lowerY-1
        ){
            return null;
        }


        return{
            top,
            left:lower[0],
            right:lower[1],
            lowerY
        };
    }


    /*
     * The UP triplet's logical lower pair is on ROWS-2
     * immediately before physical floor landing.
     */
    function approachingFloorV37(
        members
    ){

        const g =
            layoutV37(
                members
            );


        if(!g)
            return false;


        return(
            g.lowerY === ROWS-2
        );
    }


    function medianImpactV37(
        members
    ){

        const values =
            members
            .map(
                m =>
                    Number(
                        m.ball.impactOffsetX
                    )
            )
            .filter(
                Number.isFinite
            )
            .sort(
                (a,b) => a-b
            );


        if(!values.length)
            return 0;


        return values[
            Math.floor(
                values.length/2
            )
        ];
    }


    function physicalBiasV37(
        members
    ){

        let b = 0;


        for(const m of members){

            if(
                typeof hexPhysBias ===
                    "function"
            ){

                b +=
                    hexPhysBias(
                        m.ball
                    ) || 0;

            }else{

                b +=
                    Math.sign(
                        Number(
                            m.ball.momentumX
                        ) || 0
                    );
            }
        }


        return Math.sign(b);
    }


    function candidateV37(
        board,
        members,
        dir
    ){

        const plan =
            hexPhysGroupTranslationPlan(
                board,
                members,
                dir,
                1,
                "UP_FLOOR_RIGID_LAND"
            );


        if(
            !Array.isArray(plan) ||
            plan.length !== 3
        ){
            return null;
        }


        return plan.map(
            p => ({
                ...p,

                kind:
                    "UP_FLOOR_RIGID_LAND",

                floorRigidLanding:
                    true
            })
        );
    }


    function floorPlanV37(
        board,
        members
    ){

        if(
            !approachingFloorV37(
                members
            )
        ){
            return null;
        }


        /*
         * Prefer the side selected by the actual continuous
         * horizontal contact position.
         */
        let preferred =
            Math.sign(
                medianImpactV37(
                    members
                )
            );


        if(!preferred){

            preferred =
                physicalBiasV37(
                    members
                );
        }


        let left =
            candidateV37(
                board,
                members,
                -1
            );


        let right =
            candidateV37(
                board,
                members,
                1
            );


        if(!left && !right)
            return null;


        if(preferred < 0 && left)
            return left;


        if(preferred > 0 && right)
            return right;


        /*
         * If the preferred side is blocked, preserve the
         * triangle by using the other legal rigid direction.
         */
        if(preferred < 0 && right)
            return right;


        if(preferred > 0 && left)
            return left;


        /*
         * Perfectly centred empty floor:
         * both directions are physically equivalent.
         *
         * Pick one deterministic rigid landing rather than
         * allowing individual FLOOR_DROP to split the set.
         */
        if(left)
            return left;


        return right;
    }


    /*
     * Direct floor candidate used by the single final planner.
     * No hexPhysPlanGroup wrapper is installed here anymore.
     */
    function tryFloorPlanV37(
        board,
        members,
        preview=false
    ){

        const floorPlan =
            floorPlanV37(
                board,
                members
            );


        if(!floorPlan){
            return null;
        }


        if(!preview){

            for(const m of members){

                m.ball.rigid =
                    true;

                m.ball.motionGroupSize =
                    3;

                m.ball.motionGroupOrientation =
                    "up";

                m.ball
                .__upFloorRigidLandingV37 =
                    true;
            }


            window
            .__sixBallLastUpFloorRigidLandingV37 = {

                ids:
                    members.map(
                        m => m.ball.id
                    ),

                vector:[
                    floorPlan[0].tx-
                    floorPlan[0].x,

                    floorPlan[0].ty-
                    floorPlan[0].y
                ],

                at:
                    Date.now()
            };
        }


        return floorPlan;
    }


    window.__sixBallTryFloorPlanV37 =
        tryFloorPlanV37;


    /*
     * Floor approach is NEVER an up-convex protrusion event.
     */
    if(baseSeparatorV37){

        hexPhysUpConvexSeparator =
            function(
                board,
                members,
                motions
            ){

                if(
                    approachingFloorV37(
                        members
                    )
                ){

                    return null;
                }


                return baseSeparatorV37(
                    board,
                    members,
                    motions
                );
            };
    }


    window.__sixBallUpFloorApproachVersion =
        "up-floor-approach-v3.7";

    window.__sixBallUpFloorUsesCommonRigidMove =
        true;

    window.__sixBallUpFloorAllowsIndividualFloorDrop =
        false;

    window.__sixBallUpFloorKeepsTriangleShape =
        true;

})();


/*
 * ============================================================
 * SMOOTH SLOPE CURRENT-STEP RIGIDITY FINAL v39
 *
 * Priority:
 *
 * 1. Can the normal three-ball group perform ONE genuine
 *    common rigid slope step RIGHT NOW?
 *
 *       YES -> keep three-ball rigidity and move together.
 *
 * 2. Only when that common rigid step is no longer possible,
 *    delegate to the complete existing v3 resolver.
 *
 * Therefore a protrusion, hole or future obstruction never
 * breaks rigidity early.
 *
 * Split occurs only at the physical step where common rigid
 * motion actually becomes impossible.
 * ============================================================
 */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallSmoothSlopeCurrentStepV39
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

    window.__sixBallSmoothSlopeCurrentStepV39 = true;

    const basePlanGroupV39 =
        hexPhysPlanGroup;


    function normalTripletV39(members){

        if(
            !Array.isArray(members) ||
            members.length !== 3
        ){
            return false;
        }

        return members.every(
            m =>
                m &&
                m.ball &&
                typeof m.ball === "object" &&
                !m.ball.isGarbage
        );
    }


    function currentMemberMotionsV39(
        board,
        members
    ){

        const motions = [];

        for(const member of members){

            let motion = null;

            try{

                motion =
                    hexPhysIndependentMemberMotion(
                        board,
                        members,
                        member
                    );

            }catch(_){

                return null;
            }

            motions.push(motion);
        }

        return motions;
    }


    function currentCommonRigidSlopeV39(
        board,
        members,
        motions
    ){

        let plan = null;

        try{

            plan =
                hexPhysRigidSlopePlan(
                    board,
                    members,
                    motions
                );

        }catch(_){

            return null;
        }


        if(
            !Array.isArray(plan) ||
            plan.length !== 3
        ){
            return null;
        }


        if(
            !plan.every(
                step =>
                    step &&
                    step.ball &&
                    step.kind ===
                        "GROUP_SLOPE_TRANSLATE"
            )
        ){
            return null;
        }


        const memberIds =
            new Set(
                members.map(
                    m => m.ball.id
                )
            );


        if(
            !plan.every(
                step =>
                    memberIds.has(
                        step.ball.id
                    )
            )
        ){
            return null;
        }


        const dx =
            plan[0].tx -
            plan[0].x;

        const dy =
            plan[0].ty -
            plan[0].y;


        if(
            dx === 0 &&
            dy === 0
        ){
            return null;
        }


        const sameVector =
            plan.every(
                step =>
                    (
                        step.tx -
                        step.x
                    ) === dx &&
                    (
                        step.ty -
                        step.y
                    ) === dy
            );


        if(!sameVector){
            return null;
        }


        return plan;
    }


    /*
     * Direct current-step rigid candidate used by the single
     * final planner.
     *
     * No nested hexPhysPlanGroup delegation here.
     */
    function tryCurrentRigidSlopeV39(
        board,
        members,
        preview=false
    ){

        if(
            normalTripletV39(
                members
            )
        ){

            const motions =
                currentMemberMotionsV39(
                    board,
                    members
                );


            if(motions){

                const rigidPlan =
                    currentCommonRigidSlopeV39(
                        board,
                        members,
                        motions
                    );


                if(rigidPlan){

                    if(!preview){

                        for(
                            const member
                            of members
                        ){

                            member.ball.rigid =
                                true;

                            member.ball.motionGroupSize =
                                3;

                            member.ball
                                ._smoothSlopeRigidV39 =
                                true;
                        }
                    }


                    window
                        .__sixBallLastSmoothSlopeCurrentStepV39 =
                    {
                        ids:
                            members.map(
                                m =>
                                    m.ball.id
                            ),

                        vector:[
                            rigidPlan[0].tx -
                            rigidPlan[0].x,

                            rigidPlan[0].ty -
                            rigidPlan[0].y
                        ],

                        orientation:
                            members[0]
                            ?.ball
                            ?.motionGroupOrientation
                            || "",

                        at:
                            Date.now()
                    };


                    return rigidPlan;
                }
            }
        }


        return null;
    }


    window.__sixBallTryCurrentRigidSlopeV39 =
        tryCurrentRigidSlopeV39;


    window.__sixBallSmoothSlopeRigidityVersion =
        "smooth-slope-current-step-v39";

    window.__sixBallSmoothSlopeBreaksRigidity =
        false;

    window.__sixBallSmoothSlopeUsesFutureObstacle =
        false;

    window.__sixBallSmoothSlopeCurrentStepFirst =
        true;

    window.__sixBallSplitRequiresCurrentCommonMotionFailure =
        true;

})();





/*
 * ============================================================
 * SMOOTH SLOPE RIGIDITY UNTIL IMPOSSIBLE v3.9
 *
 * FINAL ORDINARY 3-BALL RIGIDITY RULE
 *
 * 1. A normal 3-ball piece remains one rigid body while all
 *    three balls can continue one legal common rigid motion.
 *
 * 2. A flat / continuous slope contact MUST NOT split the
 *    three-ball body.
 *
 * 3. The rigid common motion has priority over individual
 *    member gravity tendencies and protrusion split tests.
 *
 * 4. Only when a common 3-ball rigid motion is physically
 *    impossible may the existing canonical split / protrusion /
 *    independent-motion rules take over.
 *
 * 5. When the NEXT normal piece begins to spawn, all remaining
 *    rigidity from the previous ordinary piece is forcibly
 *    released.
 *
 * Garbage is not modified by the next-spawn release.
 * ============================================================
 */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallSmoothSlopeRigidityV39
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup!=="function" ||
        typeof hexPhysIndependentMemberMotion!=="function"
    ){
        return;
    }

    window.__sixBallSmoothSlopeRigidityV39=true;

    const basePlanGroupV39=
        hexPhysPlanGroup;

    const baseSeparatorV39=
        typeof hexPhysUpConvexSeparator==="function"
            ? hexPhysUpConvexSeparator
            : null;

    const baseSpawnV39=
        typeof spawn==="function"
            ? spawn
            : null;


    function ordinaryTriplet(members){

        return !!(
            Array.isArray(members) &&
            members.length===3 &&
            members.every(
                m=>
                    m &&
                    m.ball &&
                    !m.ball.isGarbage
            )
        );
    }


    function ensureRigidTriplet(members){

        if(!ordinaryTriplet(members)){
            return;
        }

        for(const m of members){

            const ball=m.ball;

            ball.rigid=true;
            ball.motionGroupSize=3;

            if(
                ball.motionGroupOrientation==null ||
                ball.motionGroupOrientation===""
            ){
                ball.motionGroupOrientation="up";
            }
        }
    }


    function memberMotions(
        board,
        members
    ){

        const out=[];

        for(const m of members){

            let motion=null;

            try{
                motion=
                    hexPhysIndependentMemberMotion(
                        board,
                        members,
                        m
                    );
            }catch(_){
                motion=null;
            }

            out.push(motion);
        }

        return out;
    }


    function planIsRealTriplet(plan){

        return !!(
            Array.isArray(plan) &&
            plan.length===3 &&
            plan.every(
                q=>
                    q &&
                    Number.isFinite(
                        Number(q.x)
                    ) &&
                    Number.isFinite(
                        Number(q.y)
                    ) &&
                    Number.isFinite(
                        Number(q.tx)
                    ) &&
                    Number.isFinite(
                        Number(q.ty)
                    )
            )
        );
    }


    function commonTranslationPlan(
        board,
        members,
        motions
    ){

        if(
            typeof hexPhysGroupTranslationPlan!=="function" ||
            !Array.isArray(motions) ||
            motions.length!==3 ||
            motions.some(q=>!q)
        ){
            return null;
        }

        const vectors=
            motions.map(
                (q,i)=>({
                    dx:Number(q.tx)-Number(members[i].x),
                    dy:Number(q.ty)-Number(members[i].y)
                })
            );

        if(
            vectors.some(
                v=>
                    !Number.isFinite(v.dx) ||
                    !Number.isFinite(v.dy)
            )
        ){
            return null;
        }

        const first=vectors[0];

        if(
            vectors.some(
                v=>
                    Math.abs(v.dx-first.dx)>1e-9 ||
                    Math.abs(v.dy-first.dy)>1e-9
            )
        ){
            return null;
        }

        if(
            Math.abs(first.dx)<1e-9 &&
            Math.abs(first.dy)<1e-9
        ){
            return null;
        }

        let plan=null;

        try{
            plan=
                hexPhysGroupTranslationPlan(
                    board,
                    members,
                    first.dx,
                    first.dy
                );
        }catch(_){
            plan=null;
        }

        return planIsRealTriplet(plan)
            ? plan
            : null;
    }


    function rigidSlopePlan(
        board,
        members,
        motions
    ){

        if(
            typeof hexPhysRigidSlopePlan!=="function"
        ){
            return null;
        }

        let plan=null;

        try{
            plan=
                hexPhysRigidSlopePlan(
                    board,
                    members,
                    motions
                );
        }catch(_){
            plan=null;
        }

        return planIsRealTriplet(plan)
            ? plan
            : null;
    }


    function preferredRigidPlan(
        board,
        members,
        suppliedMotions=null
    ){

        if(!ordinaryTriplet(members)){
            return null;
        }

        const motions=
            Array.isArray(suppliedMotions) &&
            suppliedMotions.length===3
                ? suppliedMotions
                : memberMotions(
                    board,
                    members
                );

        /*
         * Highest priority:
         * all 3 members can perform the exact same translation.
         */
        const translation=
            commonTranslationPlan(
                board,
                members,
                motions
            );

        if(translation){
            return translation;
        }

        /*
         * Second:
         * canonical rigid-slope motion.
         *
         * This preserves the triangle while it moves over a
         * continuous slope even if the three individual
         * natural-motion descriptions are not numerically
         * identical.
         */
        const slope=
            rigidSlopePlan(
                board,
                members,
                motions
            );

        if(slope){
            return slope;
        }

        return null;
    }


    /*
     * FINAL GROUP PLAN PRIORITY
     *
     * Before canonical split logic gets a chance, ask whether
     * all 3 ordinary balls can still move as one rigid object.
     */
    hexPhysPlanGroup=
        function(
            board,
            members,
            preview=false
        ){

            if(ordinaryTriplet(members)){

                const rigid=
                    preferredRigidPlan(
                        board,
                        members
                    );

                if(rigid){

                    if(!preview){
                        ensureRigidTriplet(
                            members
                        );

                        window.__sixBallLastSmoothSlopeRigidV39={
                            ids:
                                members.map(
                                    m=>m.ball.id
                                ),

                            vector:
                                [
                                    Number(rigid[0].tx)-
                                    Number(rigid[0].x),

                                    Number(rigid[0].ty)-
                                    Number(rigid[0].y)
                                ],

                            at:Date.now()
                        };
                    }

                    return rigid;
                }
            }

            /*
             * Common rigid movement is impossible.
             * Only now may the existing canonical resolver
             * decide whether to rest, split, pivot or separate.
             */
            /*
             * One authoritative planner path.
             *
             * Priority is exactly equivalent to the old
             * wrapper stack:
             *
             * final rigid
             * -> current-step rigid
             * -> floor approach
             * -> canonical resolver
             */

            if(
                typeof window
                    .__sixBallTryCurrentRigidSlopeV39 ===
                    "function"
            ){

                const currentRigid =
                    window
                    .__sixBallTryCurrentRigidSlopeV39(
                        board,
                        members,
                        preview
                    );

                if(currentRigid){
                    return currentRigid;
                }
            }


            if(
                typeof window
                    .__sixBallTryFloorPlanV37 ===
                    "function"
            ){

                const floorPlan =
                    window
                    .__sixBallTryFloorPlanV37(
                        board,
                        members,
                        preview
                    );

                if(floorPlan){
                    return floorPlan;
                }
            }


            return basePlanGroupV39(
                board,
                members,
                preview
            );
        };


    /*
     * Do not classify a contact as an up-convex separator while
     * a genuine 3-ball rigid slope move is still available.
     *
     * Therefore:
     *
     * continuous flat slope -> KEEP 3
     * real protrusion / obstruction -> existing split rule
     */
    if(baseSeparatorV39){

        hexPhysUpConvexSeparator=
            function(
                board,
                members,
                motions
            ){

                if(ordinaryTriplet(members)){

                    const rigid=
                        preferredRigidPlan(
                            board,
                            members,
                            motions
                        );

                    if(rigid){
                        return null;
                    }
                }

                return baseSeparatorV39(
                    board,
                    members,
                    motions
                );
            };
    }


    function releasePreviousOrdinaryRigidity(g){

        if(
            !g ||
            !Array.isArray(g.board)
        ){
            return 0;
        }

        const seen=new Set();

        let released=0;

        for(
            let y=0;
            y<g.board.length;
            y++
        ){

            const row=g.board[y];

            if(!Array.isArray(row)){
                continue;
            }

            for(
                let x=0;
                x<row.length;
                x++
            ){

                const ball=row[x];

                if(
                    !ball ||
                    typeof ball!=="object" ||
                    ball.isGarbage ||
                    seen.has(ball.id)
                ){
                    continue;
                }

                seen.add(ball.id);

                const hasRigidity=
                    !!ball.rigid ||
                    ball.motionGroupId!=null ||
                    Number(ball.motionGroupSize)>1 ||
                    !!ball.motionGroupOrientation;

                if(!hasRigidity){
                    continue;
                }

                try{
                    if(
                        typeof hexPhysClearGroupBall==="function"
                    ){
                        hexPhysClearGroupBall(
                            ball
                        );
                    }
                }catch(_){}

                ball.rigid=false;

                delete ball.motionGroupId;
                delete ball.motionGroupSize;
                delete ball.motionGroupOrientation;

                delete ball._upFloorRigidLandingV36;
                delete ball._upFloorRigidLandingV37;

                released++;
            }
        }

        if(released){

            window.__sixBallLastNextSpawnRigidityReleaseV39={
                released,
                at:Date.now()
            };
        }

        return released;
    }


    if(baseSpawnV39){

        spawn=
            function(g){

                /*
                 * Execute BEFORE the next normal active
                 * three-ball piece is created.
                 */
                releasePreviousOrdinaryRigidity(
                    g
                );

                return baseSpawnV39(
                    g
                );
            };
    }


    window.__sixBallSmoothSlopeKeepsThreeBallRigidity=
        true;

    window.__sixBallSmoothSlopeSplitOnlyWhenRigidMotionImpossible=
        true;

    window.__sixBallNextNormalSpawnBreaksPreviousRigidity=
        true;

    window.__sixBallGarbageUnaffectedByNextSpawnRelease=
        true;

    window.__sixBallRigidityRuleVersion=
        "rigidity-authoritative-v3.9";

})();
