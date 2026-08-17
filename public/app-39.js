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

function hexGarbageBoardIds(g){
    const ids=new Set();
    if(!g?.board)return ids;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;
        if(b)ids.add(b.id);
    }
    return ids;
}

/*
 * During one whole-packet release, members created a few microsteps earlier are
 * siblings from the SAME rigid airborne pose. Their exact contact circles are
 * already non-overlapping by construction. They must not make a later sibling
 * fail the continuous-centre/path reservation check merely because their new
 * fallPath now crosses space that belonged to that same formation one call ago.
 *
 * Hide only those newly-created sibling visuals and paths while one later
 * sibling runs the existing hand-off safety checks. Their logical lattice cells
 * remain occupied, so two members can never claim the same cell. Every ball and
 * path that existed before first contact stays fully visible to all safety
 * checks. Restore everything synchronously before returning.
 */
function hexGarbageWithSameReleaseSiblingsHidden(g,ids,fn){
    if(!g||!ids?.size)return fn();
    const held=[];
    for(const id of ids){
        const ball=hexGarbageBoardBallById(g,id);
        if(!ball)continue;
        const hadVis=g.vis?.has(id),vis=hadVis?g.vis.get(id):undefined;
        const path=ball.fallPath;
        held.push({id,ball,hadVis,vis,path});
        if(hadVis)g.vis.delete(id);
        if(Array.isArray(path)&&path.length)ball.fallPath=[];
    }
    g._hexGarbageObstacleFrame=null;
    try{return fn();}
    finally{
        for(const h of held){
            h.ball.fallPath=h.path;
            if(h.hadVis)g.vis.set(h.id,h.vis);
        }
        g._hexGarbageObstacleFrame=null;
    }
}

function hexGarbageWholeReleaseContext(g,pack){
    // These sets belong to ONE first-contact event and survive retry frames.
    // Without persistence, members released on frame N were misclassified as
    // pre-existing pile on frame N+1 and could permanently block the remainder.
    if(!(pack._hexWholeReleasePreExistingIds instanceof Set)){
        pack._hexWholeReleasePreExistingIds=hexGarbageBoardIds(g);
    }
    if(!(pack._hexWholeReleaseSiblingIds instanceof Set)){
        pack._hexWholeReleaseSiblingIds=new Set();
    }
    return{
        preExistingIds:pack._hexWholeReleasePreExistingIds,
        sameReleaseIds:pack._hexWholeReleaseSiblingIds
    };
}

function hexGarbageClearWholeReleaseContext(pack){
    delete pack._hexWholeReleasePreExistingIds;
    delete pack._hexWholeReleaseSiblingIds;
    delete pack._hexWholeReleaseAnchorY;
    delete pack._hexWholeReleasePending;
}

function hexGarbageReleaseWholePacketAt(g,pack,anchorY){
    if(!g||!pack?.pat?.length||!Number.isFinite(anchorY))return 0;

    if(!pack._hexSplitTriggered){
        pack._hexSplitTriggered=true;
        pack._hexSplitTriggeredAt=Number(g.garbageClock)||0;
    }
    if(!Number.isFinite(pack._hexWholeReleaseAnchorY))pack._hexWholeReleaseAnchorY=anchorY;
    // Once first contact exists, its continuous anchor is immutable across retry
    // frames. Never replace it with a later obstacle created by this release.
    anchorY=pack._hexWholeReleaseAnchorY;
    pack._hexWholeReleasePending=true;

    const {preExistingIds,sameReleaseIds}=hexGarbageWholeReleaseContext(g,pack);
    let released=0;

    // Work backwards because materializeGarbageBallAtContact() removes the
    // chosen slot from pat/colors synchronously. Every member receives the same
    // airborne anchor, preserving the formation's exact pose at first contact.
    for(let i=pack.pat.length-1;i>=0;i--){
        const beforeEntries=pack.entryBalls?.length||0;
        const ok=hexGarbageWithSameReleaseSiblingsHidden(g,sameReleaseIds,()=>
            materializeGarbageBallAtContact(g,pack,i,anchorY));
        if(!ok)continue;
        released++;
        const entry=pack.entryBalls?.[beforeEntries]||pack.entryBalls?.[pack.entryBalls.length-1];
        if(entry?.id&&!preExistingIds.has(entry.id))sameReleaseIds.add(entry.id);
    }

    // All sibling visuals are visible again here. Resolve once with the complete
    // released set so tangent contacts and existing pile contacts converge in
    // one completed physics frame rather than in order-dependent intermediate
    // states. app-22 may defer this to its normal frame-end batch solve.
    if(released&&typeof resolveVisualContacts==="function")resolveVisualContacts(g);

    if(pack.pat.length){
        // Only a PRE-EXISTING pile/path may keep a member pending. Continue using
        // the same first-contact context next frame; never reclassify siblings as
        // pre-existing obstacles and never resume free fall below this pose.
        pack.y=anchorY;
        pack.contactY=anchorY;
        pack.vy=0;
        pack._hexContactBarrierY=anchorY;
        pack._hexContactClamped=true;
    }else{
        pack.landed=true;
        pack.releaseTime=Number(g.garbageClock)||0;
        hexGarbageClearWholeReleaseContext(pack);
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
