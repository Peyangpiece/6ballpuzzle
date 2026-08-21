/* ============================================================
 * 6ball GARBAGE CONTINUOUS GRAVITY v1
 *
 * Incoming garbage:
 *
 * - no one-lattice-step-at-a-time waiting
 * - compile the whole legal gravity trajectory immediately
 * - all affected garbage balls start moving together
 * - each ball's OWN segments remain sequential
 * - straight fall follows gravitational acceleration
 * - on real-ball contact, existing circular motion takes over
 * - no pure horizontal gap filling
 * - no virtual wall pivot
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallGarbageContinuousV1
    ){
        return;
    }

    if(
        typeof updateGarbagePacks!=="function" ||
        typeof settlePass!=="function" ||
        typeof scheduleFreshPileFlowWave!=="function"
    ){
        return;
    }

    window.__sixBallGarbageContinuousV1=true;


    const MAX_COMPILE_STEPS=
        (ROWS-BOARD_MIN_ROW)*
        W2*4;


    /* ========================================================
     * GARBAGE SCHEDULER
     *
     * Previous behaviour:
     *
     * event A
     *   ↓ wait
     * event B
     *   ↓ wait
     * event C
     *
     * New behaviour:
     *
     * A ─────────→
     * B ─────────→
     * C ─────────→
     *
     * Only consecutive segments belonging to the SAME ball
     * wait for that ball's previous segment.
     * ======================================================== */

    const previousScheduler=
        scheduleFreshPileFlowWave;


    function ownPreviousEnd(
        ball,
        seg,
        base
    ){

        const path=
            Array.isArray(ball?.fallPath)
                ?ball.fallPath
                :[];


        const index=
            path.indexOf(seg);


        if(index<=0)
            return base;


        for(
            let i=index-1;
            i>=0;
            i--
        ){

            const prev=
                path[i];


            if(
                Number.isFinite(
                    prev?.pileFlowEnd
                )
            ){

                return Math.max(
                    base,
                    prev.pileFlowEnd
                );
            }
        }


        return base;
    }


    function groupedBySeq(fresh){

        const map=
            new Map();


        for(const q of fresh){

            const seq=
                Number.isFinite(q.seq)
                    ?q.seq
                    :0;


            if(!map.has(seq))
                map.set(seq,[]);


            map.get(seq)
                .push(q);
        }


        return[
            ...map.entries()
        ].sort(
            (a,b)=>a[0]-b[0]
        );
    }


    function attachGravityMetadata(
        g,
        fresh
    ){

        const byBall=
            new Map();


        for(const q of fresh){

            if(!byBall.has(q.ball.id))
                byBall.set(
                    q.ball.id,
                    []
                );


            byBall.get(q.ball.id)
                .push(q);
        }


        for(
            const [id,list]
            of byBall
        ){

            const ball=
                list[0]?.ball;

            const vis=
                g.vis?.get?.(id);


            let vy=
                Math.max(
                    0,
                    Number(vis?.vy)||
                    RELEASE_INITIAL_VY
                );


            /*
             * Sort by actual order inside that ball's
             * fallPath, not by global event number.
             */
            const path=
                Array.isArray(ball?.fallPath)
                    ?ball.fallPath
                    :[];


            list.sort(
                (a,b)=>
                    path.indexOf(a.seg)-
                    path.indexOf(b.seg)
            );


            for(const q of list){

                const seg=q.seg;

                if(
                    !seg?.from ||
                    !seg?.to
                ){
                    continue;
                }


                seg.__garbageContinuous=
                    true;


                const dx=
                    seg.to[0]-
                    seg.from[0];

                const dy=
                    seg.to[1]-
                    seg.from[1];


                if(
                    Math.abs(dx)<1e-9 &&
                    dy>0
                ){

                    const T=
                        Math.max(
                            1/120,
                            Number(
                                seg._pileNominalDuration
                            )||
                            1/120
                        );


                    seg.__garbageV0=
                        vy;

                    seg.__garbageGravityDuration=
                        T;


                    vy=
                        vy+
                        GRAV*T;


                    seg.__garbageV1=
                        vy;

                }else{

                    /*
                     * Keep downward momentum through a contact
                     * transition. Circular movement itself
                     * remains controlled by the existing
                     * SLIDE_SPEED implementation.
                     */
                    seg.__garbageV0=
                        vy;
                }
            }
        }
    }


    scheduleFreshPileFlowWave=
        function(g,fresh){

            if(
                !fresh?.length
            ){
                return;
            }


            if(
                !(
                    g &&
                    g.state==="RESOLVING" &&
                    g.phase==="GARBAGE"
                )
            ){

                return previousScheduler(
                    g,
                    fresh
                );
            }


            /*
             * Preserve all existing physical duration
             * calculations.
             */
            preparePileFlowDurations(
                g,
                fresh
            );


            attachGravityMetadata(
                g,
                fresh
            );


            const base=
                Math.max(
                    0,
                    Number(
                        g.pileFlowClock
                    )||0
                );


            const groups=
                groupedBySeq(
                    fresh
                );


            let immediate=0;


            for(
                const [
                    seq,
                    entries
                ]
                of groups
            ){

                const segs=
                    entries.map(
                        q=>q.seg
                    );


                /*
                 * One logical event uses one duration.
                 * This preserves relative positions when
                 * several balls move together.
                 */
                const duration=
                    Math.max(
                        1/120,
                        ...segs.map(
                            seg=>
                                Number(
                                    seg
                                    ?._pileNominalDuration
                                )||
                                1/120
                        )
                    );


                /*
                 * NO global previous-wave waiting.
                 *
                 * Every different ball may start at "base".
                 */
                let start=
                    base;


                /*
                 * The same ball cannot perform segment #2
                 * before its own segment #1 has finished.
                 */
                for(
                    const {
                        ball,
                        seg
                    }
                    of entries
                ){

                    start=
                        Math.max(
                            start,
                            ownPreviousEnd(
                                ball,
                                seg,
                                base
                            )
                        );
                }


                for(const seg of segs){

                    seg.pileFlowStart=
                        start;

                    seg.pileFlowDuration=
                        duration;

                    seg.pileFlowEnd=
                        start+
                        duration;

                    seg.pileFlowWaveDelay=
                        0;

                    seg.pileFlowGarbageContinuous=
                        true;
                }


                if(
                    Math.abs(
                        start-base
                    )<1e-8
                ){

                    immediate++;
                }
            }


            window
            .__sixBallLastGarbageSchedule={
                segments:
                    fresh.length,

                events:
                    groups.length,

                immediateEvents:
                    immediate,

                at:
                    Date.now()
            };
        };


    /* ========================================================
     * TRUE GRAVITY POSITION
     *
     * Existing straight pileFlow interpolation is linear in
     * normalized time.
     *
     * For incoming garbage vertical fall use:
     *
     * y = y0 + v0*t + 1/2*g*t²
     *
     * Logical physics is unchanged.
     * ======================================================== */

    if(
        typeof pileFlowPoint===
            "function"
    ){

        const previousPileFlowPoint=
            pileFlowPoint;


        pileFlowPoint=
            function(
                seg,
                q
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
                    seg?.
                    __garbageContinuous &&
                    !seg.pivot &&
                    !seg.topPivot &&
                    seg.from &&
                    seg.to
                ){

                    const dx=
                        seg.to[0]-
                        seg.from[0];

                    const dy=
                        seg.to[1]-
                        seg.from[1];


                    if(
                        Math.abs(dx)<1e-9 &&
                        dy>0
                    ){

                        const T=
                            Math.max(
                                1/120,
                                Number(
                                    seg.pileFlowDuration
                                )||
                                Number(
                                    seg
                                    .__garbageGravityDuration
                                )||
                                1/120
                            );


                        const v0=
                            Math.max(
                                0,
                                Number(
                                    seg.__garbageV0
                                )||
                                0
                            );


                        const t=
                            T*q;


                        const distance=
                            Math.min(
                                dy,
                                Math.max(
                                    0,
                                    v0*t+
                                    .5*
                                    GRAV*
                                    t*t
                                )
                            );


                        return[
                            seg.from[0],
                            seg.from[1]+
                            distance
                        ];
                    }
                }


                /*
                 * Contact / circular movement continues to use
                 * the canonical implementation.
                 */
                return previousPileFlowPoint(
                    seg,
                    q
                );
            };
    }


    /* ========================================================
     * COMPILE FULL GARBAGE TRAJECTORY
     *
     * Current normal-v4 code deliberately executes exactly
     * ONE settlePass and waits for its animation.
     *
     * Here we continue resolving LOGICAL gravity immediately,
     * appending every legal segment to fallPath.
     *
     * Rendering then plays that complete path continuously.
     * ======================================================== */

    function compileGarbageGravity(g){

        if(
            !g?.board ||
            g.phase!=="GARBAGE"
        ){
            return{
                moved:false,
                steps:0
            };
        }


        let moved=false;
        let steps=0;


        /*
         * Existing accumulated pile is already marked
         * garbagePhaseFrozen by the garbage runtime.
         *
         * Therefore settlePass can only move incoming
         * garbage balls here.
         */
        for(
            ;
            steps<
                MAX_COMPILE_STEPS;
            steps++
        ){

            if(
                !hasLegalGravityMove(
                    g.board
                )
            ){
                break;
            }


            const q=
                settlePass(
                    g.board,
                    false
                );


            if(!q)
                break;


            moved=true;

            g.ver++;
        }


        /*
         * Compile every newly appended fallPath into one
         * continuous absolute-time trajectory.
         */
        if(
            (
                moved ||
                pendingFallPathCount(g)>0
            ) &&
            typeof markPileFlowPaths===
                "function"
        ){

            markPileFlowPaths(
                g,
                "garbage_continuous_gravity"
            );
        }


        if(steps>=MAX_COMPILE_STEPS){

            window
            .__sixBallGarbageCompileCapHits=
                (
                    window
                    .__sixBallGarbageCompileCapHits||
                    0
                )+1;
        }


        window
        .__sixBallLastGarbageCompile={
            moved,
            steps,
            pending:
                pendingFallPathCount(g),
            at:
                Date.now()
        };


        return{
            moved,
            steps
        };
    }


    const previousUpdateGarbagePacks=
        updateGarbagePacks;


    updateGarbagePacks=
        function(
            g,
            dt
        ){

            const versionBefore=
                Number(g?.ver)||0;


            /*
             * This still handles:
             * - 0.5 sec spawn timing
             * - shape planning
             * - batch bookkeeping
             * - blocked spawn handling
             */
            previousUpdateGarbagePacks(
                g,
                dt
            );


            if(
                !g ||
                g.phase!=="GARBAGE"
            ){
                return;
            }


            /*
             * If nothing new was logically inserted/moved and
             * this exact logical version was already compiled,
             * there is nothing to do.
             */
            if(
                g.__garbageContinuousCompiledVersion===
                    g.ver
            ){
                return;
            }


            /*
             * A newly spawned pack or the first gravity step
             * has appeared.
             *
             * Resolve its remaining legal trajectory NOW,
             * rather than waiting one visible cell at a time.
             */
            compileGarbageGravity(g);


            g.__garbageContinuousCompiledVersion=
                g.ver;


            if(
                g.ver!==versionBefore
            ){

                window
                .__sixBallGarbageContinuousBatches=
                    (
                        window
                        .__sixBallGarbageContinuousBatches||
                        0
                    )+1;
            }
        };


    /* ========================================================
     * CLEAN BOUNDARY
     * ======================================================== */

    if(
        typeof finishGarbageVisuals===
            "function"
    ){

        const previousFinish=
            finishGarbageVisuals;


        finishGarbageVisuals=
            function(g){

                if(g){

                    delete g
                        .__garbageContinuousCompiledVersion;
                }


                return previousFinish(g);
            };
    }


    window.__sixBallGarbageContinuousVersion=
        "garbage-continuous-v1";

    window.__sixBallGarbageStepWaiting=
        false;

    window.__sixBallGarbageUsesGravityCurve=
        true;

    window.__sixBallGarbageGlobalWaveDelay=
        false;

})();


