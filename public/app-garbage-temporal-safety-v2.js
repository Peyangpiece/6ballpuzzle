/* ============================================================
 * 6ball GARBAGE TEMPORAL SAFETY v2
 *
 * Final scheduler wrapper for incoming garbage.
 *
 * The v1 temporal scheduler correctly detects unsafe swept paths, but its last
 * fallback deliberately put an impossible segment back at its earliest time.
 * That converted a detected collision into a real visual overlap.  In addition,
 * splitting a STRAIGHT wave ball-by-ball can destroy the simultaneous contact
 * geometry of FOLLOW_SUPPORT chains.
 *
 * v2 rules:
 * 1. Never publish a start time that pileFlowWaveSafe() rejected.
 * 2. First try to keep the complete logical event simultaneous.
 * 3. If the event must split, keep support-linked members in one component.
 * 4. Search existing path start/end boundaries before any dense time scan.
 * 5. An unscheduled fresh sibling is sampled at its CURRENT visual position,
 *    never at an arbitrary future fallPath.from cell.
 * 6. If no legal time exists yet, defer the component and retry it on later
 *    GARBAGE updates; the batch may not finish while a deferred component exists.
 *
 * Logical cells, segment geometry, pivots, gravity curves and the frozen pile are
 * never rewritten here.  Only absolute start times are selected.
 * ============================================================ */
