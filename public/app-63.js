/* Continuous-centre authority.
 *
 * This is the final legality layer for active pieces, rigid groups and landed
 * garbage.  Logical cells are bookkeeping; visible circle centres determine
 * contact.  Once garbage has contacted the board, special entry state is kept
 * only while genuinely off-lattice.  As soon as a continuous rest coincides
 * with a legal lattice centre it is canonicalised back into ordinary pile
 * physics, eliminating the old dual-authority rest/visual state.
 */
const HEX_CONTINUOUS_LEGAL_DIST=1-1e-7;
const HEX_CONTINUOUS_SWEEP_SAMPLES=48;
const HEX_CONTINUOUS_LATTICE_EPS=2e-5;

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
function hexContinuousResidualX(g){
    if(!g?.piece)return 0;
    const rendered=Number.isFinite(g.freeX)?g.freeX:
        (Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x);
    return rendered-g.piece.x;
}
function hexContinuousPieceFitsVisual(board,p){
    const g=board?._hexEngine;
    if(!g||g.state!=="PLAYING")return true;
    const residual=hexContinuousResidualX(g);
    const cells=pieceCells(p);
    for(const [x,y] of cells){
        const ax=latticeRealX(x+residual),ay=cellCenterYNorm(y);
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

/* One physical drop calculator for normal fall legality, shadow and hard drop.
 * Stop on the lattice anchor ABOVE contact and express the remaining descent as
 * a continuous fraction.  This is essential when the finger leaves the piece
 * between lattice columns: a logical target can be legal while the real centre
 * at fractional X would already intersect the pile.
 */
function hexActivePhysicalDropPose(g,piece=g?.piece){
    if(!g||!piece)return null;
    const residual=hexContinuousResidualX(g);
    let p={...piece};
    for(let guard=0;guard<ROWS+8;guard++){
        const cells=pieceCells(p);
        const frac=safeActiveFallOffset(g,cells,residual,0,2);
        if(frac<2-1e-7)return{piece:p,frac:Math.max(0,frac),dx:residual,cells};
        const next={...p,y:p.y+2};
        if(!__hexPieceFitsBeforeContinuousLegality(g.board,next))
            return{piece:p,frac:Math.min(2,Math.max(0,frac)),dx:residual,cells};
        p=next;
    }
    return{piece:p,frac:0,dx:residual,cells:pieceCells(p)};
}
landingShadowVisualCells=function(g){
    const pose=hexActivePhysicalDropPose(g);
    if(!pose)return null;
    return pose.cells.map(([x,y,c])=>[x+pose.dx,y+pose.frac,c]);
};
hardDrop=function(g){
    if(g.state!=="PLAYING"||!g.piece||g.hardDropAnim)return;
    const pose=hexActivePhysicalDropPose(g);if(!pose)return;
    armHardDropImpact(g,pose.piece,pose.dx,pose.frac);
    g.piece={...pose.piece};
    g.dropT=g.dropInterval*Math.max(0,Math.min(2,pose.frac))/2;
    emit(g,{t:"drop"});
    lock(g,5);
};

function hexContinuousProposalPoint(p,start,t){
    const seg={from:[start[0],start[1]],to:[p.tx,p.ty],pivot:p.pivot||null,topPivot:p.topPivot||null,kind:p.kind||""};
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
                if(hexPhysDist(x,y,o.x,o.y)<HEX_CONTINUOUS_LEGAL_DIST)
                    return{proposal:p,obstacle:o,t};
            }
        }
    }
    return null;
}

/* Continuous collision can constrain only one member of a triplet.  Do not
 * destroy all three constraints at the first hit.  Record the failed common
 * motion, let the full core planner finish trying other rigid continuations,
 * then retain the largest continuously-legal two-ball subset when one exists.
 */
