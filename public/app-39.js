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

function hexGarbageWholeReleaseContactKey(x,y){
    return String(x)+"|"+Number(y).toFixed(9);
}
function hexGarbageWholeReleaseCellKey(x,y){return x+","+y;}

/* Enumerate the same local hand-off neighbourhood used by app-17, but return
 * ALL legal cells instead of greedily taking the nearest one. Whole formations
 * need a one-to-one assignment: choosing each member independently can consume
 * the only valid cell of a later edge member (the 19-ball STRAIGHT exposed this
 * at its left edge). */
function hexGarbageWholeReleaseCandidates(g,x,visualY){
    const firstY=Math.max(BOARD_MIN_ROW,Math.ceil(visualY-1e-7));
    const lastY=Math.min(ROWS-1,firstY+2),out=[];
    for(let y=firstY;y<=lastY;y++){
        if(y+1e-7<visualY)continue;
        for(let dx=-2;dx<=2;dx++){
            const cx=x+dx;
            if(!valid(cx,y)||g.board[y][cx])continue;
            const realDist=Math.hypot((cx-x)*.5,(y-visualY)*HEX_ROW_H);
            if(realDist>1.000001)continue;
            if(!visualPointSafe(g,-1,cx,y,HEX_MIN_DIST))continue;
            if(typeof __hexdropGarbageCellCrossesActivePath==="function"&&
               __hexdropGarbageCellCrossesActivePath(g,cx,y))continue;
            const score=realDist+Math.abs(dx)*1e-5+(y-visualY)*1e-6;
            out.push({x:cx,y,score});
        }
    }
    out.sort((a,b)=>a.score-b.score||a.x-b.x||a.y-b.y);
    return out;
}

/* Deterministic bipartite matching from airborne members to unique logical
 * hand-off cells. This is a placement preflight only; no ball is moved here.
 * Existing pile/path occupancy is respected. */
function hexGarbageBuildWholeReleaseCellPlan(g,pack,anchorY){
    const items=pack.pat.map(([dx,dy],index)=>{
        const x=pack.ax+dx,visualY=anchorY+dy;
        return{
            id:index,
            contactKey:hexGarbageWholeReleaseContactKey(x,visualY),
            candidates:hexGarbageWholeReleaseCandidates(g,x,visualY)
        };
    });
    if(items.some(v=>!v.candidates.length))return null;

    const byId=new Map(items.map(v=>[v.id,v]));
    const cellOwner=new Map(),chosen=new Map();
    const order=items.slice().sort((a,b)=>a.candidates.length-b.candidates.length||a.id-b.id);

    const assign=(id,seenCells,seenItems)=>{
        if(seenItems.has(id))return false;
        const nextItems=new Set(seenItems);nextItems.add(id);
        const item=byId.get(id);if(!item)return false;
        for(const c of item.candidates){
            const ck=hexGarbageWholeReleaseCellKey(c.x,c.y);
            if(seenCells.has(ck))continue;
            seenCells.add(ck);
            const owner=cellOwner.get(ck);
            if(owner===undefined||assign(owner,seenCells,nextItems)){
                cellOwner.set(ck,id);chosen.set(id,c);return true;
            }
        }
        return false;
    };

    for(const item of order)if(!assign(item.id,new Set(),new Set()))return null;
    const plan=new Map();
    for(const item of items){
        const c=chosen.get(item.id);if(!c)return null;
        plan.set(item.contactKey,{x:c.x,y:c.y});
    }
    return plan;
}

/* Force only preplanned contacts from THIS release to their matched cell. Other
 * calls still use the production app-17 selector. */
function hexGarbageWithWholeReleaseCellPlan(g,plan,fn){
    if(!(plan instanceof Map)||!plan.size)return fn();
    const before=hexGarbageSingleLogicalCell;
    hexGarbageSingleLogicalCell=function(g2,x,visualY){
        if(g2===g){
            const c=plan.get(hexGarbageWholeReleaseContactKey(x,visualY));
            if(c&&valid(c.x,c.y)&&!g2.board[c.y][c.x])return{x:c.x,y:c.y};
        }
        return before(g2,x,visualY);
    };
    try{return fn();}
    finally{hexGarbageSingleLogicalCell=before;}
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

function hexGarbageWholeReleaseContext(g,pack,anchorY){
    // These values belong to ONE first-contact event and survive retry frames.
    if(!(pack._hexWholeReleasePreExistingIds instanceof Set)){
        pack._hexWholeReleasePreExistingIds=hexGarbageBoardIds(g);
    }
    if(!(pack._hexWholeReleaseSiblingIds instanceof Set)){
        pack._hexWholeReleaseSiblingIds=new Set();
    }
    if(!(pack._hexWholeReleaseCellPlan instanceof Map)){
        pack._hexWholeReleaseCellPlan=hexGarbageBuildWholeReleaseCellPlan(g,pack,anchorY);
    }
    return{
        preExistingIds:pack._hexWholeReleasePreExistingIds,
        sameReleaseIds:pack._hexWholeReleaseSiblingIds,
        cellPlan:pack._hexWholeReleaseCellPlan
    };
}

function hexGarbageClearWholeReleaseContext(pack){
    delete pack._hexWholeReleasePreExistingIds;
    delete pack._hexWholeReleaseSiblingIds;
    delete pack._hexWholeReleaseCellPlan;
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

    const {preExistingIds,sameReleaseIds,cellPlan}=hexGarbageWholeReleaseContext(g,pack,anchorY);
    let released=0;

    // Work backwards because materializeGarbageBallAtContact() removes the
    // chosen slot from pat/colors synchronously. Every member receives the same
    // airborne anchor, preserving the formation's exact pose at first contact.
    hexGarbageWithWholeReleaseCellPlan(g,cellPlan,()=>{
        for(let i=pack.pat.length-1;i>=0;i--){
            const beforeEntries=pack.entryBalls?.length||0;
            const ok=hexGarbageWithSameReleaseSiblingsHidden(g,sameReleaseIds,()=>
                materializeGarbageBallAtContact(g,pack,i,anchorY));
            if(!ok)continue;
            released++;
            const entry=pack.entryBalls?.[beforeEntries]||pack.entryBalls?.[pack.entryBalls.length-1];
            if(entry?.id&&!preExistingIds.has(entry.id))sameReleaseIds.add(entry.id);
        }
    });

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
