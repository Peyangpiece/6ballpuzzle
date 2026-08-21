/* ============================================================
 * 6ball COHERENT COLLAPSE v1
 *
 * Dynamic rigidity for accumulated-pile collapse.
 *
 * PRINCIPLE
 *
 * Same gravity motion possible
 *      => move as one coherent body.
 *
 * Part of the body becomes physically blocked
 *      => split only at that physical event.
 *
 * After split
 *      => each new coherent body is evaluated again.
 *
 * Different bodies may separate freely.
 *
 * Balls may never overlap.
 *
 * This replaces:
 * "clear => all accumulated balls become independent
 *  single balls immediately"
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallCoherentCollapseV1
    ){
        return;
    }

    if(
        typeof settlePass!=="function" ||
        typeof hexPhysApplyEvent!=="function"
    ){
        return;
    }

    window.__sixBallCoherentCollapseV1=true;


    const baseSettlePass=
        settlePass;

    const baseReleaseSettledConstraints=
        typeof releaseSettledConstraints===
            "function"
            ?releaseSettledConstraints
            :null;

    const baseSpawn=
        typeof spawn==="function"
            ?spawn
            :null;

    const basePrepareGarbageBatch=
        typeof prepareGarbageBatch==="function"
            ?prepareGarbageBatch
            :null;


    let BUNDLE_SEQ=
        970000000;


    function key(x,y){

        return x+","+y;
    }


    function boardEntries(board){

        const out=[];


        for(
            let y=boardScanMin(board);
            y<ROWS;
            y++
        ){

            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=
                    board[y][x];


                if(!ball)
                    continue;


                out.push({
                    ball,
                    x,
                    y
                });
            }
        }


        return out;
    }


    function liveObjectBoard(board){

        for(
            const q
            of boardEntries(board)
        ){

            return(
                typeof q.ball===
                "object"
            );
        }


        return true;
    }


    /* ========================================================
     * TRUE GROUND SUPPORT
     *
     * Wall is NOT support.
     *
     * Floor is support.
     *
     * Two real lower grounded balls can support an upper ball.
     * ======================================================== */

    function groundedIds(board){

        const all=
            boardEntries(board);


        const grounded=
            new Set();


        for(const q of all){

            if(
                q.ball.garbagePhaseFrozen
            ){

                grounded.add(
                    q.ball.id
                );

                continue;
            }


            if(touchesFloorRow(q.y)){

                grounded.add(
                    q.ball.id
                );
            }
        }


        for(
            let guard=0;
            guard<ROWS*3;
            guard++
        ){

            let changed=false;


            for(const q of all){

                if(
                    grounded.has(
                        q.ball.id
                    )
                ){
                    continue;
                }


                const supports=[];


                for(const dx of[-1,1]){

                    const sx=
                        q.x+dx;

                    const sy=
                        q.y+1;


                    if(!valid(sx,sy))
                        continue;


                    const s=
                        board[sy][sx];


                    if(s)
                        supports.push(s);
                }


                /*
                 * Horizontal neighbours alone never hold
                 * a ball against gravity.
                 */
                if(
                    supports.length===2 &&
                    supports.every(
                        s=>
                            grounded.has(
                                s.id
                            )
                    )
                ){

                    grounded.add(
                        q.ball.id
                    );

                    changed=true;
                }
            }


            if(!changed)
                break;
        }


        return grounded;
    }


    /* ========================================================
     * FLOATING CONNECTED MASSES
     * ======================================================== */

    function connectedComponents(
        entries,
        allowedIds=null
    ){

        const at=
            new Map();


        for(const q of entries){

            if(
                allowedIds &&
                !allowedIds.has(
                    q.ball.id
                )
            ){
                continue;
            }


            at.set(
                key(q.x,q.y),
                q
            );
        }


        const seen=
            new Set();

        const out=[];


        for(const q of at.values()){

            if(
                seen.has(
                    q.ball.id
                )
            ){
                continue;
            }


            const stack=[q];

            const comp=[];


            seen.add(
                q.ball.id
            );


            while(stack.length){

                const cur=
                    stack.pop();

                comp.push(cur);


                for(
                    const [dx,dy]
                    of DIRS
                ){

                    const n=
                        at.get(
                            key(
                                cur.x+dx,
                                cur.y+dy
                            )
                        );


                    if(
                        !n ||
                        seen.has(
                            n.ball.id
                        )
                    ){
                        continue;
                    }


                    seen.add(
                        n.ball.id
                    );

                    stack.push(n);
                }
            }


            out.push(comp);
        }


        return out;
    }


    function floatingComponents(
        board
    ){

        const all=
            boardEntries(board);

        const grounded=
            groundedIds(board);

        const floating=
            new Set();


        for(const q of all){

            if(
                !grounded.has(
                    q.ball.id
                ) &&
                !q.ball.garbageBubbleHold
            ){

                floating.add(
                    q.ball.id
                );
            }
        }


        return connectedComponents(
            all,
            floating
        );
    }


    /* ========================================================
     * RIGID VERTICAL TRANSLATION
     *
     * Test whether every member can perform exactly the same
     * gravitational translation while preserving all relative
     * positions.
     * ======================================================== */

    function translationSafe(
        board,
        members,
        dy
    ){

        if(
            !members.length ||
            dy<=0
        ){
            return false;
        }


        const own=
            new Set(
                members.map(
                    q=>q.ball.id
                )
            );


        const targets=
            new Set();


        for(const q of members){

            const tx=q.x;

            const ty=q.y+dy;


            if(!valid(tx,ty))
                return false;


            const k=
                key(tx,ty);


            if(targets.has(k))
                return false;


            targets.add(k);


            const obstacle=
                board[ty][tx];


            if(
                obstacle &&
                !own.has(
                    obstacle.id
                )
            ){
                return false;
            }
        }


        if(
            typeof hexPhysPathHitsStationary===
                "function"
        ){

            for(const q of members){

                const p={

                    x:q.x,
                    y:q.y,

                    tx:q.x,
                    ty:q.y+dy,

                    ball:q.ball,

                    kind:
                        "COHERENT_FREE_FALL",

                    pivot:null,
                    topPivot:null,

                    followSupportIds:[]
                };


                if(
                    hexPhysPathHitsStationary(
                        p,
                        board,
                        own
                    )
                ){

                    return false;
                }
            }
        }


        return true;
    }


    function maximumVerticalDrop(
        board,
        members
    ){

        let best=0;


        /*
         * Same lattice column:
         * y changes in units of 2.
         */
        for(
            let dy=2;
            dy<ROWS*2;
            dy+=2
        ){

            if(
                !translationSafe(
                    board,
                    members,
                    dy
                )
            ){
                break;
            }


            best=dy;
        }


        return best;
    }


    /* ========================================================
     * PHYSICAL SPLIT
     *
     * The entire body cannot descend.
     *
     * Find the maximal subset that CAN descend without
     * penetrating the blocked members.
     *
     * This is the exact moment rigidity is released.
     * ======================================================== */

    function movableSubset(
        board,
        component
    ){

        const movable=
            new Set(
                component.map(
                    q=>q.ball.id
                )
            );


        for(
            let guard=0;
            guard<component.length+2;
            guard++
        ){

            let changed=false;


            const own=
                new Set(movable);


            for(const q of component){

                if(
                    !movable.has(
                        q.ball.id
                    )
                ){
                    continue;
                }


                const tx=q.x;

                const ty=q.y+2;


                if(!valid(tx,ty)){

                    movable.delete(
                        q.ball.id
                    );

                    changed=true;

                    continue;
                }


                const obstacle=
                    board[ty][tx];


                /*
                 * A member that will NOT move belongs to the
                 * physical collision boundary.
                 */
                if(
                    obstacle &&
                    !own.has(
                        obstacle.id
                    )
                ){

                    movable.delete(
                        q.ball.id
                    );

                    changed=true;

                    continue;
                }


                if(
                    typeof hexPhysPathHitsStationary===
                        "function"
                ){

                    const p={

                        x:q.x,
                        y:q.y,

                        tx,
                        ty,

                        ball:q.ball,

                        kind:
                            "COHERENT_SPLIT_TEST",

                        pivot:null,
                        topPivot:null,

                        followSupportIds:[]
                    };


                    if(
                        hexPhysPathHitsStationary(
                            p,
                            board,
                            own
                        )
                    ){

                        movable.delete(
                            q.ball.id
                        );

                        changed=true;
                    }
                }
            }


            if(!changed)
                break;
        }


        return movable;
    }


    /* ========================================================
     * NEXT COHERENT EVENT
     * ======================================================== */

    function coherentCandidates(
        board
    ){

        const candidates=[];


        for(
            const component
            of floatingComponents(
                board
            )
        ){

            if(!component.length)
                continue;


            /*
             * First preference:
             *
             * ALL members retain the same geometry.
             */
            const wholeDrop=
                maximumVerticalDrop(
                    board,
                    component
                );


            if(wholeDrop>0){

                candidates.push({

                    members:
                        component,

                    dy:
                        wholeDrop,

                    whole:true,

                    split:false
                });


                continue;
            }


            /*
             * Whole-body motion became impossible.
             *
             * Only NOW calculate the physical split.
             */
            const movable=
                movableSubset(
                    board,
                    component
                );


            if(!movable.size)
                continue;


            const pieces=
                connectedComponents(
                    component,
                    movable
                );


            for(const piece of pieces){

                if(!piece.length)
                    continue;


                const dy=
                    maximumVerticalDrop(
                        board,
                        piece
                    );


                if(dy<=0)
                    continue;


                candidates.push({

                    members:
                        piece,

                    dy,

                    whole:false,

                    split:true,

                    originalSize:
                        component.length
                });
            }
        }


        /*
         * Lower masses first.
         * For equal height prefer larger coherent masses.
         */
        candidates.sort(
            (a,b)=>{

                const ay=
                    Math.max(
                        ...a.members.map(
                            q=>q.y
                        )
                    );

                const by=
                    Math.max(
                        ...b.members.map(
                            q=>q.y
                        )
                    );


                if(ay!==by)
                    return by-ay;


                if(
                    a.members.length!==
                    b.members.length
                ){

                    return(
                        b.members.length-
                        a.members.length
                    );
                }


                return b.dy-a.dy;
            }
        );


        return candidates;
    }


    function applyCoherentWave(
        board,
        preview=false
    ){

        const candidates=
            coherentCandidates(
                board
            );


        if(!candidates.length)
            return false;


        if(preview)
            return true;


        const proposals=[];

        const reserved=
            new Set();


        for(const c of candidates){

            const targets=
                c.members.map(
                    q=>
                        key(
                            q.x,
                            q.y+c.dy
                        )
                );


            if(
                targets.some(
                    k=>reserved.has(k)
                )
            ){
                continue;
            }


            for(const k of targets)
                reserved.add(k);


            const bundle=
                BUNDLE_SEQ++;


            for(const q of c.members){

                proposals.push({

                    x:q.x,
                    y:q.y,

                    tx:q.x,
                    ty:q.y+c.dy,

                    ball:q.ball,

                    kind:
                        c.split
                            ?"COHERENT_SPLIT_FREE_FALL"
                            :"COHERENT_FREE_FALL",

                    pivot:null,
                    topPivot:null,

                    followSupportIds:[],

                    bundleId:
                        bundle,

                    groupSize:
                        c.members.length,

                    coherentCollapse:
                        true,

                    coherentSplit:
                        !!c.split
                });
            }
        }


        if(!proposals.length)
            return false;


        const moved=
            hexPhysApplyEvent(
                board,
                proposals
            );


        if(moved){

            window.__sixBallLastCoherentCollapse={

                balls:
                    proposals.length,

                bundles:
                    new Set(
                        proposals.map(
                            p=>p.bundleId
                        )
                    ).size,

                split:
                    proposals.some(
                        p=>p.coherentSplit
                    ),

                at:
                    Date.now()
            };


            window.__sixBallCoherentCollapseCount=
                (
                    window
                    .__sixBallCoherentCollapseCount||
                    0
                )+1;
        }


        return moved;
    }


    /* ========================================================
     * CLEAR RIGIDITY POLICY
     *
     * OLD:
     * clear => zero ALL rigidity immediately.
     *
     * NEW:
     * clear => enable coherent-collapse mode.
     * ======================================================== */

    function armCoherentCollapse(
        g,
        reason
    ){

        if(!g?.board)
            return reason;


        g.board.__coherentCollapseActive=
            true;


        if(
            typeof clearBoardEquilibriumLocks===
                "function"
        ){

            clearBoardEquilibriumLocks(
                g.board
            );
        }


        g.balanceWait=0;


        if(g.physicsWatch){

            g.physicsWatch.lastSig="";
            g.physicsWatch.repeats=0;
            g.physicsWatch.steps=0;
        }


        return reason;
    }


    if(
        typeof zeroAccumulatedPileRigidity===
            "function"
    ){

        zeroAccumulatedPileRigidity=
            function(g){

                /*
                 * Intentionally DO NOT:
                 *
                 * hexPhysClearGroupBall(ball)
                 * ball.rigid=false
                 *
                 * Coherence is released only by collision.
                 */
                armCoherentCollapse(
                    g,
                    "ZERO_RIGIDITY_REPLACED"
                );


                return 0;
            };
    }


    if(baseReleaseSettledConstraints){

        releaseSettledConstraints=
            function(
                g,
                reason=
                    "clear_release"
            ){

                const text=
                    String(
                        reason||""
                    );


                if(
                    /^clear(?:_|$)/i
                    .test(text)
                ){

                    return armCoherentCollapse(
                        g,
                        reason
                    );
                }


                return baseReleaseSettledConstraints(
                    g,
                    reason
                );
            };
    }


    /* ========================================================
     * SETTLE
     *
     * Initial two-stage VERTICAL phase remains authoritative.
     *
     * After that phase:
     *
     * coherent gravity first
     *      ->
     * physical split if necessary
     *      ->
     * canonical gravity/arc solver
     * ======================================================== */

    settlePass=
        function(
            board,
            preview=false
        ){

            if(
                !liveObjectBoard(board) ||
                !(
                    board?.
                        __coherentCollapseActive ||
                    board?.
                        __postClearTwoStage ||
                    board?.
                        __postClearChunkMode
                )
            ){

                return baseSettlePass(
                    board,
                    preview
                );
            }


            /*
             * app-post-clear-two-stage owns the complete
             * first vertical-collapse phase.
             */
            if(
                board.__postClearTwoStage &&
                board.__postClearStage!=="ARC"
            ){

                return baseSettlePass(
                    board,
                    preview
                );
            }


            /*
             * COMMON GRAVITY MOTION HAS PRIORITY.
             */
            const coherent=
                applyCoherentWave(
                    board,
                    preview
                );


            if(coherent)
                return true;


            /*
             * No coherent vertical body can continue.
             *
             * From here real contact / circular motion /
             * individual gravity is physically justified.
             */
            return baseSettlePass(
                board,
                preview
            );
        };


    /* ========================================================
     * CLEANUP
     * ======================================================== */

    function clearCoherentMode(g){

        if(!g?.board)
            return;


        delete g.board
            .__coherentCollapseActive;
    }


    if(baseSpawn){

        spawn=
            function(g){

                clearCoherentMode(g);

                return baseSpawn(g);
            };
    }


    if(basePrepareGarbageBatch){

        prepareGarbageBatch=
            function(g){

                clearCoherentMode(g);

                return basePrepareGarbageBatch(
                    g
                );
            };
    }


    window.__sixBallCoherentCollapseVersion=
        "coherent-collapse-v1";

    window.__sixBallClearStartsIndependent=
        false;

    window.__sixBallCommonGravityKeepsShape=
        true;

    window.__sixBallRigidityBreaksOnCollision=
        true;

    window.__sixBallSeparateBodiesMaySeparate=
        true;

})();