(function installGarbageTemporalSafetyV2(){
    if(
        typeof window==="undefined" ||
        window.__sixBallGarbageTemporalSafetyV2
    ){
        return;
    }

    if(
        typeof scheduleFreshPileFlowWave!=="function" ||
        typeof pileFlowWaveSafe!=="function"
    ){
        return;
    }

    window.__sixBallGarbageTemporalSafetyV2=true;

    const baseSchedulerV2=scheduleFreshPileFlowWave;
    const baseUpdateGarbagePacksV2=
        typeof updateGarbagePacks==="function"
            ?updateGarbagePacks
            :null;
    const baseGarbageBatchDoneV2=
        typeof garbageBatchDone==="function"
            ?garbageBatchDone
            :null;
    const baseGarbageVisualsDoneV2=
        typeof garbageVisualsDone==="function"
            ?garbageVisualsDone
            :null;

    const SAFE_GAP=
        typeof PILE_FLOW_MIN_WAVE_GAP==="number"
            ?PILE_FLOW_MIN_WAVE_GAP
            :1/120;

    const SCHEDULE_STEP=
        typeof PILE_FLOW_SCHEDULE_STEP==="number"
            ?Math.max(1/240,PILE_FLOW_SCHEDULE_STEP)
            :1/240;

    const DENSE_STEP=Math.max(1/120,SCHEDULE_STEP);
    const EPS=1e-9;
    const MAX_DENSE_TRIES=360;
    const MAX_HORIZON_SECONDS=3.0;

    let deferredSerial=0;


    function garbagePhase(g){
        return !!(
            g &&
            g.state==="RESOLVING" &&
            g.phase==="GARBAGE"
        );
    }


    function groupedBySeq(fresh){
        const map=new Map();
        for(const q of fresh||[]){
            const seq=Number.isFinite(q?.seq)?q.seq:0;
            if(!map.has(seq))map.set(seq,[]);
            map.get(seq).push(q);
        }
        return [...map.entries()].sort((a,b)=>a[0]-b[0]);
    }


    function nominalDuration(entries){
        return Math.max(
            1/120,
            ...entries.map(q=>
                Number(q?.seg?._pileNominalDuration)||
                Number(q?.seg?.__garbageTemporalDurationV2)||
                Number(q?.seg?.pileFlowDuration)||
                1/120
            )
        );
    }


    function clearTimes(entries){
        for(const q of entries||[]){
            const seg=q?.seg;
            if(!seg)continue;
            delete seg.pileFlowStart;
            delete seg.pileFlowDuration;
            delete seg.pileFlowEnd;
        }
    }


    function ownPreviousEnd(ball,seg,base){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        const index=path.indexOf(seg);
        if(index<=0)return base;
        for(let i=index-1;i>=0;i--){
            const prev=path[i];
            if(Number.isFinite(prev?.pileFlowEnd)){
                return Math.max(base,Number(prev.pileFlowEnd));
            }
        }
        return base;
    }


    function entriesEarliest(entries,base){
        let earliest=base;
        for(const q of entries){
            earliest=Math.max(
                earliest,
                ownPreviousEnd(q.ball,q.seg,base)
            );
        }
        return earliest;
    }


    function boundaryTimes(g,earliest,exclude){
        const values=[earliest];
        const seenBalls=new Set();
        if(!Array.isArray(g?.board))return values;

        for(let y=boardScanMin(g.board);y<ROWS;y++){
            for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                if(!ball||seenBalls.has(ball)||!Array.isArray(ball.fallPath))continue;
                seenBalls.add(ball);

                for(const seg of ball.fallPath){
                    if(!seg||exclude.has(seg))continue;
                    const start=Number(seg.pileFlowStart);
                    const end=Number(seg.pileFlowEnd);

                    if(Number.isFinite(start)&&start>=earliest-EPS){
                        values.push(start,start+SAFE_GAP);
                    }
                    if(Number.isFinite(end)&&end>=earliest-EPS){
                        values.push(end,end+SAFE_GAP);
                    }
                }
            }
        }

        values.sort((a,b)=>a-b);
        const out=[];
        for(const value of values){
            if(!Number.isFinite(value)||value<earliest-EPS)continue;
            if(!out.length||Math.abs(value-out[out.length-1])>EPS){
                out.push(value);
            }
        }
        return out;
    }


    function withPendingAtCurrentVisual(allFresh,currentSegs,fn){
        const current=new Set(currentSegs);
        const hidden=[];

        for(const q of allFresh||[]){
            const seg=q?.seg;
            if(
                !seg ||
                current.has(seg) ||
                Number.isFinite(seg.pileFlowStart) ||
                seg.pileFlow!==true
            ){
                continue;
            }

            /*
             * pileFlowPositionAt() otherwise treats the first unscheduled
             * pileFlow segment as an authoritative FUTURE position.  While this
             * sibling is genuinely waiting, its current g.vis position is the
             * physical obstacle that must be sampled instead.
             */
            seg.pileFlow=false;
            hidden.push(seg);
        }

        try{
            return fn();
        }finally{
            for(const seg of hidden)seg.pileFlow=true;
        }
    }


    function safeAt(g,entries,start,duration,allFresh){
        const segs=entries.map(q=>q.seg).filter(Boolean);
        if(!segs.length)return false;

        const addedOwners=[];
        for(const q of entries){
            if(q.seg&&!q.seg._pileFlowBall){
                q.seg._pileFlowBall=q.ball;
                addedOwners.push(q.seg);
            }
        }

        let safe=false;
        try{
            safe=withPendingAtCurrentVisual(
                allFresh,
                segs,
                ()=>pileFlowWaveSafe(g,segs,start,duration)
            );
        }finally{
            for(const seg of addedOwners)delete seg._pileFlowBall;
        }
        return !!safe;
    }


    function findSafeStart(g,entries,earliest,duration,allFresh){
        const segs=new Set(entries.map(q=>q.seg).filter(Boolean));
        const boundaries=boundaryTimes(g,earliest,segs);

        for(const start of boundaries){
            if(safeAt(g,entries,start,duration,allFresh)){
                return{start,mode:"boundary"};
            }
        }

        const maxBoundary=boundaries.length
            ?boundaries[boundaries.length-1]
            :earliest;
        const horizon=Math.min(
            earliest+MAX_HORIZON_SECONDS,
            Math.max(earliest+duration+SAFE_GAP,maxBoundary+duration+SAFE_GAP)
        );

        let tries=0;
        for(
            let start=earliest+DENSE_STEP;
            start<=horizon+EPS && tries<MAX_DENSE_TRIES;
            start+=DENSE_STEP,tries++
        ){
            if(safeAt(g,entries,start,duration,allFresh)){
                return{start,mode:"dense",tries:tries+1};
            }
        }

        return null;
    }


    function supportIds(seg){
        const ids=[];
        if(Array.isArray(seg?.followSupportIds)){
            for(const id of seg.followSupportIds){
                if(id!==undefined&&id!==null&&!ids.includes(id))ids.push(id);
            }
        }
        if(
            seg?.movingSupportId!==undefined &&
            seg?.movingSupportId!==null &&
            seg.movingSupportId!==0 &&
            !ids.includes(seg.movingSupportId)
        ){
            ids.push(seg.movingSupportId);
        }
        return ids;
    }


    function supportComponents(entries){
        const n=entries.length;
        const parent=Array.from({length:n},(_,i)=>i);
        const find=i=>{
            while(parent[i]!==i){
                parent[i]=parent[parent[i]];
                i=parent[i];
            }
            return i;
        };
        const join=(a,b)=>{
            a=find(a);b=find(b);
            if(a!==b)parent[b]=a;
        };

        const byBallId=new Map();
        for(let i=0;i<n;i++){
            const id=entries[i]?.ball?.id;
            if(id!==undefined&&id!==null)byBallId.set(id,i);
        }

        for(let i=0;i<n;i++){
            for(const id of supportIds(entries[i]?.seg)){
                const j=byBallId.get(id);
                if(j!==undefined)join(i,j);
            }
        }

        const map=new Map();
        for(let i=0;i<n;i++){
            const root=find(i);
            if(!map.has(root))map.set(root,[]);
            map.get(root).push(entries[i]);
        }

        const components=[...map.values()];
        components.sort((a,b)=>{
            const ay=Math.max(...a.map(q=>Number(q?.seg?.from?.[1])||-Infinity));
            const by=Math.max(...b.map(q=>Number(q?.seg?.from?.[1])||-Infinity));
            if(Math.abs(ay-by)>EPS)return by-ay;
            const ax=Math.min(...a.map(q=>Number(q?.seg?.from?.[0])||0));
            const bx=Math.min(...b.map(q=>Number(q?.seg?.from?.[0])||0));
            return ax-bx;
        });
        return components;
    }


    function stampScheduled(entries,base,earliest,start,duration,mode){
        const delay=Math.max(0,start-earliest);
        for(const q of entries){
            const seg=q.seg;
            seg.pileFlowWaveDelay=Math.max(0,start-base);
            seg.pileFlowGarbageContinuous=true;
            seg.pileFlowTemporalSeparated=delay>EPS;
            seg.__garbageTemporalSafeV2=true;
            seg.__garbageTemporalScheduleModeV2=mode;
            seg.__garbageTemporalDurationV2=duration;
            delete seg.__garbageTemporalDeferredV2;
            delete seg.__garbageTemporalBundleV2;
        }
        return delay;
    }


    function deferComponent(entries,duration){
        const bundle=++deferredSerial;
        clearTimes(entries);
        for(const q of entries){
            const seg=q.seg;
            seg.__garbageTemporalDeferredV2=true;
            seg.__garbageTemporalBundleV2=bundle;
            seg.__garbageTemporalDurationV2=duration;
            seg.pileFlowTemporalSeparated=true;
            seg.pileFlowGarbageContinuous=true;
        }
        return bundle;
    }


    function scheduleEntries(g,entries,base,duration,allFresh){
        const earliest=entriesEarliest(entries,base);
        const found=findSafeStart(g,entries,earliest,duration,allFresh);
        if(!found){
            deferComponent(entries,duration);
            return{scheduled:false,entries,earliest};
        }

        const delay=stampScheduled(
            entries,base,earliest,found.start,duration,found.mode
        );
        return{
            scheduled:true,
            entries,
            earliest,
            start:found.start,
            delay,
            mode:found.mode
        };
    }


    scheduleFreshPileFlowWave=function(g,fresh){
        if(!fresh?.length||!garbagePhase(g)){
            return baseSchedulerV2(g,fresh);
        }

        /*
         * Let v1/continuous physics author exact nominal durations and gravity
         * metadata first.  v2 then replaces ONLY absolute times.
         */
        const result=baseSchedulerV2(g,fresh);
        const base=Math.max(0,Number(g.pileFlowClock)||0);
        const groups=groupedBySeq(fresh);

        for(const [,entries] of groups)clearTimes(entries);

        let intactEvents=0;
        let delayedIntactEvents=0;
        let splitEvents=0;
        let supportComponentsKept=0;
        let delayedSegments=0;
        let deferredSegments=0;
        let maxDelay=0;
        let denseSearches=0;

        for(const [,entries] of groups){
            if(!entries.length)continue;
            const duration=nominalDuration(entries);
            const earliest=entriesEarliest(entries,base);

            /*
             * First preference: keep the exact simultaneous logical event.
             * Unlike v1, a whole event is also allowed to move to a later SAFE
             * time before we consider splitting it.
             */
            const whole=findSafeStart(g,entries,earliest,duration,fresh);
            if(whole){
                const delay=stampScheduled(
                    entries,base,earliest,whole.start,duration,whole.mode
                );
                intactEvents++;
                if(delay>EPS){
                    delayedIntactEvents++;
                    delayedSegments+=entries.length;
                    maxDelay=Math.max(maxDelay,delay);
                }
                if(whole.mode==="dense")denseSearches++;
                continue;
            }

            splitEvents++;
            clearTimes(entries);

            /*
             * FOLLOW_SUPPORT is kinematic dependency, not optional adhesion.
             * If two members of one event are linked by that dependency they
             * must retain one common clock interval.  This is what keeps the
             * staggered STRAIGHT row tangent instead of shearing it sideways.
             */
            const components=supportComponents(entries);
            supportComponentsKept+=components.filter(c=>c.length>1).length;

            for(const component of components){
                const r=scheduleEntries(g,component,base,duration,fresh);
                if(!r.scheduled){
                    deferredSegments+=component.length;
                    continue;
                }
                if(r.delay>EPS){
                    delayedSegments+=component.length;
                    maxDelay=Math.max(maxDelay,r.delay);
                }
                if(r.mode==="dense")denseSearches++;
            }
        }

        window.__sixBallLastGarbageTemporalSafetyV2={
            segments:fresh.length,
            events:groups.length,
            intactEvents,
            delayedIntactEvents,
            splitEvents,
            supportComponentsKept,
            delayedSegments,
            deferredSegments,
            maxDelay,
            denseSearches,
            at:Date.now()
        };

        if(delayedSegments){
            window.__sixBallGarbageTemporalSafeDelayedSegmentsV2=
                (window.__sixBallGarbageTemporalSafeDelayedSegmentsV2||0)+
                delayedSegments;
        }
        if(deferredSegments){
            window.__sixBallGarbageTemporalDeferredSegmentsV2=
                (window.__sixBallGarbageTemporalDeferredSegmentsV2||0)+
                deferredSegments;
        }

        return result;
    };


    function deferredGroups(g){
        const groups=new Map();
        const seen=new Set();
        if(!Array.isArray(g?.board))return groups;

        for(let y=boardScanMin(g.board);y<ROWS;y++){
            for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                if(!ball||seen.has(ball)||!Array.isArray(ball.fallPath))continue;
                seen.add(ball);

                for(const seg of ball.fallPath){
                    if(!seg?.__garbageTemporalDeferredV2)continue;
                    const bundle=seg.__garbageTemporalBundleV2;
                    if(!groups.has(bundle))groups.set(bundle,[]);
                    groups.get(bundle).push({
                        ball,
                        seg,
                        seq:Number(seg.pileFlowOriginalSeq)||Number(seg.motionSeq)||0
                    });
                }
            }
        }
        return groups;
    }


    function hasDeferred(g){
        return deferredGroups(g).size>0;
    }


    function retryDeferred(g){
        if(!garbagePhase(g))return 0;
        const groups=deferredGroups(g);
        if(!groups.size)return 0;

        const base=Math.max(0,Number(g.pileFlowClock)||0);
        let resolved=0;

        for(const entries of groups.values()){
            const duration=nominalDuration(entries);
            const earliest=entriesEarliest(entries,base);
            const found=findSafeStart(g,entries,earliest,duration,entries);
            if(!found)continue;

            stampScheduled(
                entries,base,earliest,found.start,duration,
                "deferred_"+found.mode
            );
            resolved+=entries.length;
        }

        if(resolved){
            window.__sixBallGarbageTemporalDeferredResolutionsV2=
                (window.__sixBallGarbageTemporalDeferredResolutionsV2||0)+
                resolved;
            window.__sixBallLastGarbageTemporalDeferredRetryV2={
                resolved,
                remaining:deferredGroups(g).size,
                at:Date.now()
            };
        }
        return resolved;
    }


    if(baseUpdateGarbagePacksV2){
        updateGarbagePacks=function(g,dt){
            const result=baseUpdateGarbagePacksV2(g,dt);
            if(garbagePhase(g))retryDeferred(g);
            return result;
        };
    }


    if(baseGarbageBatchDoneV2){
        garbageBatchDone=function(g){
            if(garbagePhase(g)&&hasDeferred(g))return false;
            return baseGarbageBatchDoneV2(g);
        };
    }


    if(baseGarbageVisualsDoneV2){
        garbageVisualsDone=function(g){
            if(garbagePhase(g)&&hasDeferred(g))return false;
            return baseGarbageVisualsDoneV2(g);
        };
    }


    window.__sixBallGarbageTemporalSafetyVersion=
        "garbage-temporal-safety-v2.0";
    window.__sixBallGarbageTemporalUnsafeFallback=false;
    window.__sixBallGarbageSupportComponentsKeepTiming=true;

})();
