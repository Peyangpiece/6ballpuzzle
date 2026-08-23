/* ============================================================
 * 6ball GARBAGE TEMPORAL DEFERRED GUARD v1.1
 *
 * app-garbage-temporal-safety-v2 deliberately removes absolute times while a
 * segment is deferred.  Such a segment is a WAITING physical state and must not
 * be evaluated by updateVisuals until a safe absolute interval is selected.
 *
 * v1.1 also fixes the inverse side of that rule: when temporal-safety probes a
 * parked candidate, the candidate must be evaluated AS IF it were active at the
 * exact trial start/duration.  Otherwise a parked pileFlow=false segment can be
 * falsely accepted as safe and then collide when it is released.
 *
 * No logical cells, path geometry, pivots/supports, collision destinations or
 * frozen-pile state are changed here.
 * ============================================================ */
(function installGarbageTemporalDeferredGuardV11(){
    if(typeof window==="undefined"||window.__sixBallGarbageTemporalDeferredGuardV1)return;
    if(typeof scheduleFreshPileFlowWave!=="function")return;

    window.__sixBallGarbageTemporalDeferredGuardV1=true;

    const baseSchedule=scheduleFreshPileFlowWave;
    const baseUpdate=typeof updateGarbagePacks==="function"?updateGarbagePacks:null;
    const baseWaveSafe=typeof pileFlowWaveSafe==="function"?pileFlowWaveSafe:null;
    const EPS=1e-9;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE");
    }

    function duration(seg){
        const d=Number(seg?.pileFlowDuration)||
            Number(seg?.__garbageTemporalDurationV2)||
            Number(seg?._pileNominalDuration)||
            Number(seg?.__garbageGravityDuration)||
            1/120;
        return Number.isFinite(d)&&d>EPS?d:1/120;
    }

    function explicitSchedule(seg,baseClock){
        if(!seg||seg.__garbageTemporalDeferredV2)return false;
        if(seg.__garbageTemporalSafeV2!==true)return false;

        seg.pileFlow=true;
        if(Number.isFinite(seg.pileFlowStart)&&Number.isFinite(seg.pileFlowEnd)){
            if(!Number.isFinite(seg.pileFlowDuration))seg.pileFlowDuration=Math.max(1/120,seg.pileFlowEnd-seg.pileFlowStart);
            return true;
        }

        const delay=Math.max(0,Number(seg.pileFlowWaveDelay)||0);
        const start=Math.max(0,Number(baseClock)||0)+delay;
        const d=duration(seg);
        seg.pileFlowStart=start;
        seg.pileFlowDuration=d;
        seg.pileFlowEnd=start+d;
        return true;
    }

    function normalizeSeg(seg,baseClock){
        if(!seg)return;
        if(seg.__garbageTemporalDeferredV2){
            seg.pileFlow=false;
            delete seg.pileFlowStart;
            delete seg.pileFlowDuration;
            delete seg.pileFlowEnd;
            return;
        }
        explicitSchedule(seg,baseClock);
    }

    function normalizeFresh(fresh,baseClock){
        for(const q of fresh||[])normalizeSeg(q?.seg,baseClock);
    }

    function normalizeBoard(g,baseClock){
        if(!Array.isArray(g?.board))return;
        const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!Array.isArray(ball.fallPath))continue;
            seen.add(ball);
            for(const seg of ball.fallPath)normalizeSeg(seg,baseClock);
        }
    }

    if(baseWaveSafe){
        pileFlowWaveSafe=function(g,segs,start,durationArg){
            if(!garbagePhase(g)||!Array.isArray(segs)||!segs.length){
                return baseWaveSafe(g,segs,start,durationArg);
            }

            const d=Number.isFinite(Number(durationArg))&&Number(durationArg)>EPS
                ?Number(durationArg)
                :1/120;
            const saved=[];
            for(const seg of segs){
                if(!seg)continue;
                saved.push({
                    seg,
                    pileFlow:seg.pileFlow,
                    hasStart:Object.prototype.hasOwnProperty.call(seg,"pileFlowStart"),
                    start:seg.pileFlowStart,
                    hasDuration:Object.prototype.hasOwnProperty.call(seg,"pileFlowDuration"),
                    duration:seg.pileFlowDuration,
                    hasEnd:Object.prototype.hasOwnProperty.call(seg,"pileFlowEnd"),
                    end:seg.pileFlowEnd
                });
                // Safety must sample the exact candidate trajectory being tested,
                // even when this segment is currently parked as deferred.
                seg.pileFlow=true;
                seg.pileFlowStart=start;
                seg.pileFlowDuration=d;
                seg.pileFlowEnd=start+d;
            }

            try{
                return baseWaveSafe(g,segs,start,d);
            }finally{
                for(const s of saved){
                    s.seg.pileFlow=s.pileFlow;
                    if(s.hasStart)s.seg.pileFlowStart=s.start;else delete s.seg.pileFlowStart;
                    if(s.hasDuration)s.seg.pileFlowDuration=s.duration;else delete s.seg.pileFlowDuration;
                    if(s.hasEnd)s.seg.pileFlowEnd=s.end;else delete s.seg.pileFlowEnd;
                }
            }
        };
    }

    scheduleFreshPileFlowWave=function(g,fresh){
        const baseClock=Math.max(0,Number(g?.pileFlowClock)||0);
        const result=baseSchedule(g,fresh);
        if(garbagePhase(g))normalizeFresh(fresh,baseClock);
        return result;
    };

    if(baseUpdate){
        updateGarbagePacks=function(g,dt){
            const result=baseUpdate(g,dt);
            if(garbagePhase(g)){
                // retryDeferred() in temporal-safety-v2 ran inside baseUpdate.
                // pileFlowWaveDelay is relative to this same current base clock.
                normalizeBoard(g,Math.max(0,Number(g.pileFlowClock)||0));
            }
            return result;
        };
    }

    window.__sixBallGarbageTemporalDeferredGuardVersion="garbage-temporal-deferred-guard-v1.1";
    window.__sixBallGarbageDeferredSegmentsAreInactive=true;
    window.__sixBallGarbageDeferredSafetyProbeActive=true;
})();
