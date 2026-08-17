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

/*
 * Final numerical contact cleanup for resolved pile balls.
 *
 * The main contact solver already handles real collisions. In long clear/settle
 * chains it can leave a residual penetration of only a few 1e-6 because many
 * tangent constraints are solved sequentially. Do not snap the chain back to
 * lattice points and do not touch real overlaps. Only pairs already within
 * 0.9999..1.0 are projected apart by the missing numerical epsilon, and only
 * quiescent normal balls are allowed to absorb that correction.
 */
const HEX_RESIDUAL_CONTACT_MIN=1.00000005;
const HEX_RESIDUAL_CONTACT_FLOOR=0.9999;
const HEX_RESIDUAL_CONTACT_MAX_CORRECTION=2e-4;

function hexResidualContactMovable(item){
    if(!item?.cell||item.cell.isGarbage||!item.v)return false;
    const speed=Math.max(Math.abs(item.v.vy||0),Math.abs(item.v.motionSpeed||0));
    return speed<=1e-2;
}

function hexResolveResidualPrecisionOverlaps(g){
    if(!g||g.state!=="RESOLVING"||!g.board||!g.vis)return;
    const H=HEX_ROW_H;
    const floorMax=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;
    const items=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell)continue;
        const v=g.vis.get(cell.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        items.push({cell,v,x,y});
    }
    if(items.length<2)return;

    for(let pass=0;pass<48;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            let dx=(a.v.x-b.v.x)*.5;
            let dy=(a.v.y-b.v.y)*H;
            let d=Math.hypot(dx,dy);
            if(d>=HEX_RESIDUAL_CONTACT_MIN-1e-12||d<HEX_RESIDUAL_CONTACT_FLOOR)continue;

            const ma=hexResidualContactMovable(a),mb=hexResidualContactMovable(b);
            if(!ma&&!mb)continue;
            if(d<1e-12)continue;

            const missing=HEX_RESIDUAL_CONTACT_MIN-d;
            if(missing>HEX_RESIDUAL_CONTACT_MAX_CORRECTION)continue;
            const nx=dx/d,ny=dy/d;
            const wa=ma?(mb?.5:1):0;
            const wb=mb?(ma?.5:1):0;

            if(wa){
                a.v.x=Math.max(0,Math.min(W2-1,a.v.x+(nx*missing*wa)/.5));
                a.v.y=Math.min(floorMax,a.v.y+(ny*missing*wa)/H);
            }
            if(wb){
                b.v.x=Math.max(0,Math.min(W2-1,b.v.x-(nx*missing*wb)/.5));
                b.v.y=Math.min(floorMax,b.v.y-(ny*missing*wb)/H);
            }
            changed=true;
        }
        if(!changed)break;
    }
}

const __hexResolveVisualContactsBeforeResidualPrecision=resolveVisualContacts;
resolveVisualContacts=function(g){
    __hexResolveVisualContactsBeforeResidualPrecision(g);
    hexResolveResidualPrecisionOverlaps(g);
};
