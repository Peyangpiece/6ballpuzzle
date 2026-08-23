/* ============================================================
 * 6ball GARBAGE PHASE AUTHORITATIVE v1
 *
 * Final GARBAGE invariants, installed after every global physics/performance
 * layer:
 *
 * 1. Balls already accumulated when GARBAGE began are immutable supports.
 * 2. Current-batch garbage with no fallPath rests exactly on its logical cell.
 * 3. A live incoming garbage ball may never visually penetrate the fixed pile.
 * 4. Two live incoming garbage balls may never visually interpenetrate, even
 *    when their continuous solver-authored trajectories cross in one frame.
 * 5. Generic contact correction may not pull a live garbage centre away from
 *    its analytic fallPath in Y. Garbage contact separation is horizontal-only
 *    after the authoritative path position for the frame has been evaluated.
 * 6. The continuous garbage scheduler remains authoritative. This final layer
 *    never inserts an internal wait between two segments of a ball trajectory.
 * 7. A scheduled segment has one clock interval only:
 *       pileFlowEnd === pileFlowStart + pileFlowDuration
 * 8. The complete live garbage contact network is solved as one ordered set of
 *    horizontal constraints. Pair-by-pair correction loops are not allowed to
 *    undo each other in dense packs.
 *
 * Logical destinations, pivots, segment starts and segment durations are not
 * rewritten here. Only impossible stale end metadata and per-frame visual
 * contact positions are repaired.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageFreezeAuthoritativeV1)return;
    if(typeof hexPhysContactEntries!=="function"||typeof hexPhysResolveEvent!=="function"||typeof settlePass!=="function")return;

    window.__sixBallGarbageFreezeAuthoritativeV1=true;

    const baseContactEntries=hexPhysContactEntries;
    const baseResolveEvent=hexPhysResolveEvent;
    const baseSettlePass=settlePass;
    const baseBoardHasIllegalFloat=typeof boardHasIllegalFloat==="function"?boardHasIllegalFloat:null;
    const baseResolveVisualContacts=typeof resolveVisualContacts==="function"?resolveVisualContacts:null;
    const baseMarkPileFlowPaths=typeof markPileFlowPaths==="function"?markPileFlowPaths:null;
    const baseScheduleFreshPileFlowWave=typeof scheduleFreshPileFlowWave==="function"?scheduleFreshPileFlowWave:null;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const EPS=1e-9;
    const SAFE_EPS=1e-3;

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set){for(const id of cached)out.add(id);return out;}
        if(!Array.isArray(board))return out;
        for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?board[y][x]:null;
            if(ball?.garbagePhaseFrozen)out.add(ball.id);
        }
        return out;
    }

    function frozenBalls(board,ids){
        const out=[];
        if(!Array.isArray(board)||!ids.size)return out;
        for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?board[y][x]:null;
            if(ball&&ids.has(ball.id))out.push(ball);
        }
        return out;
    }

    function withFrozenHeld(board,fn){
        const ids=frozenIds(board);
        if(!ids.size)return{ids,value:fn()};
        const held=[];
        for(const ball of frozenBalls(board,ids)){
            held.push([ball,Object.prototype.hasOwnProperty.call(ball,"garbageBubbleHold"),ball.garbageBubbleHold]);
            ball.garbageBubbleHold=true;
        }
        try{return{ids,value:fn()};}
        finally{
            for(const[ball,had,value]of held){
                if(had)ball.garbageBubbleHold=value;
                else delete ball.garbageBubbleHold;
            }
        }
    }

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&g.board);}
    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}

    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const v=ball&&g.vis?.get?.(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function normalizeGarbageSegmentEnds(g){
        if(!garbagePhase(g))return 0;
        let fixed=0;
        for(const q of boardEntries(g)){
            const ball=q.ball;
            if(!ball?.isGarbage||!Array.isArray(ball.fallPath))continue;
            for(const seg of ball.fallPath){
                if(!seg)continue;
                const start=Number(seg.pileFlowStart);
                const duration=Number(seg.pileFlowDuration);
                if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<0)continue;
                const exactEnd=start+duration;
                const oldEnd=Number(seg.pileFlowEnd);
                if(!Number.isFinite(oldEnd)||Math.abs(oldEnd-exactEnd)>1e-9){
                    seg.pileFlowEnd=exactEnd;
                    fixed++;
                }
            }
        }
        if(fixed){
            window.__sixBallGarbageSegmentEndRepairs=(window.__sixBallGarbageSegmentEndRepairs||0)+fixed;
            window.__sixBallLastGarbageSegmentEndRepair={fixed,at:Date.now()};
        }
        return fixed;
    }

    function liveGarbageEntries(g){
        if(!garbagePhase(g))return[];
        const frozen=frozenIds(g.board);
        return boardEntries(g).filter(q=>q.ball.isGarbage&&!frozen.has(q.ball.id)&&!q.ball.garbagePhaseFrozen&&hasLivePath(q.ball));
    }

    function captureLiveFreePositions(g){
        const out=new Map();
        for(const q of liveGarbageEntries(g)){
            out.set(q.ball.id,{x:q.v.x,y:q.v.y,vy:q.v.vy,motionSpeed:q.v.motionSpeed,pileFlow:q.v.pileFlow});
        }
        return out;
    }

    function restoreLiveFreePositions(g,snapshot){
        if(!(snapshot instanceof Map)||!snapshot.size)return 0;
        let restored=0;
        for(const q of liveGarbageEntries(g)){
            const s=snapshot.get(q.ball.id);
            if(!s)continue;
            if(Math.abs(q.v.x-s.x)>EPS||Math.abs(q.v.y-s.y)>EPS)restored++;
            q.v.x=s.x;q.v.y=s.y;q.v.vy=s.vy;q.v.motionSpeed=s.motionSpeed;q.v.pileFlow=s.pileFlow;
        }
        if(restored)window.__sixBallGarbageGenericContactRestores=(window.__sixBallGarbageGenericContactRestores||0)+restored;
        return restored;
    }

    function normalizeReceivingGarbage(g){
        if(!garbagePhase(g))return 0;
        const frozen=frozenIds(g.board);
        let fixed=0;
        for(const q of boardEntries(g)){
            const{ball,v,x,y}=q;
            if(!ball.isGarbage||frozen.has(ball.id)||ball.garbagePhaseFrozen||hasLivePath(ball))continue;
            if(Math.abs(v.x-x)>EPS||Math.abs(v.y-y)>EPS||Math.abs(v.vy||0)>EPS||Math.abs(v.motionSpeed||0)>EPS)fixed++;
            v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;v.pileFlow=false;
            delete v.gravityMismatch;delete v._pendingPathComplete;
            if(g._visualMovingIds instanceof Set)g._visualMovingIds.delete(ball.id);
        }
        if(fixed)window.__sixBallGarbageReceivingFinalizations=(window.__sixBallGarbageReceivingFinalizations||0)+fixed;
        return fixed;
    }

    function physicalDistance(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);}

    function laneCompare(a,b){
        if(a.x!==b.x)return a.x-b.x;
        const as=Number(a.ball.garbageSourceSeq),bs=Number(b.ball.garbageSourceSeq);
        if(Number.isFinite(as)&&Number.isFinite(bs)&&as!==bs)return as-bs;
        const ar=Number(a.ball.garbageSourceRole),br=Number(b.ball.garbageSourceRole);
        if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return ar-br;
        if(a.y!==b.y)return a.y-b.y;
        return a.ball.id-b.ball.id;
    }

    function requiredLatticeX(a,b){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)return 0;
        return 2*(Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy))+SAFE_EPS);
    }

    function sideForFixed(live,support){
        const dx=live.v.x-support.v.x;
        if(dx<-EPS)return-1;
        if(dx>EPS)return 1;
        const logical=live.x-support.x;
        if(logical)return Math.sign(logical);
        return(live.ball.id&1)?1:-1;
    }

    function fixedBounds(live,fixed){
        let lo=0,hi=W2-1;
        for(const support of fixed){
            if(!support||support.ball.id===live.ball.id)continue;
            const dy=(live.v.y-support.v.y)*H;
            if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)continue;
            const radial=2*(Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy))+SAFE_EPS);
            const left=support.v.x-radial;
            const right=support.v.x+radial;
            if(sideForFixed(live,support)<0)hi=Math.min(hi,left);
            else lo=Math.max(lo,right);
        }
        lo=Math.max(0,lo);hi=Math.min(W2-1,hi);
        return{lo,hi,ok:lo<=hi+1e-8};
    }

    function fallbackFixedOnly(live,fixed){
        let changed=0;
        for(const q of live){
            const b=fixedBounds(q,fixed);
            if(!b.ok)continue;
            const nx=Math.max(b.lo,Math.min(b.hi,q.v.x));
            if(Math.abs(nx-q.v.x)>EPS){q.v.x=nx;changed++;}
        }
        return changed;
    }

    function solveGarbageContactNetwork(g){
        if(!garbagePhase(g))return 0;
        const frozen=frozenIds(g.board);
        const entries=boardEntries(g);
        const fixed=entries.filter(q=>frozen.has(q.ball.id)||q.ball.garbagePhaseFrozen||(q.ball.isGarbage&&!hasLivePath(q.ball)));
        const live=entries
            .filter(q=>q.ball.isGarbage&&!frozen.has(q.ball.id)&&!q.ball.garbagePhaseFrozen&&hasLivePath(q.ball))
            .sort(laneCompare);

        if(!live.length)return 0;
        const bounds=live.map(q=>fixedBounds(q,fixed));
        if(bounds.some(b=>!b.ok)){
            const fallback=fallbackFixedOnly(live,fixed);
            window.__sixBallLastGarbageConstraintSolve={ok:false,reason:"fixed_bounds",fallback,at:Date.now()};
            return fallback;
        }

        const n=live.length;
        const req=Array.from({length:n},()=>Array(n).fill(0));
        for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)req[i][j]=requiredLatticeX(live[i],live[j]);

        // Minimal feasible ordered solution. This cannot cycle because every
        // constraint points from an earlier logical lane to a later one.
        const x=bounds.map(b=>b.lo);
        let feasible=true;
        for(let j=0;j<n;j++){
            let need=bounds[j].lo;
            for(let i=0;i<j;i++)if(req[i][j]>0)need=Math.max(need,x[i]+req[i][j]);
            x[j]=need;
            if(x[j]>bounds[j].hi+1e-7){feasible=false;break;}
        }

        if(!feasible){
            const fallback=fallbackFixedOnly(live,fixed);
            window.__sixBallLastGarbageConstraintSolve={ok:false,reason:"ordered_infeasible",fallback,at:Date.now()};
            return fallback;
        }

        // Starting from the guaranteed-feasible leftmost solution, move each
        // lane back toward its analytic X as far as later-lane constraints allow.
        for(let i=n-1;i>=0;i--){
            let maxAllowed=bounds[i].hi;
            for(let j=i+1;j<n;j++)if(req[i][j]>0)maxAllowed=Math.min(maxAllowed,x[j]-req[i][j]);
            const target=Math.max(bounds[i].lo,Math.min(maxAllowed,live[i].v.x));
            if(target>x[i])x[i]=target;
        }

        let changed=0;
        let maxShift=0;
        for(let i=0;i<n;i++){
            const shift=Math.abs(x[i]-live[i].v.x);
            if(shift>EPS){live[i].v.x=x[i];changed++;maxShift=Math.max(maxShift,shift);}
        }

        window.__sixBallLastGarbageConstraintSolve={ok:true,live:n,fixed:fixed.length,changed,maxShift,at:Date.now()};
        if(changed)window.__sixBallGarbageConstraintCorrections=(window.__sixBallGarbageConstraintCorrections||0)+changed;
        return changed;
    }

    if(baseScheduleFreshPileFlowWave){
        scheduleFreshPileFlowWave=function(g,fresh){
            const result=baseScheduleFreshPileFlowWave(g,fresh);
            normalizeGarbageSegmentEnds(g);
            return result;
        };
    }

    if(baseMarkPileFlowPaths){
        markPileFlowPaths=function(g,...rest){
            const result=baseMarkPileFlowPaths(g,...rest);
            normalizeGarbageSegmentEnds(g);
            return result;
        };
    }

    hexPhysContactEntries=function(board,excluded=new Set()){
        const blocked=new Set(excluded||[]);
        for(const id of frozenIds(board))blocked.add(id);
        return baseContactEntries(board,blocked);
    };

    hexPhysResolveEvent=function(board,preview=false){
        const r=withFrozenHeld(board,()=>baseResolveEvent(board,preview)||[]);
        return(r.value||[]).filter(p=>p?.ball&&!r.ids.has(p.ball.id));
    };

    settlePass=function(board,preview=false){return withFrozenHeld(board,()=>baseSettlePass(board,preview)).value;};

    if(baseBoardHasIllegalFloat){
        boardHasIllegalFloat=function(board){return withFrozenHeld(board,()=>baseBoardHasIllegalFloat(board)).value;};
    }

    if(typeof unstableFrozenBalls==="function"){
        const baseUnstableFrozenBalls=unstableFrozenBalls;
        unstableFrozenBalls=function(board){
            const ids=frozenIds(board);
            return(baseUnstableFrozenBalls(board)||[]).filter(q=>!ids.has(q?.id));
        };
    }

    if(baseResolveVisualContacts){
        resolveVisualContacts=function(g){
            if(!garbagePhase(g))return baseResolveVisualContacts(g);
            normalizeGarbageSegmentEnds(g);
            normalizeReceivingGarbage(g);
            const free=captureLiveFreePositions(g);
            const r=baseResolveVisualContacts(g);
            normalizeReceivingGarbage(g);
            restoreLiveFreePositions(g,free);
            solveGarbageContactNetwork(g);
            return r;
        };
    }

    window.__sixBallGarbagePreBatchFreezeFinal=true;
    window.__sixBallGarbageReceivingPileFinal=true;
    window.__sixBallGarbageLiveVsFixedContactFinal=true;
    window.__sixBallGarbageLiveVsLiveContactFinal=true;
    window.__sixBallGarbagePathYAuthoritative=true;
    window.__sixBallGarbageContinuousTimingPreserved=true;
    window.__sixBallGarbageSegmentEndInvariant=true;
    window.__sixBallGarbageConstraintNetworkFinal=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-phase-authoritative-v1.15";
})();
