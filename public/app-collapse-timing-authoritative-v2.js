/* ============================================================
 * 6ball COLLAPSE TIMING AUTHORITATIVE v2
 *
 * PURPOSE
 *
 * When support disappears under an accumulated pile:
 *
 * - all newly unsupported affected balls start together
 * - no bottom-to-top visual wave
 * - each ball's own path remains sequential
 * - vertical collapse is faster
 * - contact/arc movement remains slightly slower than free fall
 * - no adhesive/tangency constraint is introduced
 *
 * LOGICAL BOARD PHYSICS IS NOT MODIFIED.
 * Only fresh pile-flow timing is normalized.
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallCollapseTimingAuthoritativeV2
    ){
        return;
    }

    window.__sixBallCollapseTimingAuthoritativeV2 = true;


    function engineFromArgs(args){

        for(const a of args){

            if(
                a &&
                typeof a === "object" &&
                a.board &&
                a.vis &&
                Number.isFinite(
                    Number(a.pileFlowClock)
                )
            ){
                return a;
            }
        }

        return null;
    }


    function boardBalls(g){

        const out = [];

        if(!g?.board)
            return out;


        const minY =
            typeof boardScanMin === "function"
                ? boardScanMin(g.board)
                : 0;


        for(let y=minY; y<ROWS; y++){

            for(let x=0; x<W2; x++){

                if(
                    typeof valid === "function" &&
                    !valid(x,y)
                ){
                    continue;
                }


                const ball =
                    g.board[y]?.[x];


                if(
                    !ball ||
                    typeof ball !== "object" ||
                    ball.isGarbage
                ){
                    continue;
                }


                if(
                    !Array.isArray(ball.fallPath) ||
                    !ball.fallPath.length
                ){
                    continue;
                }


                out.push({
                    ball,
                    x,
                    y,
                    path:ball.fallPath
                });
            }
        }


        return out;
    }


    function point(v){

        return(
            Array.isArray(v) &&
            v.length >= 2 &&
            Number.isFinite(Number(v[0])) &&
            Number.isFinite(Number(v[1]))
        )
            ? [Number(v[0]),Number(v[1])]
            : null;
    }


    function verticalSegment(seg){

        const a = point(seg?.from);
        const b = point(seg?.to);

        if(!a || !b)
            return false;


        return(
            Math.abs(b[0]-a[0]) < 1e-7 &&
            Math.abs(b[1]-a[1]) > 1e-7
        );
    }


    function batchToken(entries){

        return entries
            .map(({ball,path})=>{

                const first =
                    path[0] || {};

                const last =
                    path[path.length-1] || {};


                return [
                    ball.id,
                    path.length,
                    JSON.stringify(first.from||null),
                    JSON.stringify(first.to||null),
                    JSON.stringify(last.to||null)
                ].join(":");
            })
            .sort()
            .join("|");
    }


    function normalizeFreshCollapse(g){

        if(!g?.board)
            return;


        const entries =
            boardBalls(g);


        if(entries.length < 2)
            return;


        const token =
            batchToken(entries);


        const clock =
            Number(g.pileFlowClock) || 0;


        /*
         * scheduleFreshPileFlowWave() can internally call
         * scheduleFreshPileFlowPerBall().
         *
         * Do not accelerate the same fresh batch twice.
         */
        if(
            g.__collapseTimingV2Token === token &&
            Math.abs(
                Number(g.__collapseTimingV2Clock||0) -
                clock
            ) < 1e-5
        ){
            return;
        }


        g.__collapseTimingV2Token =
            token;

        g.__collapseTimingV2Clock =
            clock;


        /*
         * All affected members begin on effectively the same
         * physics frame.
         */
        const commonStart =
            clock + 1/240;


        let changedBalls = 0;
        let changedSegments = 0;


        for(const entry of entries){

            const path =
                entry.path;


            const original =
                path.map(seg=>({

                    start:
                        Number.isFinite(Number(seg.start))
                            ? Number(seg.start)
                            : null,

                    duration:
                        Number.isFinite(Number(seg.duration))
                            ? Math.max(
                                0.001,
                                Number(seg.duration)
                            )
                            : null
                }));


            /*
             * Only paths with real scheduler timing are touched.
             */
            if(
                !original.some(
                    q =>
                        q.start !== null ||
                        q.duration !== null
                )
            ){
                continue;
            }


            let nextStart =
                commonStart;


            for(let i=0; i<path.length; i++){

                const seg =
                    path[i];

                const old =
                    original[i];


                /*
                 * Remove bottom-to-top waiting.
                 *
                 * First segment of every affected ball starts
                 * simultaneously.
                 *
                 * Later segments of the same ball remain
                 * sequential.
                 */
                seg.start =
                    nextStart;


                let duration =
                    old.duration;


                if(duration === null){

                    duration =
                        verticalSegment(seg)
                            ? 0.075
                            : 0.105;
                }


                /*
                 * Faster vertical collapse:
                 * approximately 1.6x current speed.
                 *
                 * Contact / arc:
                 * approximately 1.2x.
                 */
                const factor =
                    verticalSegment(seg)
                        ? 0.62
                        : 0.82;


                duration *=
                    factor;


                /*
                 * Keep enough time for smooth 120Hz rendering.
                 */
                const minimum =
                    verticalSegment(seg)
                        ? 0.042
                        : 0.058;


                duration =
                    Math.max(
                        minimum,
                        duration
                    );


                seg.duration =
                    duration;


                /*
                 * Original scheduler sometimes leaves a pause
                 * before the next segment.
                 *
                 * Preserve only a tiny amount so the path remains
                 * continuous rather than staged.
                 */
                let oldGap = 0;


                if(
                    i+1 < original.length &&
                    old.start !== null &&
                    old.duration !== null &&
                    original[i+1].start !== null
                ){

                    oldGap =
                        Math.max(
                            0,
                            original[i+1].start -
                            (
                                old.start +
                                old.duration
                            )
                        );
                }


                const newGap =
                    Math.min(
                        0.008,
                        oldGap * 0.12
                    );


                nextStart =
                    seg.start +
                    seg.duration +
                    newGap;


                changedSegments++;
            }


            /*
             * Preserve downward velocity through path boundaries.
             * Do not reset it just because the scheduler split
             * one physical fall into several segments.
             */
            const v =
                g.vis?.get?.(
                    entry.ball.id
                );


            if(v){

                if(
                    Number.isFinite(
                        Number(v.motionSpeed)
                    )
                ){

                    v.motionSpeed =
                        Math.max(
                            Number(v.motionSpeed),
                            4.25
                        );
                }


                if(
                    Number.isFinite(
                        Number(v.vy)
                    )
                ){

                    v.vy =
                        Math.max(
                            Number(v.vy),
                            4.25
                        );
                }
            }


            changedBalls++;
        }


        if(changedBalls){

            window.__sixBallLastCollapseTimingV2 = {

                balls:
                    changedBalls,

                segments:
                    changedSegments,

                commonStart,

                clock,

                at:
                    Date.now()
            };
        }
    }


    /*
     * Wrap every known fresh-pile scheduler.
     *
     * Existing code still determines:
     * - which balls move
     * - where they move
     * - split decisions
     * - pivots / arcs
     *
     * v2 only normalizes WHEN those paths play.
     */

    if(
        typeof scheduleFreshPileFlowPerBall ===
            "function"
    ){

        const base =
            scheduleFreshPileFlowPerBall;


        scheduleFreshPileFlowPerBall =
            function(...args){

                const result =
                    base.apply(
                        this,
                        args
                    );


                const g =
                    engineFromArgs(args);


                if(g)
                    normalizeFreshCollapse(g);


                return result;
            };
    }


    if(
        typeof scheduleFreshPileFlowWave ===
            "function"
    ){

        const base =
            scheduleFreshPileFlowWave;


        scheduleFreshPileFlowWave =
            function(...args){

                const result =
                    base.apply(
                        this,
                        args
                    );


                const g =
                    engineFromArgs(args);


                if(g)
                    normalizeFreshCollapse(g);


                return result;
            };
    }


    if(
        typeof markPileFlowPaths ===
            "function"
    ){

        const base =
            markPileFlowPaths;


        markPileFlowPaths =
            function(...args){

                const result =
                    base.apply(
                        this,
                        args
                    );


                const g =
                    engineFromArgs(args);


                if(g)
                    normalizeFreshCollapse(g);


                return result;
            };
    }


    window.__sixBallCollapseTimingVersion =
        "collapse-timing-authoritative-v2";

    window.__sixBallCollapseStartsSimultaneously =
        true;

    window.__sixBallCollapseVerticalSpeedFactor =
        0.62;

    window.__sixBallCollapseArcSpeedFactor =
        0.82;

    window.__sixBallCollapseMaximumSegmentGap =
        0.008;

    window.__sixBallCollapseAddsAdhesion =
        false;

})();


