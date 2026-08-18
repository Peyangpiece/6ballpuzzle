/* Natural post-contact garbage fall.
 *
 * Garbage members are independent balls after their first real pile/floor
 * contact. They must not be serialized merely because their precomputed lattice
 * paths have different motion sequence numbers. Global sequence holding fixed
 * unsupported balls in mid-air and produced the large floating cluster seen in
 * the reported capture.
 *
 * Collision safety is already enforced by the swept board guard, the
 * board-vs-airborne guard, and the final one-diameter invariant. Therefore the
 * queue exposed by app-17/app-garbage-hard-separation is intentionally empty:
 * every gridified garbage ball advances concurrently until a REAL collision
 * blocks its own path. A blocked ball may wait; an unsupported ball may not.
 */
(function installNaturalGarbageFall(){
    if(typeof window==="undefined"||window.__hexNaturalGarbageFall)return;
    window.__hexNaturalGarbageFall=true;

    __hexdropGarbageMotionQueue=function(g){
        return {minSeq:Infinity,queued:new Set()};
    };

    // Mark the mode for regressions/diagnostics. No visual or logical position
    // is changed here; existing collision-aware motion code remains authoritative.
    window.__hexGarbageGlobalQueueDisabled=true;
})();
