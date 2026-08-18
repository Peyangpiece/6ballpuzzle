/* Garbage full-gravity finalization invariant.
 *
 * Incoming garbage remains ordinary ball physics. The only special rule is the
 * freeze boundary: balls present before the current GARBAGE batch are kinematic
 * until the batch ends; balls created by this batch are never added to that
 * frozen snapshot, even after temporarily resting.
 *
 * A temporary rest is NOT final while the canonical ordinary event resolver can
 * move one or more ready incoming balls downward. We deliberately use
 * hexPhysResolveEvent rather than a one-ball shortcut so target conflicts,
 * simultaneous support loss, sweeps, pivots and linked support motion are the
 * same as normal pile settling.
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
    function visuallyAtLogicalCell(q){
        return !q.v||(Math.abs(q.v.x-q.x)<=ARRIVE_TOL&&Math.abs(q.v.y-q.y)<=ARRIVE_TOL);
    }
    function readyIncoming(g,q){
        return !!q?.ball?.isGarbage&&!isOriginalFrozen(g,q.ball)&&!q.ball.garbagePhaseFrozen&&
            !(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length)&&visuallyAtLogicalCell(q);
    }
    function markUnsettled(ball){
        if(!ball)return;
        delete ball.garbagePileSettled;
        delete ball.garbageInitialRestReached;
        delete ball.equilibriumLocked;
        ball.rigid=false;ball.motionGroupId=0;ball.motionGroupSize=0;
    }

    // The ordinary resolver has no explicit `excludedIds` argument. Re-use the
    // existing frozen-ball exclusion already installed by the normal-garbage
    // adapter: only for the duration of this resolver call, mark incoming balls
    // that are still animating/not yet at their logical cell as temporarily
    // blocked. Their real frozen state is restored immediately afterward.
    function withBusyIncomingBlocked(g,fn){
        const changed=[];
        for(const q of boardEntries(g)){
            if(!q.ball.isGarbage||isOriginalFrozen(g,q.ball))continue;
            if(readyIncoming(g,q))continue;
            changed.push([q.ball,q.ball.garbagePhaseFrozen===true]);
            q.ball.garbagePhaseFrozen=true;
        }
        try{return fn();}
        finally{
            for(const[ball,wasFrozen]of changed){if(wasFrozen)ball.garbagePhaseFrozen=true;else delete ball.garbagePhaseFrozen;}
            enforceFreezeBoundary(g);
        }
    }

    function canonicalReadyEvent(g,preview=false){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return[];
        enforceFreezeBoundary(g);
        const readyIds=new Set(boardEntries(g).filter(q=>readyIncoming(g,q)).map(q=>q.ball.id));
        if(!readyIds.size)return[];
        const accepted=withBusyIncomingBlocked(g,()=>hexPhysResolveEvent(g.board,preview));
        return (accepted||[]).filter(p=>readyIds.has(p?.ball?.id)&&p.ty>p.y);
    }

    function hasOpenGravityContinuation(g){return canonicalReadyEvent(g,true).length>0;}

    function continueGravity(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return 0;
        const accepted=canonicalReadyEvent(g,false);
        if(!accepted.length)return 0;
        for(const p of accepted)markUnsettled(p.ball);
        const moved=hexPhysApplyEvent(g.board,accepted);
        if(moved){g.ver++;g.stateT=0;return accepted.length;}
        return 0;
    }

    // Re-evaluate ready incoming balls after every garbage update. A lower ball
    // can therefore vacate a support and release the ball above on the next
    // 120 Hz frame without waiting for unrelated units to finish animating.
    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        enforceFreezeBoundary(g);
        const r=baseUpdateGarbagePacks(g,dt);
        enforceFreezeBoundary(g);
        continueGravity(g);
        return r;
    };

    // Never end the attack while the ordinary event resolver still has a legal
    // downward event for any visually-ready current-batch garbage member.
    const baseGarbageBatchDone=garbageBatchDone;
    garbageBatchDone=function(g){
        if(hasOpenGravityContinuation(g))return false;
        return baseGarbageBatchDone(g);
    };
    garbageVisualsDone=garbageBatchDone;

    window.__hexGarbageContinueDownhill=continueGravity;
    window.__hexGarbageContinueGravity=continueGravity;
    window.__hexGarbageHasOpenDiagonal=hasOpenGravityContinuation;
    window.__hexGarbageHasOpenGravity=hasOpenGravityContinuation;
    window.__hexGarbageFrozenScopeIsPreBatchSnapshot=true;
    window.__hexGarbageNoChainFreeze=true;
    window.__hexGarbageDeepSettleUsesCanonicalEventResolver=true;
})();