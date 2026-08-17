/* Airborne garbage continuous-contact barrier.
 *
 * There are two different contact meanings during garbage entry:
 *  1) materialization contact: only real accumulated pile/floor may convert an
 *     airborne member into an ordinary board ball;
 *  2) visual solid contact: every already-gridified rendered ball is a physical
 *     circle and must not be drawn through, even while its own fallPath is still
 *     finishing.
 *
 * app-23 intentionally excludes moving gridified garbage from (1), otherwise a
 * moving garbage member could incorrectly trigger another member's split. The
 * old renderer also excluded it from (2). That created a discontinuity: an
 * airborne sibling could sink into the moving circle, then when that circle's
 * fallPath ended it suddenly became pile geometry and the next frame had to
 * pull the sibling upward. This looked like both tunnelling and recoil.
 *
 * Keep materialization semantics unchanged. For the renderer-only barrier,
 * include every board-backed live visual centre. A moving support therefore
 * carries the contact surface continuously as it moves; when it settles, the
 * surface is already in the same place and no retroactive upward correction is
 * needed. Airborne packets are still absent from g.board/g.vis and therefore do
 * not collide with each other.
 */
const HEX_GARBAGE_CONTACT_BARRIER_EPS=1e-8;

function hexGarbageKinematicContactY(g,pack,index){
    if(!pack?.pat?.[index])return Infinity;

    // The ordinary contact solver remains authoritative for floor + legal
    // materialization supports. This preserves every existing split/handoff
    // rule from app-23/app-37.
    let limit=hexGarbageBallContactY(g,pack,index);
    if(!g?.vis||typeof hexGarbageBoardBallById!=="function")return limit;

    const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
    for(const [id,ov] of g.vis.entries()){
        if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
        const obstacle=hexGarbageBoardBallById(g,id);
        if(!obstacle)continue;
        // Board-backed moving garbage is NOT a materialization trigger, but its
        // rendered circle is still solid for the no-penetration barrier.
        const hx=Math.abs((px-ov.x)*.5);
        if(hx>=1-1e-10)continue;
        const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
        limit=Math.min(limit,ov.y-dy-vertical);
    }
    return limit;
}

function hexGarbageRemainingContactBarrier(g,pack){
    if(!g||!pack||pack.landed||!Array.isArray(pack.pat)||!pack.pat.length)return Infinity;
    let barrier=Infinity;
    for(let i=0;i<pack.pat.length;i++){
        const cy=hexGarbageKinematicContactY(g,pack,i);
        if(Number.isFinite(cy))barrier=Math.min(barrier,cy);
    }
    return barrier;
}

function hexGarbageClampAirborneAtContact(g,pack){
    if(!g||!pack||pack.landed||!Array.isArray(pack.pat)||!pack.pat.length)return false;
    const barrier=hexGarbageRemainingContactBarrier(g,pack);
    if(!Number.isFinite(barrier)||!Number.isFinite(pack.y))return false;

    // No contact has been reached yet. Never alter reference free fall.
    if(pack.y<=barrier+HEX_GARBAGE_CONTACT_BARRIER_EPS){
        if(pack.y<barrier-HEX_GARBAGE_CONTACT_BARRIER_EPS){
            delete pack._hexContactBarrierY;
            delete pack._hexContactBarrierClock;
            delete pack._hexContactClamped;
        }
        return false;
    }

    // A contact surface has been crossed during this physics step. The packet
    // anchor is limited to the exact continuous tangent centre. No grid snap is
    // introduced and materialization is still decided exclusively by app-23.
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
    // Rebuild from the final board/visual state after the wrapped update so the
    // barrier exactly matches the centres that can be rendered this frame.
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
