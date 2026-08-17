/* Exact rendered rotation collision validation.
 *
 * app-07 used a fixed maximum future fall offset for the whole 0.10 s turn.
 * That made legal rotations look as if they were already at their lowest
 * future Y on frame zero, so ordinary turns near the pile were rejected.
 *
 * Sample the same time-varying pose that the renderer displays instead:
 * continuous X, logical row transitions, contact-clock clamping, landing
 * alignment, and the 60-degree turn.
 */
function hexRotationRenderedSweepSafe(g,fromPiece,toPiece,dir){
    if(!g||!fromPiece||!toPiece)return false;
    if(centroidOf(toPiece)[1]<centroidOf(fromPiece)[1]-1e-9)return false;

    const H=HEX_ROW_H;
    const right=latticeRealX(W2-1);
    const before=centroidOf(fromPiece),after=centroidOf(toPiece);
    const basePieceVX=Number.isFinite(g.pieceVX)?g.pieceVX:fromPiece.x;
    const startDropT=Math.max(0,g.dropT||0);
    const scale=g.fastForward?FAST_DROP_MULTIPLIER:1;
    const iv=Math.max(1e-9,g.dropInterval||DROP_INTERVAL);
    const boardBalls=[];

    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;
        const v=g.vis?.get?.(ball.id);
        boardBalls.push(
            v&&Number.isFinite(v.x)&&Number.isFinite(v.y)
                ? [latticeRealX(v.x),cellCenterYNorm(v.y)]
                : normPoint(x,y)
        );
    }

    for(let i=0;i<=64;i++){
        const p=i/64;
        const elapsed=p*ROTATE_VISUAL_TIME;
        const simPiece={...toPiece};
        let dropClock=startDropT+elapsed*scale;

        // stepEngine advances a complete logical row only after the normal
        // drop clock crosses one interval and the next row is actually free.
        while(dropClock>=iv&&pieceFits(g.board,{...simPiece,y:simPiece.y+2})){
            dropClock-=iv;
            simPiece.y+=2;
        }

        let pieceVX;
        if(g.freeX!=null){
            pieceVX=g.freeX;
        }else{
            const delta=simPiece.x-basePieceVX;
            pieceVX=basePieceVX+Math.sign(delta||0)*Math.min(Math.abs(delta),PIECE_SNAP_SPEED*elapsed);
        }

        const dxGrid=pieceVX-simPiece.x;
        const cells=pieceCells(simPiece);
        const fullDOff=dispOff(simPiece.rot);
        let effectiveDropClock=dropClock;
        let align=1;
        const blocked=!pieceFits(g.board,{...simPiece,y:simPiece.y+2});

        if(blocked){
            // This is intentionally identical to the PLAYING contact gate in
            // stepEngine: lockT remains zero until dropT reaches contactClock.
            const contactFrac=safeActiveFallOffset(g,cells,dxGrid,fullDOff,2);
            const contactClock=iv*Math.max(0,Math.min(2,contactFrac))/2;
            if(dropClock+1e-10>=contactClock){
                const excessClock=Math.max(0,dropClock-contactClock);
                effectiveDropClock=contactClock;
                const predictedLock=excessClock/Math.max(1e-9,scale);
                align=Math.max(0,1-Math.min(1,predictedLock/LANDING_ALIGN_DURATION));
            }
        }

        const dOff=fullDOff*align;
        const desiredFrac=Math.max(0,Math.min(.999999,effectiveDropClock/iv)*2);
        const frac=safeActiveFallOffset(g,cells,dxGrid,dOff,desiredFrac);

        const pts=cells.map(([x,y])=>[
            latticeRealX(x+dxGrid),
            cellCenterYNorm(y+frac+dOff)
        ]);
        const gx=(pts[0][0]+pts[1][0]+pts[2][0])/3;
        const gy=(pts[0][1]+pts[1][1]+pts[2][1])/3;
        const k=1-smoothRotationT(p);
        const ang=-k*(dir>0?1:-1)*(TAU/6);
        const ca=Math.cos(ang),sa=Math.sin(ang);
        const ox=k*(before[0]-after[0])*.5;
        const oy=k*(before[1]-after[1])*H;

        for(const [px0,py0] of pts){
            const ax=px0-gx,ay=py0-gy;
            const px=gx+ax*ca-ay*sa+ox;
            const py=gy+ax*sa+ay*ca+oy;
            if(px<-1e-8||px>right+1e-8||py>FLOOR_CENTER_N+1e-8)return false;
            for(const [bx,by] of boardBalls){
                if(Math.hypot(px-bx,py-by)<0.999999-1e-8)return false;
            }
        }
    }
    return true;
}

