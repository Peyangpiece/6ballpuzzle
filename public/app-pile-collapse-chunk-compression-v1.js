/* ============================================================
 * 6ball PILE COLLAPSE CHUNK COMPRESSION v1
 *
 * PRESENTATION/TIMING ONLY.
 *
 * Goal:
 * - accumulated pile members affected by one fresh collapse begin together
 * - the complete visual path of every affected ball is packed into one short
 *   common time window, so the pile reads as one moving mass instead of a
 *   sequence of lattice steps
 * - all affected balls finish that collapse window together
 * - no inter-segment pause is inserted
 *
 * This layer NEVER changes:
 * - logical board destinations
 * - path geometry / pivots / supports
 * - rigidity release rules
 * - split side / split ratio / split authorization
 * - garbage entry timing
 * ============================================================ */
(function(){
    if(typeof window==="undefined" || window.__sixBallPileCollapseChunkCompressionV1)return;
    if(typeof scheduleFreshPileFlow!=="function")return;

    window.__sixBallPileCollapseChunkCompressionV1=true;

    const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
    let batchSeq=1;

    function finitePoint(p){
        return Array.isArray(p) && p.length>=2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));
    }

    function physicalDistance(seg){
        if(!finitePoint(seg?.from)||!finitePoint(seg?.to))return 0.25;
        const dx=(Number(seg.to[0])-Number(seg.from[0]))*0.5;
        const dy=(Number(seg.to[1])-Number(seg.from[1]))*(Number.isFinite(Number(HEX_ROW_H))?Number(HEX_ROW_H):0.8660254038);
        let d=Math.hypot(dx,dy);
        if(seg?.pivot||seg?.topPivot)d*=1.10;
        return Math.max(0.20,d);
    }

    function previousScheduledEnd(ball,firstFreshSeg,clock){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        const idx=path.indexOf(firstFreshSeg);
        if(idx<=0)return clock;
        for(let i=idx-1;i>=0;i--){
            const prev=path[i];
            if(Number.isFinite(Number(prev?.pileFlowEnd)))return Math.max(clock,Number(prev.pileFlowEnd));
        }
        return clock;
    }

    function normalizeFreshPileCollapse(g,fresh,reason){
        if(!g || !Array.isArray(fresh) || !fresh.length)return;
        if(g.phase==="GARBAGE" || reason==="garbage_unit_timeline")return;

        const usable=fresh.filter(q=>
            q?.ball && !q.ball.isGarbage && q?.seg?.pileFlow &&
            finitePoint(q.seg.from) && finitePoint(q.seg.to)
        );
        const movingIds=new Set(usable.map(q=>q.ball.id));
        if(movingIds.size<2)return;

        const byBall=new Map();
        for(const q of usable){
            if(!byBall.has(q.ball.id))byBall.set(q.ball.id,{ball:q.ball,segments:[]});
            byBall.get(q.ball.id).segments.push(q.seg);
        }

        for(const entry of byBall.values()){
            const path=Array.isArray(entry.ball.fallPath)?entry.ball.fallPath:[];
            entry.segments.sort((a,b)=>path.indexOf(a)-path.indexOf(b));
        }

        const clock=Math.max(0,Number(g.pileFlowClock)||0);
        let commonStart=clock+1/360;
        for(const entry of byBall.values()){
            if(entry.segments.length){
                commonStart=Math.max(commonStart,previousScheduledEnd(entry.ball,entry.segments[0],clock));
            }
        }

        let maxTravel=0;
        const weightsByBall=new Map();
        for(const [id,entry] of byBall){
            const weights=entry.segments.map(physicalDistance);
            const total=weights.reduce((a,b)=>a+b,0);
            weightsByBall.set(id,{weights,total:Math.max(1e-9,total)});
            maxTravel=Math.max(maxTravel,total);
        }

        /*
         * The old scheduler could spend ~0.04-0.10 s PER segment.  The whole
         * accumulated-pile reaction now fits in roughly 0.06-0.125 s total.
         * Long paths therefore remain visible and smooth, but no longer read as
         * repeated stop/start lattice steps.
         */
        const batchDuration=Math.max(0.060,Math.min(0.125,0.055+maxTravel*0.012));
        const commonEnd=commonStart+batchDuration;
        const batchId=batchSeq++;

        for(const [id,entry] of byBall){
            const data=weightsByBall.get(id);
            let t=commonStart;
            for(let i=0;i<entry.segments.length;i++){
                const seg=entry.segments[i];
                const isLast=i===entry.segments.length-1;
                const duration=isLast
                    ?Math.max(1e-6,commonEnd-t)
                    :Math.max(1e-6,batchDuration*(data.weights[i]/data.total));

                seg.pileFlowStart=t;
                seg.pileFlowDuration=duration;
                seg.pileFlowEnd=isLast?commonEnd:t+duration;
                seg.pileFlowSimultaneous=true;
                seg.pileFlowWaveDelay=0;
                seg.pileFlowChunkCompressed=true;
                seg.pileFlowChunkBatch=batchId;

                /* Keep secondary timing fields coherent when older layers left them. */
                if(Number.isFinite(Number(seg.start)))seg.start=seg.pileFlowStart;
                if(Number.isFinite(Number(seg.duration)))seg.duration=seg.pileFlowDuration;

                t=seg.pileFlowEnd;
            }
        }

        window.__sixBallLastPileCollapseChunkCompression={
            batchId,
            balls:movingIds.size,
            segments:usable.length,
            start:commonStart,
            end:commonEnd,
            duration:batchDuration,
            reason:String(reason||"pile_flow"),
            at:Date.now()
        };
    }

    scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){
        const result=baseScheduleFreshPileFlow.apply(this,arguments);
        normalizeFreshPileCollapse(g,fresh,reason);
        return result;
    };

    window.__sixBallNormalizeFreshPileCollapseChunkV1=normalizeFreshPileCollapse;
    window.__sixBallPileCollapseChunkCompressionVersion="pile-collapse-chunk-compression-v1";
    window.__sixBallPileCollapseUsesCommonStart=true;
    window.__sixBallPileCollapseUsesCommonEnd=true;
    window.__sixBallPileCollapseMaxBatchDuration=0.125;
    window.__sixBallPileCollapseInterSegmentGap=0;
    window.__sixBallPileCollapseChangesPhysics=false;
})();
