/* Non-accumulating contact projection for analytic pile flow.
 *
 * The scheduled path is the authoritative continuous motion source. Generic
 * contact projection is useful only as an instantaneous non-penetration solve:
 * its correction must be visible for the current frame, but must never become
 * the next frame's starting trajectory (which caused mid-air drift/grid lock).
 *
 * Start every resolving frame from the analytic absolute-time pileFlow centre,
 * then run the established production contact solver exactly once. Do NOT snap
 * moving balls back after that solve. On the next frame the analytic centre is
 * regenerated again, so contact corrections cannot accumulate. Final no-path
 * balls remain eligible for the tiny canonical final-cell snap in app-25.
 */
const __hexResolveVisualContactsWithPostRestore=resolveVisualContacts;

// app-26+ experimented with phase-locking parallel support chains. The contact
// network can contain both lateral and vertical constraints that are not one
// rigid translation. Return motion generation to the proven gravity/support
// analytic function and let the one-frame contact solve satisfy simultaneous
// non-penetration constraints without changing logical/final cells.
pileFlowPointForBall=__hexPileFlowPointForBallBeforeParallelGarbageCoherence;

resolveVisualContacts=function(g){
    if(typeof hexPileFlowPhaseAllowsAuthoritativeRestore==="function"&&
       hexPileFlowPhaseAllowsAuthoritativeRestore(g)){
        hexRestorePileFlowFrame(g);
        // This is the complete production solver that existed before app-25
        // added its post-solve authoritative restore. It includes the residual
        // precision and garbage segment-start safeguards from earlier layers.
        const result=__hexResolveVisualContactsBeforeAuthoritativePileFlow(g);
        hexCanonicalizeFinishedPileVisuals(g);
        return result;
    }
    return __hexResolveVisualContactsWithPostRestore(g);
};
