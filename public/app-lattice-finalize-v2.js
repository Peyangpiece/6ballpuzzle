/* ============================================================
 * 6ball LATTICE FINALIZE ONLY v2
 *
 * IMPORTANT
 *
 * Lattice coordinates are FINAL destinations only.
 *
 * They must NOT attract a moving ball.
 *
 * During motion:
 *   - gravity decides motion
 *   - collision decides contact
 *   - real support balls decide circular roll
 *   - balls may freely separate
 *
 * Only after the entire visual/physical motion is finished
 * may a tiny residual visual error be committed to the
 * authoritative logical lattice cell.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallLatticeFinalizeV2
    ){
        return;
    }

    window.__sixBallLatticeFinalizeV2=true;


    const POS_EPS=1e-6;
    const SPEED_EPS=1e-5;


    function allBoardBalls(g){

        const out=[];

        if(!g?.board)
            return out;


        for(
            let y=boardScanMin(g.board);
            y<ROWS;
            y++
        ){

            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=
                    g.board[y][x];


                if(!ball)
                    continue;


                out.push({
                    ball,
                    x,
                    y,
                    v:g.vis?.get?.(ball.id)||null
                });
            }
        }


        return out;
    }


    function ballIsMoving(
        g,
        ball,
        v
    ){

        if(
            Array.isArray(ball?.fallPath) &&
            ball.fallPath.length
        ){
            return true;
        }


        if(
            g?._visualMovingIds instanceof Set &&
            g._visualMovingIds.has(ball.id)
        ){
            return true;
        }


        if(
            Math.abs(Number(v?.vy)||0)>
                SPEED_EPS
        ){
            return true;
        }


        if(
            Math.abs(
                Number(v?.motionSpeed)||0
            )>
                SPEED_EPS
        ){
            return true;
        }


        return false;
    }


    function boardIsQuiescent(g){

        if(!g?.board)
            return false;


        if(
            typeof pendingFallPathCount===
                "function" &&
            pendingFallPathCount(g)>0
        ){
            return false;
        }


        if(
            g._visualMovingIds instanceof Set &&
            g._visualMovingIds.size>0
        ){
            return false;
        }


        for(
            const {
                ball,
                v
            }
            of allBoardBalls(g)
        ){

            if(
                ballIsMoving(
                    g,
                    ball,
                    v
                )
            ){
                return false;
            }
        }


        /*
         * A ball still having a legal gravitational move
         * must NEVER be snapped to a lattice cell.
         */
        if(
            typeof hasLegalGravityMove===
                "function"
        ){

            try{

                if(
                    hasLegalGravityMove(
                        g.board
                    )
                ){
                    return false;
                }

            }catch(e){}
        }


        return true;
    }


    function finalizeLattice(
        g,
        reason=""
    ){

        if(!boardIsQuiescent(g))
            return 0;


        let fixed=0;


        for(
            const {
                ball,
                x,
                y,
                v
            }
            of allBoardBalls(g)
        ){

            if(!v)
                continue;


            if(
                ballIsMoving(
                    g,
                    ball,
                    v
                )
            ){
                continue;
            }


            const dx=
                Math.abs(
                    Number(v.x)-x
                );

            const dy=
                Math.abs(
                    Number(v.y)-y
                );


            if(
                dx<=POS_EPS &&
                dy<=POS_EPS
            ){
                continue;
            }


            /*
             * This is NOT movement animation.
             *
             * It is only an end-of-motion numerical cleanup
             * after gravity has already completely finished.
             */
            v.x=x;
            v.y=y;

            v.vy=0;
            v.motionSpeed=0;

            fixed++;
        }


        if(fixed){

            window.__sixBallLastLatticeFinalize={
                fixed,
                reason,
                at:Date.now()
            };


            window.__sixBallLatticeFinalizeCount=
                (
                    window
                    .__sixBallLatticeFinalizeCount||
                    0
                )+
                fixed;
        }


        return fixed;
    }


    /* ========================================================
     * IMPORTANT:
     *
     * NO updateVisuals wrapper.
     * NO resolveVisualContacts wrapper.
     *
     * Therefore there is ZERO per-frame lattice attraction.
     * ======================================================== */


    if(
        typeof prepareGarbageBatch===
            "function"
    ){

        const basePrepareGarbageBatch=
            prepareGarbageBatch;


        prepareGarbageBatch=
            function(g){

                /*
                 * CHECK -> GARBAGE is a true stable boundary.
                 */
                finalizeLattice(
                    g,
                    "before_garbage"
                );


                return basePrepareGarbageBatch(
                    g
                );
            };
    }


    if(
        typeof finishGarbageVisuals===
            "function"
    ){

        const baseFinishGarbageVisuals=
            finishGarbageVisuals;


        finishGarbageVisuals=
            function(g){

                const r=
                    baseFinishGarbageVisuals(
                        g
                    );


                finalizeLattice(
                    g,
                    "after_garbage"
                );


                return r;
            };
    }


    if(typeof spawn==="function"){

        const baseSpawn=
            spawn;


        spawn=
            function(g){

                /*
                 * Previous pile must already be completely
                 * settled before the next active piece.
                 */
                finalizeLattice(
                    g,
                    "before_spawn"
                );


                return baseSpawn(g);
            };
    }


    window.__sixBallLatticeFinalizeVersion=
        "lattice-finalize-v2";

    window.__sixBallPerFrameLatticeSnap=
        false;

    window.__sixBallLatticeAttraction=
        false;

    window.__sixBallLatticeOnlyAtFinalRest=
        true;

})();
