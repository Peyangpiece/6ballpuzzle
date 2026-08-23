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
 *    horizontal constraints. Fixed supports define allowed horizontal corridors
 *    instead of contradictory one-sided bounds. The order is the instantaneous
 *    analytic left-to-right order. If that total order is impossible in a dense
 *    crossing, a disjunctive pair solver may choose either side per contact while
 *    preserving the same analytic Y and every fixed-support corridor. A pair's
 *    current left/right side is preserved whenever that side is physically
 *    feasible, preventing dense contact chains from oscillating between mirrors.
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

    function laneCompare(a,b){
        const visualDx=a.v.x-b.v.x;
        if(Math.abs(visualDx)>1e-7)return visualDx;
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

    function allowedIntervals(live,fixed){
        const forbidden=[];
        for(const support of fixed){
            if(!support||support.ball.id===live.ball.id)continue;
            const dy=(live.v.y-support.v.y)*H;
            if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)continue;
            const radial=2*(Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy))+SAFE_EPS);
            const lo=Math.max(0,support.v.x-radial);
            const hi=Math.min(W2-1,support.v.x+radial);
            if(lo<hi-EPS)forbidden.push({lo,hi});
        }

        if(!forbidden.length)return[{lo:0,hi:W2-1}];
        forbidden.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
        const merged=[];
        for(const f of forbidden){
            const last=merged[merged.length-1];
            if(!last||f.lo>last.hi+EPS)merged.push({...f});
            else last.hi=Math.max(last.hi,f.hi);
        }

        const allowed=[];
        let cursor=0;
        for(const f of merged){
            if(f.lo>cursor+EPS)allowed.push({lo:cursor,hi:f.lo});
            cursor=Math.max(cursor,f.hi);
        }
        if(cursor<W2-1-EPS)allowed.push({lo:cursor,hi:W2-1});

        if(!allowed.length){
            if(merged[0].lo>EPS)return[{lo:0,hi:0}];
            const last=merged[merged.length-1];
            if(last.hi<W2-1-EPS)return[{lo:W2-1,hi:W2-1}];
        }
        return allowed;
    }

    function intervalDistance(interval,x){
        if(x<interval.lo)return interval.lo-x;
        if(x>interval.hi)return x-interval.hi;
        return 0;
    }

    function preferredInterval(intervals,live){
        if(!intervals.length)return null;
        let best=intervals[0];
        let bestD=intervalDistance(best,live.v.x);
        for(let i=1;i<intervals.length;i++){
            const q=intervals[i];
            const d=intervalDistance(q,live.v.x);
            if(d<bestD-EPS){best=q;bestD=d;continue;}
            if(Math.abs(d-bestD)<=EPS){
                const qLogical=intervalDistance(q,live.x);
                const bLogical=intervalDistance(best,live.x);
                if(qLogical<bLogical-EPS){best=q;bestD=d;}
            }
        }
        return best;
    }

    function solveConvexDomains(live,req,domains){
        const n=live.length;
        const x=new Array(n);
        for(let j=0;j<n;j++){
            const d=domains[j];
            if(!d)return null;
            let need=d.lo;
            for(let i=0;i<j;i++)if(req[i][j]>0)need=Math.max(need,x[i]+req[i][j]);
            if(need>d.hi+1e-7)return null;
            x[j]=need;
        }

        for(let i=n-1;i>=0;i--){
            const d=domains[i];
            let maxAllowed=d.hi;
            for(let j=i+1;j<n;j++)if(req[i][j]>0)maxAllowed=Math.min(maxAllowed,x[j]-req[i][j]);
            const target=Math.max(d.lo,Math.min(maxAllowed,live[i].v.x));
            if(target>x[i])x[i]=target;
        }
        return x;
    }

    function solveAcrossCorridors(live,req,corridors){
        const n=live.length;
        const x=new Array(n);
        const chosen=new Array(n);

        for(let j=0;j<n;j++){
            let need=0;
            for(let i=0;i<j;i++)if(req[i][j]>0)need=Math.max(need,x[i]+req[i][j]);
            let pick=null;
            for(const d of corridors[j]){
                if(d.hi>=need-1e-7){pick=d;break;}
            }
            if(!pick)return null;
            chosen[j]=pick;
            x[j]=Math.max(pick.lo,need);
            if(x[j]>pick.hi+1e-7)return null;
        }

        for(let i=n-1;i>=0;i--){
            const d=chosen[i];
            let maxAllowed=d.hi;
            for(let j=i+1;j<n;j++)if(req[i][j]>0)maxAllowed=Math.min(maxAllowed,x[j]-req[i][j]);
            const target=Math.max(d.lo,Math.min(maxAllowed,live[i].v.x));
            if(target>x[i])x[i]=target;
        }
        return{x,chosen};
    }

    function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

    function pairOrderCandidate(left,right,leftIntervals,rightIntervals,req){
        let best=null;
        const leftNow=left.v.x,rightNow=right.v.x;
        for(const a of leftIntervals)for(const b of rightIntervals){
            const aHi=Math.min(a.hi,b.hi-req);
            if(a.lo>aHi+1e-7)continue;
            const seeds=[
                clamp(leftNow,a.lo,aHi),
                clamp(rightNow-req,a.lo,aHi),
                clamp((leftNow+rightNow-req)/2,a.lo,aHi),
                a.lo,aHi
            ];
            for(const seed of seeds){
                let lx=clamp(seed,a.lo,aHi);
                let rx=clamp(rightNow,Math.max(b.lo,lx+req),b.hi);
                if(rx-lx<req-1e-7)continue;
                lx=clamp(leftNow,a.lo,Math.min(aHi,rx-req));
                rx=clamp(rightNow,Math.max(b.lo,lx+req),b.hi);
                if(rx-lx<req-1e-7)continue;
                const cost=(lx-leftNow)*(lx-leftNow)+(rx-rightNow)*(rx-rightNow);
                if(!best||cost<best.cost-1e-12)best={leftX:lx,rightX:rx,cost};
            }
        }
        return best;
    }

    function bestPairCandidate(a,b,aIntervals,bIntervals,req){
        const aFirst=a.v.x<=b.v.x;
        if(aFirst){
            const same=pairOrderCandidate(a,b,aIntervals,bIntervals,req);
            if(same)return{ax:same.leftX,bx:same.rightX,cost:same.cost,flipped:false};
            const reverse=pairOrderCandidate(b,a,bIntervals,aIntervals,req);
            return reverse?{ax:reverse.rightX,bx:reverse.leftX,cost:reverse.cost,flipped:true}:null;
        }
        const same=pairOrderCandidate(b,a,bIntervals,aIntervals,req);
        if(same)return{ax:same.rightX,bx:same.leftX,cost:same.cost,flipped:false};
        const reverse=pairOrderCandidate(a,b,aIntervals,bIntervals,req);
        return reverse?{ax:reverse.leftX,bx:reverse.rightX,cost:reverse.cost,flipped:true}:null;
    }

    function solveDisjunctivePairs(live,corridors){
        const start=live.map(q=>q.v.x);
        let pairMoves=0;
        const limit=Math.max(96,live.length*live.length*6);

        for(let iter=0;iter<limit;iter++){
            let worst=null;
            for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
                const req=requiredLatticeX(live[i],live[j]);
                if(req<=0)continue;
                const sep=Math.abs(live[j].v.x-live[i].v.x);
                const deficit=req-sep;
                if(deficit>1e-7&&(!worst||deficit>worst.deficit))worst={i,j,req,deficit};
            }
            if(!worst){
                let changed=0,maxShift=0;
                for(let i=0;i<live.length;i++){
                    const shift=Math.abs(live[i].v.x-start[i]);
                    if(shift>EPS){changed++;maxShift=Math.max(maxShift,shift);}
                }
                return{ok:true,changed,maxShift,pairMoves,iterations:iter};
            }

            const a=live[worst.i],b=live[worst.j];
            const candidate=bestPairCandidate(a,b,corridors[worst.i],corridors[worst.j],worst.req);
            if(!candidate)return{ok:false,reason:"pair_unresolvable",pair:[a.ball.id,b.ball.id],pairMoves,iterations:iter};

            if(Math.abs(a.v.x-candidate.ax)>EPS||Math.abs(b.v.x-candidate.bx)>EPS)pairMoves++;
            a.v.x=candidate.ax;
            b.v.x=candidate.bx;
        }

        let worst=null;
        for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
            const req=requiredLatticeX(live[i],live[j]);
            const deficit=req-Math.abs(live[j].v.x-live[i].v.x);
            if(deficit>1e-7&&(!worst||deficit>worst.deficit))worst={i,j,req,deficit};
        }
        return{ok:!worst,reason:worst?"iteration_limit":null,pair:worst?[live[worst.i].ball.id,live[worst.j].ball.id]:null,pairMoves,iterations:limit};
    }

    function clampToPreferredCorridors(live,corridors){
        let changed=0;
        for(let i=0;i<live.length;i++){
            const d=preferredInterval(corridors[i],live[i]);
            if(!d)continue;
            const nx=Math.max(d.lo,Math.min(d.hi,live[i].v.x));
            if(Math.abs(nx-live[i].v.x)>EPS){live[i].v.x=nx;changed++;}
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
        const corridors=live.map(q=>allowedIntervals(q,fixed));
        if(corridors.some(q=>!q.length)){
            window.__sixBallLastGarbageConstraintSolve={ok:false,reason:"no_fixed_corridor",at:Date.now()};
            return 0;
        }

        const n=live.length;
        const req=Array.from({length:n},()=>Array(n).fill(0));
        for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)req[i][j]=requiredLatticeX(live[i],live[j]);

        const preferred=corridors.map((list,i)=>preferredInterval(list,live[i]));
        let x=solveConvexDomains(live,req,preferred);
        let mode="preferred";
        let chosen=preferred;

        if(!x){
            const alternate=solveAcrossCorridors(live,req,corridors);
            if(alternate){x=alternate.x;chosen=alternate.chosen;mode="alternate_corridor";}
        }

        if(!x){
            const disjunctive=solveDisjunctivePairs(live,corridors);
            if(disjunctive.ok){
                window.__sixBallLastGarbageConstraintSolve={
                    ok:true,mode:"disjunctive_pairs",live:n,fixed:fixed.length,
                    changed:disjunctive.changed,maxShift:disjunctive.maxShift,
                    pairMoves:disjunctive.pairMoves,iterations:disjunctive.iterations,
                    corridorCounts:corridors.map(q=>q.length),at:Date.now()
                };
                if(disjunctive.changed)window.__sixBallGarbageConstraintCorrections=(window.__sixBallGarbageConstraintCorrections||0)+disjunctive.changed;
                return disjunctive.changed;
            }

            const fallback=clampToPreferredCorridors(live,corridors);
            window.__sixBallLastGarbageConstraintSolve={
                ok:false,reason:disjunctive.reason||"corridor_infeasible",fallback,
                pair:disjunctive.pair||null,pairMoves:disjunctive.pairMoves||0,
                iterations:disjunctive.iterations||0,
                corridorCounts:corridors.map(q=>q.length),at:Date.now()
            };
            return fallback;
        }

        let changed=0;
        let maxShift=0;
        for(let i=0;i<n;i++){
            const shift=Math.abs(x[i]-live[i].v.x);
            if(shift>EPS){live[i].v.x=x[i];changed++;maxShift=Math.max(maxShift,shift);}
        }

        window.__sixBallLastGarbageConstraintSolve={
            ok:true,mode,live:n,fixed:fixed.length,changed,maxShift,
            corridorCounts:corridors.map(q=>q.length),
            chosen:chosen.map(q=>q?[q.lo,q.hi]:null),at:Date.now()
        };
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
    window.__sixBallGarbageFixedCorridorSolver=true;
    window.__sixBallGarbageInstantaneousLaneOrder=true;
    window.__sixBallGarbageDisjunctivePairFallback=true;
    window.__sixBallGarbagePairSideStable=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-phase-authoritative-v1.19";
})();
