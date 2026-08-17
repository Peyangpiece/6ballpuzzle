/* Final render-boundary no-overlap invariant.
 *
 * app-48 keeps settled garbage at exact continuous centres. Restoring those
 * fixed centres after legacy contact resolution can re-introduce a tiny
 * penetration, and pushing one follower away can in turn put it into its next
 * neighbour. Solve the whole visible pile as one contact set at the final
 * render boundary instead of fixing only rest-vs-moving pairs.
 *
 * Continuous-rest members have zero mobility here. A ball that still has a
 * path, is in the visual moving set, or is measurably away from its logical
 * centre is mobile. When two mobile balls overlap they share the minimum
 * correction; when only one is mobile it takes the whole correction. This keeps
 * already-settled lattice balls fixed and removes penetration without snapping
 * continuous-rest supports back to grid cells.
 */
const HEX_RENDER_MIN_DIST = 1.000001;
const HEX_RENDER_CONTACT_PASSES = 32;
const HEX_RENDER_OFFGRID_EPS = 1e-7;

function hexRenderBoardVisuals(g){
    const out=[];
    if(!g?.board)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const v=ball&&g.vis.get(ball.id);
        if(!ball||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        out.push({ball,v,x,y});
    }
    return out;
}

function hexRenderMobility(g,q){
    if(q.ball?._hexGarbageContinuousRest)return 0;
    if(Array.isArray(q.ball?.fallPath)&&q.ball.fallPath.length)return 1;
    if(g._visualMovingIds?.has(q.ball.id))return 1;
    const off=Math.hypot((q.v.x-q.x)*0.5,(q.v.y-q.y)*HEX_ROW_H);
    return off>HEX_RENDER_OFFGRID_EPS?1:0;
}

function hexRenderPairNormal(a,b){
    let dx=(b.v.x-a.v.x)*0.5,dy=(b.v.y-a.v.y)*HEX_ROW_H,d=Math.hypot(dx,dy);
    if(d>1e-10)return{nx:dx/d,ny:dy/d,d};
    dx=(b.x-a.x)*0.5;dy=(b.y-a.y)*HEX_ROW_H;d=Math.hypot(dx,dy);
    if(d<=1e-10){dx=1;dy=0;d=1;}
    return{nx:dx/d,ny:dy/d,d:0};
}

function hexRenderClampBoard(q){
    const floorY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    q.v.x=Math.max(0,Math.min(W2-1,q.v.x));
    q.v.y=Math.min(floorY,q.v.y);
}

function hexRenderMoveAlongNormal(q,nx,ny,amount,sign){
    if(amount<=0)return;
    q.v.x+=sign*nx*amount/0.5;
    q.v.y+=sign*ny*amount/HEX_ROW_H;
    hexRenderClampBoard(q);
    if(!Array.isArray(q.ball.fallPath)||!q.ball.fallPath.length){
        q.v.vy=0;q.v.motionSpeed=0;
    }
}

function hexEnforceFinalVisualNonOverlap(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2)return 0;
    let corrections=0;
    for(let pass=0;pass<HEX_RENDER_CONTACT_PASSES;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j],n=hexRenderPairNormal(a,b);
            if(n.d>=HEX_RENDER_MIN_DIST-1e-10)continue;
            let ma=hexRenderMobility(g,a),mb=hexRenderMobility(g,b);
            if(ma<=0&&mb<=0){
                // Two exact continuous-rest supports are intentionally fixed.
                // Any overlap here is a real upstream invariant violation and
                // must remain visible to regression tests rather than be hidden.
                if(a.ball?._hexGarbageContinuousRest&&b.ball?._hexGarbageContinuousRest)continue;
                // Exact logical lattice centres cannot overlap on a valid board;
                // for round-off-only cases split the minimal correction.
                ma=mb=1;
            }
            const total=ma+mb;if(total<=0)continue;
            const push=HEX_RENDER_MIN_DIST-n.d;
            hexRenderMoveAlongNormal(a,n.nx,n.ny,push*(ma/total),-1);
            hexRenderMoveAlongNormal(b,n.nx,n.ny,push*(mb/total),+1);
            changed=true;corrections++;
        }
        if(!changed)break;
    }
    return corrections;
}

const __hexGarbageApplyContinuousRestsBeforeFinalContact=hexGarbageApplyContinuousRests;
hexGarbageApplyContinuousRests=function(g){
    const result=__hexGarbageApplyContinuousRestsBeforeFinalContact(g);
    hexEnforceFinalVisualNonOverlap(g);
    return result;
};
