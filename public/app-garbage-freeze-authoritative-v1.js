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
 * 7. Fixed accumulated-pile contact has final priority. Live/live correction
 *    uses only horizontal clearance reachable without crossing a fixed support.
 * 8. A scheduled segment has one clock interval only:
 *       pileFlowEnd === pileFlowStart + pileFlowDuration
 *    Stale extended end-times may not hold a ball at an internal contact cell
 *    after its physical segment duration has already completed.
 * 9. Live garbage is separated in one stable logical lane order. Corrections do
 *    not alternate pair direction based on board-scan order, preventing dense
 *    packs from cycling back into a previously solved overlap.
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
        return boardEntries(g).filter(q=>
            q.ball.isGarbage&&
            !frozen.has(q.ball.id)&&
            !q.ball.garbagePhaseFrozen&&
            hasLivePath(q.ball)
        );
    }

    function captureLiveFreePositions(g){
        const out=new Map();
        for(const q of liveGarbageEntries(g)){
            out.set(q.ball.id,{
                x:q.v.x,
                y:q.v.y,
                vy:q.v.vy,
                motionSpeed:q.v.motionSpeed,
                pileFlow:q.v.pileFlow
            });
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
            q.v.x=s.x;
            q.v.y=s.y;
            q.v.vy=s.vy;
            q.v.motionSpeed=s.motionSpeed;
            q.v.pileFlow=s.pileFlow;
        }
        if(restored){
            window.__sixBallGarbageGenericContactRestores=(window.__sixBallGarbageGenericContactRestores||0)+restored;
        }
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
            v.x=x;
            v.y=y;
            v.vy=0;
            v.motionSpeed=0;
            v.pileFlow=false;
            delete v.gravityMismatch;
            delete v._pendingPathComplete;
            if(g._visualMovingIds instanceof Set)g._visualMovingIds.delete(ball.id);
        }
        if(fixed)window.__sixBallGarbageReceivingFinalizations=(window.__sixBallGarbageReceivingFinalizations||0)+fixed;
        return fixed;
    }

    function physicalDistance(a,b){
        return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);
    }

    function horizontalTangentX(live,fixed,dy){
        const needX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy))+SAFE_EPS;
        let sign=Math.sign((live.v.x-fixed.v.x)*.5);
        if(!sign)sign=Math.sign((live.x-fixed.x)*.5)||((live.ball.id&1)?1:-1);
        const candidates=[sign,-sign].map(s=>fixed.v.x+(s*needX)/.5);
        const validCandidates=candidates.filter(x=>x>=0&&x<=W2-1);
        if(validCandidates.length){
            validCandidates.sort((a,b)=>Math.abs(a-live.x)-Math.abs(b-live.x));
            return validCandidates[0];
        }
        return Math.max(0,Math.min(W2-1,candidates[0]));
    }

    function pushLiveFromFixed(live,fixed){
        const dy=(live.v.y-fixed.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)return false;
        const nextX=horizontalTangentX(live,fixed,dy);
        if(Math.abs(nextX-live.v.x)<=EPS)return false;
        live.v.x=nextX;
        return true;
    }

    function fixedDirectionalCapacity(live,dir,fixed){
        let cap=dir>0?(W2-1-live.v.x):live.v.x;
        const x=live.v.x;

        for(const support of fixed){
            if(!support||support.ball.id===live.ball.id)continue;
            const dy=(live.v.y-support.v.y)*H;
            if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)continue;

            const radial=2*(Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy))+SAFE_EPS);
            const left=support.v.x-radial;
            const right=support.v.x+radial;

            if(dir>0){
                if(x>=right-EPS)continue;
                if(x<=left+EPS){
                    cap=Math.min(cap,Math.max(0,left-x));
                    continue;
                }
                return 0;
            }

            if(x<=left+EPS)continue;
            if(x>=right-EPS){
                cap=Math.min(cap,Math.max(0,x-right));
                continue;
            }
            return 0;
        }

        return Math.max(0,cap);
    }

    function laneCompare(a,b){
        if(a.x!==b.x)return a.x-b.x;
        const as=Number(a.ball.garbageSourceSeq);
        const bs=Number(b.ball.garbageSourceSeq);
        if(Number.isFinite(as)&&Number.isFinite(bs)&&as!==bs)return as-bs;
        const ar=Number(a.ball.garbageSourceRole);
        const br=Number(b.ball.garbageSourceRole);
        if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return ar-br;
        if(a.y!==b.y)return a.y-b.y;
        return a.ball.id-b.ball.id;
    }

    function separateOrderedPair(left,right,fixed){
        const dy=(left.v.y-right.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)return false;

        const requiredPhysicalX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
        const requiredLatticeX=2*(requiredPhysicalX+SAFE_EPS);
        let missing=requiredLatticeX-(right.v.x-left.v.x);
        if(missing<=1e-8)return false;

        // Stable lane policy: propagate pressure toward increasing logical X.
        // This is monotonic across every pair in the pass, unlike the former
        // board-order solver where the same middle ball could be pushed right by
        // one pair and immediately left by another pair.
        let moveRight=Math.min(fixedDirectionalCapacity(right,1,fixed),missing);
        right.v.x=Math.min(W2-1,right.v.x+moveRight);
        missing-=moveRight;

        if(missing>EPS){
            const moveLeft=Math.min(fixedDirectionalCapacity(left,-1,fixed),missing);
            left.v.x=Math.max(0,left.v.x-moveLeft);
            missing-=moveLeft;
            return moveRight+moveLeft>EPS;
        }

        return moveRight>EPS;
    }

    function enforceFixedContacts(g,frozen,maxPasses){
        let corrections=0;
        for(let pass=0;pass<maxPasses;pass++){
            let changed=false;
            const entries=boardEntries(g);
            const fixed=entries.filter(q=>frozen.has(q.ball.id)||q.ball.garbagePhaseFrozen||(q.ball.isGarbage&&!hasLivePath(q.ball)));
            const live=entries.filter(q=>q.ball.isGarbage&&!frozen.has(q.ball.id)&&!q.ball.garbagePhaseFrozen&&hasLivePath(q.ball));

            for(const moving of live)for(const support of fixed){
                if(moving.ball.id===support.ball.id)continue;
                if(physicalDistance(moving,support)>=MIN_DIST-1e-8)continue;
                if(pushLiveFromFixed(moving,support)){changed=true;corrections++;}
            }
            if(!changed)break;
        }
        return corrections;
    }

    function enforceGarbageContacts(g){
        if(!garbagePhase(g))return 0;
        const frozen=frozenIds(g.board);
        let corrections=0;

        corrections+=enforceFixedContacts(g,frozen,16);

        for(let pass=0;pass<128;pass++){
            let changed=false;
            const entries=boardEntries(g);
            const fixed=entries.filter(q=>frozen.has(q.ball.id)||q.ball.garbagePhaseFrozen||(q.ball.isGarbage&&!hasLivePath(q.ball)));
            const live=entries
                .filter(q=>q.ball.isGarbage&&!frozen.has(q.ball.id)&&!q.ball.garbagePhaseFrozen&&hasLivePath(q.ball))
                .sort(laneCompare);

            for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
                if(physicalDistance(live[i],live[j])>=MIN_DIST-1e-8)continue;
                if(separateOrderedPair(live[i],live[j],fixed)){changed=true;corrections++;}
            }

            // Fixed supports remain the final boundary after every lane sweep.
            for(const moving of live)for(const support of fixed){
                if(moving.ball.id===support.ball.id)continue;
                if(physicalDistance(moving,support)>=MIN_DIST-1e-8)continue;
                if(pushLiveFromFixed(moving,support)){changed=true;corrections++;}
            }

            if(!changed)break;
        }

        corrections+=enforceFixedContacts(g,frozen,16);

        if(corrections)window.__sixBallGarbageFinalContactCorrections=(window.__sixBallGarbageFinalContactCorrections||0)+corrections;
        return corrections;
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
        return (r.value||[]).filter(p=>p?.ball&&!r.ids.has(p.ball.id));
    };

    settlePass=function(board,preview=false){
        return withFrozenHeld(board,()=>baseSettlePass(board,preview)).value;
    };

    if(baseBoardHasIllegalFloat){
        boardHasIllegalFloat=function(board){return withFrozenHeld(board,()=>baseBoardHasIllegalFloat(board)).value;};
    }

    if(typeof unstableFrozenBalls==="function"){
        const baseUnstableFrozenBalls=unstableFrozenBalls;
        unstableFrozenBalls=function(board){
            const ids=frozenIds(board);
            return (baseUnstableFrozenBalls(board)||[]).filter(q=>!ids.has(q?.id));
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
            enforceGarbageContacts(g);
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
    window.__sixBallGarbageStableLaneSeparation=true;
    window.__sixBallGarbageFixedContactPriorityFinal=true;
    window.__sixBallGarbageFixedAwareLiveSeparation=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-phase-authoritative-v1.14";
})();
