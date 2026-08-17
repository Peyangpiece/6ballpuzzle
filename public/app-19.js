/* Gridified garbage segment-boundary precision.
 *
 * A garbage ball can finish one lattice segment a few ten-thousandths of a
 * grid row above the exact start of its next segment. The following garbage
 * ball is legitimately waiting tangent to that exact start, so carrying the
 * tiny upstream error into the next segment creates a visible/validated
 * overlap even though the logical path is correct.
 *
 * Normalize only the instant before a downward segment begins: the rendered
 * centre must already be within 0.001 physical units of seg.from and must not
 * have moved below that start. Once the ball has begun the segment (y > sy),
 * this wrapper never changes its trajectory or speed.
 */
const HEX_GARBAGE_SEGMENT_START_EPS=0.001;
const __hexUpdateVisualsBeforeGarbageStartPrecision=updateVisuals;

updateVisuals=function(g,dt){
    __hexUpdateVisualsBeforeGarbageStartPrecision(g,dt);
    if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE"||!g.board||!g.vis)return;

    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell?.isGarbage||!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
        const seg=cell.fallPath[0];
        if(!seg?.from||!seg?.to||seg.pileFlow)continue;
        const v=g.vis.get(cell.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;

        const [sx,sy]=seg.from;
        if(v.y>sy+1e-9)continue;
        const d=pileFlowPhysicalDist([v.x,v.y],[sx,sy]);
        if(d>HEX_GARBAGE_SEGMENT_START_EPS)continue;

        v.x=sx;
        v.y=sy;
    }
};
