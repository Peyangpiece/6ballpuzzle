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


/* ============================================================
 * 6ball GARBAGE TEMPORAL TRAJECTORY SCHEDULER v1
 *
 * The continuous garbage layer intentionally removes global lattice-wave waits,
 * but that also removed app-07's sampled path-safety gate. Two logically legal
 * neighbouring segments can therefore be tangent on the lattice while a real
 * pivot/FOLLOW_SUPPORT arc cuts inside that tangent and creates visual overlap.
 *
 * Restore only the missing temporal collision rule:
 * - keep a whole logical event simultaneous when its authored trajectories are safe
 * - if the event is unsafe, keep every non-conflicting member simultaneous
 * - delay only the conflicting member to the first safe already-authored end time
 * - lower garbage has priority, so an upper ball never pushes through a lower one
 * - never alter logical cells, pivots, durations, gravity curves or settled pile
 * ============================================================ */
(function installGarbageTemporalTrajectorySchedulerV1(){

    if(
        typeof window==="undefined" ||
        window.__sixBallGarbageTemporalTrajectorySchedulerV1
    ){
        return;
    }

    if(
        typeof scheduleFreshPileFlowWave!=="function" ||
        typeof pileFlowWaveSafe!=="function"
    ){
        return;
    }

    window.__sixBallGarbageTemporalTrajectorySchedulerV1=true;

    const baseSchedulerTemporalV1=
        scheduleFreshPileFlowWave;

    const SAFE_GAP=
        typeof PILE_FLOW_MIN_WAVE_GAP==="number"
            ?PILE_FLOW_MIN_WAVE_GAP
            :1/120;

    const EPS_TIME=1e-9;


    function garbagePhase(g){
        return !!(
            g &&
            g.state==="RESOLVING" &&
            g.phase==="GARBAGE"
        );
    }


    function ownPreviousEnd(ball,seg,base){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        const index=path.indexOf(seg);
        if(index<=0)return base;
        for(let i=index-1;i>=0;i--){
            const prev=path[i];
            if(Number.isFinite(prev?.pileFlowEnd)){
                return Math.max(base,prev.pileFlowEnd);
            }
        }
        return base;
    }


    function groupedBySeq(fresh){
        const map=new Map();
        for(const q of fresh){
            const seq=Number.isFinite(q?.seq)?q.seq:0;
            if(!map.has(seq))map.set(seq,[]);
            map.get(seq).push(q);
        }
        return [...map.entries()].sort((a,b)=>a[0]-b[0]);
    }


    function groupDuration(entries){
        return Math.max(
            1/120,
            ...entries.map(q=>Number(q?.seg?._pileNominalDuration)||1/120)
        );
    }


    function clearSchedule(entries){
        for(const {seg} of entries){
            if(!seg)continue;
            delete seg.pileFlowStart;
            delete seg.pileFlowDuration;
            delete seg.pileFlowEnd;
        }
    }


    function scheduledEndCandidates(g,earliest,excludeSeg){
        const ends=[];
        const seen=new Set();
        if(!Array.isArray(g?.board))return ends;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!Array.isArray(ball.fallPath))continue;
            seen.add(ball);
            for(const seg of ball.fallPath){
                if(seg===excludeSeg)continue;
                const end=Number(seg?.pileFlowEnd);
                if(!Number.isFinite(end)||end<earliest-EPS_TIME)continue;
                ends.push(end);
            }
        }
        ends.sort((a,b)=>a-b);
        const unique=[];
        for(const end of ends){
            if(!unique.length||Math.abs(end-unique[unique.length-1])>EPS_TIME){
                unique.push(end);
            }
        }
        return unique;
    }


    function lowerFirst(entries){
        return entries.slice().sort((a,b)=>{
            const ay=Number(a?.seg?.from?.[1]);
            const by=Number(b?.seg?.from?.[1]);
            if(Number.isFinite(ay)&&Number.isFinite(by)&&Math.abs(ay-by)>EPS_TIME){
                return by-ay;
            }
            const aty=Number(a?.seg?.to?.[1]);
            const bty=Number(b?.seg?.to?.[1]);
            if(Number.isFinite(aty)&&Number.isFinite(bty)&&Math.abs(aty-bty)>EPS_TIME){
                return bty-aty;
            }
            const ax=Number(a?.seg?.from?.[0]);
            const bx=Number(b?.seg?.from?.[0]);
            if(Number.isFinite(ax)&&Number.isFinite(bx)&&Math.abs(ax-bx)>EPS_TIME){
                return ax-bx;
            }
            return Number(a?.ball?.id||0)-Number(b?.ball?.id||0);
        });
    }


    function scheduleSingleSafely(g,entry,earliest,duration){
        const {seg}=entry;
        const candidates=[earliest];
        for(const end of scheduledEndCandidates(g,earliest,seg)){
            candidates.push(end);
            candidates.push(end+SAFE_GAP);
        }

        let last=earliest;
        for(const start of candidates){
            if(start<earliest-EPS_TIME)continue;
            if(start<last-EPS_TIME)continue;
            last=start;
            if(pileFlowWaveSafe(g,[seg],start,duration)){
                return start;
            }
        }

        const fallback=Math.max(
            earliest,
            ...scheduledEndCandidates(g,earliest,seg),
            earliest
        )+SAFE_GAP;

        if(pileFlowWaveSafe(g,[seg],fallback,duration)){
            return fallback;
        }

        // The remaining impossible case is a genuinely impossible final corridor,
        // not a temporal crossing. Keep the canonical segment rather than inventing
        // a new trajectory; the final non-penetration layer remains authoritative.
        seg.pileFlowStart=earliest;
        seg.pileFlowDuration=duration;
        seg.pileFlowEnd=earliest+duration;
        return earliest;
    }


    scheduleFreshPileFlowWave=function(g,fresh){

        if(!fresh?.length){
            return baseSchedulerTemporalV1(g,fresh);
        }

        if(!garbagePhase(g)){
            return baseSchedulerTemporalV1(g,fresh);
        }

        // First let the continuous layer author its exact durations, gravity
        // metadata and canonical segment flags. We only replace absolute starts.
        const result=baseSchedulerTemporalV1(g,fresh);

        const base=Math.max(0,Number(g.pileFlowClock)||0);
        const groups=groupedBySeq(fresh);

        // Remove only this fresh batch's absolute times. Existing older paths stay
        // scheduled and therefore participate as moving obstacles in safety tests.
        for(const [,entries] of groups)clearSchedule(entries);

        let intactEvents=0;
        let splitEvents=0;
        let delayedSegments=0;
        let maxDelay=0;

        for(const [,entries] of groups){
            const segs=entries.map(q=>q.seg).filter(Boolean);
            if(!segs.length)continue;

            const duration=groupDuration(entries);
            let earliest=base;
            for(const {ball,seg} of entries){
                earliest=Math.max(earliest,ownPreviousEnd(ball,seg,base));
            }

            // Preserve full simultaneous motion whenever the real sampled paths
            // are safe. This is the normal case and adds no visual delay.
            if(pileFlowWaveSafe(g,segs,earliest,duration)){
                for(const seg of segs){
                    seg.pileFlowWaveDelay=Math.max(0,earliest-base);
                    seg.pileFlowGarbageContinuous=true;
                    seg.pileFlowTemporalSeparated=false;
                }
                intactEvents++;
                continue;
            }

            splitEvents++;

            // pileFlowWaveSafe deletes the failed tentative schedule. Give the
            // physically lower members first access to the same event time, then
            // schedule only colliding neighbours behind an existing path end.
            clearSchedule(entries);

            for(const entry of lowerFirst(entries)){
                const seg=entry.seg;
                const ownEarliest=ownPreviousEnd(entry.ball,seg,base);
                const start=scheduleSingleSafely(g,entry,ownEarliest,duration);
                const delay=Math.max(0,start-ownEarliest);
                seg.pileFlowWaveDelay=Math.max(0,start-base);
                seg.pileFlowGarbageContinuous=true;
                seg.pileFlowTemporalSeparated=delay>EPS_TIME;
                if(delay>EPS_TIME){
                    delayedSegments++;
                    maxDelay=Math.max(maxDelay,delay);
                }
            }
        }

        window.__sixBallLastGarbageTemporalScheduleV1={
            segments:fresh.length,
            events:groups.length,
            intactEvents,
            splitEvents,
            delayedSegments,
            maxDelay,
            at:Date.now()
        };

        window.__sixBallGarbageTemporalSeparatedSegments=
            (window.__sixBallGarbageTemporalSeparatedSegments||0)+delayedSegments;

        return result;
    };

    window.__sixBallGarbageTemporalTrajectoryVersion=
        "garbage-temporal-trajectory-v1";

})();
