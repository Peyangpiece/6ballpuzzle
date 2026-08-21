/* ============================================================
 * 6ball SIMULTANEOUS PILE COLLAPSE v1
 *
 * Removes staged/wave-like post-clear pile movement.
 *
 * Rules:
 *
 * - if support disappears, all affected upper balls begin
 *   falling in the same collapse interval
 *
 * - unrelated balls never wait for another ball's whole
 *   lattice transition to finish
 *
 * - each individual ball's own multi-segment path remains
 *   sequential and continuous
 *
 * - initial large-clear vertical phase remains vertical only
 *
 * - arc motion remains forbidden until vertical phase ends
 *
 * - garbage entry keeps the previous scheduler
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        typeof scheduleFreshPileFlowWave!=="function" ||
        window.__sixBallSimultaneousCollapseV1
    ){
        return;
    }

    window.__sixBallSimultaneousCollapseV1=true;


    const oldScheduler=
        scheduleFreshPileFlowWave;


    function isPostClearCollapse(g,fresh){

        if(!g || !Array.isArray(fresh))
            return false;


        /*
         * Do not change garbage entry timing.
         */
        if(g.phase==="GARBAGE")
            return false;


        if(
            g.board?.__postClearTwoStage ||
            g.board?.__postClearChunkMode
        ){
            return true;
        }


        /*
         * CLEAR support release may call the scheduler before
         * the stage flags become visible to the next frame.
         */
        if(g.phase==="CLEAR")
            return true;


        return false;
    }


    function previousOwnSegmentEnd(
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


        /*
         * Only this SAME ball's previous path may delay it.
         *
         * Other balls never introduce wave delay.
         */
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


    function groupBySeq(fresh){

        const map=
            new Map();


        for(const q of fresh){

            const seq=
                Number.isFinite(q.seq)
                    ?q.seq
                    :0;


            if(!map.has(seq))
                map.set(seq,[]);


            map.get(seq).push(q);
        }


        return[
            ...map.entries()
        ].sort(
            (a,b)=>a[0]-b[0]
        );
    }


    scheduleFreshPileFlowWave=
        function(g,fresh){

            if(
                !fresh?.length
            ){
                return;
            }


            if(
                !isPostClearCollapse(
                    g,
                    fresh
                )
            ){

                return oldScheduler(
                    g,
                    fresh
                );
            }


            /*
             * Calculate the same physical durations as before.
             *
             * We are changing START TIMES only.
             */
            preparePileFlowDurations(
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
                groupBySeq(fresh);


            let simultaneousStarts=0;


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
                 * Members belonging to one physical event keep
                 * one duration so a rigid falling chunk keeps
                 * its relative shape.
                 */
                const duration=
                    Math.max(
                        1/120,
                        ...segs.map(
                            seg=>
                                seg
                                ?._pileNominalDuration
                                ||1/120
                        )
                    );


                /*
                 * IMPORTANT:
                 *
                 * Previous implementation:
                 *
                 * previous wave start
                 *      +
                 * 1/120 second
                 *
                 * AND
                 *
                 * max(end time of unrelated balls)
                 *
                 * Both are removed.
                 *
                 * A new event starts immediately unless a BALL
                 * ITSELF is still travelling through its own
                 * previous segment.
                 */
                let start=
                    base;


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
                            previousOwnSegmentEnd(
                                ball,
                                seg,
                                base
                            )
                        );
                }


                /*
                 * All members of this event begin together.
                 */
                for(const seg of segs){

                    seg.pileFlowStart=
                        start;

                    seg.pileFlowDuration=
                        duration;

                    seg.pileFlowEnd=
                        start+
                        duration;

                    seg.pileFlowSimultaneous=
                        true;

                    seg.pileFlowWaveDelay=
                        0;
                }


                if(
                    Math.abs(
                        start-base
                    )<1e-8
                ){
                    simultaneousStarts++;
                }
            }


            /*
             * Support followers are intentionally allowed to
             * begin in the SAME interval as their moving lower
             * support.
             *
             * pileFlowPointForBall() already evaluates the
             * actual moving support position continuously.
             */


            window.__sixBallLastSimultaneousCollapse={
                fresh:
                    fresh.length,

                events:
                    groups.length,

                immediateEvents:
                    simultaneousStarts,

                baseStart:
                    base,

                at:
                    Date.now()
            };


            window.__sixBallSimultaneousCollapseCount=
                (
                    window
                    .__sixBallSimultaneousCollapseCount||
                    0
                )+1;
        };


    window.__sixBallSimultaneousCollapseVersion=
        "simultaneous-collapse-v1";

    window.__sixBallStagedPileWaves=
        false;

    window.__sixBallUnrelatedPileWait=
        false;

})();
