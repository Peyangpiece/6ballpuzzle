/* ============================================================
 * 6ball POST-CLEAR TWO-STAGE GRAVITY v1
 *
 * Large clear:
 *
 * PHASE 1
 *   VERTICAL GRAVITY ONLY
 *
 *   - unsupported connected chunks keep their shape
 *   - straight down only
 *   - NO arc / roll
 *   - NO horizontal compaction
 *   - compile all possible vertical falls first
 *
 * PHASE 2
 *   NORMAL GRAVITY + ARC
 *
 *   - starts only after PHASE 1 animation has completed
 *   - real supporting balls may become pivots
 *   - chunks may split naturally
 *
 * Logical lattice remains authoritative.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallPostClearTwoStageV1
    ){
        return;
    }

    window.__sixBallPostClearTwoStageV1=true;


    /*
     * 6 is an ordinary clear.
     * "Many balls at once" starts here.
     */
    const LARGE_CLEAR_MIN=6;

    let bundleSeq=1;


    function k(x,y){
        return x+","+y;
    }


    function entries(b){

        const out=[];

        for(
            let y=boardScanMin(b);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;

                const ball=b[y][x];

                if(ball){
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


    /* ========================================================
     * TRUE GROUNDED PILE
     *
     * Wall does not count as support.
     * ======================================================== */

    function groundedIds(b){

        const all=entries(b);

        const grounded=
            new Set();


        for(const q of all){

            if(touchesFloorRow(q.y)){

                grounded.add(
                    q.ball.id
                );

                continue;
            }


            if(
                typeof ballInBalancedHexagonRing===
                    "function" &&
                ballInBalancedHexagonRing(
                    b,
                    q.x,
                    q.y
                )
            ){

                grounded.add(
                    q.ball.id
                );
            }
        }


        /*
         * Support propagates upward only through
         * TWO REAL grounded lower balls.
         */
        for(
            let guard=0;
            guard<ROWS*2;
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

                    const sx=q.x+dx;
                    const sy=q.y+1;

                    if(!valid(sx,sy))
                        continue;

                    const s=b[sy][sx];

                    if(s)
                        supports.push(s);
                }


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
     * FLOATING CONNECTED CHUNKS
     * ======================================================== */

    function floatingComponents(b){

        const grounded=
            groundedIds(b);

        const floating=
            new Map();


        for(const q of entries(b)){

            if(
                !grounded.has(
                    q.ball.id
                )
            ){

                floating.set(
                    k(q.x,q.y),
                    q
                );
            }
        }


        const seen=
            new Set();

        const out=[];


        for(const q of floating.values()){

            if(seen.has(q.ball.id))
                continue;


            const stack=[q];
            const comp=[];

            seen.add(q.ball.id);


            while(stack.length){

                const cur=
                    stack.pop();

                comp.push(cur);


                for(const [dx,dy] of DIRS){

                    const n=
                        floating.get(
                            k(
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


    /* ========================================================
     * PURE VERTICAL CHUNK FALL
     * ======================================================== */

    function verticalSafe(
        b,
        comp,
        dy
    ){

        if(
            !comp.length ||
            dy<=0
        ){
            return false;
        }


        const own=
            new Set(
                comp.map(
                    q=>q.ball.id
                )
            );


        const targets=
            new Set();


        for(const q of comp){

            const tx=q.x;
            const ty=q.y+dy;


            if(!valid(tx,ty))
                return false;


            const key=
                k(tx,ty);


            if(targets.has(key))
                return false;

            targets.add(key);


            const obstacle=
                b[ty][tx];


            if(
                obstacle &&
                !own.has(
                    obstacle.id
                )
            ){
                return false;
            }
        }


        /*
         * Continuous sweep.
         *
         * Still no pivot and no arc.
         */
        if(
            typeof hexPhysPathHitsStationary===
                "function"
        ){

            for(const q of comp){

                const p={
                    x:q.x,
                    y:q.y,

                    tx:q.x,
                    ty:q.y+dy,

                    ball:q.ball,

                    kind:
                        "POST_CLEAR_VERTICAL_FIRST",

                    pivot:null,
                    topPivot:null,

                    followSupportIds:[]
                };


                if(
                    hexPhysPathHitsStationary(
                        p,
                        b,
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
        b,
        comp
    ){

        let best=0;


        /*
         * Same lattice column => y changes by 2.
         */
        for(
            let dy=2;
            dy<ROWS*2;
            dy+=2
        ){

            if(
                !verticalSafe(
                    b,
                    comp,
                    dy
                )
            ){
                break;
            }


            best=dy;
        }


        return best;
    }


    function verticalCandidates(b){

        const out=[];


        for(
            const comp
            of floatingComponents(b)
        ){

            if(!comp.length)
                continue;


            const dy=
                maximumVerticalDrop(
                    b,
                    comp
                );


            if(dy<=0)
                continue;


            out.push({
                comp,
                dy
            });
        }


        /*
         * Lower chunks first.
         * Larger chunks win ties.
         */
        out.sort(
            (a,z)=>{

                const ay=
                    Math.max(
                        ...a.comp.map(
                            q=>q.y
                        )
                    );

                const zy=
                    Math.max(
                        ...z.comp.map(
                            q=>q.y
                        )
                    );


                if(ay!==zy)
                    return zy-ay;


                if(
                    a.comp.length!==
                    z.comp.length
                ){
                    return(
                        z.comp.length-
                        a.comp.length
                    );
                }


                return z.dy-a.dy;
            }
        );


        return out;
    }


    /*
     * Apply as many independent vertical chunks as safely
     * possible in ONE logical event.
     *
     * This makes the initial collapse look global instead of
     * moving one ball at a time.
     */
    function applyVerticalWave(b){

        const candidates=
            verticalCandidates(b);


        if(!candidates.length)
            return false;


        const accepted=[];

        const reservedTargets=
            new Set();

        const movingIds=
            new Set();


        for(const c of candidates){

            const own=
                new Set(
                    c.comp.map(
                        q=>q.ball.id
                    )
                );


            let conflict=false;


            for(const q of c.comp){

                const tx=q.x;
                const ty=q.y+c.dy;

                const target=
                    k(tx,ty);


                if(
                    reservedTargets.has(
                        target
                    )
                ){
                    conflict=true;
                    break;
                }


                const obstacle=
                    b[ty][tx];


                if(
                    obstacle &&
                    !own.has(obstacle.id) &&
                    !movingIds.has(
                        obstacle.id
                    )
                ){
                    conflict=true;
                    break;
                }
            }


            if(conflict)
                continue;


            const bundle=
                910000000+
                bundleSeq++;


            for(const q of c.comp){

                reservedTargets.add(
                    k(
                        q.x,
                        q.y+c.dy
                    )
                );

                movingIds.add(
                    q.ball.id
                );


                accepted.push({

                    x:q.x,
                    y:q.y,

                    tx:q.x,
                    ty:q.y+c.dy,

                    ball:q.ball,

                    kind:
                        "POST_CLEAR_VERTICAL_FIRST",

                    /*
                     * Absolutely no circular motion in phase 1.
                     */
                    pivot:null,
                    topPivot:null,

                    followSupportIds:[],

                    bundleId:bundle,

                    groupSize:
                        c.comp.length
                });
            }
        }


        if(!accepted.length)
            return false;


        return hexPhysApplyEvent(
            b,
            accepted
        );
    }


    /* ========================================================
     * COMPILE ALL VERTICAL GRAVITY FIRST
     *
     * Logical result is pre-computed, but visual fallPath keeps
     * every straight-down motion so animation remains continuous.
     * ======================================================== */

    function compileVerticalPhase(g){

        let moved=false;
        let waves=0;


        const cap=
            (ROWS-BOARD_MIN_ROW)*
            W2*2;


        for(
            let guard=0;
            guard<cap;
            guard++
        ){

            const q=
                applyVerticalWave(
                    g.board
                );


            if(!q)
                break;


            moved=true;
            waves++;

            g.ver++;
        }


        /*
         * Do NOT schedule the vertical-only animation here.
         *
         * Large-clear collapse is now compiled as one epoch:
         *
         * vertical free-fall
         *      ->
         * physical contact / split
         *      ->
         * arc / roll
         *
         * All generated fallPath segments are scheduled once
         * after the complete logical collapse is known.
         */


        window.__sixBallLastVerticalFirst={
            moved,
            waves,
            at:Date.now()
        };


        return moved;
    }


    /* ========================================================
     * SINGLE COLLAPSE EPOCH
     *
     * Compute the whole post-clear reaction before animation:
     *
     * 1. maximal straight-down collapse
     * 2. coherent collision / physical split
     * 3. canonical contact / arc / roll
     *
     * Rendering receives the complete path once.
     *
     * This removes the old visual barrier between vertical
     * movement and the following deformation.
     * ======================================================== */

    function compileCollapseEpoch(g){

        let moved =
            compileVerticalPhase(g);

        let passes = 0;

        const cap =
            Math.max(
                128,
                (
                    ROWS -
                    BOARD_MIN_ROW
                ) *
                W2 *
                4
            );


        /*
         * Logical vertical collapse is already complete.
         * Permit real contact geometry immediately.
         */
        g.board.__postClearStage =
            "ARC";


        for(
            let guard=0;
            guard<cap;
            guard++
        ){

            let q=false;

            try{

                q =
                    !!settlePass(
                        g.board,
                        false
                    );

            }catch(err){

                window.__sixBallCollapseEpochError = {
                    message:
                        String(
                            err?.message ||
                            err
                        ),

                    passes,

                    at:
                        Date.now()
                };

                break;
            }


            if(!q)
                break;


            moved=true;
            passes++;

            g.ver++;
        }


        /*
         * IMPORTANT:
         *
         * Schedule ONCE after every physical segment has been
         * appended.  collapse-timing can therefore give all
         * affected balls one common start while each individual
         * ball keeps a continuous sequential path.
         */
        if(
            moved &&
            typeof markPileFlowPaths ===
                "function"
        ){

            markPileFlowPaths(
                g,
                "large_clear_collapse_epoch"
            );
        }


        const capHit =
            passes >= cap;


        window.__sixBallLastCollapseEpoch = {

            moved,

            passes,

            cap,

            capHit,

            at:
                Date.now()
        };


        return{
            moved,
            passes,
            capHit
        };
    }


    /* ========================================================
     * PREPARE CLEAR COLLAPSE
     * ======================================================== */

    const previousPrepare=
        typeof prepareContinuousPileFlow===
            "function"
            ?prepareContinuousPileFlow
            :null;


    if(previousPrepare){

        prepareContinuousPileFlow=
            function(
                g,
                reason=
                    "clear_support_loss"
            ){

                const n=
                    Array.isArray(
                        g?.clearing?.cells
                    )
                        ?g.clearing.cells.length
                        :0;


                /*
                 * Normal/small clears keep previous behaviour.
                 */
                if(n<LARGE_CLEAR_MIN){

                    return previousPrepare(
                        g,
                        reason
                    );
                }


                clearBoardEquilibriumLocks(
                    g.board
                );

                g.balanceWait=0;


                /*
                 * Keep the post-clear rendering/smoothing
                 * layers active.
                 */
                g.board.__postClearChunkMode=
                    true;

                g.board.__postClearTwoStage=
                    true;

                g.board.__postClearStage=
                    "VERTICAL";


                const epoch=
                    compileCollapseEpoch(g);


                /*
                 * There is no visual phase barrier anymore.
                 *
                 * Vertical + physical deformation were compiled
                 * into one continuous collapse epoch.
                 */
                g.board.__postClearStage=
                    "ARC";


                window.__sixBallPostClearTwoStageActive=
                    true;


                return{
                    moved:
                        epoch.moved,

                    twoStage:true,

                    collapseEpoch:true,

                    passes:
                        epoch.passes,

                    capHit:
                        epoch.capHit,

                    stage:
                        "COLLAPSE_EPOCH"
                };
            };
    }


    /* ========================================================
     * SETTLE
     *
     * By the time SETTLE is called, pendingFallPathCount==0.
     * Therefore the complete vertical animation has finished.
     *
     * Only NOW enable normal gravity + arc motion.
     * ======================================================== */

    const previousSettlePass=
        settlePass;


    settlePass=
        function(
            b,
            preview=false
        ){

            if(
                !b?.
                __postClearTwoStage
            ){

                return previousSettlePass(
                    b,
                    preview
                );
            }


            if(
                b.__postClearStage===
                    "WAIT_VERTICAL_VISUAL" ||
                b.__postClearStage===
                    "VERTICAL"
            ){

                /*
                 * Check whether any further PURE VERTICAL
                 * chunk motion has become possible.
                 */
                const candidates=
                    verticalCandidates(b);


                if(candidates.length){

                    if(preview)
                        return true;


                    const moved=
                        applyVerticalWave(b);


                    if(moved)
                        return true;
                }


                /*
                 * Vertical-only gravity has completely ended.
                 *
                 * From this exact point:
                 * gravity + circular roll is legal.
                 */
                b.__postClearStage=
                    "ARC";
            }


            /*
             * app-post-clear-chunk-v1 would otherwise run its
             * own chunk-first logic again.
             *
             * Temporarily disable that wrapper so ARC phase
             * uses the canonical normal gravity solver.
             */
            const oldChunk=
                b.__postClearChunkMode;


            b.__postClearChunkMode=
                false;


            try{

                return previousSettlePass(
                    b,
                    preview
                );

            }finally{

                b.__postClearChunkMode=
                    oldChunk;
            }
        };


    /* ========================================================
     * CLEANUP
     * ======================================================== */

    function clearMode(g){

        if(g?.board){

            delete g.board
                .__postClearTwoStage;

            delete g.board
                .__postClearStage;
        }


        window.__sixBallPostClearTwoStageActive=
            false;
    }


    if(typeof spawn==="function"){

        const previousSpawn=
            spawn;


        spawn=function(g){

            clearMode(g);

            return previousSpawn(g);
        };
    }


    if(
        typeof prepareGarbageBatch===
            "function"
    ){

        const previousGarbage=
            prepareGarbageBatch;


        prepareGarbageBatch=
            function(g){

                clearMode(g);

                return previousGarbage(g);
            };
    }


    window.__sixBallPostClearTwoStageVersion=
        "post-clear-two-stage-v1";

    window.__sixBallLargeClearThreshold=
        LARGE_CLEAR_MIN;

    window.__sixBallArcAllowedDuringInitialCollapse=
        false;

})();
