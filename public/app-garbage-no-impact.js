/* Pre-existing pile is kinematic during an incoming-garbage batch.
 *
 * Garbage is allowed to collide with, stop on, and roll around balls that were
 * already accumulated when the batch began. The collision is strictly one-way:
 * no impulse, gravity re-evaluation, visual projection, or queued pile motion
 * created by the garbage phase may move those pre-existing balls.
 */
(function installGarbageNoImpactOnOriginalPile(){
    if(typeof window==="undefined"||window.__hexGarbageNoImpact)return;
    window.__hexGarbageNoImpact=true;

    const pinnedByBoard=new WeakMap();

    function cloneData(v){
        if(Array.isArray(v))return v.map(cloneData);
        if(v&&typeof v==="object"){
            const out={};
            for(const k of Object.keys(v))out[k]=cloneData(v[k]);
            return out;
        }
        return v;
    }

    function capturePins(g){
        const ids=g?.garbageOriginalPileIds instanceof Set?new Set(g.garbageOriginalPileIds):new Set();
        const entries=new Map();
        if(g?.board){
            for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                if(!ball||!ids.has(ball.id))continue;
                const v=g.vis.get(ball.id);
                entries.set(ball.id,{
                    ball,x,y,
                    ballState:cloneData(ball),
                    visual:v?cloneData(v):null
                });
            }
        }
        const state={ids,entries,g};
        pinnedByBoard.set(g.board,state);
        g.garbageImpactPinnedIds=new Set(ids);
        return state;
    }

    function pinState(g){return g?.board?pinnedByBoard.get(g.board)||null:null;}

    function restoreObject(target,snapshot){
        if(!target||!snapshot)return;
        for(const k of Object.keys(target))if(!Object.prototype.hasOwnProperty.call(snapshot,k))delete target[k];
        for(const k of Object.keys(snapshot))target[k]=cloneData(snapshot[k]);
    }

    function restorePins(g){
        const state=pinState(g);if(!state)return;
        // Resolver filtering below prevents logical displacement. This scan is a
        // hard invariant fallback so even a future garbage-specific code path
        // cannot leave an original pile ball in another lattice cell.
        const location=new Map();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball&&state.ids.has(ball.id))location.set(ball.id,{x,y,ball});
        }
        for(const [id,e] of state.entries){
            const q=location.get(id);
            if(q&&(q.x!==e.x||q.y!==e.y)&&g.board[q.y][q.x]===e.ball)g.board[q.y][q.x]=null;
        }
        for(const [id,e] of state.entries){
            const occupant=valid(e.x,e.y)?g.board[e.y][e.x]:null;
            // This should never differ because pinned proposals are rejected.
            // Do not delete another ball in production; retain the anchor's
            // object state and let collision guards prevent the impossible case.
            if(!occupant||occupant===e.ball)g.board[e.y][e.x]=e.ball;
            restoreObject(e.ball,e.ballState);
            if(e.visual){
                let v=g.vis.get(id);
                if(!v){v={};g.vis.set(id,v);}
                restoreObject(v,e.visual);
                v.vy=Number.isFinite(e.visual.vy)?e.visual.vy:0;
                v.motionSpeed=Number.isFinite(e.visual.motionSpeed)?e.visual.motionSpeed:0;
            }
            if(g._visualMovingIds)g._visualMovingIds.delete(id);
            if(g._visualMotionSeqById)g._visualMotionSeqById.delete(id);
        }
    }

    function bundleKey(p){return p?.bundleId?"g:"+p.bundleId:"b:"+(p?.ball?.id||0);}

    // settlePass() asks hexPhysResolveEvent() for motions before it applies them.
    // Reject every bundle containing an original-pile ball while the garbage
    // batch is pinned. This prevents the incoming ball from indirectly causing
    // a support ball to acquire a fallPath or change logical cells.
    const baseResolveEvent=hexPhysResolveEvent;
    hexPhysResolveEvent=function(board,preview=false){
        const accepted=baseResolveEvent(board,preview);
        const state=pinnedByBoard.get(board);
        if(!state||!accepted?.length)return accepted;
        const blockedBundles=new Set();
        for(const p of accepted)if(p?.ball&&state.ids.has(p.ball.id))blockedBundles.add(bundleKey(p));
        if(!blockedBundles.size)return accepted;
        return accepted.filter(p=>!state.ids.has(p?.ball?.id)&&!blockedBundles.has(bundleKey(p)));
    };

    // Capture AFTER the pre-existing-pile contact layer has taken its batch
    // snapshot; prepareGarbageBatch itself only plans on a shadow board.
    const basePrepare=prepareGarbageBatch;
    prepareGarbageBatch=function(g){
        const fresh=!g?.garbageBatchPrepared;
        const out=basePrepare(g);
        if(fresh)capturePins(g);
        return out;
    };

    // Visual contact resolution must always see the original pile as stationary.
    // The core resolver already gives all correction to the moving ball when the
    // other ball is stationary; restoring before/after guarantees that contract.
    const baseResolveVisual=resolveVisualContacts;
    resolveVisualContacts=function(g){
        const state=pinState(g);
        if(!state)return baseResolveVisual(g);
        restorePins(g);
        const out=baseResolveVisual(g);
        restorePins(g);
        return out;
    };

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const state=pinState(g);
        if(!state)return baseUpdateVisuals(g,dt);
        restorePins(g);
        const out=baseUpdateVisuals(g,dt);
        restorePins(g);
        return out;
    };

    // updateGarbagePacks contains garbage-triggered settlePass calls. Enforce the
    // invariant around the whole transaction in addition to the resolver filter.
    const baseUpdateGarbage=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        const state=pinState(g);
        if(state)restorePins(g);
        const out=baseUpdateGarbage(g,dt);
        if(state)restorePins(g);
        return out;
    };

    // Keep the anchors pinned until every incoming member and its visual lattice
    // motion has finished. A later, separate garbage batch takes a new snapshot,
    // so previously settled garbage then legitimately belongs to the pile.
    const baseBatchDone=garbageBatchDone;
    garbageBatchDone=function(g){
        const done=baseBatchDone(g);
        if(done&&pinState(g)){
            restorePins(g);
            pinnedByBoard.delete(g.board);
            delete g.garbageImpactPinnedIds;
        }
        return done;
    };

    window.__hexGarbageImpactPinState=pinState;
    window.__hexRestoreGarbageImpactPins=restorePins;
})();
