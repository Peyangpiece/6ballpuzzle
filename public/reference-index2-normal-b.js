/* index-2 exact normal motion B: copied verbatim from user-provided index-2.html */
function visualPointSafe(g, id, x, y, minDist = 0.999999) {
    const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    if (y > maxVisualRowY + 1e-7) return false;

    for (const [oid, ov] of g.vis.entries()) {
        if (oid === id || !ov) continue;

        if(g._liveBatchIds?.has(id)&&g._liveBatchIds?.has(oid))continue;

        const pivot = g._visualArcPivotById && g._visualArcPivotById.get(id);
        if (pivot) {
            const pdx = (ov.x - pivot[0]) * 0.5;
            const pdy = (ov.y - pivot[1]) * HEX_ROW_H;
            // This obstacle is the exact support around which the ball is being
            // placed on a radius-1 circle. The arc math itself enforces contact;
            // a straight chord sweep would falsely report penetration.
            if (pdx*pdx + pdy*pdy <= 1e-10) continue;
        }

        const dx=(x-ov.x)*0.5;
        const dy=(y-ov.y)*HEX_ROW_H;
        if (dx*dx+dy*dy < minDist*minDist) return false;
    }
    return true;
}

function visualSegmentSafe(g,id,ox,oy,nx,ny,minDist=0.999999){
    // Continuous/swept test. 24 samples per rendered step is conservative for
    // the very short fixed-step movements used here.
    for(let i=1;i<=24;i++){
        const t=i/24;
        const x=ox+(nx-ox)*t;
        const y=oy+(ny-oy)*t;
        if(!visualPointSafe(g,id,x,y,minDist))return false;
    }
    return true;
}

function clampVisualSegment(g, id, ox, oy, nx, ny) {
    if (visualSegmentSafe(g,id,ox,oy,nx,ny)) return [nx,ny,1];

    // Binary-search the largest safe fraction of THIS frame's movement.
    let lo=0,hi=1;
    for(let i=0;i<18;i++){
        const m=(lo+hi)*0.5;
        const x=ox+(nx-ox)*m;
        const y=oy+(ny-oy)*m;
        if(visualSegmentSafe(g,id,ox,oy,x,y))lo=m;
        else hi=m;
    }

    if(lo>1e-5){
        return [ox+(nx-ox)*lo,oy+(ny-oy)*lo,lo];
    }

    // If already touching, do not teleport through the other ball.
    // Stay exactly where it was and retry next fixed-step after the blocker moves.
    return [ox,oy,0];
}

/* index-2 stepEngine used exactly 16 visual integrations per frame.
   Keep that cadence whenever a non-garbage ball is moving. */
const __hexIndex2PrevVisualSubsteps =
    typeof visualSubstepCount==="function" ? visualSubstepCount : null;
visualSubstepCount=function(g){
    let normalMoving=false;
    for(let y=0;y<ROWS&&!normalMoving;y++)for(let x=0;x<W2;x++){
        const c=valid(x,y)?g.board[y][x]:null;
        if(!c||c.isGarbage)continue;
        const v=g.vis.get(c.id);
        const hasPath=Array.isArray(c.fallPath)&&c.fallPath.length>0;
        const inTransit=!!v&&(Math.abs(v.x-x)>0.015||Math.abs(v.y-y)>0.015);
        if(hasPath||inTransit){normalMoving=true;break;}
    }
    if(normalMoving)return 16;
    return typeof __hexIndex2PrevVisualSubsteps==="function"
        ? Math.max(1,__hexIndex2PrevVisualSubsteps(g))
        : 1;
};
