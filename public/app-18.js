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

/* Pile-flow endpoint precision. */
function hexSnapPileFlowEndpoint(seg,point,oldY){
    if(!seg||!point)return point;
    for(const ep of [seg.from,seg.to]){
        if(!Array.isArray(ep)||ep.length<2)continue;
        if(ep[1]<oldY-1e-9)continue;
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

/*
 * Contact-network precision normalization.
 *
 * Every pile-flow ball whose first segment has not started yet is physically
 * waiting at seg.from. The contact solver may nudge a connected chain by tiny
 * amounts while solving neighbouring tangencies; if only one member is snapped
 * back, that neighbour's tiny offset makes the correction look unsafe and the
 * error cascades through the chain. Treat the waiting starts as one target
 * network and validate/apply them together.
 */
const HEX_QUIESCENT_SNAP_EPS=5e-4;
const HEX_QUIESCENT_WAIT_SANITY=1e-2;
const HEX_QUIESCENT_SAFE_DIST=0.9999999;

function hexQuiescentPileTarget(g,cell,x,y,v){
    if(!cell||cell.isGarbage||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return null;
    const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
    const seg=path&&path.length?path[0]:null;
    const speed=Math.max(Math.abs(v.vy||0),Math.abs(v.motionSpeed||0));
    const waiting=!!seg?.pileFlow&&Number.isFinite(seg.pileFlowStart)&&g.pileFlowClock<seg.pileFlowStart-1e-10;

    if(waiting&&Array.isArray(seg.from)&&seg.from.length>=2){
        const d=pileFlowPhysicalDist([v.x,v.y],seg.from);
        if(d<=HEX_QUIESCENT_WAIT_SANITY)return[seg.from[0],seg.from[1]];
        return null;
    }
    if(speed>1e-3)return null;

    const choices=[];
    if(seg?.pileFlow){
        for(const ep of [seg.from,seg.to]){
            if(!Array.isArray(ep)||ep.length<2)continue;
            const d=pileFlowPhysicalDist([v.x,v.y],ep);
            if(d<=HEX_QUIESCENT_SNAP_EPS)choices.push({target:[ep[0],ep[1]],d});
        }
    }else if(!path||!path.length){
        const d=pileFlowPhysicalDist([v.x,v.y],[x,y]);
        if(d<=HEX_QUIESCENT_SNAP_EPS)choices.push({target:[x,y],d});
    }
    if(!choices.length)return null;
    choices.sort((a,b)=>a.d-b.d);
    return choices[0].target;
}

function hexRenderedBoardEntries(g){
    const out=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell)continue;
        const v=g.vis.get(cell.id);
        const current=v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?[v.x,v.y]:[x,y];
        out.push({cell,v,x,y,current});
    }
    return out;
}

function hexNormalizeQuiescentPileNetwork(g){
    if(!g?.board||!g?.vis)return;
    const entries=hexRenderedBoardEntries(g);
    const byId=new Map(entries.map(e=>[e.cell.id,e]));
    const targets=new Map();

    for(const e of entries){
        const target=hexQuiescentPileTarget(g,e.cell,e.x,e.y,e.v);
        if(target)targets.set(e.cell.id,target);
    }
    if(!targets.size)return;

    const active=new Set(targets.keys());
    let changed=true;
    while(changed&&active.size){
        changed=false;
        const remove=[];
        for(const id of active){
            const a=byId.get(id),ap=targets.get(id);
            if(!a||!ap){remove.push(id);continue;}
            for(const b of entries){
                if(b.cell.id===id)continue;
                const bp=active.has(b.cell.id)?targets.get(b.cell.id):b.current;
                if(!bp)continue;
                if(pileFlowPhysicalDist(ap,bp)<HEX_QUIESCENT_SAFE_DIST){
                    remove.push(id);
                    break;
                }
            }
        }
        if(remove.length){
            changed=true;
            for(const id of remove)active.delete(id);
        }
    }

    for(const id of active){
        const e=byId.get(id),target=targets.get(id);
        if(!e?.v||!target)continue;
        e.v.x=target[0];
        e.v.y=target[1];
        const seg=Array.isArray(e.cell.fallPath)&&e.cell.fallPath.length?e.cell.fallPath[0]:null;
        if(!seg||g.pileFlowClock<seg.pileFlowStart){e.v.vy=0;e.v.motionSpeed=0;}
    }
}

const __hexResolveVisualContactsBeforeEndpointStabilize=resolveVisualContacts;
function hexPileEndpointSafeNow(g,cell,ep){
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const other=valid(x,y)?g.board[y][x]:null;
        if(!other||other===cell)continue;
        const ov=g.vis.get(other.id);
        const op=ov&&Number.isFinite(ov.x)&&Number.isFinite(ov.y)?[ov.x,ov.y]:[x,y];
        if(pileFlowPhysicalDist(ep,op)<HEX_QUIESCENT_SAFE_DIST)return false;
    }
    return true;
}
resolveVisualContacts=function(g){
    __hexResolveVisualContactsBeforeEndpointStabilize(g);
    hexNormalizeQuiescentPileNetwork(g);
};
