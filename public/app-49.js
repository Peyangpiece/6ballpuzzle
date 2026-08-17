/* Continuous-rest aware settlement predicates.
 *
 * app-48 intentionally keeps a released garbage ball at its exact continuous
 * physical rest centre instead of snapping it back to the reserved lattice
 * cell. The legacy nearlySettled() equated "settled" with "visual centre is
 * near logical cell". That blocked both GARBAGE completion and later ordinary
 * SETTLE checkpoints even though the garbage circles were physically motionless.
 *
 * A continuous-rest ball counts as settled only while it has no new fallPath
 * and its authoritative visual centre is finite. If support changes later,
 * app-48 bridges the continuous rest centre into the newly created fallPath
 * before the resolver reaches this predicate, so the normal path check blocks
 * phase completion exactly as before. Ordinary balls retain the legacy rules.
 */
const __hexNearlySettledBeforeContinuousRestAware=nearlySettled;
nearlySettled=function(g,tol){
    if(!g?.board)return __hexNearlySettledBeforeContinuousRestAware(g,tol);
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;
        if(Array.isArray(ball.fallPath)&&ball.fallPath.length)return false;
        const v=g.vis.get(ball.id);
        if(ball._hexGarbageContinuousRest){
            if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return false;
            if(Math.abs(Number(v.vy)||0)>1e-8||Math.abs(Number(v.motionSpeed)||0)>1e-8)return false;
            continue;
        }
        if(v&&(Math.abs(v.y-y)>tol||Math.abs(v.x-x)>tol))return false;
    }
    return true;
};

/* Keep the public garbage completion hook explicit. It now delegates to the
 * continuous-rest-aware nearlySettled() above, without temporarily moving any
 * rendered centre to its bookkeeping lattice cell. */
garbageVisualsDone=function(g){return nearlySettled(g,.06);};
