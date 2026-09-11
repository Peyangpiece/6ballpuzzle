/* Retired split display follower.
 *
 * g.vis is also read by active-piece collision, contact sweeps, and segment
 * rebasing. Independently chasing each centre here shortened rigid pivot arms,
 * changed swept trajectories, and restored stale state after solver changes.
 * Keep the integrator's synchronized, contact-checked positions authoritative.
 * Smoothness and no-lift handling remain in the motion and continuity layers
 * loaded before this compatibility entry point; no second clock is applied.
 */
(function retireSplitVisualFollower(){
    if(typeof window === "undefined") return;
    window.__sixBallSplitVisualSmoothnessVersion = "authoritative-motion-no-follower-v2";
    window.__sixBallSplitVisualUsesAuthoritativePositions = true;
})();
