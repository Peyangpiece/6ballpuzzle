/* HEXDROP garbage contact convergence consolidation.
 * The current wrapper stack requests six dt=0 relaxation passes around
 * updateVisuals/resolveVisualContacts before the one real 1/120 s relaxation.
 * Only the frame-final result is observable. Preserve the real time-advancing
 * solve exactly, coalesce all zero-time requests during one stepEngine call,
 * then execute one final dt=0 contact convergence after the full physics step.
 */
const __hex72RelaxBeforeConsolidation=hexGarbageRelaxStep;
const __hex72StepBeforeConsolidation=stepEngine;

hexGarbageRelaxStep=function(g,dt){
    const h=Math.max(0,Number(dt)||0);
    if(g?._hex72CoalesceZeroRelax&&h<=1e-12){
        g._hex72ZeroRelaxRequested=true;
        return 0;
    }
    return __hex72RelaxBeforeConsolidation(g,dt);
};

stepEngine=function(g,dt){
    if(!g)return __hex72StepBeforeConsolidation(g,dt);
    const outer=!!g._hex72CoalesceZeroRelax;
    if(outer)return __hex72StepBeforeConsolidation(g,dt);
    g._hex72CoalesceZeroRelax=true;
    g._hex72ZeroRelaxRequested=false;
    let result;
    try{
        result=__hex72StepBeforeConsolidation(g,dt);
    }finally{
        g._hex72CoalesceZeroRelax=false;
    }
    const requested=!!g._hex72ZeroRelaxRequested;
    g._hex72ZeroRelaxRequested=false;
    if(requested&&typeof hexGarbageRelaxMembers==="function"&&hexGarbageRelaxMembers(g).length){
        __hex72RelaxBeforeConsolidation(g,0);
    }
    return result;
};
