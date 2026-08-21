/* ============================================================
 * 6ball FLOOR BRIDGE COLLAPSE v1
 *
 * Fixes:
 *
 *   ○ ○ ○ ○ ○
 *   -----------
 *        empty floor
 *
 * A horizontal row immediately above an empty floor region
 * must never become a stable bridge.
 *
 * Rules:
 * - only applies to the row directly above the floor
 * - only balls with BOTH lower floor cells empty participate
 * - rigid active groups are untouched
 * - intentional HEXAGON holes are untouched
 * - frozen pre-garbage pile is untouched
 * - all compatible bridge members fall in ONE physics event
 * - no arbitrary same-row horizontal movement
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallFloorBridgeCollapseV1
    ){
        return;
    }

    if(
        typeof hexPhysResolveEvent!=="function"
    ){
        return;
    }

    window.__sixBallFloorBridgeCollapseV1=true;


    function objectBoard(board){

        for(
            let y=boardScanMin(board);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;

                const ball=board[y][x];

                if(ball!==null){

                    return(
                        typeof ball==="object"
                    );
                }
            }
        }

        return true;
    }


    function eligible(
        board,
        x,
        y
    ){

        if(!valid(x,y))
            return false;


        const ball=
            board[y][x];


        if(
            !ball ||
            typeof ball!=="object"
        ){
            return false;
        }


        /*
         * Never interfere with an authored rigid triplet/pair.
         */
        if(
            ball.motionGroupId ||
            ball.rigid
        ){
            return false;
        }


        /*
         * Existing pile remains frozen during incoming garbage.
         */
        if(ball.garbagePhaseFrozen)
            return false;


        if(ball.garbageBubbleHold)
            return false;


        if(
            typeof ballInBalancedHexagonRing===
                "function" &&
            ballInBalancedHexagonRing(
                board,
                x,
                y
            )
        ){
            return false;
        }


        const fy=
            ROWS-1;


        /*
         * This invariant is specifically for the row exactly
         * one lattice step above the floor.
         */
        if(y+1!==fy)
            return false;


        const lx=x-1;
        const rx=x+1;


        if(
            !valid(lx,fy) ||
            !valid(rx,fy)
        ){
            return false;
        }


        /*
         * The screenshot bug:
         *
         * BOTH physical lower directions are empty.
         *
         * Therefore horizontal neighbours cannot support this
         * ball against gravity.
         */
        return(
            board[fy][lx]===null &&
            board[fy][rx]===null
        );
    }


    function packingScore(
        board,
        x,
        y
    ){

        if(
            typeof floorPackingScore===
                "function"
        ){

            try{

                return Number(
                    floorPackingScore(
                        board,
                        x,
                        y
                    )
                )||0;

            }catch(e){}
        }


        /*
         * Fallback: prefer a floor slot beside an already
         * settled floor ball.
         */
        let score=0;


        for(const dx of[-2,2]){

            const nx=x+dx;

            if(
                valid(nx,y) &&
                board[y][nx]
            ){
                score++;
            }
        }


        return score;
    }


    function horizontalRuns(
        board,
        y
    ){

        const xs=[];


        for(let x=0;x<W2;x++){

            if(
                eligible(
                    board,
                    x,
                    y
                )
            ){
                xs.push(x);
            }
        }


        if(!xs.length)
            return[];


        xs.sort(
            (a,b)=>a-b
        );


        const runs=[];
        let run=[xs[0]];


        for(
            let i=1;
            i<xs.length;
            i++
        ){

            /*
             * Same-row touching balls in doubled-x lattice
             * coordinates differ by 2.
             */
            if(
                xs[i]-
                xs[i-1]===
                2
            ){

                run.push(xs[i]);

            }else{

                runs.push(run);
                run=[xs[i]];
            }
        }


        runs.push(run);


        /*
         * Single unsupported balls are already handled by
         * ordinary gravity. This patch fixes BRIDGES only.
         */
        return runs.filter(
            r=>r.length>=2
        );
    }


    function preferredDirection(
        board,
        run,
        floorY
    ){

        let leftScore=0;
        let rightScore=0;


        for(const x of run){

            leftScore+=
                packingScore(
                    board,
                    x-1,
                    floorY
                );

            rightScore+=
                packingScore(
                    board,
                    x+1,
                    floorY
                );
        }


        if(rightScore>leftScore)
            return 1;

        if(leftScore>rightScore)
            return -1;


        /*
         * Preserve existing momentum only as a tie breaker.
         */
        let momentum=0;


        for(const x of run){

            const ball=
                board[floorY-1][x];


            if(
                typeof hexPhysBias===
                    "function"
            ){

                momentum+=
                    hexPhysBias(ball);
            }
        }


        if(momentum)
            return Math.sign(momentum);


        /*
         * Fully symmetric case: deterministic.
         */
        return -1;
    }


    function matchRun(
        board,
        run,
        floorY
    ){

        const dir=
            preferredDirection(
                board,
                run,
                floorY
            );


        const options=
            new Map();


        for(const x of run){

            const first=x+dir;
            const second=x-dir;

            const a=[];


            if(
                valid(first,floorY) &&
                board[floorY][first]===null
            ){
                a.push(first);
            }


            if(
                valid(second,floorY) &&
                board[floorY][second]===null
            ){
                a.push(second);
            }


            options.set(x,a);
        }


        /*
         * Small bipartite matching:
         *
         * upper balls -> empty floor cells
         *
         * This removes the old "two balls booked the same
         * vacancy, therefore nobody moves" case.
         */
        const targetOwner=
            new Map();


        function augment(
            x,
            seen
        ){

            for(
                const target
                of options.get(x)||[]
            ){

                if(seen.has(target))
                    continue;


                seen.add(target);


                const old=
                    targetOwner.get(
                        target
                    );


                if(
                    old===undefined ||
                    augment(
                        old,
                        seen
                    )
                ){

                    targetOwner.set(
                        target,
                        x
                    );

                    return true;
                }
            }


            return false;
        }


        for(const x of run){

            augment(
                x,
                new Set()
            );
        }


        const targetByX=
            new Map();


        for(
            const [
                target,
                x
            ]
            of targetOwner
        ){

            targetByX.set(
                x,
                target
            );
        }


        return targetByX;
    }


    function bridgePlan(board){

        if(!objectBoard(board))
            return[];


        /*
         * During the initial post-clear phase ONLY vertical
         * gravity is allowed. The two-stage layer will switch
         * this to ARC before ordinary resolver motion begins.
         */
        if(
            board?.
                __postClearTwoStage &&
            board.
                __postClearStage!=="ARC"
        ){
            return[];
        }


        const y=
            ROWS-2;

        const fy=
            ROWS-1;


        const runs=
            horizontalRuns(
                board,
                y
            );


        if(!runs.length)
            return[];


        const proposals=[];

        let bundleBase=
            930000000;


        for(
            const run
            of runs
        ){

            const mapping=
                matchRun(
                    board,
                    run,
                    fy
                );


            /*
             * A bridge fix should move the whole compatible
             * run, not one member at a time.
             */
            if(
                mapping.size!==
                run.length
            ){
                continue;
            }


            const bundle=
                bundleBase++;


            for(const x of run){

                const ball=
                    board[y][x];

                const tx=
                    mapping.get(x);


                if(
                    !ball ||
                    !Number.isFinite(tx)
                ){
                    continue;
                }


                proposals.push({

                    x,
                    y,

                    tx,
                    ty:fy,

                    ball,

                    /*
                     * This is gravitational floor packing,
                     * not a support-pivot roll.
                     */
                    kind:
                        "FLOOR_BRIDGE_GRAVITY",

                    pivot:null,
                    topPivot:null,

                    followSupportIds:[],

                    bundleId:bundle,

                    groupSize:
                        run.length,

                    floorBridgeCollapse:
                        true
                });
            }
        }


        return proposals;
    }


    const baseResolve=
        hexPhysResolveEvent;


    hexPhysResolveEvent=
        function(
            board,
            preview=false
        ){

            const bridge=
                bridgePlan(board);


            if(bridge.length){

                window
                .__sixBallLastFloorBridgeCollapse={
                    count:
                        bridge.length,

                    cells:
                        bridge.map(
                            p=>({
                                from:[
                                    p.x,
                                    p.y
                                ],
                                to:[
                                    p.tx,
                                    p.ty
                                ]
                            })
                        ),

                    at:
                        Date.now()
                };


                window
                .__sixBallFloorBridgeCollapseCount=
                    (
                        window
                        .__sixBallFloorBridgeCollapseCount||
                        0
                    )+1;


                return preview
                    ?bridge.slice(0,1)
                    :bridge;
            }


            return baseResolve(
                board,
                preview
            );
        };


    window.__sixBallFloorBridgeCollapseVersion=
        "floor-bridge-collapse-v1";

    window.__sixBallHorizontalFloorBridgeAllowed=
        false;

})();
