/* ============================================================
 * 6ball CONTACT SEPARATION / NON-ADHESION v1
 *
 * Pile / garbage collapse rule:
 *
 * OLD
 * ------------------------------------------------------------
 * Once a moving ball had a supporting ball assigned,
 * presentation continuously reconstructed distance == 1.
 *
 * That behaved like an invisible bond:
 *
 *     upper ball
 *        ○
 *        |
 *        | always connected
 *        ○
 *     lower ball
 *
 *
 * NEW
 * ------------------------------------------------------------
 * Balls are NOT bonded.
 *
 * Gravity acts independently.
 *
 * They may freely SEPARATE.
 *
 * Contact constraint activates ONLY when predicted distance
 * becomes LESS than one ball diameter.
 *
 * Therefore:
 *
 *     separate       -> allowed
 *     touching       -> allowed
 *     overlapping    -> corrected
 *
 * This changes presentation/contact behaviour only.
 * Logical lattice destinations remain authoritative.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallContactSeparationV1
    ){
        return;
    }

    window.__sixBallContactSeparationV1=true;


    const H=
        typeof HEX_ROW_H==="number"
            ?HEX_ROW_H
            :Math.sqrt(3)/2;


    const MIN_DIST=
        typeof PILE_FLOW_MIN_DIST==="number"
            ?PILE_FLOW_MIN_DIST
            :(
                typeof HEX_MIN_DIST==="number"
                    ?HEX_MIN_DIST
                    :.9995
            );


    const EPS=1e-7;


    /* ========================================================
     * REMOVE AUTOMATIC "KEEP TOUCHING" INFERENCE
     *
     * A visual coincidence at the beginning/end of a segment
     * must NOT create a physical bond.
     *
     * Actual logical collision pivots remain untouched.
     * ======================================================== */

    if(
        typeof pileFlowInferMovingSupportIds===
            "function"
    ){

        pileFlowInferMovingSupportIds=
            function(){

                window
                .__sixBallSuppressedAdhesiveInferences=
                    (
                        window
                        .__sixBallSuppressedAdhesiveInferences||
                        0
                    )+1;

                return[];
            };
    }


    if(
        typeof pileFlowAttachCausalSupports===
            "function"
    ){

        pileFlowAttachCausalSupports=
            function(){

                return false;
            };
    }


    /* ========================================================
     * STATIC PIVOT CLEANUP
     *
     * A real stationary support may remain a geometric pivot
     * for a circular roll.
     *
     * But it does NOT need followSupportIds to glue the ball
     * to that support.
     * ======================================================== */

    if(
        typeof repairPileFlowSegmentGeometry===
            "function"
    ){

        const baseRepair=
            repairPileFlowSegmentGeometry;


        repairPileFlowSegmentGeometry=
            function(
                g,
                ball,
                seg,
                reason="pile_flow"
            ){

                const r=
                    baseRepair(
                        g,
                        ball,
                        seg,
                        reason
                    );


                if(
                    seg &&
                    seg.pileFlowStaticContact
                ){

                    /*
                     * Keep:
                     *   seg.pivot
                     *
                     * Remove:
                     *   invisible adhesive tracking
                     */
                    seg.followSupportIds=[];
                    seg.movingSupportId=0;

                    delete seg
                        .pileFlowStaticContact;
                }


                return r;
            };
    }


    /* ========================================================
     * NON-PENETRATION PROJECTION
     * ======================================================== */

    function physicalDelta(
        a,
        b
    ){

        return[
            (a[0]-b[0])*.5,
            (a[1]-b[1])*H
        ];
    }


    function physicalDistance(
        a,
        b
    ){

        const [dx,dy]=
            physicalDelta(
                a,
                b
            );


        return Math.hypot(
            dx,
            dy
        );
    }


    function fallbackNormal(
        seg,
        support
    ){

        const candidates=[
            seg?.from,
            seg?.to
        ];


        for(const p of candidates){

            if(!p)
                continue;


            const [
                dx,
                dy
            ]=
                physicalDelta(
                    p,
                    support
                );


            const d=
                Math.hypot(
                    dx,
                    dy
                );


            if(d>EPS){

                return[
                    dx/d,
                    dy/d
                ];
            }
        }


        /*
         * Degenerate overlap:
         * upward from the support is the safest gravitational
         * contact normal.
         */
        return[0,-1];
    }


    function pushOutOfSupport(
        point,
        support,
        seg
    ){

        let[
            dx,
            dy
        ]=
            physicalDelta(
                point,
                support
            );


        let d=
            Math.hypot(
                dx,
                dy
            );


        /*
         * Separation or exact contact:
         * DO NOTHING.
         *
         * This is the critical difference from the old
         * adhesive implementation.
         */
        if(
            d>=MIN_DIST-EPS
        ){

            return{
                point,
                corrected:false
            };
        }


        let nx;
        let ny;


        if(d>EPS){

            nx=dx/d;
            ny=dy/d;

        }else{

            [
                nx,
                ny
            ]=
                fallbackNormal(
                    seg,
                    support
                );
        }


        const sx=
            support[0]*.5;

        const sy=
            support[1]*H;


        const px=
            sx+
            nx*MIN_DIST;

        const py=
            sy+
            ny*MIN_DIST;


        return{
            point:[
                px/.5,
                py/H
            ],

            corrected:true
        };
    }


    /* ========================================================
     * REPLACE ADHESIVE POSITION SOLVER
     *
     * Free trajectory is always evaluated FIRST.
     *
     * Supporting balls are consulted only if the free
     * trajectory would penetrate them.
     * ======================================================== */

    if(
        typeof pileFlowPointForBall===
            "function"
    ){

        pileFlowPointForBall=
            function(
                g,
                ball,
                seg,
                q,
                t,
                depth=0,
                seen=null
            ){

                q=
                    Math.max(
                        0,
                        Math.min(
                            1,
                            q
                        )
                    );


                if(
                    !seg ||
                    !ball ||
                    depth>10
                ){

                    return pileFlowPoint(
                        seg,
                        q
                    );
                }


                /*
                 * FIRST calculate this ball's OWN gravity /
                 * pivot path.
                 *
                 * No support attachment is applied here.
                 */
                let point=
                    pileFlowPoint(
                        seg,
                        q
                    );


                const ids=
                    typeof pileFlowSupportIds===
                        "function"
                        ?pileFlowSupportIds(seg)
                        :[];


                if(!ids.length)
                    return point;


                if(!seen)
                    seen=new Set();


                if(seen.has(ball.id))
                    return point;


                const nextSeen=
                    new Set(seen);

                nextSeen.add(
                    ball.id
                );


                const supports=
                    ids
                    .map(
                        id=>
                            pileFlowBallById(
                                g,
                                id
                            )
                    )
                    .filter(Boolean)
                    .filter(
                        support=>
                            !nextSeen.has(
                                support.id
                            )
                    );


                if(!supports.length)
                    return point;


                const supportPositions=
                    supports.map(
                        support=>
                            pileFlowPositionAt(
                                g,
                                support,
                                t,
                                depth+1,
                                nextSeen
                            )
                    );


                let corrections=0;


                /*
                 * A few projection iterations are enough for
                 * simultaneous contact with two supports.
                 *
                 * Crucially:
                 *
                 * distance > 1
                 *      =>
                 * no correction
                 *
                 * The balls are allowed to separate.
                 */
                for(
                    let iteration=0;
                    iteration<4;
                    iteration++
                ){

                    let changed=false;


                    for(
                        const support
                        of supportPositions
                    ){

                        const result=
                            pushOutOfSupport(
                                point,
                                support,
                                seg
                            );


                        if(
                            result.corrected
                        ){

                            point=
                                result.point;

                            corrections++;

                            changed=true;
                        }
                    }


                    if(!changed)
                        break;
                }


                if(corrections){

                    window
                    .__sixBallNonPenetrationCorrections=
                        (
                            window
                            .__sixBallNonPenetrationCorrections||
                            0
                        )+
                        corrections;
                }


                return point;
            };
    }


    /* ========================================================
     * CLEAN INFERRED METADATA FROM NEW PATHS
     *
     * This is a safety net for paths produced by another
     * compatibility layer before this final layer executes.
     * ======================================================== */

    if(
        typeof markPileFlowPaths===
            "function"
    ){

        const baseMark=
            markPileFlowPaths;


        markPileFlowPaths=
            function(
                g,
                reason="pile_flow"
            ){

                const r=
                    baseMark(
                        g,
                        reason
                    );


                if(!g?.board)
                    return r;


                for(
                    let y=boardScanMin(g.board);
                    y<ROWS;
                    y++
                ){

                    for(
                        let x=0;
                        x<W2;
                        x++
                    ){

                        if(!valid(x,y))
                            continue;


                        const ball=
                            g.board[y][x];


                        if(
                            !ball ||
                            !Array.isArray(
                                ball.fallPath
                            )
                        ){
                            continue;
                        }


                        for(
                            const seg
                            of ball.fallPath
                        ){

                            if(!seg)
                                continue;


                            if(
                                seg
                                .pileFlowInferredSupport
                            ){

                                seg.followSupportIds=[];
                                seg.movingSupportId=0;

                                delete seg
                                    .pileFlowInferredSupport;
                            }


                            if(
                                seg
                                .pileFlowStaticContact
                            ){

                                /*
                                 * Keep a real pivot if present;
                                 * remove only adhesive following.
                                 */
                                seg.followSupportIds=[];
                                seg.movingSupportId=0;

                                delete seg
                                    .pileFlowStaticContact;
                            }
                        }
                    }
                }


                return r;
            };
    }


    /* ========================================================
     * DIAGNOSTICS
     * ======================================================== */

    window.__sixBallContactSeparationVersion=
        "contact-separation-v1";

    window.__sixBallContactIsAdhesive=
        false;

    window.__sixBallSeparationAllowed=
        true;

    window.__sixBallOverlapAllowed=
        false;

})();
