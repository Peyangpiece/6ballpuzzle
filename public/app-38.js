/* Airborne garbage continuous-contact barrier.
 *
 * Contact detection can succeed before the airborne->lattice hand-off is safe.
 * The old update kept the packet's absolute free-fall Y in that case, so the
 * renderer could draw a still-airborne member below the pile it had already hit.
 *
 * Remaining airborne members are now clamped to the earliest real pile/floor
 * contact after every garbage update. This does not grid-snap or create a new
 * collision: it only prevents a contacted centre from being rendered below its
 * continuous circle contact while materialization retries. The next physics
 * frame still recomputes absolute-time free fall, so once the hand-off becomes
 * safe the existing continuous materialization/path code remains authoritative.
 */
const HEX_GARBAGE_CONTACT_BARRIER_EPS=1e-8;

function hexGarbageRemainingContactBarrier(g,pack){
    if(!g||!pack||pack.landed||!Array.isArray(pack.pat)||!pack.pat.length)return Infinity;
    let barrier=Infinity;
    for(let i=0;i<pack.pat.length;i++){
        const cy=hexGarbageBallContactY(g,pack,i);
        if(Number.isFinite(cy))barrier=Math.min(barrier,cy);
    }
    return barrier;
}

function hexGarbageClampAirborneAtContact(g,pack){
    if(!g||!pack||pack.landed||!Array.isArray(pack.pat)||!pack.pat.length)return false;
    const barrier=hexGarbageRemainingContactBarrier(g,pack);
    if(!Number.isFinite(barrier)||!Number.isFinite(pack.y))return false;

    // No contact has been reached yet.
    if(pack.y<=barrier+HEX_GARBAGE_CONTACT_BARRIER_EPS){
        if(pack.y<barrier-HEX_GARBAGE_CONTACT_BARRIER_EPS){
            delete pack._hexContactBarrierY;
            delete pack._hexContactBarrierClock;
            delete pack._hexContactClamped;
        }
        return false;
    }

    // Contact was reached, but this member is still in pack.pat: materialization
    // was deferred. Never expose the analytically advanced Y to the renderer.
    pack.y=barrier;
    pack.contactY=barrier;
    pack.vy=0;
    pack._hexContactBarrierY=barrier;
    pack._hexContactBarrierClock=Number(g.garbageClock)||0;
    pack._hexContactClamped=true;
    return true;
}

function hexGarbageClampAllAirborneAtContacts(g){
    if(!g||!Array.isArray(g.activeGarbagePacks))return 0;
    // Rebuild from final board/visual state after the wrapped update so the
    // barrier matches exactly what will be rendered on this frame.
    g._hexGarbageObstacleFrame=null;
    let clamped=0;
    for(const pack of g.activeGarbagePacks)if(hexGarbageClampAirborneAtContact(g,pack))clamped++;
    g._hexGarbageObstacleFrame=null;
    return clamped;
}

const __hexUpdateGarbagePacksBeforeContactBarrier=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const result=__hexUpdateGarbagePacksBeforeContactBarrier(g,dt);
    hexGarbageClampAllAirborneAtContacts(g);
    return result;
};
