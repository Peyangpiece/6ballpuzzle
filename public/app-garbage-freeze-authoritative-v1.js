/* ============================================================
 * 6ball GARBAGE PRE-BATCH FREEZE AUTHORITATIVE v1
 *
 * GARBAGE owns one phase boundary only: balls that were already on the
 * board when the incoming batch started are physical supports/obstacles but
 * must not become motion candidates until the whole batch has settled.
 *
 * app-garbage-normal-physics establishes that invariant early in the load
 * order. Later global gravity layers replace both hexPhysContactEntries and
 * hexPhysResolveEvent, including a rescue path that can otherwise select an
 * unsupported frozen pile ball directly. This final guard re-applies the same
 * exclusion to the FINAL production resolver without changing incoming
 * garbage physics.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageFreezeAuthoritativeV1)return;
    if(typeof hexPhysContactEntries!=="function"||typeof hexPhysResolveEvent!=="function")return;

    window.__sixBallGarbageFreezeAuthoritativeV1=true;

    const baseContactEntries=hexPhysContactEntries;
    const baseResolveEvent=hexPhysResolveEvent;

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

    hexPhysContactEntries=function(board,excluded=new Set()){
        const blocked=new Set(excluded||[]);
        for(const id of frozenIds(board))blocked.add(id);
        return baseContactEntries(board,blocked);
    };

    hexPhysResolveEvent=function(board,preview=false){
        const ids=frozenIds(board);
        if(!ids.size)return baseResolveEvent(board,preview);

        // Gravity Priority v2's rescue scan is intentionally broader than
        // hexPhysNaturalMotion and only skips garbageBubbleHold. Temporarily
        // applying that existing "do not move" marker to the immutable
        // pre-batch snapshot prevents the rescue path from bypassing the phase
        // freeze. The balls remain present in occupancy and continue to act as
        // real supports/collision obstacles.
        const held=[];
        for(const ball of frozenBalls(board,ids)){
            held.push([ball,Object.prototype.hasOwnProperty.call(ball,"garbageBubbleHold"),ball.garbageBubbleHold]);
            ball.garbageBubbleHold=true;
        }

        let accepted=[];
        try{
            accepted=baseResolveEvent(board,preview)||[];
        }finally{
            for(const[ball,had,value]of held){
                if(had)ball.garbageBubbleHold=value;
                else delete ball.garbageBubbleHold;
            }
        }

        // Defensive final barrier for any future direct-rescue helper.
        return accepted.filter(p=>p?.ball&&!ids.has(p.ball.id));
    };

    if(typeof unstableFrozenBalls==="function"){
        const baseUnstableFrozenBalls=unstableFrozenBalls;
        unstableFrozenBalls=function(board){
            const ids=frozenIds(board);
            return (baseUnstableFrozenBalls(board)||[]).filter(q=>!ids.has(q?.id));
        };
    }

    window.__sixBallGarbagePreBatchFreezeFinal=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-freeze-authoritative-v1.1";
})();
