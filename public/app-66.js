/* Attack payload conservation.
 *
 * sendBuffer is the authoritative number of garbage balls that survived local
 * offset/cancellation.  sendShapes is only a structural description of those
 * same balls.  Older CLEAR code reduced sendBuffer during offset but left the
 * pre-cancellation shape list untouched; App delivers shapes instead of n when
 * any shape exists, so cancelled balls could silently reappear on the opponent.
 *
 * Keep shape metadata only when its packet sizes can represent the exact
 * authoritative count.  Otherwise fall back to numeric garbage with the same
 * count.  Never change sendBuffer here.
 */
function hexAttackShapeBallCount(shapes){
    return (Array.isArray(shapes)?shapes:[]).reduce((n,w)=>n+(GARBAGE_SHAPES[w]?.length||0),0);
}
function hexAttackExactShapeSubset(shapes,target){
    target=Math.max(0,Math.floor(Number(target)||0));
    if(target===0)return[];
    const src=(Array.isArray(shapes)?shapes:[]).filter(w=>GARBAGE_SHAPES[w]);
    const dp=new Map([[0,[]]]);
    for(let i=0;i<src.length;i++){
        const w=src[i],size=GARBAGE_SHAPES[w].length;
        const entries=[...dp.entries()].sort((a,b)=>b[0]-a[0]);
        for(const [sum,list] of entries){
            const next=sum+size;if(next>target||dp.has(next))continue;
            dp.set(next,[...list,w]);
        }
    }
    return dp.get(target)||null;
}
function hexNormalizeAttackPayload(g){
    if(!g||!Array.isArray(g.sendShapes))return;
    const target=Math.max(0,Math.floor(Number(g.sendBuffer)||0));
    if(!g.sendShapes.length)return;
    const represented=hexAttackShapeBallCount(g.sendShapes);
    if(represented===target)return;
    const exact=hexAttackExactShapeSubset(g.sendShapes,target);
    g.sendShapes=exact||[];
}
const __hexStepEngineBeforeAttackConservation=stepEngine;
stepEngine=function(g,dt){
    const result=__hexStepEngineBeforeAttackConservation(g,dt);
    hexNormalizeAttackPayload(g);
    return result;
};
