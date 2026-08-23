/* ============================================================
 * 6ball GARBAGE PHASE AUTHORITATIVE v1
 *
 * Two invariants are re-applied after every global physics/performance layer:
 *
 * 1. Balls that were already accumulated when GARBAGE began are immutable
 *    supports/obstacles until the incoming batch has completely settled.
 * 2. A current-batch garbage ball with no remaining fallPath is a receiving
 *    pile member whose canonical centre is its logical lattice cell. It must
 *    not retain a stale contact-correction offset and become a static overlap.
 *
 * Incoming balls with a live fallPath still use the ordinary gravity/contact
 * solver unchanged.
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

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set){
            for(const id of cached)out.add(id);
            return out;
        }

        // Diagnostic/manual boards may not have the cached snapshot set.
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

        // Every late gravity rescue/fallback already treats garbageBubbleHold as
        // an absolute no-motion marker. Borrow it only for the duration of the
        // resolver call, then restore the exact prior property state.
        const held=[];
        for(const ball of frozenBalls(board,ids)){
            held.push([ball,Object.prototype.hasOwnProperty.call(ball,"garbageBubbleHold"),ball.garbageBubbleHold]);
            ball.garbageBubbleHold=true;
        }

        try{
            return{ids,value:fn()};
        }finally{
            for(const[ball,had,value]of held){
                if(had)ball.garbageBubbleHold=value;
                else delete ball.garbageBubbleHold;
            }
        }
    }

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&g.board);
    }

    function hasLivePath(ball){
        return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;
    }

    function normalizeReceivingGarbage(g){
        if(!garbagePhase(g))return 0;
        const frozen=frozenIds(g.board);
        let fixed=0;

        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage||frozen.has(ball.id)||ball.garbagePhaseFrozen||hasLivePath(ball))continue;
            const v=g.vis?.get?.(ball.id);
            if(!v)continue;

            // fallPath has ended: logical occupancy is now the authoritative
            // centre. Leaving a previous-frame x/y projection here makes the
            // final performance resolver classify two overlapping balls as a
            // static-static pair and skip them forever.
            if(Math.abs(v.x-x)>1e-9||Math.abs(v.y-y)>1e-9||Math.abs(v.vy||0)>1e-9||Math.abs(v.motionSpeed||0)>1e-9)fixed++;
            v.x=x;
            v.y=y;
            v.vy=0;
            v.motionSpeed=0;
            v.pileFlow=false;
            delete v.gravityMismatch;
            delete v._pendingPathComplete;
            if(g._visualMovingIds instanceof Set)g._visualMovingIds.delete(ball.id);
        }

        if(fixed){
            window.__sixBallGarbageReceivingFinalizations=(window.__sixBallGarbageReceivingFinalizations||0)+fixed;
        }
        return fixed;
    }

    hexPhysContactEntries=function(board,excluded=new Set()){
        const blocked=new Set(excluded||[]);
        for(const id of frozenIds(board))blocked.add(id);
        return baseContactEntries(board,blocked);
    };

    hexPhysResolveEvent=function(board,preview=false){
        const r=withFrozenHeld(board,()=>baseResolveEvent(board,preview)||[]);
        // Defensive final barrier for any future direct-rescue helper.
        return (r.value||[]).filter(p=>p?.ball&&!r.ids.has(p.ball.id));
    };

    settlePass=function(board,preview=false){
        // Gravity Priority v5 has a private findFinalGravity fallback inside
        // settlePass, so guarding only hexPhysResolveEvent is insufficient.
        // Hold the immutable snapshot across the complete settle pass.
        return withFrozenHeld(board,()=>baseSettlePass(board,preview)).value;
    };

    if(baseBoardHasIllegalFloat){
        boardHasIllegalFloat=function(board){
            return withFrozenHeld(board,()=>baseBoardHasIllegalFloat(board)).value;
        };
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

            // Re-establish the receiving-pile invariant BEFORE the final
            // runtime-performance contact pass. A moving incoming neighbour is
            // then projected away from this exact stationary tangent point.
            normalizeReceivingGarbage(g);
            const r=baseResolveVisualContacts(g);

            // A no-path garbage member is never allowed to leave a contact pass
            // with a stale static offset. Live-path members are untouched.
            normalizeReceivingGarbage(g);
            return r;
        };
    }

    window.__sixBallGarbagePreBatchFreezeFinal=true;
    window.__sixBallGarbageReceivingPileFinal=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-phase-authoritative-v1.3";
})();
