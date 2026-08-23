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
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const EPS=1e-9;
    const SAFE_EPS=2e-7;

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
        const needX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
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
        let dx=(live.v.x-fixed.v.x)*.5;
        let dy=(live.v.y-fixed.v.y)*H;
        let d=Math.hypot(dx,dy);
        if(d>=MIN_DIST-1e-8)return false;

        // Never push a falling garbage ball upward. Above a fixed support, use
        // the exact horizontal tangent at the current height instead.
        if(dy<0){
            live.v.x=horizontalTangentX(live,fixed,dy);
            return true;
        }

        if(d<=1e-10){
            dx=(live.x-fixed.x)*.5;
            dy=(live.y-fixed.y)*H;
            d=Math.hypot(dx,dy);
        }

        if(d>1e-10&&dy>=0){
            const nx=dx/d,ny=dy/d;
            live.v.x=Math.max(0,Math.min(W2-1,fixed.v.x+(nx*MIN_DIST)/.5));
            live.v.y=Math.min((FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H,Math.max(live.v.y,fixed.v.y+(ny*MIN_DIST)/H));
        }else{
            live.v.x=horizontalTangentX(live,fixed,0);
        }

        dx=(live.v.x-fixed.v.x)*.5;
        dy=(live.v.y-fixed.v.y)*H;
        if(Math.hypot(dx,dy)<MIN_DIST-1e-8&&Math.abs(dy)<MIN_DIST){
            live.v.x=horizontalTangentX(live,fixed,dy);
        }
        return true;
    }

    function livePairSign(a,b){
        // Keep the same left/right order as the solver's logical destinations.
        // For members of one shaped unit this also preserves source-role order
        // when their target x happens to be equal.
        let sign=Math.sign(a.x-b.x);
        if(!sign)sign=Math.sign(a.v.x-b.v.x);
        if(!sign&&a.ball.garbageSourceSeq===b.ball.garbageSourceSeq){
            sign=Math.sign((Number(a.ball.garbageSourceRole)||0)-(Number(b.ball.garbageSourceRole)||0));
        }
        return sign||((a.ball.id>b.ball.id)?1:-1);
    }

    function separateLivePair(a,b){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-SAFE_EPS)return false;

        const requiredPhysicalX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
        const requiredLatticeX=2*(requiredPhysicalX+SAFE_EPS);
        const sign=livePairSign(a,b);
        const signedCurrent=sign*(a.v.x-b.v.x);
        let missing=requiredLatticeX-signedCurrent;
        if(missing<=1e-8)return false;

        // Separate horizontally only. This guarantees contact correction cannot
        // create the old visual upward kick while both balls are falling/arcing.
        const capA=sign>0?(W2-1-a.v.x):a.v.x;
        const capB=sign>0?b.v.x:(W2-1-b.v.x);
        let moveA=Math.min(Math.max(0,capA),missing*.5);
        let moveB=Math.min(Math.max(0,capB),missing-moveA);
        missing-=moveA+moveB;
        if(missing>EPS){
            const moreA=Math.min(Math.max(0,capA-moveA),missing);
            moveA+=moreA;missing-=moreA;
        }
        if(missing>EPS){
            const moreB=Math.min(Math.max(0,capB-moveB),missing);
            moveB+=moreB;missing-=moreB;
        }

        a.v.x=Math.max(0,Math.min(W2-1,a.v.x+sign*moveA));
        b.v.x=Math.max(0,Math.min(W2-1,b.v.x-sign*moveB));
        return moveA+moveB>EPS;
    }

    function enforceGarbageContacts(g){
        if(!garbagePhase(g))return 0;
        const frozen=frozenIds(g.board);
        let corrections=0;

        // Each correction can expose a neighbouring contact, so iterate the
        // small GARBAGE set to convergence. No logical cell/path is changed.
        for(let pass=0;pass<16;pass++){
            let changed=false;
            const entries=boardEntries(g);
            const fixed=entries.filter(q=>frozen.has(q.ball.id)||q.ball.garbagePhaseFrozen||(q.ball.isGarbage&&!hasLivePath(q.ball)));
            const live=entries.filter(q=>q.ball.isGarbage&&!frozen.has(q.ball.id)&&!q.ball.garbagePhaseFrozen&&hasLivePath(q.ball));

            for(const moving of live)for(const support of fixed){
                if(moving.ball.id===support.ball.id)continue;
                if(physicalDistance(moving,support)>=MIN_DIST-1e-8)continue;
                if(pushLiveFromFixed(moving,support)){changed=true;corrections++;}
            }

            for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
                if(physicalDistance(live[i],live[j])>=MIN_DIST-1e-8)continue;
                if(separateLivePair(live[i],live[j])){changed=true;corrections++;}
            }

            if(!changed)break;
        }

        if(corrections)window.__sixBallGarbageFinalContactCorrections=(window.__sixBallGarbageFinalContactCorrections||0)+corrections;
        return corrections;
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
            const r=baseResolveVisualContacts(g);
            normalizeReceivingGarbage(g);
            enforceGarbageContacts(g);
            return r;
        };
    }

    window.__sixBallGarbagePreBatchFreezeFinal=true;
    window.__sixBallGarbageReceivingPileFinal=true;
    window.__sixBallGarbageLiveVsFixedContactFinal=true;
    window.__sixBallGarbageLiveVsLiveContactFinal=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-phase-authoritative-v1.5";
})();
