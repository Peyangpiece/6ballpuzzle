/* Final post-render contact convergence for continuous garbage.
 *
 * updateGarbagePacks solves against the fixed visuals that exist at the start
 * of the physics frame.  updateVisuals may then finish/canonicalize an older
 * released garbage ball to its logical cell.  That fixed centre can therefore
 * move after the relaxation solve and overlap a still-relaxing sibling for one
 * rendered frame.  Re-solve with dt=0 after the complete visual update, using
 * the exact centres that are about to be drawn.  No time, velocity, or Y
 * progress is added; this is only same-frame contact convergence.
 */
const __hexUpdateVisualsBeforeFinalGarbageConvergence=updateVisuals;
updateVisuals=function(g,dt){
    const result=__hexUpdateVisualsBeforeFinalGarbageConvergence(g,dt);
    if(typeof hexGarbageRelaxMembers==="function"&&hexGarbageRelaxMembers(g).length){
        hexGarbageRelaxStep(g,0);
    }
    return result;
};
