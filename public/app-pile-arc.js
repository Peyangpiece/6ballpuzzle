/* Accumulated-pile contact arc binding.
 *
 * A diagonal lattice transition is physically a roll around a supporting ball,
 * not a straight chord through that ball. The core solver already records a
 * pivot for ordinary ROLL_LEFT/ROLL_RIGHT events, but after a clear the logical
 * board may contain the support at its FINAL cell while the moving ball's path
 * still refers to the support's ORIGINAL cell. In that case app-07 could not
 * bind the segment to the moving support and rendering could fall back to a
 * straight diagonal interpolation.
 *
 * Resolve the support by its current logical cell, visual centre, or any queued
 * fallPath endpoint. Once found, bind the moving pile ball to that support so
 * pileFlowPointForBall composes the support's own motion with a unit-radius arc.
 * Free-fall / floor-only motion is intentionally untouched: an arc is required
 * only when there is a real ball acting as the rolling support.
 */
(function installAccumulatedPileArcBinding(){
    if(typeof window==="undefined"||window.__hexAccumulatedPileArcBinding)return;
    window.__hexAccumulatedPileArcBinding=true;

    const baseRepairPileFlowSegmentGeometry=repairPileFlowSegmentGeometry;
    const ARC_EPS=2e-5;
    const LOC_EPS=0.03;

    function physicalDist(a,b){
        return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);
    }

    function isUsablePileSupport(ball){
        if(!ball)return false;
        if(!ball.isGarbage)return true;
        // A de-rigidified incoming garbage ball is not accumulated pile until
        // its first landing has fully settled (the settle-state gate contract).
        return ball.garbagePileSettled===true;
    }

    function ballLogicalCell(g,ball){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            if(valid(x,y)&&g.board[y][x]===ball)return [x,y];
        }
        return null;
    }

    function pathTouchesPoint(ball,px,py){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        for(const seg of path){
            if(seg?.from&&Math.abs(seg.from[0]-px)<=ARC_EPS&&Math.abs(seg.from[1]-py)<=ARC_EPS)return true;
            if(seg?.to&&Math.abs(seg.to[0]-px)<=ARC_EPS&&Math.abs(seg.to[1]-py)<=ARC_EPS)return true;
        }
        return false;
    }

    function supportAtHistoricalPivot(g,moving,px,py){
        let best=null;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||ball===moving||!isUsablePileSupport(ball))continue;
            let rank=99;
            if(x===px&&y===py)rank=0;
            else if(pathTouchesPoint(ball,px,py))rank=1;
            else{
                const v=g.vis.get(ball.id);
                if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&physicalDist([v.x,v.y],[px,py])<=LOC_EPS)rank=2;
            }
            if(rank===99)continue;
            const logical=ballLogicalCell(g,ball);
            const travel=logical?physicalDist(logical,[px,py]):0;
            const candidate={ball,rank,travel};
            if(!best||candidate.rank<best.rank||(candidate.rank===best.rank&&candidate.travel<best.travel))best=candidate;
        }
        return best?.ball||null;
    }

    function bindSupport(g,ball,seg,pivot){
        const support=supportAtHistoricalPivot(g,ball,pivot[0],pivot[1]);
        if(!support)return false;
        seg.pivot=[pivot[0],pivot[1]];
        seg.followSupportIds=[support.id];
        seg.movingSupportId=support.id;
        seg.pileFlowGridArc=true;
        seg.pileFlowArcSupportId=support.id;
        return true;
    }

    repairPileFlowSegmentGeometry=function(g,ball,seg,reason="pile_flow"){
        baseRepairPileFlowSegmentGeometry(g,ball,seg,reason);
        if(!seg||!ball||!seg.from||!seg.to||seg.topPivot)return;

        const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
        if(dy!==1||Math.abs(dx)!==1)return;

        // Existing physical ROLL pivots are authoritative. Re-bind them to the
        // actual support object, including a support that has already moved to
        // its final logical cell and only retains the old pivot in fallPath.
        if(seg.pivot){
            const d0=physicalDist(seg.from,seg.pivot),d1=physicalDist(seg.to,seg.pivot);
            if(Math.abs(d0-1)<=ARC_EPS&&Math.abs(d1-1)<=ARC_EPS)bindSupport(g,ball,seg,seg.pivot);
            return;
        }

        // If another layer already supplied a moving support, that relation is
        // enough for pileFlowPointForBall to preserve circular contact.
        if(seg.movingSupportId||(Array.isArray(seg.followSupportIds)&&seg.followSupportIds.length))return;

        // Two unit-circle centres are geometrically possible for adjacent hex
        // lattice cells. Only choose one when an actual accumulated ball occupied
        // that centre either now or earlier in its queued path.
        const pivots=[
            [seg.from[0]+2*dx,seg.from[1]],
            [seg.from[0]-dx,seg.from[1]+1]
        ];
        for(const pivot of pivots){
            if(!valid(pivot[0],pivot[1]))continue;
            if(Math.abs(physicalDist(seg.from,pivot)-1)>ARC_EPS||Math.abs(physicalDist(seg.to,pivot)-1)>ARC_EPS)continue;
            if(bindSupport(g,ball,seg,pivot))return;
        }
    };

    // Diagnostics used by the regression suite.
    window.__hexBindPileArcSegment=(g,ball,seg)=>repairPileFlowSegmentGeometry(g,ball,seg,"clear_support_loss");
})();
