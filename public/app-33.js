/* Converge simultaneous active contacts within one rendered frame.
 *
 * Start from analytic pileFlow once, then iterate the established projection a
 * few times WITHOUT carrying its result into the next physics frame. This lets
 * dense support networks converge to non-penetration while app-31 still resets
 * the next frame from continuous absolute-time motion. Future scheduled waiters
 * are restored after convergence by app-32 semantics.
 */
const __hexResolveVisualContactsBeforeSettleConvergence=resolveVisualContacts;
const HEX_SETTLE_CONTACT_CONVERGENCE_PASSES=4;

resolveVisualContacts=function(g){
    if(typeof hexPileFlowPhaseAllowsAuthoritativeRestore==="function"&&
       hexPileFlowPhaseAllowsAuthoritativeRestore(g)){
        hexRestorePileFlowFrame(g);
        let result;
        for(let i=0;i<HEX_SETTLE_CONTACT_CONVERGENCE_PASSES;i++){
            result=__hexResolveVisualContactsBeforeAuthoritativePileFlow(g);
        }
        if(typeof hexRestoreFuturePileFlowWaiters==="function")hexRestoreFuturePileFlowWaiters(g);
        if(typeof hexCanonicalizeFinishedPileVisuals==="function")hexCanonicalizeFinishedPileVisuals(g);
        return result;
    }
    return __hexResolveVisualContactsBeforeSettleConvergence(g);
};