/*
 * ============================================================
 * COLLAPSE VERTICAL PATH MERGE v2.1
 *
 * VISUAL PATH ONLY.
 *
 * When support inside/below a settled pile disappears:
 *
 * - consecutive pure downward free-fall segments of the SAME
 *   ball are merged into one continuous visual fall
 * - all affected balls keep their simultaneous start
 * - no pause is inserted between consecutive segments
 * - real pivot / arc / contact / split transitions remain
 *   separate
 *
 * Logical board positions, collision resolution, gravity,
 * rigidity and split decisions are NOT changed here.
 * ============================================================
 */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallCollapseVerticalMergeV21
    ){
        return;
    }

    window.__sixBallCollapseVerticalMergeV21 = true;

    const processedPaths = new WeakSet();


    function num(v){
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }


    function point(seg, side){

        if(!seg || typeof seg !== "object"){
            return null;
        }

        const q = seg[side];

        if(Array.isArray(q) && q.length >= 2){
            const x = num(q[0]);
            const y = num(q[1]);

            if(x !== null && y !== null){
                return {x,y};
            }
        }

        if(q && typeof q === "object"){
            const x = num(q.x);
            const y = num(q.y);

            if(x !== null && y !== null){
                return {x,y};
            }
        }

        if(side === "from"){

            const x =
                num(seg.x) ??
                num(seg.fromX);

            const y =
                num(seg.y) ??
                num(seg.fromY);

            if(x !== null && y !== null){
                return {x,y};
            }

        }else{

            const x =
                num(seg.tx) ??
                num(seg.toX);

            const y =
                num(seg.ty) ??
                num(seg.toY);

            if(x !== null && y !== null){
                return {x,y};
            }
        }

        return null;
    }


    function writeEnd(seg, end){

        if(!seg || !end){
            return;
        }

        if(Array.isArray(seg.to)){

            seg.to =
                seg.to.slice();

            seg.to[0] = end.x;
            seg.to[1] = end.y;

        }else if(
            seg.to &&
            typeof seg.to === "object"
        ){

            seg.to = {
                ...seg.to,
                x:end.x,
                y:end.y
            };
        }


        if(
            Number.isFinite(
                Number(seg.tx)
            )
        ){
            seg.tx = end.x;
        }

        if(
            Number.isFinite(
                Number(seg.ty)
            )
        ){
            seg.ty = end.y;
        }

        if(
            Number.isFinite(
                Number(seg.toX)
            )
        ){
            seg.toX = end.x;
        }

        if(
            Number.isFinite(
                Number(seg.toY)
            )
        ){
            seg.toY = end.y;
        }
    }


    function hasRealPivot(seg){

        if(!seg){
            return false;
        }

        if(
            seg.pivot ||
            seg.topPivot ||
            seg.virtualPivot ||
            seg.movingSupportId
        ){
            return true;
        }

        if(
            Array.isArray(seg.followSupportIds) &&
            seg.followSupportIds.length
        ){
            return true;
        }

        return false;
    }


    function pureVertical(seg){

        if(
            !seg ||
            hasRealPivot(seg)
        ){
            return false;
        }

        const kind =
            String(
                seg.kind ??
                seg.type ??
                ""
            ).toUpperCase();


        /*
         * Never flatten genuine contact geometry.
         */
        if(
            /ROLL|ARC|PIVOT|SLIDE|SPLIT|CONTACT/.test(
                kind
            )
        ){
            return false;
        }


        const a = point(seg,"from");
        const b = point(seg,"to");

        if(!a || !b){
            return false;
        }

        return(
            Math.abs(a.x-b.x) < 1e-7 &&
            b.y > a.y
        );
    }


    function contiguous(a,b){

        const ae = point(a,"to");
        const bs = point(b,"from");

        if(!ae || !bs){
            return false;
        }

        return(
            Math.abs(ae.x-bs.x) < 1e-7 &&
            Math.abs(ae.y-bs.y) < 1e-7
        );
    }


    function durationOf(seg){

        const d =
            num(seg?.duration);

        if(d !== null && d > 0){
            return d;
        }

        const pd =
            num(seg?.pileFlowDuration);

        if(pd !== null && pd > 0){
            return pd;
        }

        return 0;
    }


    function compressPath(path){

        if(
            !Array.isArray(path) ||
            path.length < 2 ||
            processedPaths.has(path)
        ){
            return {
                before:
                    Array.isArray(path)
                    ? path.length
                    : 0,

                after:
                    Array.isArray(path)
                    ? path.length
                    : 0,

                merged:0
            };
        }

        processedPaths.add(path);

        const before = path.length;
        const out = [];

        let i = 0;
        let merged = 0;

        while(i < path.length){

            const first = path[i];

            if(!pureVertical(first)){

                out.push(first);
                i++;
                continue;
            }


            let j = i;
            let totalDuration =
                durationOf(first);

            while(
                j + 1 < path.length &&
                pureVertical(path[j+1]) &&
                contiguous(
                    path[j],
                    path[j+1]
                )
            ){
                j++;
                totalDuration +=
                    durationOf(path[j]);
            }


            if(j === i){

                out.push(first);
                i++;
                continue;
            }


            const last = path[j];

            const combined = {
                ...first
            };

            const end =
                point(last,"to");

            writeEnd(
                combined,
                end
            );


            /*
             * One uninterrupted fall is intentionally shorter
             * than replaying every lattice segment separately.
             *
             * Existing v2 timing has already accelerated each
             * segment. 0.78 removes the repeated-boundary cost
             * without creating a visual teleport.
             */
            const mergedDuration =
                Math.max(
                    0.050,
                    totalDuration * 0.78
                );

            combined.duration =
                mergedDuration;

            if(
                "pileFlowDuration" in combined
            ){
                combined.pileFlowDuration =
                    mergedDuration;
            }


            combined
                ._verticalMergedV21 =
                j - i + 1;

            out.push(combined);

            merged +=
                j - i;

            i = j + 1;
        }


        /*
         * Rebuild playback timing with ZERO artificial gap.
         * Real geometry changes are still separate segments,
         * but they begin immediately when the preceding segment
         * ends.
         */
        if(out.length){

            let cursor =
                num(out[0].start);

            if(cursor === null){
                cursor =
                    num(
                        out[0].pileFlowStart
                    );
            }

            if(cursor !== null){

                for(const seg of out){

                    const d =
                        durationOf(seg);

                    seg.start =
                        cursor;

                    /*
                     * Scheduled pile rendering is authoritative on
                     * pileFlowStart / pileFlowDuration / pileFlowEnd.
                     * Rewriting only the legacy start field leaves the
                     * old end time attached to the new compacted start.
                     * With several balls moving together that makes one
                     * trajectory outlive another, lets contact separation
                     * permute their visual identities, and SETTLE then waits
                     * forever for visuals that can no longer reach their
                     * logical cells.
                     *
                     * Keep the three absolute-time fields atomic whenever
                     * this is a scheduled pile-flow segment.
                     */
                    if(
                        seg.pileFlow ||
                        "pileFlowStart" in seg ||
                        "pileFlowDuration" in seg ||
                        "pileFlowEnd" in seg
                    ){
                        seg.pileFlowStart =
                            cursor;

                        seg.pileFlowDuration =
                            d;

                        seg.pileFlowEnd =
                            cursor + d;
                    }

                    cursor += d;
                }
            }
        }


        path.splice(
            0,
            path.length,
            ...out
        );


        return {
            before,
            after:path.length,
            merged
        };
    }


    function compressEngine(g){

        if(
            !g ||
            !Array.isArray(g.board)
        ){
            return null;
        }

        let balls = 0;
        let mergedSegments = 0;
        let beforeSegments = 0;
        let afterSegments = 0;

        const seen = new Set();

        for(
            let y=0;
            y<g.board.length;
            y++
        ){

            const row = g.board[y];

            if(!Array.isArray(row)){
                continue;
            }

            for(
                let x=0;
                x<row.length;
                x++
            ){

                const ball = row[x];

                if(
                    !ball ||
                    typeof ball !== "object" ||
                    seen.has(ball.id) ||
                    !Array.isArray(ball.fallPath)
                ){
                    continue;
                }

                seen.add(ball.id);

                const r =
                    compressPath(
                        ball.fallPath
                    );

                if(r.merged > 0){
                    balls++;
                    mergedSegments += r.merged;
                    beforeSegments += r.before;
                    afterSegments += r.after;
                }
            }
        }


        if(mergedSegments){

            window.__sixBallLastCollapseVerticalMergeV21 = {
                balls,
                mergedSegments,
                beforeSegments,
                afterSegments,
                at:Date.now()
            };
        }

        return {
            balls,
            mergedSegments,
            beforeSegments,
            afterSegments
        };
    }


    function engineFromArgs(args){

        for(const q of args){

            if(
                q &&
                typeof q === "object" &&
                Array.isArray(q.board)
            ){
                return q;
            }
        }

        return null;
    }


    /*
     * markPileFlowPaths is the normal point where the complete
     * visual trajectory exists but has not yet been displayed.
     */
    if(
        typeof markPileFlowPaths ===
        "function"
    ){

        const baseMarkPileFlowPathsV21 =
            markPileFlowPaths;

        markPileFlowPaths =
            function(...args){

                const result =
                    baseMarkPileFlowPathsV21
                    .apply(
                        this,
                        args
                    );

                const g =
                    engineFromArgs(args);

                if(g){
                    compressEngine(g);
                }

                return result;
            };
    }


    /*
     * Keep scheduler wrappers as a safety net for paths created
     * by alternate post-clear routes.
     */
    if(
        typeof scheduleFreshPileFlowWave ===
        "function"
    ){

        const baseWaveV21 =
            scheduleFreshPileFlowWave;

        scheduleFreshPileFlowWave =
            function(...args){

                const result =
                    baseWaveV21.apply(
                        this,
                        args
                    );

                const g =
                    engineFromArgs(args);

                if(g){
                    compressEngine(g);
                }

                return result;
            };
    }


    if(
        typeof scheduleFreshPileFlowPerBall ===
        "function"
    ){

        const basePerBallV21 =
            scheduleFreshPileFlowPerBall;

        scheduleFreshPileFlowPerBall =
            function(...args){

                const result =
                    basePerBallV21.apply(
                        this,
                        args
                    );

                const g =
                    engineFromArgs(args);

                if(g){
                    compressEngine(g);
                }

                return result;
            };
    }


    window.__sixBallCollapseTimingVersion =
        "collapse-timing-authoritative-v2.1";

    window.__sixBallCollapseVerticalSegmentsMerged =
        true;

    window.__sixBallCollapseArtificialSegmentGap =
        0;

    window.__sixBallCollapseLogicalPhysicsChanged =
        false;

})();





