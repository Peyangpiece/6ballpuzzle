/* Garbage full-gravity finalization invariant.
 *
 * Incoming garbage remains ordinary ball physics. The only phase-specific rule
 * is the freeze boundary: balls present before the current GARBAGE batch are
 * kinematic until the batch ends; balls created by this batch are never added
 * to that snapshot, even after temporarily resting.
 *
 * A temporary rest is NOT final while a safe ordinary downward move exists.
 * First use the canonical contact-aware event resolver. There is one important
 * failure mode in dense garbage: hexPhysContactEntries may replace a ball's own
 * safe ROLL with FOLLOW_SUPPORT merely because its support has a raw proposal.
 * If that support proposal is later rejected, the follower proposal can also be
 * rejected and the original safe roll is lost. When the entire canonical event
 * is empty, re-check each READY garbage member's original hexPhysNaturalMotion
 * and accept one swept-safe move with all other balls stationary. This restores
 * the ordinary fallback path without inventing a new destination or moving the
 * pre-batch pile.
 */
(function installGarbageDeepSettle(){
    if(typeof window==="undefined"||window.__hexGarbageDeepSettle)return;
    window.__hexGarbageDeepSettle=true;

    const ARRIVE_TOL=0.045;

    function frozenSnapshot(g){return g?.garbageFrozenPileIds instanceof Set?g.garbageFrozenPileIds:null;}
    function isOriginalFrozen(g,ball){const ids=frozenSnapshot(g);return !!ball&&!!ids&&ids.has(ball.id);}
    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=ROWS-1;y>=boardScanMin(g.board);y--)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        return out;
    }
    function enforceFreezeBoundary(g){
        const ids=frozenSnapshot(g);if(!ids)return;
        for(const q of boardEntries(g)){
            if(ids.has(q.ball.id)){q.ball.garbagePhaseFrozen=true;continue;}
            if(q.ball.isGarbage){delete q.ball.garbagePhaseFrozen;delete q.ball.equilibriumLocked;}
        }
    }
    function visuallyAtLogicalCell(q){return !q.v||(Math.abs(q.v.x-q.x)<=ARRIVE_TOL&&Math.abs(q.v.y-q.y)<=ARRIVE_TOL);}
    function readyIncoming(g,q){
        return !!q?.ball?.isGarbage&&!isOriginalFrozen(g,q.ball)&&!q.ball.garbagePhaseFrozen&&
            !(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length)&&visuallyAtLogicalCell(q);
    }
    function markUnsettled(ball){
        if(!ball)return;
        delete ball.garbagePileSettled;delete ball.garbageInitialRestReached;delete ball.equilibriumLocked;
        ball.rigid=false;ball.motionGroupId=0;ball.motionGroupSize=0;
    }
    function withBusyIncomingBlocked(g,fn){
        const changed=[];
        for(const q of boardEntries(g)){
            if(!q.ball.isGarbage||isOriginalFrozen(g,q.ball))continue;
            if(readyIncoming(g,q))continue;
            changed.push([q.ball,q.ball.garbagePhaseFrozen===true]);q.ball.garbagePhaseFrozen=true;
        }
        try{return fn();}
        finally{
            for(const[ball,wasFrozen]of changed){if(wasFrozen)ball.garbagePhaseFrozen=true;else delete ball.garbagePhaseFrozen;}
            enforceFreezeBoundary(g);
        }
    }
    function readyIds(g){return new Set(boardEntries(g).filter(q=>readyIncoming(g,q)).map(q=>q.ball.id));}

    function canonicalReadyEvent(g,preview=false){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return[];
        enforceFreezeBoundary(g);
        const ids=readyIds(g);if(!ids.size)return[];
        const accepted=withBusyIncomingBlocked(g,()=>hexPhysResolveEvent(g.board,preview));
        return (accepted||[]).filter(p=>ids.has(p?.ball?.id)&&p.ty>p.y);
    }

    function rawReadyFallbackEvent(g,preview=false){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return[];
        enforceFreezeBoundary(g);
        // boardEntries is bottom-up. Move only ONE raw fallback member per
        // logical event so a ROLL pivot/support is guaranteed stationary for
        // the complete arc. Once that animation ends, the ordinary resolver is
        // run again from the new board state before any further fallback move.
        for(const q of boardEntries(g)){
            if(!readyIncoming(g,q))continue;
            const p=hexPhysNaturalMotion(g.board,q.x,q.y);
            if(!p||p.ty<=p.y)continue;
            if(!valid(p.tx,p.ty))continue;
            const target=g.board[p.ty][p.tx];
            if(target&&target!==q.ball)continue;
            // Exact ordinary swept-path check. A true pivot support is exempted
            // inside hexPhysPathHitsStationary, but every other ball—including
            // other current-batch garbage—is stationary for this fallback event.
            if(hexPhysPathHitsStationary(p,g.board,new Set([q.ball.id])))continue;
            p.bundleId=0;p.groupSize=0;p.garbageRawGravityFallback=true;
            return[p];
        }
        return[];
    }

    function nextReadyGravityEvent(g,preview=false){
        const canonical=canonicalReadyEvent(g,preview);
        if(canonical.length)return canonical;
        return rawReadyFallbackEvent(g,preview);
    }
    function hasOpenGravityContinuation(g){return nextReadyGravityEvent(g,true).length>0;}
    function continueGravity(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return 0;
        const accepted=nextReadyGravityEvent(g,false);if(!accepted.length)return 0;
        for(const p of accepted)markUnsettled(p.ball);
        const moved=hexPhysApplyEvent(g.board,accepted);
        if(moved){g.ver++;g.stateT=0;return accepted.length;}return 0;
    }

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        enforceFreezeBoundary(g);const r=baseUpdateGarbagePacks(g,dt);enforceFreezeBoundary(g);continueGravity(g);return r;
    };
    const baseGarbageBatchDone=garbageBatchDone;
    garbageBatchDone=function(g){if(hasOpenGravityContinuation(g))return false;return baseGarbageBatchDone(g);};
    garbageVisualsDone=garbageBatchDone;

    window.__hexGarbageContinueDownhill=continueGravity;
    window.__hexGarbageContinueGravity=continueGravity;
    window.__hexGarbageHasOpenDiagonal=hasOpenGravityContinuation;
    window.__hexGarbageHasOpenGravity=hasOpenGravityContinuation;
    window.__hexGarbageCanonicalReadyEvent=canonicalReadyEvent;
    window.__hexGarbageRawReadyFallbackEvent=rawReadyFallbackEvent;
    window.__hexGarbageNextReadyGravityEvent=nextReadyGravityEvent;
    window.__hexGarbageFrozenScopeIsPreBatchSnapshot=true;
    window.__hexGarbageNoChainFreeze=true;
    window.__hexGarbageDeepSettleUsesCanonicalEventResolver=true;
    window.__hexGarbageRawFallbackAfterFailedFollow=true;
})();