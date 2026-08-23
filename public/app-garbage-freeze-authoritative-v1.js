/* ============================================================
 * 6ball GARBAGE PRE-BATCH FREEZE AUTHORITATIVE v1
 *
 * GARBAGE owns one phase boundary only: balls that were already on the
 * board when the incoming batch started are physical supports/obstacles but
 * must not become motion candidates until the whole batch has settled.
 *
 * app-garbage-normal-physics establishes that invariant early in the load
 * order. Later global gravity layers are allowed to replace
 * hexPhysContactEntries, so this final guard re-applies the same exclusion to
 * the FINAL production resolver without changing incoming garbage physics.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageFreezeAuthoritativeV1)return;
    if(typeof hexPhysContactEntries!=="function")return;

    window.__sixBallGarbageFreezeAuthoritativeV1=true;

    const baseContactEntries=hexPhysContactEntries;

    function addFrozenIds(board,blocked){
        const ids=board?.__hexGarbageFrozenIds;
        if(ids instanceof Set){
            for(const id of ids)blocked.add(id);
            return;
        }

        // Diagnostic/manual boards may not have the cached snapshot set.
        // Preserve compatibility by honoring the per-ball marker as well.
        if(!Array.isArray(board))return;
        for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?board[y][x]:null;
            if(ball?.garbagePhaseFrozen)blocked.add(ball.id);
        }
    }

    hexPhysContactEntries=function(board,excluded=new Set()){
        const blocked=new Set(excluded||[]);
        addFrozenIds(board,blocked);
        return baseContactEntries(board,blocked);
    };

    window.__sixBallGarbagePreBatchFreezeFinal=true;
    window.__sixBallGarbageFreezeAuthoritativeVersion="garbage-freeze-authoritative-v1";
})();