/*
 * ============================================================
 * GARBAGE COLLISION RESERVATION v1
 *
 * Root fix for:
 * - garbage balls visually overlapping
 * - two balls claiming the same gravity destination
 * - compiled fall paths crossing during the same garbage update
 * - resulting GARBAGE/SETTLE freeze
 *
 * Rules:
 * 1. One target cell may belong to one garbage ball only.
 * 2. One trajectory cell/edge may belong to one ball per compile.
 * 3. Head-on swaps are forbidden.
 * 4. A rejected ball stays where it is and is recalculated from
 *    the newest logical board on the next update.
 * 5. Duplicate logical references are repaired defensively.
 *
 * Normal-piece physics is untouched.
 * ============================================================
 */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallGarbageCollisionReservationV1
    ){
        return;
    }

    if(
        typeof updateGarbagePacks!=="function" ||
        typeof hexPhysApplyEvent!=="function"
    ){
        return;
    }

    window.__sixBallGarbageCollisionReservationV1=true;

    const baseUpdateGarbagePacksCollisionV1=
        updateGarbagePacks;

    const baseGarbageBatchDoneCollisionV1=
        typeof garbageBatchDone==="function"
            ? garbageBatchDone
            : null;

    const baseGarbageVisualsDoneCollisionV1=
        typeof garbageVisualsDone==="function"
            ? garbageVisualsDone
            : null;


    function coordKey(x,y){

        return (
            String(Number(x))+
            ","+
            String(Number(y))
        );
    }


    function edgeKey(x,y,tx,ty){

        return (
            coordKey(x,y)+
            ">"+
            coordKey(tx,ty)
        );
    }


    function reverseEdgeKey(x,y,tx,ty){

        return (
            coordKey(tx,ty)+
            ">"+
            coordKey(x,y)
        );
    }


    function midpointKey(x,y,tx,ty){

        /*
         * Do not divide by two.
         * Using summed coordinates avoids floating-point keys.
         */
        return (
            String(Number(x)+Number(tx))+
            ","+
            String(Number(y)+Number(ty))
        );
    }


    function moveId(move,index){

        const b=move?.ball;

        if(
            b &&
            b.id!==undefined &&
            b.id!==null
        ){
            return "id:"+String(b.id);
        }

        if(b){
            return b;
        }

        return "anonymous:"+index;
    }


    function knownMove(move){

        return !!(
            move &&
            move.ball &&
            Number.isFinite(Number(move.x)) &&
            Number.isFinite(Number(move.y)) &&
            Number.isFinite(Number(move.tx)) &&
            Number.isFinite(Number(move.ty))
        );
    }


    function occupantAt(board,x,y){

        const row=
            board?.[Number(y)];

        if(!row){
            return null;
        }

        return row[Number(x)] || null;
    }


    function filterGarbageEvent(
        board,
        event,
        ctx
    ){

        if(
            !Array.isArray(event) ||
            event.length===0
        ){
            return event;
        }

        /*
         * If this is not the ordinary move-event format,
         * leave it unchanged rather than guessing.
         */
        if(
            !event.some(knownMove)
        ){
            return event;
        }

        const sourceBalls=
            new Set();

        for(const move of event){

            if(
                knownMove(move) &&
                move.ball
            ){
                sourceBalls.add(
                    move.ball
                );
            }
        }


        let accepted=[];

        const localTargets=
            new Map();

        const localSources=
            new Set();

        const localEdges=
            new Map();

        const localMidpoints=
            new Map();


        for(
            let i=0;
            i<event.length;
            i++
        ){

            const move=event[i];

            if(!knownMove(move)){

                /*
                 * Preserve unrelated metadata event members.
                 */
                accepted.push(move);
                continue;
            }

            const id=
                moveId(move,i);

            const sx=
                Number(move.x);

            const sy=
                Number(move.y);

            const tx=
                Number(move.tx);

            const ty=
                Number(move.ty);

            const source=
                coordKey(sx,sy);

            const target=
                coordKey(tx,ty);

            const edge=
                edgeKey(
                    sx,sy,tx,ty
                );

            const reverse=
                reverseEdgeKey(
                    sx,sy,tx,ty
                );

            const midpoint=
                midpointKey(
                    sx,sy,tx,ty
                );


            /*
             * A single physical ball may only have one move in
             * one simultaneous event.
             */
            if(
                localSources.has(
                    move.ball
                )
            ){
                ctx.rejected++;
                continue;
            }


            /*
             * Same destination in the same event.
             */
            if(
                localTargets.has(target)
            ){
                ctx.rejected++;
                continue;
            }


            /*
             * Same destination already travelled to by another
             * ball during this compile/update.
             *
             * The same ball may continue its own multi-step path.
             */
            if(
                ctx.targets.has(target) &&
                ctx.targets.get(target)!==id
            ){
                ctx.rejected++;
                continue;
            }


            /*
             * Prevent head-on edge swaps.
             */
            if(
                localEdges.has(reverse) ||
                (
                    ctx.edges.has(reverse) &&
                    ctx.edges.get(reverse)!==id
                )
            ){
                ctx.rejected++;
                continue;
            }


            /*
             * Prevent two different trajectories crossing at
             * the same geometric midpoint during one compile.
             */
            if(
                (
                    localMidpoints.has(midpoint) &&
                    localMidpoints.get(midpoint)!==id
                ) ||
                (
                    ctx.midpoints.has(midpoint) &&
                    ctx.midpoints.get(midpoint)!==id
                )
            ){
                ctx.rejected++;
                continue;
            }


            const occupied=
                occupantAt(
                    board,
                    tx,
                    ty
                );

            /*
             * Target occupied by a stationary ball:
             * never permit penetration.
             *
             * Occupation by another member of this same event
             * is provisionally allowed because that member may
             * move away simultaneously.
             */
            if(
                occupied &&
                occupied!==move.ball &&
                !sourceBalls.has(occupied)
            ){
                ctx.rejected++;
                continue;
            }


            accepted.push(move);

            localSources.add(
                move.ball
            );

            localTargets.set(
                target,
                id
            );

            localEdges.set(
                edge,
                id
            );

            localMidpoints.set(
                midpoint,
                id
            );
        }


        /*
         * Dependency pass:
         *
         * If A wants B's current cell but B's move was rejected,
         * A must also wait. Repeat until stable.
         */
        let changed=true;

        while(changed){

            changed=false;

            const moving=
                new Set(
                    accepted
                        .filter(knownMove)
                        .map(m=>m.ball)
                );

            const next=[];

            for(const move of accepted){

                if(!knownMove(move)){
                    next.push(move);
                    continue;
                }

                const occupied=
                    occupantAt(
                        board,
                        move.tx,
                        move.ty
                    );

                if(
                    occupied &&
                    occupied!==move.ball &&
                    !moving.has(occupied)
                ){
                    ctx.rejected++;
                    changed=true;
                    continue;
                }

                next.push(move);
            }

            accepted=next;
        }


        /*
         * Only final accepted moves reserve trajectory space.
         */
        for(
            let i=0;
            i<accepted.length;
            i++
        ){

            const move=accepted[i];

            if(!knownMove(move)){
                continue;
            }

            const id=
                moveId(move,i);

            const target=
                coordKey(
                    move.tx,
                    move.ty
                );

            const edge=
                edgeKey(
                    move.x,
                    move.y,
                    move.tx,
                    move.ty
                );

            const midpoint=
                midpointKey(
                    move.x,
                    move.y,
                    move.tx,
                    move.ty
                );

            ctx.targets.set(
                target,
                id
            );

            ctx.edges.set(
                edge,
                id
            );

            ctx.midpoints.set(
                midpoint,
                id
            );

            ctx.accepted++;
        }


        return accepted;
    }


    function findDuplicateBoardRefs(g){

        const duplicates=[];

        if(
            !g ||
            !Array.isArray(g.board)
        ){
            return duplicates;
        }

        const seenObjects=
            new Map();

        const seenIds=
            new Map();

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
                    typeof ball!=="object"
                ){
                    continue;
                }

                if(seenObjects.has(ball)){

                    duplicates.push({
                        first:
                            seenObjects.get(ball),
                        second:{x,y},
                        ball
                    });

                }else{

                    seenObjects.set(
                        ball,
                        {x,y}
                    );
                }


                if(
                    ball.id!==undefined &&
                    ball.id!==null
                ){

                    const id=
                        String(ball.id);

                    if(seenIds.has(id)){

                        const prev=
                            seenIds.get(id);

                        if(
                            prev.ball!==ball
                        ){
                            duplicates.push({
                                first:
                                    {
                                        x:prev.x,
                                        y:prev.y
                                    },
                                second:{x,y},
                                ball,
                                duplicateId:id
                            });
                        }

                    }else{

                        seenIds.set(
                            id,
                            {
                                x,
                                y,
                                ball
                            }
                        );
                    }
                }
            }
        }

        return duplicates;
    }


    function repairDuplicateObjectRefs(g){

        if(
            !g ||
            !Array.isArray(g.board)
        ){
            return 0;
        }

        const positions=
            new Map();

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
                    typeof ball!=="object"
                ){
                    continue;
                }

                if(!positions.has(ball)){
                    positions.set(ball,[]);
                }

                positions.get(ball).push({
                    x,
                    y
                });
            }
        }


        let repaired=0;


        for(
            const [ball,cells]
            of positions
        ){

            if(cells.length<=1){
                continue;
            }


            /*
             * Prefer the coordinate which agrees with the
             * ball's own logical x/y.
             */
            let keep=
                cells.find(
                    q=>
                        Number(ball.x)===q.x &&
                        Number(ball.y)===q.y
                );


            /*
             * If metadata is stale, gravity direction wins:
             * keep the lowest logical occurrence.
             */
            if(!keep){

                keep=
                    cells
                        .slice()
                        .sort(
                            (a,b)=>
                                b.y-a.y ||
                                a.x-b.x
                        )[0];
            }


            for(const q of cells){

                if(
                    q.x===keep.x &&
                    q.y===keep.y
                ){
                    continue;
                }

                if(
                    g.board[q.y]?.[q.x]===
                    ball
                ){
                    g.board[q.y][q.x]=null;
                    repaired++;
                }
            }
        }


        if(repaired){

            g.ver=
                Number(g.ver||0)+1;

            delete g.__garbageContinuousCompiledVersion;

            window.__sixBallLastGarbageDuplicateRepairV1={
                repaired,
                at:Date.now()
            };
        }


        return repaired;
    }


    updateGarbagePacks=
        function(g,dt){

            if(
                !g ||
                g.phase!=="GARBAGE"
            ){
                return baseUpdateGarbagePacksCollisionV1(
                    g,
                    dt
                );
            }


            /*
             * PERFORMANCE v1.1
             *
             * Do NOT scan the whole board every frame.
             * A duplicate can only become newly relevant after
             * the logical board version changes.
             */
            let versionBefore=
                Number(g.ver||0);

            if(
                g.__sixBallGarbageCollisionCheckedVer!==
                versionBefore
            ){
                repairDuplicateObjectRefs(g);

                versionBefore=
                    Number(g.ver||0);

                g.__sixBallGarbageCollisionCheckedVer=
                    versionBefore;
            }


            const originalApply=
                hexPhysApplyEvent;

            /*
             * Do not allocate Maps until an actual garbage
             * movement event reaches hexPhysApplyEvent.
             */
            let ctx=null;


            hexPhysApplyEvent=
                function(
                    board,
                    event
                ){

                    if(
                        !Array.isArray(event) ||
                        !event.some(knownMove)
                    ){
                        return originalApply(
                            board,
                            event
                        );
                    }


                    if(!ctx){

                        ctx={
                            g,
                            targets:new Map(),
                            edges:new Map(),
                            midpoints:new Map(),
                            accepted:0,
                            rejected:0
                        };
                    }


                    const filtered=
                        filterGarbageEvent(
                            board,
                            event,
                            ctx
                        );


                    return originalApply(
                        board,
                        filtered
                    );
                };


            let result;

            try{

                result=
                    baseUpdateGarbagePacksCollisionV1(
                        g,
                        dt
                    );

            }finally{

                hexPhysApplyEvent=
                    originalApply;
            }


            const versionAfter=
                Number(g.ver||0);

            let repaired=0;


            /*
             * Full-board validation only when:
             *
             * - logical board actually changed
             * - or collision reservation rejected something.
             */
            if(
                versionAfter!==versionBefore ||
                (
                    ctx &&
                    ctx.rejected>0
                )
            ){

                repaired=
                    repairDuplicateObjectRefs(g);

                g.__sixBallGarbageCollisionCheckedVer=
                    Number(g.ver||0);
            }


            if(
                (
                    ctx &&
                    ctx.rejected>0
                ) ||
                repaired>0
            ){

                delete g.__garbageContinuousCompiledVersion;

                g.__sixBallGarbageCollisionDeferredUntil=
                    Date.now()+120;
            }


            if(
                ctx ||
                repaired>0
            ){

                window.__sixBallLastGarbageCollisionReservationV1={
                    accepted:
                        ctx
                            ? ctx.accepted
                            : 0,

                    rejected:
                        ctx
                            ? ctx.rejected
                            : 0,

                    repaired,

                    lazy:true,

                    at:Date.now()
                };
            }


            return result;
        };



    function mustContinueGarbageCollisionV1(g){

        if(
            !g ||
            g.phase!=="GARBAGE"
        ){
            return false;
        }


        if(
            Number(
                g.__sixBallGarbageCollisionDeferredUntil||0
            ) >
            Date.now()
        ){
            return true;
        }


        /*
         * Do not run findDuplicateBoardRefs() every time
         * garbageBatchDone() is queried.
         *
         * Only validate when the logical board version changed
         * since the last validation.
         */
        const ver=
            Number(g.ver||0);

        if(
            g.__sixBallGarbageCollisionCheckedVer!==
            ver
        ){

            const repaired=
                repairDuplicateObjectRefs(g);

            g.__sixBallGarbageCollisionCheckedVer=
                Number(g.ver||0);

            if(repaired>0){

                g.__sixBallGarbageCollisionDeferredUntil=
                    Date.now()+120;

                return true;
            }
        }


        return false;
    }



    if(baseGarbageBatchDoneCollisionV1){

        garbageBatchDone=
            function(g){

                if(
                    mustContinueGarbageCollisionV1(g)
                ){
                    return false;
                }

                return baseGarbageBatchDoneCollisionV1(
                    g
                );
            };
    }


    if(baseGarbageVisualsDoneCollisionV1){

        garbageVisualsDone=
            function(g){

                if(
                    mustContinueGarbageCollisionV1(g)
                ){
                    return false;
                }

                return baseGarbageVisualsDoneCollisionV1(
                    g
                );
            };
    }


    window.__sixBallGarbageCollisionReservationVersion=
        "garbage-collision-reservation-v1.1-lazy";

    window.__sixBallGarbageCollisionLazyValidationV11=
        true;

    window.__sixBallGarbageCollisionMapsAllocatedOnDemand=
        true;

    window.__sixBallGarbageCollisionScansOnlyOnVersionChange=
        true;

    window.__sixBallGarbageSameTargetForbidden=
        true;

    window.__sixBallGarbageHeadOnSwapForbidden=
        true;

    window.__sixBallGarbageCrossTrajectoryForbidden=
        true;

    window.__sixBallGarbageCollisionReplanNextFrame=
        true;

})();


