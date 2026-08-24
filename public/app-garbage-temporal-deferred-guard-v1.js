/* ============================================================
 * 6ball GARBAGE TEMPORAL DEFERRED GUARD v1.3
 *
 * Deferred segments are WAITING physical states: they have no absolute start/end
 * until temporal safety finds a legal interval.  v1.2 made the safety probe
 * lag-aware.  v1.3 closes a convergence hole left by old FOLLOW_SUPPORT events.
 *
 * A FOLLOW_SUPPORT segment can be deferred while its support is moving.  If that
 * support finishes before the deferred segment ever receives an absolute time,
 * the old kinematic event is stale: retrying the same authored dependency forever
 * can never represent the current contact state.  When that exact situation is
 * proven, restore the waiting ball to the segment's authored FROM lattice cell,
 * cancel only the stale path, invalidate the garbage compile, and let ordinary
 * garbage physics replan on the next update.
 *
 * Recovery is allowed only when:
 * - the segment is still deferred and has no absolute time;
 * - it is FOLLOW_SUPPORT with at least one referenced support;
 * - every referenced support exists and is now settled (no fallPath);
 * - the ball is still visually at the authored FROM point;
 * - the FROM lattice cell is valid, empty, and non-overlapping.
 *
 * No frozen-pile ball, ordinary piece, authored support, or settled body moves.
 * ============================================================ */
