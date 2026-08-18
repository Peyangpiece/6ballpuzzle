/* Garbage downhill-finalization invariant.
 *
 * Incoming garbage still uses the canonical ordinary-ball motion proposal.
 * This layer only prevents a released garbage ball from being treated as
 * settled while a legal one-cell diagonal-down continuation still exists.
 *
 * Freeze scope is snapshot-based: only balls that existed when the current
 * GARBAGE batch began (garbageFrozenPileIds) are kinematic. Garbage that has
 * already landed during this batch never joins that frozen snapshot and may
 * move again whenever ordinary gravity gives it a legal continuation.
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
            // A ball created by this incoming batch is never promoted into the
            // pre-batch frozen set, even after it has reached a resting cell.
            if(q.ball.isGarbage)delete q.ball.garbagePhaseFrozen;
        }
    }
    function diagonalContinuation(g,q){
        if(!q?.ball?.isGarbage||isOriginalFrozen(g,q.ball)||q.ball.garbagePhaseFrozen)return null;
        if(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length)return null;
        if(q.v&&(Math.abs(q.v.x-q.x)>ARRIVE_TOL||Math.abs(q.v.y-q.y)>ARRIVE_TOL))return null;
        const p=hexPhysNaturalMotion(g.board,q.x,q.y);
        if(!p)return null;
        const dx=p.tx-q.x,dy=p.ty-q.y;
        if(dy!==1||Math.abs(dx)!==1)return null;
        // The canonical proposal already supplies the correct support pivot or
        // topPivot. Re-check its swept path before applying it independently.
        if(typeof hexPhysPathHitsStationary==="function"&&
           hexPhysPathHitsStationary(p,g.board,new Set([q.ball.id])))return null;
        return p;
    }
    function hasOpenDiagonalContinuation(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return false;
        enforceFreezeBoundary(g);
        return boardEntries(g).some(q=>!!diagonalContinuation(g,q));
    }
    function continueDownhill(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return 0;
        enforceFreezeBoundary(g);
        let moved=0;
        // Bottom-up means a ball moved from y to y+1 cannot be selected for a
        // second logical step in this same frame. Its visual arc finishes first.
        for(const q of boardEntries(g)){
            if(g.board[q.y]?.[q.x]!==q.ball)continue;
            const p=diagonalContinuation(g,q);
            if(!p)continue;
            delete q.ball.garbagePileSettled;
            delete q.ball.garbageInitialRestReached;
            if(hexPhysApplyEvent(g.board,[p])){
                moved++;
                g.ver++;
            }
        }
        return moved;
    }

    // Apply the next ordinary diagonal cell as soon as this garbage ball itself
    // reaches the current cell. Do not wait for unrelated garbage animations.
    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        enforceFreezeBoundary(g);
        const r=baseUpdateGarbagePacks(g,dt);
        enforceFreezeBoundary(g);
        continueDownhill(g);
        return r;
    };

    // A batch cannot finish while any non-snapshot garbage ball still has a
    // legal diagonal-down continuation.
    const baseGarbageBatchDone=garbageBatchDone;
    garbageBatchDone=function(g){
        if(hasOpenDiagonalContinuation(g))return false;
        return baseGarbageBatchDone(g);
    };
    garbageVisualsDone=garbageBatchDone;

    window.__hexGarbageContinueDownhill=continueDownhill;
    window.__hexGarbageHasOpenDiagonal=hasOpenDiagonalContinuation;
    window.__hexGarbageFrozenScopeIsPreBatchSnapshot=true;
})();