/*
 * ============================================================
 * GARBAGE LOGICAL WALL GUARD v1.2b
 *
 * IMPORTANT:
 * - NO garbage timing changes
 * - NO fallPath reservation
 * - NO animation speed changes
 * - NO cross-frame trajectory reservation
 *
 * Only impossible off-board garbage moves are rejected.
 * ============================================================
 */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallGarbageLogicalWallGuardV12b
    ){
        return;
    }

    if(
        typeof updateGarbagePacks!=="function" ||
        typeof hexPhysApplyEvent!=="function"
    ){
        return;
    }

    window.__sixBallGarbageLogicalWallGuardV12b=true;

    const baseUpdateV12b=
        updateGarbagePacks;


    function validMoveV12b(move){

        if(
            !move ||
            !move.ball ||
            !Number.isFinite(Number(move.tx)) ||
            !Number.isFinite(Number(move.ty))
        ){
            return true;
        }

        if(typeof valid!=="function"){
            return true;
        }

        return valid(
            Number(move.tx),
            Number(move.ty)
        );
    }


    updateGarbagePacks=
        function(g,dt){

            if(
                !g ||
                g.phase!=="GARBAGE"
            ){
                return baseUpdateV12b(
                    g,
                    dt
                );
            }

            const originalApply=
                hexPhysApplyEvent;

            let wallRejected=0;


            hexPhysApplyEvent=
                function(
                    board,
                    event
                ){

                    if(
                        !Array.isArray(event) ||
                        event.length===0
                    ){
                        return originalApply(
                            board,
                            event
                        );
                    }

                    let changed=false;

                    const filtered=[];

                    for(const move of event){

                        if(
                            !validMoveV12b(move)
                        ){
                            wallRejected++;
                            changed=true;
                            continue;
                        }

                        filtered.push(move);
                    }


                    return originalApply(
                        board,
                        changed
                            ? filtered
                            : event
                    );
                };


            try{

                return baseUpdateV12b(
                    g,
                    dt
                );

            }finally{

                hexPhysApplyEvent=
                    originalApply;

                if(wallRejected){

                    window.__sixBallLastGarbageLogicalWallGuardV12b={
                        wallRejected,
                        at:Date.now()
                    };
                }
            }
        };


    window.__sixBallGarbageWallGuardVersion=
        "garbage-logical-wall-guard-v1.2b";

    window.__sixBallGarbageTimingChanged=
        false;

    window.__sixBallGarbagePendingPathReservation=
        false;

})();
