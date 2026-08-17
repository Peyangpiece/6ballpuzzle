/* Remove artificial lateral launch from first-contact garbage release.
 *
 * Continuous relaxation must be driven by real support geometry, not a packet-
 * centre heuristic.  The old outward seed made the upper row of a flat
 * STRAIGHT drift off its symmetric two-ball supports and eventually compete for
 * floor cells with the lower row.  On a flat symmetric support the reference
 * result is zero horizontal impulse.  Uneven support can still create lateral
 * displacement through the contact constraints / subsequent pile physics.
 */
const __hexGarbageBeginRelaxBeforePhysicalZeroX=hexGarbageBeginRelax;
hexGarbageBeginRelax=function(ball,v,pack,exactX,exactY){
    __hexGarbageBeginRelaxBeforePhysicalZeroX(ball,v,pack,exactX,exactY);
    const r=ball?._hexGarbageRelax;
    if(r)r.vx=0;
};
