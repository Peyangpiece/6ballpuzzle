/* Visual tangency guard for scheduled accumulated-pile motion.
 *
 * Logical collapse already guarantees non-overlapping destination cells. During
 * two simultaneous support-loss arcs, however, the 120 Hz visual sample of one
 * ball can arrive a few thousandths of a diameter before its neighbour. Keep
 * the same authored path/timing and clamp only that single rendered frame to the
 * furthest collision-safe point between its previous and requested visual
 * centre. Logical cells, fallPath, gravity, slide speed and final placement are
 * untouched.
 *
 * Performance note: the common no-collision path is intentionally unchanged.
 * Only after a collision is detected do we snapshot the other visual centres
 * once and reuse that immutable list for the old-position check plus all 22
 * binary-search probes. Those other centres cannot change inside this one ball's
 * update call, so the comparisons and clamp result are identical while avoiding
 * up to 23 repeated full board scans and Map lookups on a collision frame.
 */
(function installPileFlowVisualTangency(){
    if(typeof window==="undefined"||window.__hexPileFlowVisualTangency)return;
    if(typeof updateScheduledPileFlowVisual!=="function")return;
    window.__hexPileFlowVisualTangency=true;

    const baseUpdate=updateScheduledPileFlowVisual;
    const MIN_DIST=0.999999;
    const SEARCH_STEPS=22;

    function physicalDist(ax,ay,bx,by){
        return Math.hypot((ax-bx)*.5,(ay-by)*HEX_ROW_H);
    }
    function safeAtBoard(g,id,x,y){
        if(!g?.board||!g?.vis)return true;
        for(let yy=boardScanMin(g.board);yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
            if(!valid(xx,yy))continue;
            const other=g.board[yy][xx];
            if(!other||other.id===id)continue;
            const ov=g.vis.get(other.id);
            if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            if(physicalDist(x,y,ov.x,ov.y)<MIN_DIST)return false;
        }
        return true;
    }
    function snapshotOtherVisuals(g,id){
        const out=[];
        if(!g?.board||!g?.vis)return out;
        for(let yy=boardScanMin(g.board);yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
            if(!valid(xx,yy))continue;
            const other=g.board[yy][xx];
            if(!other||other.id===id)continue;
            const ov=g.vis.get(other.id);
            if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            out.push([ov.x,ov.y]);
        }
        return out;
    }
    function safeAtSnapshot(list,x,y){
        for(let i=0;i<list.length;i++){
            const ov=list[i];
            if(physicalDist(x,y,ov[0],ov[1])<MIN_DIST)return false;
        }
        return true;
    }

    updateScheduledPileFlowVisual=function(g,cell,v,dt){
        if(!cell||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return baseUpdate(g,cell,v,dt);
        const ox=v.x,oy=v.y;
        const handled=baseUpdate(g,cell,v,dt);
        if(!handled||!Number.isFinite(v.x)||!Number.isFinite(v.y))return handled;
        const nx=v.x,ny=v.y;
        if(safeAtBoard(g,cell.id,nx,ny))return handled;

        // The first collision test above preserves the exact old common path.
        // From this point until return, only this ball's v is changed; every
        // other visual centre is stable, so one ordered snapshot is equivalent
        // to repeating the board scan for every bisection probe.
        const others=snapshotOtherVisuals(g,cell.id);
        if(!safeAtSnapshot(others,ox,oy))return handled;

        let lo=0,hi=1;
        for(let i=0;i<SEARCH_STEPS;i++){
            const m=(lo+hi)*.5,x=ox+(nx-ox)*m,y=oy+(ny-oy)*m;
            if(safeAtSnapshot(others,x,y))lo=m;else hi=m;
        }
        v.x=ox+(nx-ox)*lo;
        v.y=Math.max(oy,oy+(ny-oy)*lo);
        const d=Math.max(1e-9,Number(dt)||0);
        v.vy=Math.max(0,(v.y-oy)/d);
        v.motionSpeed=physicalDist(ox,oy,v.x,v.y)/d;
        v.pileFlowTangencyClamped=true;
        return handled;
    };

    window.__hexPileFlowVisualTangencyVersion="pileflow-tangency-v2";
    window.__hexPileFlowVisualTangencyMinDist=MIN_DIST;
    window.__hexPileFlowVisualTangencyPhysicsUnchanged=true;
    window.__hexPileFlowTangencyCollisionSnapshot=true;
    window.__hexPileFlowTangencySearchSteps=SEARCH_STEPS;
})();
