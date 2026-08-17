/* Layer-aware parallel support-chain coherence.
 *
 * A garbage-affected support tree must be synchronized laterally, not collapsed
 * vertically onto one representative. Include the segment's start row and the
 * RELATIVE pivot/topPivot geometry in the parallel-wave signature. Members on
 * the same layer with translated-equivalent supports/arcs phase-lock together;
 * parent/child layers remain separate and therefore keep their unit-distance
 * contact constraints.
 */
hexGarbageParallelWaveKey=function(seg){
    if(!seg?.pileFlow||!seg.from||!seg.to)return null;
    if(!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))return null;
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(Math.abs(dx)<1e-10&&Math.abs(dy)<1e-10)return null;
    const rel=(p)=>Array.isArray(p)
        ?`${(p[0]-seg.from[0]).toFixed(9)},${(p[1]-seg.from[1]).toFixed(9)}`
        :'-';
    return[
        seg.pileFlowStart.toFixed(9),seg.pileFlowEnd.toFixed(9),
        seg.from[1].toFixed(9),
        dx.toFixed(9),dy.toFixed(9),String(seg.kind||''),
        pileFlowSupportIds(seg).length,
        `p:${rel(seg.pivot)}`,
        `tp:${rel(seg.topPivot)}`
    ].join('|');
};
