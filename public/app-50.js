/* Final render-boundary constraint for continuous-rest garbage.
 *
 * app-48 preserves a settled garbage ball at its exact continuous centre. The
 * legacy contact resolver may temporarily move that fixed support while solving
 * a collision and app-48 then restores the support afterwards. Restoring it can
 * put the moving/following ball a few thousandths (or, inside a frame, much
 * more) back inside the fixed circle. That is the remaining visible
 * pass-through case.
 *
 * Continuous-rest members are unilateral supports: never move them here. After
 * every authoritative rest restore, project only the other board balls out of
 * those fixed circles. This is the same contact constraint as a ball rolling on
 * an immovable support and therefore does not introduce lattice snapping.
 */
const HEX_CONTINUOUS_REST_RENDER_MIN_DIST = 1.000001;
const HEX_CONTINUOUS_REST_RENDER_PASSES = 24;

function hexContinuousRestFixedVisuals(g){
    const out=[];
    if(!g?.board)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const v=ball&&g.vis.get(ball.id);
        if(ball?._hexGarbageContinuousRest&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y)){
            out.push({ball,v,x,y});
        }
    }
    return out;
}

function hexContinuousRestMovingVisuals(g,fixedIds){
    const out=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const v=ball&&g.vis.get(ball.id);
        if(!ball||!v||fixedIds.has(ball.id)||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        out.push({ball,v,x,y});
    }
    return out;
}

function hexContinuousRestFallbackNormal(m,s){
    // Use logical ordering only for the degenerate coincident-centre case.
    // Physical centres decide every ordinary contact direction.
    let dx=(m.x-s.x)*0.5,dy=(m.y-s.y)*HEX_ROW_H,d=Math.hypot(dx,dy);
    if(d>1e-10)return{nx:dx/d,ny:dy/d,d};
    dx=(m.logicalX-s.logicalX)*0.5;dy=(m.logicalY-s.logicalY)*HEX_ROW_H;d=Math.hypot(dx,dy);
    if(d<=1e-10){dx=0;dy=-1;d=1;}
    return{nx:dx/d,ny:dy/d,d:0};
}

function hexContinuousRestProjectMoving(g){
    const fixed=hexContinuousRestFixedVisuals(g);
    if(!fixed.length)return 0;
    const fixedIds=new Set(fixed.map(q=>q.ball.id));
    const moving=hexContinuousRestMovingVisuals(g,fixedIds);
    const floorY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    let corrections=0;

    for(let pass=0;pass<HEX_CONTINUOUS_REST_RENDER_PASSES;pass++){
        let changed=false;
        for(const m of moving){
            for(const s of fixed){
                const dx=(m.v.x-s.v.x)*0.5,dy=(m.v.y-s.v.y)*HEX_ROW_H;
                const d=Math.hypot(dx,dy);
                if(d>=HEX_CONTINUOUS_REST_RENDER_MIN_DIST-1e-10)continue;
                const n=hexContinuousRestFallbackNormal(
                    {x:m.v.x,y:m.v.y,logicalX:m.x,logicalY:m.y},
                    {x:s.v.x,y:s.v.y,logicalX:s.x,logicalY:s.y}
                );
                const push=HEX_CONTINUOUS_REST_RENDER_MIN_DIST-d;
                m.v.x+=n.nx*push/0.5;
                m.v.y+=n.ny*push/HEX_ROW_H;
                // Ball centres cannot leave the playable circle bounds.
                m.v.x=Math.max(0,Math.min(W2-1,m.v.x));
                m.v.y=Math.min(floorY,m.v.y);
                if(!Array.isArray(m.ball.fallPath)||!m.ball.fallPath.length){
                    m.v.vy=0;m.v.motionSpeed=0;
                }else if(n.ny<0&&Number.isFinite(m.v.vy)){
                    // A support below the moving ball removes only the velocity
                    // component driving farther into that support.
                    m.v.vy=Math.max(0,m.v.vy);
                }
                changed=true;corrections++;
            }
        }
        if(!changed)break;
    }
    return corrections;
}

const __hexGarbageApplyContinuousRestsBeforeFinalContact=hexGarbageApplyContinuousRests;
hexGarbageApplyContinuousRests=function(g){
    const result=__hexGarbageApplyContinuousRestsBeforeFinalContact(g);
    hexContinuousRestProjectMoving(g);
    return result;
};
