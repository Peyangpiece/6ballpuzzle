/* Settled garbage must behave as accumulated pile geometry.
 *
 * The previous app-23 filter ignored every isGarbage obstacle until the incoming
 * packet had already split. That was too broad: an old garbage ball whose
 * fallPath had finished is no longer airborne garbage; it is a stationary pile
 * circle and must stop later garbage exactly like a normal accumulated ball.
 *
 * Keep only the intended exception: garbage that is STILL MOVING may be passed
 * through by another airborne garbage member. Stationary/grid-settled garbage
 * is always a contact obstacle, even before the new packet's first split.
 */
function hexGarbageObstacleIsAccumulatedPile(frame,entry){
    if(!entry)return false;
    if(!entry.isGarbage)return true;
    const ball=frame?.byId?.get(entry.id);
    // If the logical board entry exists but the cache cannot resolve it, fail
    // closed and treat it as solid rather than allowing a possible tunnel.
    if(!ball)return true;
    return !hexGarbageBallStillMoving(ball);
}

hexGarbageObstacleStopsAirborne=function(frame,entry,splitTriggered){
    return hexGarbageObstacleIsAccumulatedPile(frame,entry);
};