rotate=function(g,dir){
    if(g.state!=="PLAYING"||!g.piece)return false;
    const nr=(g.piece.rot+(dir>0?1:5))%6;
    const from={...g.piece};
    const before=centroidOf(from);

    for(const[kx,ky]of KICKS){
        const q={...from,rot:nr,x:from.x+kx,y:from.y+ky};
        if(!pieceFits(g.board,q))continue;
        if(!rotationSweepSafe(g.board,from,q,dir))continue;
        if(!hexRotationRenderedSweepSafe(g,from,q,dir))continue;

        const after=centroidOf(q);
        g.piece=q;
        g.rotAnim={p:0,dir:dir>0?1:-1,dx:before[0]-after[0],dy:before[1]-after[1]};
        emit(g,{t:"rotate"});
        if(g.lockT>0&&g.lockResets<12){g.lockT=0;g.lockResets++;}
        return true;
    }
    return false;
};

/* Pile-flow endpoint precision.
 *
 * Contact arcs can finish a few millionths inside an exact hex tangent because
 * a moving-support circle projection is evaluated with floating-point trig.
 * The logical path endpoints are exact lattice contacts. When the analytic
 * result is already indistinguishably close to one of those endpoints, snap to
 * that exact point. This changes no visible trajectory and prevents a nominal
 * diameter-1 contact from becoming 0.999998... in the long overlap invariant.
 */
function hexSnapPileFlowEndpoint(seg,point,oldY){
    if(!seg||!point)return point;
    for(const ep of [seg.from,seg.to]){
        if(!Array.isArray(ep)||ep.length<2)continue;
        if(ep[1]<oldY-1e-9)continue; // pile visuals never move upward
        if(pileFlowPhysicalDist(point,ep)<=1e-5)return[ep[0],ep[1]];
    }
    return point;
}

updateScheduledPileFlowVisual=function(g,cell,v,dt){
    const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
    if(!path||!path.length)return false;
    while(path.length&&path[0]?.pileFlow&&Number.isFinite(path[0].pileFlowEnd)&&g.pileFlowClock>=path[0].pileFlowEnd-1e-10){
        v.x=path[0].to[0];v.y=path[0].to[1];path.shift();
    }
    if(!path.length){delete cell.fallPath;v.pileFlow=false;v.vy=0;v.motionSpeed=0;return true;}
    const seg=path[0];
    if(!seg?.pileFlow)return false;
    const oldX=v.x,oldY=v.y;
    if(g.pileFlowClock<seg.pileFlowStart){
        const held=hexSnapPileFlowEndpoint(seg,[v.x,v.y],oldY);
        v.x=held[0];
        v.y=Math.max(oldY,held[1]);
        if(v.x!==oldX||v.y!==oldY){v.vy=0;v.motionSpeed=0;}
        return true;
    }
    const q=(g.pileFlowClock-seg.pileFlowStart)/Math.max(1e-9,seg.pileFlowDuration);
    let point=pileFlowPointForBall(g,cell,seg,q,g.pileFlowClock);
    point=hexSnapPileFlowEndpoint(seg,point,oldY);
    v.x=point[0];
    v.y=Math.max(oldY,point[1]);
    const physicalSpeed=Math.hypot((v.x-oldX)*0.5,(v.y-oldY)*HEX_ROW_H)/Math.max(1e-9,dt);
    v.motionSpeed=physicalSpeed;
    v.vy=Math.max(0,(v.y-oldY)/Math.max(1e-9,dt));
    return true;
};

// resolveVisualContacts can make a microscopic secondary correction after a
// pile-flow ball has already been placed on an exact lattice tangent. Restore
// that exact endpoint only when it is still collision-free against every other
// rendered board ball. This is a precision cleanup, never a collision bypass.
const __hexResolveVisualContactsBeforeEndpointStabilize=resolveVisualContacts;
function hexPileEndpointSafeNow(g,cell,ep){
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const other=valid(x,y)?g.board[y][x]:null;
        if(!other||other===cell)continue;
        const ov=g.vis.get(other.id);
        const op=ov&&Number.isFinite(ov.x)&&Number.isFinite(ov.y)?[ov.x,ov.y]:[x,y];
        if(pileFlowPhysicalDist(ep,op)<0.9999999)return false;
    }
    return true;
}
resolveVisualContacts=function(g){
    __hexResolveVisualContactsBeforeEndpointStabilize(g);
    if(!g?.board||!g?.vis)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        const seg=cell&&Array.isArray(cell.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;
        if(!cell||!seg?.pileFlow)continue;
        const v=g.vis.get(cell.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        const candidates=[seg.from,seg.to]
            .filter(ep=>Array.isArray(ep)&&ep.length>=2&&ep[1]>=v.y-1e-8)
            .map(ep=>({ep,d:pileFlowPhysicalDist([v.x,v.y],ep)}))
            .filter(q=>q.d<=2e-5)
            .sort((a,b)=>a.d-b.d);
        for(const {ep} of candidates){
            if(!hexPileEndpointSafeNow(g,cell,ep))continue;
            v.x=ep[0];
            v.y=ep[1];
            if(g.pileFlowClock<seg.pileFlowStart){v.vy=0;v.motionSpeed=0;}
            break;
        }
    }
};
