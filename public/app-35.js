/* Final same-frame convergence with future waiters held fixed.
 *
 * After app-34 corrected mobility classification, the remaining worst contact
 * error is numerical (~1e-5 of a diameter) between already-active members of a
 * dense support chain. Re-run the base 48-pass projection from its current
 * corrected centres while future waiters remain hidden/fixed. No analytic reset
 * occurs between these passes, so they converge the same frame instead of
 * restarting. The next physics frame is still regenerated from continuous
 * pileFlow by app-31/app-34, preventing any accumulated grid-lock trajectory.
 */
const __hexResolveVisualContactsBeforeFixedWaiterConvergence=resolveVisualContacts;
const HEX_FIXED_WAITER_CONVERGENCE_CALLS=3;

resolveVisualContacts=function(g){
    if(typeof hexPileFlowPhaseAllowsAuthoritativeRestore==="function"&&
       hexPileFlowPhaseAllowsAuthoritativeRestore(g)){
        hexRestorePileFlowFrame(g);
        const baseSolve=typeof __hexResolveVisualContactsBeforeResidualPrecision==="function"
            ?__hexResolveVisualContactsBeforeResidualPrecision
            :__hexResolveVisualContactsBeforeAuthoritativePileFlow;
        let result;
        result=hexWithFuturePileFlowWaitersFixed(g,()=>{
            let r;
            for(let i=0;i<HEX_FIXED_WAITER_CONVERGENCE_CALLS;i++)r=baseSolve(g);
            return r;
        });
        if(typeof hexRestoreFuturePileFlowWaiters==="function")hexRestoreFuturePileFlowWaiters(g);
        if(typeof hexCanonicalizeFinishedPileVisuals==="function")hexCanonicalizeFinishedPileVisuals(g);
        return result;
    }
    return __hexResolveVisualContactsBeforeFixedWaiterConvergence(g);
};
