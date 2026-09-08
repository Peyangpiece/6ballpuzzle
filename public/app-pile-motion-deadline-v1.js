/* ============================================================
 * 6ball PILE MOTION DEADLINE v1
 *
 * FINAL VISUAL-TIMING AUTHORITY FOR ACCUMULATED PILE MOTION.
 *
 * User-visible goal:
 * - post-technique / post-clear pile reactions move as one event
 * - garbage-related pile reactions do not become step-by-step waves
 * - every already-compiled pile-motion epoch finishes within 4 seconds
 *
 * NON-GOALS / HARD GUARANTEES:
 * - logical board physics is not changed
 * - rigidity release definitions are not changed
 * - split direction / split ratio are not changed
 * - fallPath geometry (from/to/pivot/support metadata) is not changed
 * - garbage spawn cadence is not changed
 *
 * This layer runs AFTER every existing pile scheduler and only rewrites
 * pileFlowStart / pileFlowDuration / pileFlowEnd.
 * ============================================================ */
(function(){
    if(typeof window==="undefined" || window.__sixBallPileMotionDeadlineV1)return;
    window.__sixBallPileMotionDeadlineV1=true;

    const HARD_DEADLINE=3.75;          // always below the requested 4 seconds
    const TIME_SCALE=0.30;             // aggressively shorten long staged epochs
    const MIN_EPOCH=0.18;              // still render enough frames to look continuous
    const MAX_SEGMENT_GAP=0;           // no visual pause between segments of one ball
    const EPS=1e-9;

    function finite(v){return Number.isFinite(Number(v));}

    function boardBalls(g){
        const out=[];
        if(!g?.board)return out;
        const minY=typeof boardScanMin==="function"?boardScanMin(g.board):0;
        for(let y=minY;y<ROWS;y++)for(let x=0;x<W2;x++){
            if(typeof valid==="function"&&!valid(x,y))continue;
            const ball=g.board[y]?.[x];
            if(!ball||typeof ball!=="object")continue;
            const path=Array.isArray(ball.fallPath)?ball.fallPath:null;
            if(!path?.length)continue;
            const scheduled=path.filter(seg=>
                seg&&seg.pileFlow&&finite(seg.pileFlowStart)&&finite(seg.pileFlowEnd)
            );
            if(scheduled.length)out.push({ball,path,scheduled});
        }
        return out;
    }

    function segmentWeight(seg){
        const d=finite(seg?.pileFlowDuration)?Math.max(0,Number(seg.pileFlowDuration)):0;
        if(d>EPS)return d;
        const a=Array.isArray(seg?.from)?seg.from:null;
        const b=Array.isArray(seg?.to)?seg.to:null;
        if(a&&b){
            const dx=(Number(b[0])-Number(a[0]))*.5;
            const dy=(Number(b[1])-Number(a[1]))*(typeof HEX_ROW_H==="number"?HEX_ROW_H:0.8660254);
            const dist=Math.hypot(dx,dy);
            if(dist>EPS)return dist;
        }
        return 1;
    }

    function tokenFor(entries){
        return entries.map(({ball,scheduled})=>{
            const first=scheduled[0],last=scheduled[scheduled.length-1];
            return [
                ball.id,
                scheduled.length,
                first?.from?.join?.(",")||"",
                last?.to?.join?.(",")||""
            ].join(":");
        }).sort().join("|");
    }

    function compress(g,source="pile_motion"){
        const entries=boardBalls(g);
        if(!entries.length)return false;

        const clock=Math.max(0,Number(g.pileFlowClock)||0);
        const token=tokenFor(entries);

        // A scheduler can be wrapped several times in one call chain.
        // Only normalize an unchanged compiled batch once per clock value.
        if(
            g.__pileDeadlineToken===token &&
            Math.abs((Number(g.__pileDeadlineClock)||0)-clock)<1e-8
        )return false;

        let originalStart=Infinity;
        let originalEnd=-Infinity;
        for(const {scheduled} of entries)for(const seg of scheduled){
            originalStart=Math.min(originalStart,Number(seg.pileFlowStart));
            originalEnd=Math.max(originalEnd,Number(seg.pileFlowEnd));
        }
        if(!finite(originalStart)||!finite(originalEnd))return false;

        const originalSpan=Math.max(1/120,originalEnd-originalStart);

        // One common epoch for every currently moving accumulated-pile member.
        // The 30% scale removes the "one step, then next step" feel; the hard
        // cap guarantees completion in under four seconds even for huge chains.
        const epoch=Math.min(
            HARD_DEADLINE,
            Math.max(MIN_EPOCH,originalSpan*TIME_SCALE)
        );

        const commonStart=clock+1/240;
        const commonEnd=commonStart+epoch;

        let segmentCount=0;
        for(const {scheduled} of entries){
            const weights=scheduled.map(segmentWeight);
            const total=Math.max(EPS,weights.reduce((a,b)=>a+b,0));
            let cursor=commonStart;

            for(let i=0;i<scheduled.length;i++){
                const seg=scheduled[i];
                const isLast=i===scheduled.length-1;
                const duration=isLast
                    ?Math.max(1/240,commonEnd-cursor)
                    :Math.max(1/240,epoch*(weights[i]/total));

                seg.pileFlowStart=cursor;
                seg.pileFlowDuration=duration;
                seg.pileFlowEnd=isLast?commonEnd:(cursor+duration);
                seg.pileFlowWaveDelay=0;
                seg.pileFlowGlobalEpoch=true;
                seg.pileFlowDeadline=commonEnd;

                cursor=seg.pileFlowEnd+MAX_SEGMENT_GAP;
                segmentCount++;
            }
        }

        g.__pileDeadlineToken=token;
        g.__pileDeadlineClock=clock;
        g.__pileDeadlineEnd=commonEnd;

        window.__sixBallLastPileMotionDeadline={
            source,
            balls:entries.length,
            segments:segmentCount,
            originalSpan,
            compressedSpan:epoch,
            start:commonStart,
            end:commonEnd,
            hardDeadline:HARD_DEADLINE,
            at:Date.now()
        };
        window.__sixBallPileMotionDeadlineCount=(window.__sixBallPileMotionDeadlineCount||0)+1;
        return true;
    }

    // markPileFlowPaths is the common entry point after clear/technique collapse
    // and after compiled garbage gravity. Normalize AFTER all earlier authority
    // layers have produced the final physical path.
    if(typeof markPileFlowPaths==="function"){
        const base=markPileFlowPaths;
        markPileFlowPaths=function(...args){
            const out=base.apply(this,args);
            const g=args.find(a=>a&&typeof a==="object"&&a.board&&a.vis);
            if(g)compress(g,String(args[1]||"markPileFlowPaths"));
            return out;
        };
    }

    // Some code paths invoke the wave scheduler directly. This late wrapper
    // makes the 4-second rule authoritative there as well.
    if(typeof scheduleFreshPileFlowWave==="function"){
        const base=scheduleFreshPileFlowWave;
        scheduleFreshPileFlowWave=function(...args){
            const out=base.apply(this,args);
            const g=args[0];
            if(g?.board&&g?.vis)compress(g,"scheduleFreshPileFlowWave");
            return out;
        };
    }

    if(typeof scheduleFreshPileFlowPerBall==="function"){
        const base=scheduleFreshPileFlowPerBall;
        scheduleFreshPileFlowPerBall=function(...args){
            const out=base.apply(this,args);
            const g=args[0];
            if(g?.board&&g?.vis)compress(g,"scheduleFreshPileFlowPerBall");
            return out;
        };
    }

    window.__sixBallPileMotionDeadlineVersion="pile-motion-deadline-v1";
    window.__sixBallPileMotionHardDeadlineSeconds=HARD_DEADLINE;
    window.__sixBallPileMotionTimeScale=TIME_SCALE;
    window.__sixBallPileMotionGlobalEpoch=true;
    window.__sixBallPileMotionSegmentGap=MAX_SEGMENT_GAP;
    window.__sixBallPileMotionChangesPhysics=false;
})();
