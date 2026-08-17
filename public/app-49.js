/* Continuous-rest aware garbage completion.
 *
 * app-48 intentionally keeps a settled garbage ball at its exact continuous
 * physical centre instead of snapping it back to the reserved lattice cell.
 * The legacy garbageVisualsDone() delegates to nearlySettled(), whose visual
 * part assumes every settled board ball must converge back to that logical
 * lattice centre.  That made an already-motionless garbage batch remain in
 * RESOLVING/GARBAGE forever.
 *
 * Preserve every legacy completion condition for ordinary/moving balls.  Only
 * while evaluating the legacy predicate, temporarily present app-48's frozen
 * continuous-rest members at their bookkeeping lattice centres.  Restore their
 * real continuous centres immediately after the synchronous predicate returns,
 * so neither rendering nor subsequent physics ever observes a snap.
 */
const __hexGarbageVisualsDoneBeforeContinuousRestAware = garbageVisualsDone;

garbageVisualsDone = function(g){
    if(!g?.board)return __hexGarbageVisualsDoneBeforeContinuousRestAware(g);
    const saved=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball?._hexGarbageContinuousRest)continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        saved.push({v,x:v.x,y:v.y,vy:v.vy,motionSpeed:v.motionSpeed});
        v.x=x;
        v.y=y;
        v.vy=0;
        v.motionSpeed=0;
    }
    try{
        return __hexGarbageVisualsDoneBeforeContinuousRestAware(g);
    }finally{
        for(const s of saved){
            s.v.x=s.x;
            s.v.y=s.y;
            s.v.vy=s.vy;
            s.v.motionSpeed=s.motionSpeed;
        }
    }
};
