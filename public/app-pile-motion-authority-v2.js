/* ============================================================
 * 6ball PILE MOTION AUTHORITY v2
 *
 * SINGLE timing authority for accumulated-pile playback.
 *
 * Replaces the overlapping timing responsibilities previously split among:
 * - simultaneous-collapse-v1
 * - collapse-timing-authoritative-v2 timing/fast-playback sections
 * - pile-collapse-chunk-compression-v1
 * - pile-motion-deadline-v1
 *
 * Guarantees:
 * - one common collapse epoch for currently scheduled pile motion
 * - no artificial inter-segment pause
 * - whole compiled epoch finishes in <= 3.75 s
 * - no board destination, pivot, support, collision, rigidity or split change
 * - garbage spawn cadence is untouched
 * ============================================================ */
(function(){
    if(typeof window==="undefined" || window.__sixBallPileMotionAuthorityV2)return;
    window.__sixBallPileMotionAuthorityV2=true;

    const HARD_DEADLINE=3.75;
    const TIME_SCALE=0.30;
    const MIN_EPOCH=0.18;
    const MIN_SEGMENT=1/240;
    const EPS=1e-9;

    function finite(v){return Number.isFinite(Number(v));}

    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        const minY=typeof boardScanMin==="function"?boardScanMin(g.board):0;
        const seen=new Set();

        for(let y=minY;y<ROWS;y++)for(let x=0;x<W2;x++){
            if(typeof valid==="function"&&!valid(x,y))continue;
            const ball=g.board[y]?.[x];
            if(!ball||typeof ball!=="object"||seen.has(ball))continue;
            seen.add(ball);
            const path=Array.isArray(ball.fallPath)?ball.fallPath:null;
            if(!path?.length)continue;
            const scheduled=path.filter(seg=>
                seg&&seg.pileFlow&&finite(seg.pileFlowStart)&&finite(seg.pileFlowEnd)
            );
            if(scheduled.length)out.push({ball,scheduled});
        }
        return out;
    }

    function segmentWeight(seg){
        if(finite(seg?.pileFlowDuration)){
            const d=Math.max(0,Number(seg.pileFlowDuration));
            if(d>EPS)return d;
        }
        const a=Array.isArray(seg?.from)?seg.from:null;
        const b=Array.isArray(seg?.to)?seg.to:null;
        if(a&&b&&finite(a[0])&&finite(a[1])&&finite(b[0])&&finite(b[1])){
            const dx=(Number(b[0])-Number(a[0]))*0.5;
            const dy=(Number(b[1])-Number(a[1]))*(typeof HEX_ROW_H==="number"?HEX_ROW_H:0.8660254038);
            let d=Math.hypot(dx,dy);
            if(seg.pivot||seg.topPivot)d*=1.10;
            if(d>EPS)return d;
        }
        return 1;
    }

    function batchToken(entries){
        return entries.map(({ball,scheduled})=>{
            const first=scheduled[0],last=scheduled[scheduled.length-1];
            return [
                ball.id,
                scheduled.length,
                first?.from?.join?.(",")||"",
                first?.to?.join?.(",")||"",
                last?.to?.join?.(",")||""
            ].join(":");
        }).sort().join("|");
    }

    function synchronizeLegacyTiming(seg){
        if("start" in seg&&finite(seg.pileFlowStart))seg.start=seg.pileFlowStart;
        if("duration" in seg&&finite(seg.pileFlowDuration))seg.duration=seg.pileFlowDuration;
    }

    function normalize(g,source="pile_motion"){
        const entries=boardEntries(g);
        if(!entries.length)return false;

        const clock=Math.max(0,Number(g.pileFlowClock)||0);
        const token=batchToken(entries);

        if(
            g.__pileMotionAuthorityToken===token&&
            Math.abs((Number(g.__pileMotionAuthorityClock)||0)-clock)<1e-8
        )return false;

        let originalStart=Infinity;
        let originalEnd=-Infinity;
        for(const {scheduled} of entries)for(const seg of scheduled){
            originalStart=Math.min(originalStart,Number(seg.pileFlowStart));
            originalEnd=Math.max(originalEnd,Number(seg.pileFlowEnd));
        }
        if(!finite(originalStart)||!finite(originalEnd))return false;

        const originalSpan=Math.max(1/120,originalEnd-originalStart);
        const epoch=Math.min(HARD_DEADLINE,Math.max(MIN_EPOCH,originalSpan*TIME_SCALE));
        const commonStart=clock+1/240;
        const commonEnd=commonStart+epoch;

        let segments=0;
        for(const {scheduled} of entries){
            const weights=scheduled.map(segmentWeight);
            const total=Math.max(EPS,weights.reduce((a,b)=>a+b,0));
            let cursor=commonStart;

            for(let i=0;i<scheduled.length;i++){
                const seg=scheduled[i];
                const last=i===scheduled.length-1;
                let duration=last
                    ?commonEnd-cursor
                    :epoch*(weights[i]/total);
                duration=Math.max(MIN_SEGMENT,duration);

                /* If minimum segment frames would overflow, the final segment
                   closes exactly at the common deadline. */
                if(last)duration=Math.max(MIN_SEGMENT,commonEnd-cursor);

                seg.pileFlowStart=cursor;
                seg.pileFlowDuration=duration;
                seg.pileFlowEnd=last?commonEnd:Math.min(commonEnd,cursor+duration);
                seg.pileFlowWaveDelay=0;
                seg.pileFlowGlobalEpoch=true;
                seg.pileFlowDeadline=commonEnd;
                seg.pileFlowAuthorityV2=true;
                synchronizeLegacyTiming(seg);

                cursor=seg.pileFlowEnd;
                segments++;
            }
        }

        g.__pileMotionAuthorityToken=token;
        g.__pileMotionAuthorityClock=clock;
        g.__pileMotionAuthorityEnd=commonEnd;

        window.__sixBallLastPileMotionAuthorityV2={
            source,
            balls:entries.length,
            segments,
            originalSpan,
            compressedSpan:epoch,
            start:commonStart,
            end:commonEnd,
            hardDeadline:HARD_DEADLINE,
            at:Date.now()
        };
        window.__sixBallPileMotionAuthorityCount=(window.__sixBallPileMotionAuthorityCount||0)+1;
        return true;
    }

    function engineFromArgs(args){
        return args.find(a=>a&&typeof a==="object"&&a.board&&a.vis)||null;
    }

    function wrap(name){
        if(typeof window[name]!=="function")return;
        const base=window[name];
        window[name]=function(...args){
            const out=base.apply(this,args);
            const g=engineFromArgs(args);
            if(g)normalize(g,name);
            return out;
        };
    }

    /* One outer authority over every production pile scheduling entry point. */
    wrap("markPileFlowPaths");
    wrap("scheduleFreshPileFlow");
    wrap("scheduleFreshPileFlowWave");
    wrap("scheduleFreshPileFlowPerBall");

    window.__sixBallPileMotionAuthorityVersion="pile-motion-authority-v2";
    window.__sixBallPileMotionHardDeadlineSeconds=HARD_DEADLINE;
    window.__sixBallPileMotionTimeScale=TIME_SCALE;
    window.__sixBallPileMotionGlobalEpoch=true;
    window.__sixBallPileMotionSegmentGap=0;
    window.__sixBallPileMotionChangesPhysics=false;

    /* Compatibility probes for existing regression scripts. These are aliases,
       not legacy executable layers. */
    window.__sixBallPileMotionDeadlineV1=true;
    window.__sixBallPileMotionDeadlineVersion="pile-motion-authority-v2";
    window.__sixBallCollapseStartsSimultaneously=true;
    window.__sixBallStagedPileWaves=false;
    window.__sixBallUnrelatedPileWait=false;
})();