(function installGarbageTemporalDeferredGuardV13(){
    if(typeof window==="undefined"||window.__sixBallGarbageTemporalDeferredGuardV1)return;
    if(typeof scheduleFreshPileFlowWave!=="function")return;

    window.__sixBallGarbageTemporalDeferredGuardV1=true;

    const baseSchedule=scheduleFreshPileFlowWave;
    const baseUpdate=typeof updateGarbagePacks==="function"?updateGarbagePacks:null;
    const baseWaveSafe=typeof pileFlowWaveSafe==="function"?pileFlowWaveSafe:null;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=typeof PILE_FLOW_MIN_DIST==="number"?PILE_FLOW_MIN_DIST:.9998;
    const SAMPLE_COUNT=typeof PILE_FLOW_COLLISION_SAMPLES==="number"?Math.max(48,PILE_FLOW_COLLISION_SAMPLES):144;
    const ALIGN_SAMPLES=32;
    const ALIGN_REFINE=20;
    const EPS=1e-9;
    const START_MATCH_DIST=.02;
    const LEGAL_DIST=.9995;

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE");}
    function duration(seg){
        const d=Number(seg?.pileFlowDuration)||Number(seg?.__garbageTemporalDurationV2)||Number(seg?._pileNominalDuration)||Number(seg?.__garbageGravityDuration)||1/120;
        return Number.isFinite(d)&&d>EPS?d:1/120;
    }
    function explicitSchedule(seg,baseClock){
        if(!seg||seg.__garbageTemporalDeferredV2||seg.__garbageTemporalSafeV2!==true)return false;
        seg.pileFlow=true;
        if(Number.isFinite(seg.pileFlowStart)&&Number.isFinite(seg.pileFlowEnd)){
            if(!Number.isFinite(seg.pileFlowDuration))seg.pileFlowDuration=Math.max(1/120,seg.pileFlowEnd-seg.pileFlowStart);
            return true;
        }
        const delay=Math.max(0,Number(seg.pileFlowWaveDelay)||0),start=Math.max(0,Number(baseClock)||0)+delay,d=duration(seg);
        seg.pileFlowStart=start;seg.pileFlowDuration=d;seg.pileFlowEnd=start+d;return true;
    }
    function normalizeSeg(seg,baseClock){
        if(!seg)return;
        if(seg.__garbageTemporalDeferredV2){seg.pileFlow=false;delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;return;}
        explicitSchedule(seg,baseClock);
    }
    function normalizeFresh(fresh,baseClock){for(const q of fresh||[])normalizeSeg(q?.seg,baseClock);}
    function normalizeBoard(g,baseClock){
        if(!Array.isArray(g?.board))return;const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball||seen.has(ball)||!Array.isArray(ball.fallPath))continue;seen.add(ball);
            for(const seg of ball.fallPath)normalizeSeg(seg,baseClock);
        }
    }
    function physicalDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*H);}
    function visPoint(g,ball){const v=g?.vis?.get?.(ball?.id);return v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?[v.x,v.y]:null;}
    function boardBalls(g){
        const out=[],seen=new Set();if(!Array.isArray(g?.board))return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;if(b&&!seen.has(b)){seen.add(b);out.push(b);}
        }
        return out;
    }
    function scheduledWindow(ball){
        let lo=Infinity,hi=-Infinity,count=0;
        for(const seg of ball?.fallPath||[]){
            if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))continue;
            lo=Math.min(lo,Number(seg.pileFlowStart));hi=Math.max(hi,Number(seg.pileFlowEnd));count++;
        }
        return count?{lo,hi}:null;
    }
    function pathPoint(g,ball,t){
        if(typeof pileFlowPositionAt!=="function")return null;
        try{const p=pileFlowPositionAt(g,ball,Math.max(0,t));return Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])?p:null;}catch(_){return null;}
    }

    function effectivePathTime(g,ball,wallClock){
        const vis=visPoint(g,ball),window=scheduledWindow(ball);if(!vis||!window)return wallClock;
        const hi=Math.min(window.hi,Math.max(window.lo,wallClock)),lo=window.lo;if(hi<lo-EPS)return wallClock;
        let bestT=lo,bestErr=Infinity,bestIndex=0;
        for(let i=0;i<=ALIGN_SAMPLES;i++){
            const t=lo+(hi-lo)*(i/ALIGN_SAMPLES),p=pathPoint(g,ball,t);if(!p)continue;
            const e=physicalDist(p,vis);if(e<bestErr){bestErr=e;bestT=t;bestIndex=i;}
        }
        let a=lo+(hi-lo)*(Math.max(0,bestIndex-1)/ALIGN_SAMPLES),b=lo+(hi-lo)*(Math.min(ALIGN_SAMPLES,bestIndex+1)/ALIGN_SAMPLES);
        for(let i=0;i<ALIGN_REFINE&&b-a>1e-8;i++){
            const t1=a+(b-a)/3,t2=b-(b-a)/3,p1=pathPoint(g,ball,t1),p2=pathPoint(g,ball,t2);
            const e1=p1?physicalDist(p1,vis):Infinity,e2=p2?physicalDist(p2,vis):Infinity;if(e1<=e2)b=t2;else a=t1;
        }
        const t=(a+b)*.5,p=pathPoint(g,ball,t),e=p?physicalDist(p,vis):Infinity;if(e<bestErr){bestErr=e;bestT=t;}
        const finalP=pathPoint(g,ball,window.hi);if(finalP&&physicalDist(finalP,vis)<=.002&&wallClock>=window.hi-EPS)return wallClock;
        return Math.min(wallClock,Math.max(lo,bestT));
    }
    function lagAwarePosition(g,ball,t,wallClock,lagCache){
        if(!scheduledWindow(ball)){const v=visPoint(g,ball);return v||pathPoint(g,ball,t);}
        let lag=lagCache.get(ball.id);if(lag===undefined){const effective=effectivePathTime(g,ball,wallClock);lag=Math.max(0,wallClock-effective);lagCache.set(ball.id,lag);}
        return pathPoint(g,ball,Math.max(0,t-lag))||visPoint(g,ball);
    }
    function lagAwareSafe(g,segs,start,d){
        if(typeof pileFlowPositionAt!=="function")return true;
        const candidateBalls=new Set(segs.map(seg=>seg?._pileFlowBall).filter(Boolean));if(!candidateBalls.size)return true;
        const others=boardBalls(g).filter(b=>!candidateBalls.has(b)),wall=Math.max(0,Number(g?.pileFlowClock)||0),lagCache=new Map();let maxLag=0;
        for(let i=0;i<=SAMPLE_COUNT;i++){
            const t=start+d*(i/SAMPLE_COUNT);
            for(const moving of candidateBalls){
                const a=pathPoint(g,moving,t);if(!a)continue;
                for(const other of others){
                    const b=lagAwarePosition(g,other,t,wall,lagCache);if(!b)continue;
                    if(physicalDist(a,b)<MIN_DIST-EPS){for(const lag of lagCache.values())maxLag=Math.max(maxLag,lag);window.__sixBallLastGarbageLagAwareSafetyV1={ok:false,start,duration:d,moving:moving.id,other:other.id,t,maxLag,at:Date.now()};return false;}
                }
            }
        }
        for(const lag of lagCache.values())maxLag=Math.max(maxLag,lag);window.__sixBallLastGarbageLagAwareSafetyV1={ok:true,start,duration:d,checkedOthers:others.length,maxLag,at:Date.now()};return true;
    }

    if(baseWaveSafe){
        pileFlowWaveSafe=function(g,segs,start,durationArg){
            if(!garbagePhase(g)||!Array.isArray(segs)||!segs.length)return baseWaveSafe(g,segs,start,durationArg);
            const d=Number.isFinite(Number(durationArg))&&Number(durationArg)>EPS?Number(durationArg):1/120,saved=[];
            for(const seg of segs){
                if(!seg)continue;
                saved.push({seg,pileFlow:seg.pileFlow,hasStart:Object.prototype.hasOwnProperty.call(seg,"pileFlowStart"),start:seg.pileFlowStart,hasDuration:Object.prototype.hasOwnProperty.call(seg,"pileFlowDuration"),duration:seg.pileFlowDuration,hasEnd:Object.prototype.hasOwnProperty.call(seg,"pileFlowEnd"),end:seg.pileFlowEnd});
                seg.pileFlow=true;seg.pileFlowStart=start;seg.pileFlowDuration=d;seg.pileFlowEnd=start+d;
            }
            try{if(!baseWaveSafe(g,segs,start,d))return false;return lagAwareSafe(g,segs,start,d);}
            finally{
                for(const s of saved){
                    s.seg.pileFlow=s.pileFlow;
                    if(s.hasStart)s.seg.pileFlowStart=s.start;else delete s.seg.pileFlowStart;
                    if(s.hasDuration)s.seg.pileFlowDuration=s.duration;else delete s.seg.pileFlowDuration;
                    if(s.hasEnd)s.seg.pileFlowEnd=s.end;else delete s.seg.pileFlowEnd;
                }
            }
        };
    }

    function supportIds(seg){
        const out=[];
        if(Array.isArray(seg?.followSupportIds))for(const id of seg.followSupportIds)if(id!==undefined&&id!==null&&id!==0&&!out.includes(id))out.push(id);
        const moving=seg?.movingSupportId;if(moving!==undefined&&moving!==null&&moving!==0&&!out.includes(moving))out.push(moving);
        return out;
    }
    function ballById(g,id){return boardBalls(g).find(b=>b.id===id)||null;}
    function findCell(g,ball){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]===ball)return{x,y};
        return null;
    }
    function startPoint(seg){
        const x=Number(seg?.from?.[0]),y=Number(seg?.from?.[1]);return Number.isInteger(x)&&Number.isInteger(y)&&valid(x,y)?{x,y}:null;
    }
    function safeAtStart(g,ball,start){
        const p=[start.x,start.y];
        for(const other of boardBalls(g)){
            if(other===ball)continue;const q=visPoint(g,other);if(q&&physicalDist(p,q)<LEGAL_DIST-EPS)return false;
        }
        return true;
    }
    function invalidateCompile(g){
        delete g.__garbageContinuousCompiledVersion;delete g.__garbageContinuousCompiled;
        delete g.__garbageTemporalSafetyV2CompiledVersion;delete g.__garbageTemporalDeferredCompiledVersion;
    }
    function recoverOrphanedDeferred(g){
        if(!garbagePhase(g)||!Array.isArray(g.board))return{recovered:0,details:[]};
        const details=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball||seen.has(ball)||!ball.isGarbage||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;seen.add(ball);
            const seg=ball.fallPath[0];
            if(!seg?.__garbageTemporalDeferredV2||Number.isFinite(seg.pileFlowStart)||Number.isFinite(seg.pileFlowEnd)||String(seg.kind)!=="FOLLOW_SUPPORT")continue;
            const ids=supportIds(seg);if(!ids.length)continue;
            const supports=ids.map(id=>ballById(g,id));if(supports.some(b=>!b)||supports.some(b=>Array.isArray(b.fallPath)&&b.fallPath.length))continue;
            const start=startPoint(seg),vis=visPoint(g,ball);if(!start||!vis||physicalDist(vis,[start.x,start.y])>START_MATCH_DIST)continue;
            const current=findCell(g,ball);if(!current)continue;
            const occupant=g.board?.[start.y]?.[start.x]||null;if(occupant&&occupant!==ball)continue;
            if(!safeAtStart(g,ball,start))continue;

            if(current.x!==start.x||current.y!==start.y){if(g.board[current.y]?.[current.x]===ball)g.board[current.y][current.x]=null;g.board[start.y][start.x]=ball;}
            ball.fallPath=[];if("activeFall" in ball)ball.activeFall=null;if("falling" in ball)ball.falling=false;
            const v=g.vis?.get?.(ball.id);if(v){v.x=start.x;v.y=start.y;if(Number.isFinite(v.vx))v.vx=0;if(Number.isFinite(v.vy))v.vy=0;if("motionSpeed" in v)v.motionSpeed=0;if("speed" in v)v.speed=0;if("pileFlow" in v)v.pileFlow=false;if("arc" in v)v.arc=null;}
            invalidateCompile(g);
            details.push({id:ball.id,kind:seg.kind,from:[start.x,start.y],oldLogical:[current.x,current.y],supports:ids});
        }
        if(details.length)window.__sixBallGarbageOrphanedDeferredRecoveries=(window.__sixBallGarbageOrphanedDeferredRecoveries||0)+details.length;
        window.__sixBallLastGarbageOrphanedDeferredRecoveryV1={recovered:details.length,details,at:Date.now()};
        return{recovered:details.length,details};
    }

    scheduleFreshPileFlowWave=function(g,fresh){const baseClock=Math.max(0,Number(g?.pileFlowClock)||0),result=baseSchedule(g,fresh);if(garbagePhase(g))normalizeFresh(fresh,baseClock);return result;};
    if(baseUpdate){
        updateGarbagePacks=function(g,dt){
            const result=baseUpdate(g,dt);
            if(garbagePhase(g)){
                normalizeBoard(g,Math.max(0,Number(g.pileFlowClock)||0));
                recoverOrphanedDeferred(g);
            }
            return result;
        };
    }

    window.__sixBallGarbageTemporalDeferredGuardVersion="garbage-temporal-deferred-guard-v1.3-orphan-replan";
    window.__sixBallGarbageDeferredSegmentsAreInactive=true;
    window.__sixBallGarbageDeferredSafetyProbeActive=true;
    window.__sixBallGarbageLagAwareSafety=true;
    window.__sixBallGarbageOrphanedDeferredReplan=true;
})();