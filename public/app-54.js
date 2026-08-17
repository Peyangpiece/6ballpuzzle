/* Frame-wide garbage recoil tolerance.
 *
 * A check-87 STRAIGHT ball can move upward by more than the numeric threshold
 * inside updateGarbagePacks and then move partly back down in updateVisuals,
 * leaving only a ~1e-7 net upward drift. Per-function clamps cannot recognize
 * that as noise. Keep the Y centres from the start of the garbage frame and
 * compare only after updateVisuals has finished the complete visible frame.
 */
const __hexUpdateGarbagePacksBeforeFrameBaseline=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    if(!g._hexGarbageFrameBaselineY){
        g._hexGarbageFrameBaselineY=hexSnapshotSettledGarbageY(g);
    }
    return __hexUpdateGarbagePacksBeforeFrameBaseline(g,dt);
};

const __hexUpdateVisualsBeforeFrameNoiseClamp=updateVisuals;
updateVisuals=function(g,dt){
    const baseline=g?._hexGarbageFrameBaselineY||null;
    const result=__hexUpdateVisualsBeforeFrameNoiseClamp(g,dt);
    if(baseline){
        hexClampSettledGarbageBoundaryNoise(g,baseline);
        delete g._hexGarbageFrameBaselineY;
    }
    return result;
};