const __hexPhysBundleSafeBeforeContinuousLegality=hexPhysBundleSafe;
hexPhysBundleSafe=function(bundle,board,accepted){
    if(!__hexPhysBundleSafeBeforeContinuousLegality(bundle,board,accepted))return false;
    const hit=hexContinuousBundleSweepCollision(board,bundle,accepted);
    if(!hit)return true;
    if(!board._hexContinuousHits)board._hexContinuousHits=new Map();
    const gid=bundle.find(p=>p.ball?.motionGroupId)?.ball?.motionGroupId||0;
    if(gid&&!board._hexContinuousSubsetProbe)board._hexContinuousHits.set(gid,hit);
    return false;
};
const __hexPhysPlanGroupBeforeContinuousSubsets=hexPhysPlanGroup;
function hexContinuousProbePair(board,pair){
    const fake=pair.map(m=>({...m,ball:{...m.ball,motionGroupSize:2,rigid:true}}));
    board._hexContinuousSubsetProbe=true;
    try{return __hexPhysPlanGroupBeforeContinuousSubsets(board,fake,true)||[];}
    finally{delete board._hexContinuousSubsetProbe;}
}
hexPhysPlanGroup=function(board,members,preview=false){
    const gid=members?.[0]?.ball?.motionGroupId||0;
    if(gid&&board._hexContinuousHits)board._hexContinuousHits.delete(gid);
    const full=__hexPhysPlanGroupBeforeContinuousSubsets(board,members,preview)||[];
    if(full.length||members.length!==3||!gid)return full;
    const hit=board._hexContinuousHits?.get(gid);if(!hit)return full;

    const hitId=hit?.proposal?.ball?.id||0,candidates=[];
    for(let omit=0;omit<3;omit++){
        const pair=members.filter((_,i)=>i!==omit),plan=hexContinuousProbePair(board,pair);
        if(plan.length)candidates.push({omit,pair,plan,detached:members[omit].ball.id});
    }
    if(!candidates.length){
        if(!preview)for(const m of members){
            hexPhysClearGroupBall(m.ball);m.ball.rigid=false;
            m.ball.visualTripletId=0;m.ball.visualTripletOrientation="";m.ball.visualTripletRole=-1;
            m.ball._hexContinuousConstraintBreak={obstacleId:hit?.obstacle?.id||0,t:Number(hit?.t)||0};
        }
        return[];
    }
    // Prefer detaching the member whose swept trajectory actually hit.  If more
    // than one pair is legal this makes the physical cause of the split stable.
    candidates.sort((a,b)=>(a.detached===hitId?-1:0)-(b.detached===hitId?-1:0)||a.detached-b.detached);
    const chosen=candidates[0];if(preview)return chosen.plan;
    const detached=members[chosen.omit];
    hexPhysClearGroupBall(detached.ball);detached.ball.rigid=false;
    detached.ball.visualTripletId=0;detached.ball.visualTripletOrientation="";detached.ball.visualTripletRole=-1;
    detached.ball._hexContinuousConstraintBreak={obstacleId:hit?.obstacle?.id||0,t:Number(hit?.t)||0};
    for(const m of chosen.pair){m.ball.motionGroupSize=2;m.ball.rigid=true;}
    return __hexPhysPlanGroupBeforeContinuousSubsets(board,chosen.pair,false)||[];
};

/* Landed garbage rest must not remain a second coordinate authority forever.
 * If the continuous rest is already a legal lattice centre, move the logical
 * reservation to that same centre and clear all special rest state BEFORE the
 * next settle pass plans motion.  This prevents backward bridge paths such as
 * [2,5] -> [1,4] and stale 0.5-cell rest/visual disagreements.
 */
