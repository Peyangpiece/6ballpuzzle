/* ============================================================
 * 6ball GARBAGE PRE-BATCH FREEZE AUTHORITATIVE v1
 *
 * GARBAGE owns one phase boundary only: balls that were already on the
 * board when the incoming batch started are physical supports/obstacles but
 * must not become motion candidates until the whole batch has settled.
 *
 * app-garbage-normal-physics establishes that invariant early in the load
 * order. Later global gravity layers replace contact/event resolution AND
 * settlePass itself, including last-resort gravity fallbacks that can otherwise
 * select an unsupported frozen pile ball directly. This final guard re-applies
 * the phase boundary to the FINAL production stack without changing incoming
 * garbage physics.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageFreezeAuthoritativeV1)return;
    if(typeof hexPhysContactEntries!=="function"||typeof hexPhysResolveEvent!=="function"||typeof settlePass!=="function")return;

    window.__sixBallGarbageFreezeAuthoritativeV1=true;

    const baseContactEntries=hexPhysContactEntries;
    const baseResolveEvent=hexPhysResolveEvent;
    const baseSettlePass=settlePass;
    const baseBoardHasIllegalFloat=typeof boardHasIllegalFloat==="function"?boardHasIllegalFloat:null;

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

    window.__sixBallGarbagePreBatchFreezeFinal=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-freeze-authoritative-v1.2";
})();
