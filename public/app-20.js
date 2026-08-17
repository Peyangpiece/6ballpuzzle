/* Wall-edge rotation sweep compatibility.
 *
 * The logical piece is always required to finish fully inside the board.
 * During the 0.10 s visual turn, however, an equilateral triplet whose outer
 * centre is exactly on a wall can sweep a few hundredths of a ball radius past
 * that wall before the kick translation finishes. Rejecting that harmless
 * transient centre excursion made rotations fail specifically at the walls.
 *
 * Keep the full board-ball/floor sweep, but allow only a tiny visual wall pad.
 * Final placement is still protected by pieceFits().
 */
const HEX_ROTATION_WALL_VISUAL_PAD=0.125;

function hexRotationRenderedSweepSafeWall(g,fromPiece,toPiece,dir){
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
        boardBalls.push(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)
            ?[latticeRealX(v.x),cellCenterYNorm(v.y)]
            :normPoint(x,y));
    }

    for(let i=0;i<=64;i++){
        const p=i/64,elapsed=p*ROTATE_VISUAL_TIME;
        const simPiece={...toPiece};
        let dropClock=startDropT+elapsed*scale;
        while(dropClock>=iv&&pieceFits(g.board,{...simPiece,y:simPiece.y+2})){
            dropClock-=iv;simPiece.y+=2;
        }

        let pieceVX;
        if(g.freeX!=null)pieceVX=g.freeX;
        else{
            const delta=simPiece.x-basePieceVX;
            pieceVX=basePieceVX+Math.sign(delta||0)*Math.min(Math.abs(delta),PIECE_SNAP_SPEED*elapsed);
        }

        const dxGrid=pieceVX-simPiece.x,cells=pieceCells(simPiece),fullDOff=dispOff(simPiece.rot);
        let effectiveDropClock=dropClock,align=1;
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
        const pts=cells.map(([x,y])=>[latticeRealX(x+dxGrid),cellCenterYNorm(y+frac+dOff)]);
        const gx=(pts[0][0]+pts[1][0]+pts[2][0])/3,gy=(pts[0][1]+pts[1][1]+pts[2][1])/3;
        const k=1-smoothRotationT(p),ang=-k*(dir>0?1:-1)*(TAU/6),ca=Math.cos(ang),sa=Math.sin(ang);
        const ox=k*(before[0]-after[0])*.5,oy=k*(before[1]-after[1])*H;

        for(const[px0,py0]of pts){
            const ax=px0-gx,ay=py0-gy;
            const px=gx+ax*ca-ay*sa+ox,py=gy+ax*sa+ay*ca+oy;
            if(px<-HEX_ROTATION_WALL_VISUAL_PAD||px>right+HEX_ROTATION_WALL_VISUAL_PAD||py>FLOOR_CENTER_N+1e-8)return false;
            for(const[bx,by]of boardBalls)if(Math.hypot(px-bx,py-by)<0.999999-1e-8)return false;
        }
    }
    return true;
}

rotate=function(g,dir){
    if(g.state!=="PLAYING"||!g.piece)return false;
    const nr=(g.piece.rot+(dir>0?1:5))%6,from={...g.piece},before=centroidOf(from);
    for(const[kx,ky]of KICKS){
        const q={...from,rot:nr,x:from.x+kx,y:from.y+ky};
        if(!pieceFits(g.board,q))continue;
        if(!hexRotationRenderedSweepSafeWall(g,from,q,dir))continue;
        const after=centroidOf(q);
        g.piece=q;
        g.rotAnim={p:0,dir:dir>0?1:-1,dx:before[0]-after[0],dy:before[1]-after[1]};
        emit(g,{t:"rotate"});
        if(g.lockT>0&&g.lockResets<12){g.lockT=0;g.lockResets++;}
        return true;
    }
    return false;
};