function hexContinuousRestGridPoint(rest){
    if(!rest)return null;
    const x=rest.px/.5,y=(rest.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    const ix=Math.round(x),iy=Math.round(y);
    if(Math.abs(x-ix)>HEX_CONTINUOUS_LATTICE_EPS||Math.abs(y-iy)>HEX_CONTINUOUS_LATTICE_EPS)return null;
    if(!valid(ix,iy))return null;
    return{x:ix,y:iy,visualX:x,visualY:y};
}
function hexCanonicalizeContinuousRests(g){
    if(!g?.board)return 0;
    const moves=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,rest=ball?._hexGarbageContinuousRest;
        if(!ball||!rest||ball._hexGarbageRelax)continue;
        const p=hexContinuousRestGridPoint(rest);if(!p)continue;
        if((p.x!==x||p.y!==y)&&g.board[p.y][p.x]!==null)continue;
        moves.push({ball,fromX:x,fromY:y,...p});
    }
    // Do not move two logical reservations into the same target.
    const used=new Set();let n=0;
    for(const m of moves){const key=m.x+","+m.y;if(used.has(key))continue;used.add(key);
        if((m.x!==m.fromX||m.y!==m.fromY)&&g.board[m.fromY][m.fromX]===m.ball){
            g.board[m.fromY][m.fromX]=null;g.board[m.y][m.x]=m.ball;noteBoardCell(g.board,m.y,m.ball);
        }
        const v=g.vis.get(m.ball.id);if(v){v.x=m.visualX;v.y=m.visualY;v.vy=0;v.motionSpeed=0;}
        delete m.ball._hexGarbageContinuousRest;delete m.ball._hexGarbageGroupFinalized;delete m.ball._hexContinuousSettled;
        n++;
    }
    return n;
}
const __hexSettlePassBeforeRestCanonicalization=settlePass;
settlePass=function(board,...args){
    const g=board?._hexEngine;if(g)hexCanonicalizeContinuousRests(g);
    return __hexSettlePassBeforeRestCanonicalization(board,...args);
};

/* Off-lattice rests cannot be canonicalised immediately.  If a support change
 * has already created a logical path, never insert an upward bridge back to an
 * obsolete logical waypoint.  Drop already-passed upward waypoints and rebase
 * the first remaining segment on the current physical centre.
 */
hexGarbageBridgeContinuousRests=function(g){
    if(!g?.board)return 0;
    hexCanonicalizeContinuousRests(g);
    let bridged=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,rest=ball?._hexGarbageContinuousRest;
        if(!ball||!rest||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        const from=[rest.px/.5,(rest.py-BOARD_TOP_CENTER_N)/HEX_ROW_H];
        while(ball.fallPath.length){
            const s=ball.fallPath[0];
            if(s?.garbageContinuousHandoff){ball.fallPath.shift();continue;}
            if(s?.to&&s.to[1]<from[1]-HEX_CONTINUOUS_LATTICE_EPS){ball.fallPath.shift();continue;}
            break;
        }
        const seg=ball.fallPath[0];
        if(seg?.to){
            seg.from=[...from];
            if(seg.pivot&&Math.abs(hexPhysDist(from[0],from[1],seg.pivot[0],seg.pivot[1])-1)>.03){seg.pivot=null;seg.topPivot=null;seg.followSupportIds=[];seg.movingSupportId=0;}
            if(seg.pileFlow){
                const state={vy:Math.max(0,v.vy||0),speed:Math.max(0,v.motionSpeed||0)};
                const duration=Math.max(1/120,pileFlowNominalDuration(seg,state));
                seg.pileFlowStart=Math.max(Number(g.pileFlowClock)||0,0);
                seg.pileFlowDuration=duration;seg.pileFlowEnd=seg.pileFlowStart+duration;
            }
        }
        delete ball._hexGarbageContinuousRest;delete ball._hexGarbageGroupFinalized;delete ball._hexContinuousSettled;
        bridged++;
    }
    return bridged;
};

/* The final externally visible boundary must agree with continuous rest data.
 * Earlier layers may snap a rest ball toward its logical reservation after the
 * rest solver has run.  Reassert the physical rest at the end of the complete
 * transaction, then let the final non-overlap solver update that rest if a real
 * contact requires movement.
 */
function hexReassertOffGridContinuousRests(g){
    if(!g?.board)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,rest=ball?._hexGarbageContinuousRest,v=ball&&g.vis.get(ball.id);
        if(!ball||!rest||!v||ball._hexGarbageRelax||ball.fallPath?.length)continue;
        v.x=rest.px/.5;v.y=(rest.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;v.vy=0;v.motionSpeed=0;
    }
}
const __hexStepEngineBeforeContinuousAuthority=stepEngine;
stepEngine=function(g,dt){
    const result=__hexStepEngineBeforeContinuousAuthority(g,dt);
    hexCanonicalizeContinuousRests(g);
    hexReassertOffGridContinuousRests(g);
    if(typeof hexEnforceFinalVisualNonOverlap==="function")hexEnforceFinalVisualNonOverlap(g);
    hexCanonicalizeContinuousRests(g);
    return result;
};
