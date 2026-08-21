/* ============================================================
 * 6ball WALL BOUNDARY AUTHORITATIVE v1
 *
 * WALL RULE:
 *
 * - impenetrable boundary
 * - zero friction
 * - NOT a support
 * - NO attraction
 * - NO followSupport
 * - NO movingSupport binding
 * - NO wall-specific rigidity
 *
 * Motion is decided by gravity / real balls / floor only.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallWallBoundaryAuthoritativeV1
    ){
        return;
    }

    if(
        typeof hexPhysSupportInfo!=="function"
    ){
        return;
    }

    window.__sixBallWallBoundaryAuthoritativeV1=true;


    /*
     * IMPORTANT:
     *
     * Outside-board space is still collision-blocked by
     * hexPhysOccupied(), therefore balls cannot penetrate wall.
     *
     * But outside-board space must NEVER count as a physical
     * support capable of holding a ball against gravity.
     */
    hexPhysSupportInfo=
        function(
            board,
            x,
            y,
            ignore=null
        ){

            const floor=
                touchesFloorRow(y);


            const left={
                x:x-1,
                y:y+1,
                valid:valid(
                    x-1,
                    y+1
                )
            };


            const right={
                x:x+1,
                y:y+1,
                valid:valid(
                    x+1,
                    y+1
                )
            };


            left.ball=
                left.valid
                    ?board[left.y][left.x]
                    :null;


            right.ball=
                right.valid
                    ?board[right.y][right.x]
                    :null;


            /*
             * Invalid/outside cells:
             *
             * occupied for penetration purposes,
             * but NOT occupied for support purposes.
             */
            left.occupied=
                !!(
                    left.valid &&
                    left.ball &&
                    !(
                        ignore &&
                        ignore.has(
                            left.ball.id
                        )
                    )
                );


            right.occupied=
                !!(
                    right.valid &&
                    right.ball &&
                    !(
                        ignore &&
                        ignore.has(
                            right.ball.id
                        )
                    )
                );


            return{
                floor,
                left,
                right,

                count:
                    floor
                        ?2
                        :Number(
                            left.occupied
                         )+
                         Number(
                            right.occupied
                         )
            };
        };


    if(
        typeof lowerContactSupportCount===
            "function"
    ){

        lowerContactSupportCount=
            function(
                board,
                x,
                y
            ){

                return(
                    hexPhysSupportInfo(
                        board,
                        x,
                        y
                    ).count
                );
            };
    }


    window.__sixBallWallIsSupport=false;

    window.__sixBallWallFriction=0;

    window.__sixBallWallAttraction=false;

    window.__sixBallWallFollowerBinding=false;

    window.__sixBallWallMovingSupportBinding=false;

    window.__sixBallWallRigidity=false;

    window.__sixBallWallBoundaryVersion=
        "wall-boundary-authoritative-v1";

})();


/* ============================================================
 * WALL EDGE TERMINAL CLASSIFICATION v1.1
 *
 * Fixes a SETTLE livelock at the extreme left/right lattice
 * columns, especially the third level from the floor.
 *
 * IMPORTANT:
 *
 * The wall is STILL:
 * - not a support ball
 * - zero friction
 * - non-attractive
 *
 * This only prevents a geometrically wall-constrained ball
 * with zero legal motion from being mislabeled illegalFloat.
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallWallEdgeTerminalV11
    ){
        return;
    }

    if(
        typeof unstableFrozenBalls !== "function" ||
        typeof hexPhysNaturalMotion !== "function"
    ){
        return;
    }

    window.__sixBallWallEdgeTerminalV11 = true;


    const baseUnstableFrozenBallsWallV11 =
        unstableFrozenBalls;


    function wallEdgeTerminal(
        board,
        q
    ){

        if(
            !q ||
            !valid(q.x,q.y)
        ){
            return false;
        }


        const ball =
            board[q.y][q.x];


        if(!ball)
            return false;


        if(touchesFloorRow(q.y))
            return false;


        const leftValid =
            valid(
                q.x-1,
                q.y+1
            );


        const rightValid =
            valid(
                q.x+1,
                q.y+1
            );


        /*
         * Exactly one lower diagonal must be outside.
         *
         * This identifies a true left/right wall cell,
         * not an ordinary interior gap.
         */
        if(leftValid === rightValid)
            return false;


        const innerX =
            leftValid
                ?q.x-1
                :q.x+1;


        const innerY =
            q.y+1;


        const innerSupport =
            valid(innerX,innerY)
                ?board[innerY][innerX]
                :null;


        /*
         * No real inner ball:
         * this is not a wall wedge.
         * Ordinary gravity must handle it.
         */
        if(!innerSupport)
            return false;


        /*
         * If any canonical natural motion exists,
         * it must move normally.
         */
        let motion = null;


        try{

            motion =
                hexPhysNaturalMotion(
                    board,
                    q.x,
                    q.y,
                    null
                );

        }catch(e){

            return false;
        }


        if(motion)
            return false;


        /*
         * Wall itself is NOT counted as support.
         *
         * We only state that this ball currently has
         * zero legal physical exit path and therefore
         * must not keep SETTLE alive forever.
         */
        ball.__wallEdgeTerminalV11 =
            true;


        return true;
    }


    unstableFrozenBalls =
        function(board){

            let raw = [];


            try{

                raw =
                    baseUnstableFrozenBallsWallV11(
                        board
                    ) || [];

            }catch(e){

                raw = [];
            }


            const out =
                raw.filter(
                    q=>
                        !wallEdgeTerminal(
                            board,
                            q
                        )
                );


            if(out.length !== raw.length){

                window.__sixBallLastWallEdgeTerminal = {

                    removed:
                        raw
                        .filter(
                            q=>
                                wallEdgeTerminal(
                                    board,
                                    q
                                )
                        )
                        .map(
                            q=>({
                                id:q.id,
                                x:q.x,
                                y:q.y
                            })
                        ),

                    at:
                        Date.now()
                };
            }


            return out;
        };


    boardHasIllegalFloat =
        function(board){

            return(
                unstableFrozenBalls(
                    board
                ).length>0
            );
        };


    window.__sixBallWallEdgeTerminalVersion =
        "wall-edge-terminal-v1.1";

    window.__sixBallWallStillNotSupport =
        true;

    window.__sixBallWallEdgeNoMotionIsNotIllegalFloat =
        true;

})();
