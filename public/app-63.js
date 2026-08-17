/* Continuous-centre legality for active landing and rigid pile motion.
 *
 * Logical cells are bookkeeping, but collision legality must use the centres
 * that are actually rendered. A settled garbage ball can rest between lattice
 * centres; ignoring that centre lets an active triplet or a rigid group plan a
 * move through occupied physical space and only discover the overlap afterward.
 *
 * This layer moves the decision earlier:
 *  - active pieceFits also checks the settled visual pile,
 *  - every logical motion bundle is swept against stationary visual centres,
 *  - if a rigid group is blocked for only part of its common motion, that real
 *    contact is the physical event that releases the group's rigidity.
 * No individual member of a still-rigid triplet is post-corrected.
 */
const HEX_CONTINUOUS_LEGAL_DIST=1-1e-7;
const HEX_CONTINUOUS_SWEEP_SAMPLES=36;

const __hexCreateEngineBeforeContinuousLegality=createEngine;
createEngine=function(seed,opts={}){
    const g=__hexCreateEngineBeforeContinuousLegality(seed,opts);
    try{Object.defineProperty(g.board,"_hexEngine",{value:g,writable:true,configurable:true,enumerable:false});}
    catch(_){g.board._hexEngine=g;}
    return g;
};

function hexContinuousBoardBallById(board,id){
    if(!board||!id)return null;
    for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball?.id===id)return ball;
    }
    return null;
}
function hexContinuousPieceFitsVisual(board,p){
    const g=board?._hexEngine;
    if(!g||g.state!=="PLAYING")return true;
    const cells=pieceCells(p);
    for(const [x,y] of cells){
        const ax=latticeRealX(x),ay=cellCenterYNorm(y);
        for(const [id,v] of g.vis.entries()){
            if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            const ball=hexContinuousBoardBallById(board,id);if(!ball)continue;
            const bx=v.x*.5,by=cellCenterYNorm(v.y);
            if(Math.hypot(ax-bx,ay-by)<HEX_CONTINUOUS_LEGAL_DIST)return false;
        }
    }
    return true;
}
const __hexPieceFitsBeforeContinuousLegality=pieceFits;
pieceFits=function(board,p){
    return __hexPieceFitsBeforeContinuousLegality(board,p)&&hexContinuousPieceFitsVisual(board,p);
};

function hexContinuousProposalPoint(p,start,t){
    const seg={
        from:[start[0],start[1]],to:[p.tx,p.ty],
        pivot:p.pivot||null,topPivot:p.topPivot||null,kind:p.kind||""
    };
    if(typeof liveSegPoint==="function")return liveSegPoint(seg,t,null,null);
    return[start[0]+(p.tx-start[0])*t,start[1]+(p.ty-start[1])*t];
}
function hexContinuousBundleSweepCollision(board,bundle,accepted){
    const g=board?._hexEngine;if(!g)return null;
    const movingIds=new Set([...bundle,...accepted].map(p=>p.ball?.id).filter(Boolean));
    const obstacles=[];
    for(const [id,v] of g.vis.entries()){
        if(movingIds.has(id)||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        const ball=hexContinuousBoardBallById(board,id);if(!ball)continue;
        obstacles.push({id,ball,x:v.x,y:v.y});
    }
    if(!obstacles.length)return null;
    for(const p of bundle){
        const v=g.vis.get(p.ball.id),start=v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?[v.x,v.y]:[p.x,p.y];
        for(let i=0;i<=HEX_CONTINUOUS_SWEEP_SAMPLES;i++){
            const t=i/HEX_CONTINUOUS_SWEEP_SAMPLES,[x,y]=hexContinuousProposalPoint(p,start,t);
            for(const o of obstacles){
                if(hexPhysDist(x,y,o.x,o.y)<HEX_CONTINUOUS_LEGAL_DIST){
                    return{proposal:p,obstacle:o,t};
                }
            }
        }
    }
    return null;
}
function hexContinuousReleaseRigidGroup(board,bundle,hit){
    const gids=new Set(bundle.map(p=>p.ball?.motionGroupId||0).filter(Boolean));
    if(!gids.size)return;
    for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?board[y][x]:null;if(!ball||!gids.has(ball.motionGroupId||0))continue;
        hexPhysClearGroupBall(ball);ball.rigid=false;
        ball.visualTripletId=0;ball.visualTripletOrientation="";ball.visualTripletRole=-1;
        ball._hexContinuousConstraintBreak={obstacleId:hit?.obstacle?.id||0,t:Number(hit?.t)||0};
    }
}
const __hexPhysBundleSafeBeforeContinuousLegality=hexPhysBundleSafe;
hexPhysBundleSafe=function(bundle,board,accepted){
    if(!__hexPhysBundleSafeBeforeContinuousLegality(bundle,board,accepted))return false;
    const hit=hexContinuousBundleSweepCollision(board,bundle,accepted);
    if(!hit)return true;
    hexContinuousReleaseRigidGroup(board,bundle,hit);
    return false;
};
