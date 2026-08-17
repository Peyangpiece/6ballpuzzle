/* The check-87 upward noise is introduced inside updateGarbagePacks(), before
 * app-52's updateVisuals boundary snapshot can observe the old centre. Apply the
 * same <=1e-7 pathless-garbage recoil clamp around that transaction as well.
 */
const __hexUpdateGarbagePacksBeforeBoundaryNoiseClamp=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const before=hexSnapshotSettledGarbageY(g);
    const result=__hexUpdateGarbagePacksBeforeBoundaryNoiseClamp(g,dt);
    hexClampSettledGarbageBoundaryNoise(g,before);
    return result;
};
