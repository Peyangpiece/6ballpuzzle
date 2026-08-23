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
 *    when their solver-authored unit-local paths cross in the same frame.
 * 5. Generic contact correction may not pull a live garbage centre away from
 *    its analytic fallPath in Y. Garbage contact separation is horizontal-only
 *    after the authoritative path position for the frame has been evaluated.
 * 6. Continuous garbage motion stays simultaneous when safe, but a fresh wave
 *    is delayed to the earliest collision-free instant instead of being forced
 *    through an already moving garbage trajectory.
 * 7. Fixed accumulated-pile contact has final priority over live/live visual
 *    separation. Live/live correction uses only horizontal clearance that is
 *    physically reachable without crossing an immutable fixed support.
 *
 * Logical destinations and fallPath geometry are never rewritten here. Contact
 * correction changes only the already-resolved visual centres for this frame.
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
    const baseScheduleFreshPileFlowWave=typeof scheduleFreshPileFlowWave==="function"?scheduleFreshPileFlowWave:null;
    const finalPileFlowWaveSafe=typeof pileFlowWaveSafe==="function"?pileFlowWaveSafe:null;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const EPS=1e-9;
    const SAFE_EPS=5e-4;
    const SCHEDULE_STEP=typeof PILE_FLOW_SCHEDULE_STEP==="number"?PILE_FLOW_SCHEDULE_STEP:1/240;

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
            v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;v.pileFlow=false;
            delete v.gravityMismatch;delete v._pendingPathComplete;
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

    function livePairSign(a,b){
        let sign=Math.sign(a.x-b.x);
        if(!sign)sign=Math.sign(a.v.x-b.v.x);
        if(!sign&&a.ball.garbageSourceSeq===b.ball.garbageSourceSeq){
            sign=Math.sign((Number(a.ball.garbageSourceRole)||0)-(Number(b.ball.garbageSourceRole)||0));
        }
        return sign||((a.ball.id>b.ball.id)?1:-1);
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

    function separateLivePair(a,b,fixed){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)return false;

        const requiredPhysicalX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
        const requiredLatticeX=2*(requiredPhysicalX+SAFE_EPS);
        const sign=livePairSign(a,b);
        const signedCurrent=sign*(a.v.x-b.v.x);
        let missing=requiredLatticeX-signedCurrent;
        if(missing<=1e-8)return false;

        // Each member may move only as far as the first fixed-support tangent in
        // the requested direction. If one side is pinned at a support, the other
        // member absorbs the whole live/live separation instead of pushing the
        // pinned member through the pile and relying on a later correction.
        const capA=fixedDirectionalCapacity(a,sign,fixed);
        const capB=fixedDirectionalCapacity(b,-sign,fixed);
        let moveA=Math.min(capA,missing*.5);
        let moveB=Math.min(capB,missing-moveA);
        missing-=moveA+moveB;

        if(missing>EPS){
            const moreA=Math.min(Math.max(0,capA-moveA),missing);
            moveA+=moreA;
            missing-=moreA;
        }
        if(missing>EPS){
            const moreB=Math.min(Math.max(0,capB-moveB),missing);
            moveB+=moreB;
            missing-=moreB;
        }

        a.v.x=Math.max(0,Math.min(W2-1,a.v.x+sign*moveA));
        b.v.x=Math.max(0,Math.min(W2-1,b.v.x-sign*moveB));
        return moveA+moveB>EPS;
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

        // Establish the immutable pile boundary first. Live/live correction can
        // then calculate how much sideways space is actually reachable.
        corrections+=enforceFixedContacts(g,frozen,16);

        for(let pass=0;pass<96;pass++){
            let changed=false;
            const entries=boardEntries(g);
            const fixed=entries.filter(q=>frozen.has(q.ball.id)||q.ball.garbagePhaseFrozen||(q.ball.isGarbage&&!hasLivePath(q.ball)));
            const live=entries.filter(q=>q.ball.isGarbage&&!frozen.has(q.ball.id)&&!q.ball.garbagePhaseFrozen&&hasLivePath(q.ball));

            for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
                if(physicalDistance(live[i],live[j])>=MIN_DIST-1e-8)continue;
                if(separateLivePair(live[i],live[j],fixed)){changed=true;corrections++;}
            }

            // Keep this as a defensive polish. With fixed-aware pair capacities
            // it should normally do nothing, but it guarantees fixed support is
            // still the final invariant if several neighbouring constraints meet.
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

    function groupFreshBySeq(fresh){
        const map=new Map();
        for(const q of fresh||[]){
            const seq=Number.isFinite(q?.seq)?q.seq:0;
            if(!map.has(seq))map.set(seq,[]);
            map.get(seq).push(q);
        }
        return[...map.entries()].sort((a,b)=>a[0]-b[0]);
    }

    function previousScheduledEnd(ball,seg,base){
        let earliest=base;
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        const index=path.indexOf(seg);
        if(index<=0)return earliest;
        for(let i=index-1;i>=0;i--){
            const prev=path[i];
            if(Number.isFinite(prev?.pileFlowEnd)){
                earliest=Math.max(earliest,prev.pileFlowEnd);
                break;
            }
        }
        return earliest;
    }

    function latestScheduledEnd(g){
        let end=Math.max(0,Number(g?.pileFlowClock)||0);
        if(!g?.board)return end;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.fallPath)continue;
            for(const seg of ball.fallPath){
                if(Number.isFinite(seg?.pileFlowEnd))end=Math.max(end,seg.pileFlowEnd);
            }
        }
        return end;
    }

    if(baseScheduleFreshPileFlowWave&&finalPileFlowWaveSafe){
        scheduleFreshPileFlowWave=function(g,fresh){
            const r=baseScheduleFreshPileFlowWave(g,fresh);
            if(!garbagePhase(g)||!Array.isArray(fresh)||!fresh.length)return r;

            const base=Math.max(0,Number(g.pileFlowClock)||0);
            const groups=groupFreshBySeq(fresh);

            for(const q of fresh){
                const seg=q?.seg;
                if(!seg)continue;
                delete seg.pileFlowStart;
                delete seg.pileFlowDuration;
                delete seg.pileFlowEnd;
            }

            let delayedGroups=0;
            let safetyChecks=0;
            let fallbackGroups=0;

            for(const[,entries]of groups){
                const segs=entries.map(q=>q?.seg).filter(Boolean);
                if(!segs.length)continue;

                const duration=Math.max(
                    1/120,
                    ...segs.map(seg=>Number(seg?._pileNominalDuration)||1/120)
                );

                let earliest=base;
                for(const q of entries){
                    if(!q?.ball||!q?.seg)continue;
                    earliest=Math.max(earliest,previousScheduledEnd(q.ball,q.seg,base));
                }

                const fallback=Math.max(earliest,latestScheduledEnd(g));
                let start=earliest;
                let safe=false;
                let attempts=0;
                const maxAttempts=4096;

                while(start<=fallback+SCHEDULE_STEP+1e-9&&attempts<maxAttempts){
                    safetyChecks++;
                    attempts++;
                    if(finalPileFlowWaveSafe(g,segs,start,duration)){
                        safe=true;
                        break;
                    }
                    start+=SCHEDULE_STEP;
                }

                if(!safe){
                    fallbackGroups++;
                    start=fallback+SCHEDULE_STEP;
                    for(const seg of segs){
                        seg.pileFlowStart=start;
                        seg.pileFlowDuration=duration;
                        seg.pileFlowEnd=start+duration;
                    }
                }

                if(start>earliest+1e-9)delayedGroups++;

                for(const seg of segs){
                    seg.pileFlowWaveDelay=Math.max(0,start-base);
                    seg.pileFlowGarbageContinuous=true;
                }
            }

            window.__sixBallLastGarbageCollisionAwareSchedule={
                groups:groups.length,
                delayedGroups,
                safetyChecks,
                fallbackGroups,
                at:Date.now()
            };
            return r;
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
    window.__sixBallGarbageCollisionAwareScheduleFinal=true;
    window.__sixBallGarbageFixedContactPriorityFinal=true;
    window.__sixBallGarbageFixedAwareLiveSeparation=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-phase-authoritative-v1.10";
})();
