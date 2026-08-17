/* Frame-local cache for garbage-affected support closure.
 *
 * app-28's support ancestry is topological state. Rebuilding it for every
 * pileFlowPositionAt() sample multiplies a board scan through scheduler and
 * renderer recursion. Cache once per physics clock/version/path-head epoch.
 */
const __hexParallelGarbageSupportClosureUncached=hexParallelGarbageSupportClosure;

hexParallelGarbageSupportClosure=function(g){
    if(!g)return new Set();
    const stamp=[
        Number(g.ver)||0,
        String(g.phase||''),
        Number(g.pileFlowClock||0).toFixed(9),
        Number(g._hexParallelPathEpoch)||0
    ].join('|');
    const cached=g._hexParallelSupportClosureCache;
    if(cached?.stamp===stamp)return cached.value;
    const value=__hexParallelGarbageSupportClosureUncached(g);
    g._hexParallelSupportClosureCache={stamp,value};
    return value;
};

const __hexUpdateScheduledPileFlowVisualBeforeClosureCache=updateScheduledPileFlowVisual;
updateScheduledPileFlowVisual=function(g,cell,v,dt){
    const before=Array.isArray(cell?.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;
    const result=__hexUpdateScheduledPileFlowVisualBeforeClosureCache(g,cell,v,dt);
    const after=Array.isArray(cell?.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;
    if(before!==after){
        g._hexParallelPathEpoch=(g._hexParallelPathEpoch||0)+1;
        g._hexParallelSupportClosureCache=null;
    }
    return result;
};
