/* ============================================================
 * 6ball GARBAGE TEMPORAL DEFERRED GUARD v1
 *
 * app-garbage-temporal-safety-v2 can deliberately defer a segment by removing
 * its absolute pileFlow start/end times.  An unscheduled segment is a WAITING
 * physical state and must never be evaluated as an active trajectory: doing so
 * feeds undefined timing into updateVisuals and can produce NaN positions.
 *
 * This compatibility guard makes that state explicit:
 * - deferred + no legal time  -> pileFlow=false (park at current visual point)
 * - temporal-safe scheduled   -> pileFlow=true with explicit finite start/end
 *
 * It does not change logical cells, path geometry, pivots, supports, durations,
 * collision decisions, or the frozen pile.  It only makes the v2 scheduler's
 * already-authored wait/release decision executable by the visual runtime.
 * ============================================================ */
(function installGarbageTemporalDeferredGuardV1(){
    if(typeof window==="undefined"||window.__sixBallGarbageTemporalDeferredGuardV1)return;
    if(typeof scheduleFreshPileFlowWave!=="function")return;

    window.__sixBallGarbageTemporalDeferredGuardV1=true;

    const baseSchedule=scheduleFreshPileFlowWave;
    const baseUpdate=typeof updateGarbagePacks==="function"?updateGarbagePacks:null;
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
            // A deferred segment has no authored absolute time yet.  It is a
            // parked future trajectory, not an active pileFlow segment.
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
                // retryDeferred() in temporal-safety-v2 runs inside baseUpdate.
                // Its release clock is the current pileFlowClock on return.
                normalizeBoard(g,Math.max(0,Number(g.pileFlowClock)||0));
            }
            return result;
        };
    }

    window.__sixBallGarbageTemporalDeferredGuardVersion="garbage-temporal-deferred-guard-v1";
    window.__sixBallGarbageDeferredSegmentsAreInactive=true;
})();
