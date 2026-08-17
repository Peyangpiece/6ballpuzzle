/* One physics frame = one integration + one contact convergence.
 * Intermediate continuous-rest restores may happen several times inside legacy
 * visual wrappers, but they represent the same physical instant and must not
 * repeatedly advance/re-solve the released garbage system.
 */
const __hexRelaxBeforeFrameTransaction=hexGarbageRelaxStep;
const __hexFinalBeforeFrameTransaction=hexEnforceFinalVisualNonOverlap;
const __hexStepBeforeFrameTransaction=stepEngine;

hexGarbageRelaxStep=function(g,dt){
    const tx=g?._hexContactFrameTransaction;
    if(tx&&Math.abs(Number(dt)||0)<=1e-12){
        tx.skippedZeroRelax=(tx.skippedZeroRelax||0)+1;
        return 0;
    }
    return __hexRelaxBeforeFrameTransaction(g,dt);
};

hexEnforceFinalVisualNonOverlap=function(g){
    const tx=g?._hexContactFrameTransaction;
    if(tx&&!tx.allowFinal){
        tx.skippedFinal=(tx.skippedFinal||0)+1;
        return 0;
    }
    return __hexFinalBeforeFrameTransaction(g);
};

stepEngine=function(g,dt){
    if(!g||g._hexContactFrameTransaction)return __hexStepBeforeFrameTransaction(g,dt);
    const beforeY=typeof hexSnapshotSettledGarbageY==='function'?hexSnapshotSettledGarbageY(g):null;
    const tx={allowFinal:false,skippedZeroRelax:0,skippedFinal:0};
    g._hexContactFrameTransaction=tx;
    let result;
    try{
        // Positive-dt relaxation inside updateGarbagePacks is the sole time
        // integration for this 1/120 s transaction. All nested dt=0 resolves
        // are suppressed because they solve the same instant repeatedly.
        result=__hexStepBeforeFrameTransaction(g,dt);

        // After every legacy visual/rest restore has finished, converge the
        // current contact set exactly once at zero elapsed time.
        __hexRelaxBeforeFrameTransaction(g,0);
        tx.allowFinal=true;
        __hexFinalBeforeFrameTransaction(g);
        if(beforeY&&typeof hexClampSettledGarbageBoundaryNoise==='function'){
            hexClampSettledGarbageBoundaryNoise(g,beforeY);
        }
        return result;
    }finally{
        delete g._hexContactFrameTransaction;
    }
};
