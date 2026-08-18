/* Garbage full-gravity finalization invariant.
 *
 * Incoming garbage uses the canonical ordinary-ball gravity proposal. A newly
 * arrived garbage ball is never considered finally settled while ANY legal
 * downward ordinary move remains: FREE_FALL, ROLL_LEFT, ROLL_RIGHT or
 * FLOOR_DROP. This prevents one contact with the pre-existing pile from
 * freezing a whole chain of incoming balls above newly opened space.
 *
 * Freeze scope stays snapshot-based. Only balls that existed when the current
 * GARBAGE batch began (garbageFrozenPileIds) are kinematic. Garbage created by
 * this batch is never added to that set, even after it has temporarily rested.
 */
(function installGarbageDeepSettle(){
    if(typeof window==="undefined"||window.__hexGarbageDeepSettle)return;
    window.__hexGarbageDeepSettle=true;

    const ARRIVE_TOL=0.045;

    function frozenSnapshot(g){
        return g?.garbageFrozenPileIds instanceof Set?g.garbageFrozenPileIds:null;
    }
    function isOriginalFrozen(g,ball){
        const ids=frozenSnapshot(g);
        return !!ball&&!!ids&&ids.has(ball.id);
    }
    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        // Bottom-up: when a lower incoming ball vacates a support cell, the ball
        // above can be reconsidered in the same physics frame without allowing
        // the same ball to take two logical steps (the first step adds fallPath).
        for(let y=ROWS-1;y>=boardScanMin(g.board);y--)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        return out;
    }
    function enforceFreezeBoundary(g){
        const ids=frozenSnapshot(g);
        if(!ids)return;
        for(const q of boardEntries(g)){
            if(ids.has(q.ball.id)){
                q.ball.garbagePhaseFrozen=true;
                continue;
            }
            if(q.ball.isGarbage){
                // A ball from the current attack is always live gravity matter.
                delete q.ball.garbagePhaseFrozen;
                delete q.ball.equilibriumLocked;
            }
        }
    }
    function visuallyAtLogicalCell(q){
        return !q.v||(
            Math.abs(q.v.x-q.x)<=ARRIVE_TOL&&
            Math.abs(q.v.y-q.y)<=ARRIVE_TOL
        );
    }
    function ordinaryContinuation(g,q){
        if(!q?.ball?.isGarbage||isOriginalFrozen(g,q.ball)||q.ball.garbagePhaseFrozen)return null;
        if(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length)return null;
        if(!visuallyAtLogicalCell(q))return null;

        const p=hexPhysNaturalMotion(g.board,q.x,q.y);
        if(!p)return null;
        const dx=p.tx-q.x,dy=p.ty-q.y;
        // Gravity may be vertical (two doubled-y rows), diagonal (one row) or
        // the bottom parity bridge. Never finalize while any downward move exists.
        if(dy<=0)return null;
        const canonicalKind=p.kind||"";
        if(!["FREE_FALL","ROLL_LEFT","ROLL_RIGHT","FLOOR_DROP"].includes(canonicalKind)){
            // FOLLOW_SUPPORT and other canonical downward proposals may appear
            // after a support starts moving. They are still legal gravity if the
            // target is lower; preserve them rather than inventing a special rule.
            if(!(p.ty>p.y))return null;
        }

        // Re-use the canonical swept-path safety test. The supporting pivot of a
        // roll is already exempted by hexPhysPathHitsStationary itself.
        if(typeof hexPhysPathHitsStationary==="function"&&
           hexPhysPathHitsStationary(p,g.board,new Set([q.ball.id])))return null;
        return p;
    }
    function markUnsettledIfMovable(g,q){
        const p=ordinaryContinuation(g,q);
        if(!p)return null;
        delete q.ball.garbagePileSettled;
        delete q.ball.garbageInitialRestReached;
        delete q.ball.equilibriumLocked;
        q.ball.rigid=false;
        q.ball.motionGroupId=0;
        q.ball.motionGroupSize=0;
        return p;
    }
    function hasOpenGravityContinuation(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return false;
        enforceFreezeBoundary(g);
        for(const q of boardEntries(g))if(markUnsettledIfMovable(g,q))return true;
        return false;
    }
    function continueGravity(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return 0;
        enforceFreezeBoundary(g);
        let moved=0;
        const entries=boardEntries(g);
        for(const q of entries){
            if(g.board[q.y]?.[q.x]!==q.ball)continue;
            const p=markUnsettledIfMovable(g,q);
            if(!p)continue;
            if(hexPhysApplyEvent(g.board,[p])){
                moved++;
                g.ver++;
            }
        }
        return moved;
    }

    // Re-evaluate each incoming ball immediately after its own visual segment is
    // complete. Do not wait for unrelated garbage balls to finish animating.
    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        enforceFreezeBoundary(g);
        const r=baseUpdateGarbagePacks(g,dt);
        enforceFreezeBoundary(g);
        continueGravity(g);
        return r;
    };

    // The attack cannot finish while any current-batch garbage ball can still
    // descend under the ordinary solver. This also prevents unsupported internal
    // holes from being accepted as a finished pile.
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
})();