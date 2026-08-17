/* Gridified garbage segment-boundary precision.
 *
 * A garbage ball can finish one lattice segment a few ten-thousandths of a
 * grid row above the exact start of its next segment. The following garbage
 * ball is legitimately waiting tangent to that exact start, so carrying the
 * tiny upstream error into the next segment creates a visual overlap even
 * though the logical path is correct.
 *
 * Candidate balls are already within 0.001 physical units of seg.from and have
 * not begun moving below that start. Normalize touching candidates as a local
 * component, validate the whole component against every other rendered ball,
 * then apply it atomically. This runs after both visual integration and the
 * common contact solver, so the contact solver cannot reintroduce the drift.
 */
const HEX_GARBAGE_SEGMENT_START_EPS=0.001;
const HEX_GARBAGE_SEGMENT_START_SAFE=0.9999999;
const HEX_GARBAGE_SEGMENT_COMPONENT_LINK=1.05;

function hexGarbageSegmentStartEntries(g){
    const entries=[];
    const candidates=new Map();
    if(!g?.board||!g?.vis)return{entries,candidates};

    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell)continue;
        const v=g.vis.get(cell.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        const entry={cell,v,current:[v.x,v.y],target:null};
        entries.push(entry);

        if(!cell.isGarbage||!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
        const seg=cell.fallPath[0];
        if(!seg?.from||!seg?.to||seg.pileFlow)continue;
        const [sx,sy]=seg.from;
        if(v.y>sy+1e-9)continue;
        const d=pileFlowPhysicalDist([v.x,v.y],[sx,sy]);
        if(d>HEX_GARBAGE_SEGMENT_START_EPS)continue;
        entry.target=[sx,sy];
        candidates.set(cell.id,entry);
    }
    return{entries,candidates};
}

function hexStabilizeGarbageSegmentStarts(g){
    if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return;
    const {entries,candidates}=hexGarbageSegmentStartEntries(g);
    if(!candidates.size)return;

    const remaining=new Set(candidates.keys());
    while(remaining.size){
        const first=remaining.values().next().value;
        const component=new Set([first]);
        remaining.delete(first);
        const queue=[first];

        while(queue.length){
            const id=queue.shift(),a=candidates.get(id);
            for(const otherId of [...remaining]){
                const b=candidates.get(otherId);
                const linked=
                    pileFlowPhysicalDist(a.target,b.target)<=HEX_GARBAGE_SEGMENT_COMPONENT_LINK||
                    pileFlowPhysicalDist(a.current,b.current)<=HEX_GARBAGE_SEGMENT_COMPONENT_LINK;
                if(!linked)continue;
                remaining.delete(otherId);
                component.add(otherId);
                queue.push(otherId);
            }
        }

        let safe=true;
        for(const id of component){
            const a=candidates.get(id);
            for(const b of entries){
                if(b.cell.id===id)continue;
                const bp=component.has(b.cell.id)?candidates.get(b.cell.id)?.target:b.current;
                if(!bp)continue;
                if(pileFlowPhysicalDist(a.target,bp)<HEX_GARBAGE_SEGMENT_START_SAFE){
                    safe=false;
                    break;
                }
            }
            if(!safe)break;
        }
        if(!safe)continue;

        for(const id of component){
            const e=candidates.get(id);
            e.v.x=e.target[0];
            e.v.y=e.target[1];
        }
    }
}

const __hexUpdateVisualsBeforeGarbageStartPrecision=updateVisuals;
updateVisuals=function(g,dt){
    __hexUpdateVisualsBeforeGarbageStartPrecision(g,dt);
    hexStabilizeGarbageSegmentStarts(g);
};

const __hexResolveVisualContactsBeforeGarbageStartPrecision=resolveVisualContacts;
resolveVisualContacts=function(g){
    __hexResolveVisualContactsBeforeGarbageStartPrecision(g);
    hexStabilizeGarbageSegmentStarts(g);
};