/*
 * ============================================================
 * POST CLEAR PILE ONLY FAST PLAYBACK v2.2p
 *
 * Applies ONLY to:
 *
 *   normal-ball clear
 *       -> unsupported settled pile collapses
 *
 * NEVER applies to:
 *
 *   GARBAGE phase
 *   active falling piece
 *   garbage spawn/fall animation
 *
 * Logical physics is unchanged.
 * ============================================================
 */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallPostClearPileFastV22p
    ){
        return;
    }

    window.__sixBallPostClearPileFastV22p=true;


    const GAP=0.002;

    const VERTICAL_CAP=0.045;
    const OTHER_CAP=0.065;

    const VERTICAL_MIN=0.027;
    const OTHER_MIN=0.040;


    function isPostClearPileV22p(g){

        if(!g){
            return false;
        }


        /*
         * ABSOLUTE EXCLUSION:
         * garbage animation must remain unchanged.
         */
        if(
            String(
                g.phase||""
            ).toUpperCase()==="GARBAGE"
        ){
            return false;
        }


        /*
         * Active gameplay falling piece is also excluded.
         *
         * Pile collapse after a clear occurs in RESOLVING.
         */
        if(
            String(
                g.state||""
            ).toUpperCase()!=="RESOLVING"
        ){
            return false;
        }


        return true;
    }


    function point(seg,to){

        if(!seg){
            return null;
        }

        const obj=
            seg[
                to
                    ? "to"
                    : "from"
            ];

        if(
            obj &&
            Number.isFinite(Number(obj.x)) &&
            Number.isFinite(Number(obj.y))
        ){
            return {
                x:Number(obj.x),
                y:Number(obj.y)
            };
        }


        const x=
            to
                ? (
                    seg.tx ??
                    seg.toX ??
                    seg.x2
                )
                : (
                    seg.x ??
                    seg.sx ??
                    seg.fromX
                );

        const y=
            to
                ? (
                    seg.ty ??
                    seg.toY ??
                    seg.y2
                )
                : (
                    seg.y ??
                    seg.sy ??
                    seg.fromY
                );


        if(
            !Number.isFinite(Number(x)) ||
            !Number.isFinite(Number(y))
        ){
            return null;
        }


        return {
            x:Number(x),
            y:Number(y)
        };
    }


    function vertical(seg){

        const a=point(
            seg,
            false
        );

        const b=point(
            seg,
            true
        );

        if(!a || !b){
            return false;
        }


        const kind=
            String(
                seg.kind ??
                seg.type ??
                ""
            ).toUpperCase();


        if(
            /ARC|ROLL|PIVOT|SLIDE|SPLIT/.test(
                kind
            )
        ){
            return false;
        }


        return (
            Math.abs(
                a.x-b.x
            )<1e-9 &&
            b.y>a.y
        );
    }


    function compactPath(path){

        if(
            !Array.isArray(path) ||
            path.length<1
        ){
            return 0;
        }


        let changed=0;
        let cursor=null;


        for(const seg of path){

            if(
                !seg ||
                typeof seg!=="object"
            ){
                continue;
            }


            const isVertical=
                vertical(seg);


            const oldDuration=
                Number.isFinite(
                    Number(seg.duration)
                )
                    ? Number(seg.duration)
                    : (
                        isVertical
                            ? 0.075
                            : 0.105
                    );


            const duration=
                Math.max(
                    isVertical
                        ? VERTICAL_MIN
                        : OTHER_MIN,

                    Math.min(
                        isVertical
                            ? VERTICAL_CAP
                            : OTHER_CAP,

                        oldDuration*(
                            isVertical
                                ? 0.68
                                : 0.78
                        )
                    )
                );


            if(
                Math.abs(
                    oldDuration-duration
                )>1e-6
            ){
                seg.duration=
                    duration;

                changed++;
            }


            const start=
                Number(seg.start);


            if(cursor!==null){

                const latest=
                    cursor+GAP;


                if(
                    Number.isFinite(start) &&
                    start>latest
                ){
                    seg.start=
                        latest;

                    changed++;
                }
            }


            const actualStart=
                Number.isFinite(
                    Number(seg.start)
                )
                    ? Number(seg.start)
                    : 0;


            cursor=
                actualStart+
                duration;
        }


        return changed;
    }


    function compactPileV22p(g){

        if(
            !isPostClearPileV22p(g) ||
            !Array.isArray(g.board)
        ){
            return 0;
        }


        const seen=
            new Set();

        let balls=0;
        let changed=0;


        for(const row of g.board){

            if(!Array.isArray(row)){
                continue;
            }


            for(const ball of row){

                if(
                    !ball ||
                    typeof ball!=="object" ||
                    seen.has(ball)
                ){
                    continue;
                }

                seen.add(ball);


                /*
                 * Garbage balls are explicitly excluded even
                 * if they happen to exist on the board while a
                 * normal clear resolves.
                 */
                if(ball.isGarbage){
                    continue;
                }


                if(
                    !Array.isArray(
                        ball.fallPath
                    ) ||
                    ball.fallPath.length===0
                ){
                    continue;
                }


                const n=
                    compactPath(
                        ball.fallPath
                    );


                if(n){
                    balls++;
                    changed+=n;
                }
            }
        }


        if(changed){

            window.__sixBallLastPostClearPileFastV22p={
                balls,
                changed,
                at:Date.now()
            };
        }


        return changed;
    }


    function wrap(name){

        const fn=
            window[name];

        if(
            typeof fn!=="function"
        ){
            return;
        }


        window[name]=
            function(g,...args){

                const r=
                    fn(
                        g,
                        ...args
                    );


                /*
                 * Timing compression AFTER logical physics.
                 */
                compactPileV22p(g);


                return r;
            };
    }


    wrap(
        "markPileFlowPaths"
    );

    wrap(
        "scheduleFreshPileFlowWave"
    );

    wrap(
        "scheduleFreshPileFlowPerBall"
    );

    wrap(
        "prepareContinuousPileFlow"
    );


    window.__sixBallCollapseTimingVersion=
        "collapse-timing-v2.2p-post-clear-pile-only";

    window.__sixBallPostClearPileMaximumGap=
        GAP;

    window.__sixBallGarbageCollapseTimingUntouched=
        true;

    window.__sixBallActivePieceTimingUntouched=
        true;

    window.__sixBallCollapseLogicalPhysicsChanged=
        false;

})();
