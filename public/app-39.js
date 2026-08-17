/* First-contact whole-packet release.
 *
 * Reference garbage behavior keeps a PYRAMID / HEXAGON / STRAIGHT formation as
 * one visual packet only while it is completely airborne. The first real
 * floor/accumulated-pile contact ends that airborne rigidity. From that exact
 * contact frame onward every member is an ordinary independent ball governed
 * by the same gravity / slide / split solver as accumulated balls.
 *
 * The previous implementation materialized only the member that had touched
 * and left its siblings in pack.pat. Those siblings then shared a free-fall
 * anchor while the released members moved independently underneath them. A
 * released member could therefore become a new settled obstacle only after a
 * sibling had already descended into its future circle, producing tunnelling
 * followed by an upward recoil. Eliminate that mixed representation entirely.
 */

function hexGarbageFirstRealContactAnchor(g,pack){
    if(!pack?.pat?.length)return Infinity;
    let first=Infinity;
    for(let i=0;i<pack.pat.length;i++){
        const cy=hexGarbageBallContactY(g,pack,i);
        if(Number.isFinite(cy))first=Math.min(first,cy);
    }
    return first;
}

function hexGarbageReleaseWholePacketAt(g,pack,anchorY){
    if(!g||!pack?.pat?.length||!Number.isFinite(anchorY))return 0;

    if(!pack._hexSplitTriggered){
        pack._hexSplitTriggered=true;
        pack._hexSplitTriggeredAt=Number(g.garbageClock)||0;
    }
    pack._hexWholeReleaseAnchorY=anchorY;
    pack._hexWholeReleasePending=true;

    // Work backwards because materializeGarbageBallAtContact() removes the
    // chosen slot from pat/colors synchronously. Every member receives the same
    // airborne anchor, preserving the formation's exact pose at first contact;
    // only after this synchronous release does ordinary ball physics diverge.
    let released=0;
    for(let i=pack.pat.length-1;i>=0;i--){
        if(materializeGarbageBallAtContact(g,pack,i,anchorY))released++;
    }

    if(pack.pat.length){
        // A logical/path reservation may very briefly prevent one hand-off.
        // Keep the unreleased remainder at the already-safe first-contact pose;
        // never resume free fall below it. The next physics update retries the
        // same whole-release anchor, so no mixed packet can tunnel downward.
        pack.y=anchorY;
        pack.contactY=anchorY;
        pack.vy=0;
        pack._hexContactBarrierY=anchorY;
        pack._hexContactClamped=true;
    }else{
        pack.landed=true;
        pack.releaseTime=Number(g.garbageClock)||0;
        delete pack._hexWholeReleasePending;
        delete pack._hexContactClamped;
        delete pack._hexContactBarrierY;
    }
    delete pack._hexContactFrame;
    return released;
}

materializeGarbageContactsThrough=function(g,pack,desiredY){
    if(!pack?.pat?.length)return 0;

    // Once first contact has happened, never go back to per-member free fall.
    if(pack._hexWholeReleasePending&&Number.isFinite(pack._hexWholeReleaseAnchorY)){
        return hexGarbageReleaseWholePacketAt(g,pack,pack._hexWholeReleaseAnchorY);
    }

    const first=hexGarbageFirstRealContactAnchor(g,pack);
    if(!Number.isFinite(first)||desiredY+HEX_GARBAGE_CONTACT_EPS<first)return 0;

    // Release at the exact continuous first-contact anchor, not at an overshot
    // absolute-time desiredY. This is continuous collision detection for the
    // rigid airborne formation and prevents one-frame penetration at low fps.
    return hexGarbageReleaseWholePacketAt(g,pack,first);
};

// app-38 normally recomputes a renderer barrier from live board geometry. A
// whole-release retry is different: its authoritative safe pose is the exact
// first-contact pose captured above. Newly released siblings must not pull the
// unreleased remainder upward while the synchronous hand-off completes.
const __hexGarbageClampAirborneAtContactBeforeWholeRelease=hexGarbageClampAirborneAtContact;
hexGarbageClampAirborneAtContact=function(g,pack){
    if(pack?._hexWholeReleasePending&&Number.isFinite(pack._hexWholeReleaseAnchorY)){
        const y=pack._hexWholeReleaseAnchorY;
        if(Number.isFinite(pack.y)&&pack.y>y+HEX_GARBAGE_CONTACT_BARRIER_EPS){
            pack.y=y;pack.contactY=y;pack.vy=0;
            pack._hexContactBarrierY=y;pack._hexContactClamped=true;
            return true;
        }
        pack.y=y;pack.contactY=y;pack.vy=0;
        pack._hexContactBarrierY=y;pack._hexContactClamped=true;
        return false;
    }
    return __hexGarbageClampAirborneAtContactBeforeWholeRelease(g,pack);
};
