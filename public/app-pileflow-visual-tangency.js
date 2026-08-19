/* Visual tangency guard for scheduled accumulated-pile motion.
 *
 * Logical collapse already guarantees non-overlapping destination cells. During
 * two simultaneous support-loss arcs, however, the 120 Hz visual sample of one
 * ball can arrive a few thousandths of a diameter before its neighbour. Keep
 * the same authored path/timing and clamp only that single rendered frame to the
 * furthest collision-safe point between its previous and requested visual
 * centre. Logical cells, fallPath, gravity, slide speed and final placement are
 * untouched.
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
    function safeAt(g,id,x,y){
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

    updateScheduledPileFlowVisual=function(g,cell,v,dt){
        if(!cell||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return baseUpdate(g,cell,v,dt);
        const ox=v.x,oy=v.y;
        const handled=baseUpdate(g,cell,v,dt);
        if(!handled||!Number.isFinite(v.x)||!Number.isFinite(v.y))return handled;
        const nx=v.x,ny=v.y;
        if(safeAt(g,cell.id,nx,ny))return handled;
        if(!safeAt(g,cell.id,ox,oy))return handled;

        let lo=0,hi=1;
        for(let i=0;i<SEARCH_STEPS;i++){
            const m=(lo+hi)*.5,x=ox+(nx-ox)*m,y=oy+(ny-oy)*m;
            if(safeAt(g,cell.id,x,y))lo=m;else hi=m;
        }
        v.x=ox+(nx-ox)*lo;
        v.y=Math.max(oy,oy+(ny-oy)*lo);
        const d=Math.max(1e-9,Number(dt)||0);
        v.vy=Math.max(0,(v.y-oy)/d);
        v.motionSpeed=physicalDist(ox,oy,v.x,v.y)/d;
        v.pileFlowTangencyClamped=true;
        return handled;
    };

    window.__hexPileFlowVisualTangencyVersion="pileflow-tangency-v1";
    window.__hexPileFlowVisualTangencyMinDist=MIN_DIST;
    window.__hexPileFlowVisualTangencyPhysicsUnchanged=true;
})();
