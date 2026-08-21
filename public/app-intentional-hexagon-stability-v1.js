/* ============================================================
 * 6ball INTENTIONAL HEXAGON STABILITY v1
 *
 * A valid HEXAGON centre hole is a NORMAL stable state.
 *
 * It must:
 * - keep its centre empty
 * - never be treated as an illegal floating gap
 * - never be moved by rigid-group simulation
 * - never trigger freeze/stall recovery
 * - never be filled by gravity
 *
 * IMPORTANT:
 * This uses the existing isBalancedHexagonCenterHole().
 * Therefore only a canonical intentional HEXAGON is protected.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallIntentionalHexagonStabilityV1
    ){
        return;
    }

    if(
        typeof hexPhysNaturalMotion!=="function" ||
        typeof isBalancedHexagonCenterHole!=="function"
    ){
        return;
    }

    window.__sixBallIntentionalHexagonStabilityV1=true;


    const RING_OFFSETS=[
        [-2,0],
        [ 2,0],
        [-1,-1],
        [ 1,-1],
        [-1, 1],
        [ 1, 1]
    ];


    function ringInfo(board){

        const ids=new Set();
        const centers=[];


        for(
            let cy=1;
            cy<ROWS-1;
            cy++
        ){

            for(
                let cx=2;
                cx<W2-2;
                cx++
            ){

                if(
                    !valid(cx,cy) ||
                    board[cy][cx]!==null
                ){
                    continue;
                }


                let ok=false;


                try{

                    ok=
                        !!isBalancedHexagonCenterHole(
                            board,
                            cx,
                            cy
                        );

                }catch(e){

                    ok=false;
                }


                if(!ok)
                    continue;


                const members=[];


                for(
                    const [dx,dy]
                    of RING_OFFSETS
                ){

                    const x=cx+dx;
                    const y=cy+dy;


                    if(!valid(x,y))
                        continue;


                    const ball=
                        board[y][x];


                    if(!ball)
                        continue;


                    ids.add(
                        ball.id
                    );


                    members.push({
                        ball,
                        x,
                        y
                    });
                }


                if(members.length===6){

                    centers.push({
                        cx,
                        cy,
                        members
                    });
                }
            }
        }


        return{
            ids,
            centers
        };
    }


    function isRingBall(
        board,
        ball
    ){

        if(!ball)
            return false;


        return ringInfo(board)
            .ids
            .has(ball.id);
    }


    /* ========================================================
     * CORE FIX
     *
     * OLD:
     * ring protection only when ignore == null
     *
     * That meant rigid-group simulation bypassed the
     * intentional HEXAGON exception.
     *
     * NEW:
     * ring protection applies regardless of ignore.
     * ======================================================== */

    const baseNaturalMotion=
        hexPhysNaturalMotion;


    hexPhysNaturalMotion=
        function(
            board,
            x,
            y,
            ignore=null
        ){

            if(
                valid(x,y)
            ){

                const ball=
                    board[y][x];


                if(
                    ball &&
                    isRingBall(
                        board,
                        ball
                    )
                ){

                    return null;
                }
            }


            return baseNaturalMotion(
                board,
                x,
                y,
                ignore
            );
        };


    /* ========================================================
     * REMOVE STALE RIGIDITY FROM A COMPLETED HEXAGON
     *
     * Once a member belongs to an intentional stable ring,
     * its old triplet/pair constraint must not try to pull
     * it out of that ring.
     * ======================================================== */

    function normalizeRingGroups(
        board
    ){

        if(
            typeof hexPhysClearGroupBall!==
                "function"
        ){
            return 0;
        }


        const info=
            ringInfo(board);


        let fixed=0;


        for(
            const center
            of info.centers
        ){

            for(
                const m
                of center.members
            ){

                const b=
                    m.ball;


                if(
                    b.motionGroupId ||
                    b.rigid
                ){

                    hexPhysClearGroupBall(
                        b
                    );

                    fixed++;
                }


                /*
                 * Intentional HEXAGON is already a physically
                 * finalized structure.
                 */
                b.rigid=false;

                b.__intentionalHexagonStable=
                    true;

                b.__intentionalHexagonCenter=[
                    center.cx,
                    center.cy
                ];
            }
        }


        return fixed;
    }


    /* ========================================================
     * GROUP PLANNER GUARD
     * ======================================================== */

    if(
        typeof hexPhysPlanGroup===
            "function"
    ){

        const basePlanGroup=
            hexPhysPlanGroup;


        hexPhysPlanGroup=
            function(
                board,
                members,
                preview=false
            ){

                if(
                    !Array.isArray(members) ||
                    !members.length
                ){

                    return basePlanGroup(
                        board,
                        members,
                        preview
                    );
                }


                const ringIds=
                    ringInfo(board).ids;


                const ringMembers=
                    members.filter(
                        m=>
                            ringIds.has(
                                m.ball.id
                            )
                    );


                if(!ringMembers.length){

                    return basePlanGroup(
                        board,
                        members,
                        preview
                    );
                }


                /*
                 * Complete intentional ring members are
                 * physically FINAL, not "pinned waiting".
                 */
                if(!preview){

                    for(
                        const m
                        of ringMembers
                    ){

                        if(
                            typeof hexPhysClearGroupBall===
                                "function"
                        ){

                            hexPhysClearGroupBall(
                                m.ball
                            );
                        }


                        m.ball.rigid=false;

                        m.ball
                        .__intentionalHexagonStable=
                            true;
                    }
                }


                const remaining=
                    members.filter(
                        m=>
                            !ringIds.has(
                                m.ball.id
                            )
                    );


                if(!remaining.length)
                    return [];


                /*
                 * Any non-ring member may continue normally.
                 * The six ring balls remain real stationary
                 * collision/support objects.
                 */
                if(
                    remaining.length>=2
                ){

                    if(
                        !preview &&
                        typeof hexPhysSetGroup===
                            "function"
                    ){

                        hexPhysSetGroup(

                            remaining,

                            remaining.length,

                            remaining[0]
                                ?.orientation ||
                            remaining[0]
                                ?.ball
                                ?.motionGroupOrientation ||
                            ""
                        );
                    }


                    return basePlanGroup(
                        board,
                        remaining,
                        preview
                    );
                }


                const m=
                    remaining[0];


                const p=
                    hexPhysNaturalMotion(
                        board,
                        m.x,
                        m.y,
                        null
                    );


                return p
                    ?[p]
                    :[];
            };
    }


    /* ========================================================
     * FINAL FROZEN-BALL FILTER
     *
     * Never classify an intentional HEXAGON member as
     * an illegal frozen/floating ball.
     * ======================================================== */

    if(
        typeof unstableFrozenBalls===
            "function"
    ){

        const baseUnstableFrozenBalls=
            unstableFrozenBalls;


        unstableFrozenBalls=
            function(board){

                const ringIds=
                    ringInfo(board).ids;


                let result=[];


                try{

                    result=
                        baseUnstableFrozenBalls(
                            board
                        )||[];

                }catch(e){

                    result=[];
                }


                return result.filter(
                    q=>
                        !ringIds.has(
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


    if(
        typeof markCollisionBalancedGaps===
            "function"
    ){

        const baseMarkCollisionBalancedGaps=
            markCollisionBalancedGaps;


        markCollisionBalancedGaps=
            function(board){

                const result=
                    baseMarkCollisionBalancedGaps(
                        board
                    );


                const info=
                    ringInfo(board);


                for(
                    const center
                    of info.centers
                ){

                    for(
                        const m
                        of center.members
                    ){

                        delete m.ball
                            .equilibriumLocked;
                    }
                }


                return(
                    typeof unstableFrozenBalls===
                        "function"
                )
                    ?unstableFrozenBalls(
                        board
                    ).length
                    :result;
            };
    }


    /* ========================================================
     * SETTLE ENTRY
     *
     * Remove obsolete triplet/pair metadata BEFORE any
     * resolver layer sees the stable HEXAGON.
     * ======================================================== */

    if(
        typeof settlePass===
            "function"
    ){

        const baseSettlePass=
            settlePass;


        settlePass=
            function(
                board,
                preview=false
            ){

                if(!preview){

                    const fixed=
                        normalizeRingGroups(
                            board
                        );


                    if(fixed){

                        window
                        .__sixBallLastIntentionalHexagonNormalize={
                            groupsRemoved:
                                fixed,

                            centers:
                                ringInfo(board)
                                .centers
                                .map(
                                    q=>[
                                        q.cx,
                                        q.cy
                                    ]
                                ),

                            at:
                                Date.now()
                        };
                    }
                }


                return baseSettlePass(
                    board,
                    preview
                );
            };
    }


    /* ========================================================
     * SAFETY WATCH
     *
     * A stable intentional HEXAGON must never be interpreted
     * as a repeated unresolved physics state.
     * ======================================================== */

    if(
        typeof physicsSafetyCheck===
            "function"
    ){

        const basePhysicsSafetyCheck=
            physicsSafetyCheck;


        physicsSafetyCheck=
            function(
                g,
                moved,
                context="SETTLE"
            ){

                if(
                    g?.board
                ){

                    normalizeRingGroups(
                        g.board
                    );


                    const info=
                        ringInfo(
                            g.board
                        );


                    if(
                        info.centers.length &&
                        typeof unstableFrozenBalls===
                            "function" &&
                        unstableFrozenBalls(
                            g.board
                        ).length===0 &&
                        !moved
                    ){

                        if(g.physicsWatch){

                            g.physicsWatch.lastSig=
                                "";

                            g.physicsWatch.repeats=
                                0;

                            g.physicsWatch.steps=
                                0;
                        }


                        window
                        .__sixBallLastIntentionalHexagonStable={
                            centers:
                                info.centers.map(
                                    q=>[
                                        q.cx,
                                        q.cy
                                    ]
                                ),

                            context,

                            at:
                                Date.now()
                        };


                        return false;
                    }
                }


                return basePhysicsSafetyCheck(
                    g,
                    moved,
                    context
                );
            };
    }


    window.__sixBallIntentionalHexagonStabilityVersion=
        "intentional-hexagon-stability-v1";

    window.__sixBallIntentionalHexagonCenterHoleNormal=
        true;

    window.__sixBallIntentionalHexagonCanFreeze=
        false;

    window.__sixBallIntentionalHexagonProtectedInsideRigidSolver=
        true;

})();
