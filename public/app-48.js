/* Continuous-rest finalization for released garbage groups.
 *
 * The reference does not snap a settled garbage formation back to a nearby
 * lattice packing after first-contact granular motion. app-46 kept re-opening
 * an otherwise stable group until every continuous centre could be matched to
 * a unique lattice cell within 0.24 real units. On irregular piles (notably the
 * long STRAIGHT seed-7 case) that matching may not exist, so the group kept
 * re-entering the expensive relaxation solver indefinitely.
 *
 * Logical cells are already reserved atomically when the packet is released.
 * Once every sibling is locally stable and the continuous circles are genuinely
 * non-overlapping, preserve those solved centres as the authoritative resting
 * visuals. The logical cells remain bookkeeping only. If a later clear/support
 * change creates a real fallPath, bridge from this continuous rest centre into
 * the ordinary pile path on that exact frame; no snap is introduced.
 */
const HEX_GARBAGE_CONTINUOUS_REST_EPS=1e-7;

function hexGarbageContinuousRestSafe(g,members){
    if(!members?.length)return false;
    const ids=new Set(members.map(m=>m.ball.id));
    const limit=HEX_MIN_DIST-HEX_GARBAGE_CONTINUOUS_REST_EPS;
    for(let i=0;i<members.length;i++){
        const a=members[i];
        if(!Number.isFinite(a.r?.px)||!Number.isFinite(a.r?.py))return false;
        for(let j=i+1;j<members.length;j++){
            const b=members[j];
            if(Math.hypot(a.r.px-b.r.px,a.r.py-b.r.py)<limit)return false;
        }
        for(const [id,v] of g.vis.entries()){
            if(ids.has(id)||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            const px=v.x*.5,py=cellCenterYNorm(v.y);
            if(Math.hypot(a.r.px-px,a.r.py-py)<limit)return false;
        }
    }
    return true;
}

function hexGarbageContinuousRestMembers(g){
    const out=[];
    if(!g?.board)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const rest=ball?._hexGarbageContinuousRest;
        const v=ball?g.vis.get(ball.id):null;
        if(ball&&rest&&v)out.push({ball,rest,v,lx:x,ly:y});
    }
    return out;
}

function hexGarbageApplyContinuousRests(g){
    for(const m of hexGarbageContinuousRestMembers(g)){
        m.v.x=m.rest.px/.5;
        m.v.y=(m.rest.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=0;
        m.v.motionSpeed=0;
    }
}

function hexGarbageBridgeContinuousRests(g){
    if(!g?.board)return 0;
    let bridged=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const rest=ball?._hexGarbageContinuousRest;
        if(!ball||!rest||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        const from=[rest.px/.5,(rest.py-BOARD_TOP_CENTER_N)/HEX_ROW_H];
        if(!ball.fallPath[0]?.garbageContinuousHandoff){
            hexGarbagePrepareContinuousPath(g,ball,{id:ball.id,x,y},from);
        }
        delete ball._hexGarbageContinuousRest;
        delete ball._hexGarbageGroupFinalized;
        delete ball._hexContinuousSettled;
        bridged++;
    }
    return bridged;
}

// Replace app-46's near-lattice matching requirement. The whole group still
// finishes atomically; only the final coordinate authority changes.
hexGarbageFinalizeGroup=function(g,key,members){
    if(!members?.length||members.some(m=>!m.r?.groupFrozen))return false;
    const expected=Math.max(...members.map(m=>Number(m.r.groupExpected)||0));
    if(expected&&members.length!==expected)return false;
    if(!hexGarbageContinuousRestSafe(g,members))return false;

    for(const m of members){
        m.r.groupFinalized=true;
        m.r.vx=0;m.r.vy=0;
        m.ball._hexGarbageContinuousRest={px:m.r.px,py:m.r.py,groupKey:key};
        m.ball._hexGarbageGroupFinalized=true;
        m.ball.fallPath=[];
        delete m.ball._hexContinuousSettled;
        delete m.ball._hexGarbageRelax;
        m.v.x=m.r.px/.5;
        m.v.y=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=0;m.v.motionSpeed=0;
    }
    g.ver=(g.ver||0)+1;
    return true;
};

const __hexUpdateVisualsBeforeContinuousRestAuthority=updateVisuals;
updateVisuals=function(g,dt){
    hexGarbageBridgeContinuousRests(g);
    const result=__hexUpdateVisualsBeforeContinuousRestAuthority(g,dt);
    // Legacy visual layers are lattice-centric. Restore the exact granular rest
    // centres before this frame is exposed, then converge any still-relaxing
    // sibling against them at zero elapsed time.
    hexGarbageApplyContinuousRests(g);
    if(typeof hexGarbageRelaxMembers==="function"&&hexGarbageRelaxMembers(g).length){
        hexGarbageRelaxStep(g,0);
    }
    hexGarbageApplyContinuousRests(g);
    return result;
};

const __hexResolveVisualContactsBeforeContinuousRestAuthority=resolveVisualContacts;
resolveVisualContacts=function(g){
    const result=__hexResolveVisualContactsBeforeContinuousRestAuthority(g);
    hexGarbageApplyContinuousRests(g);
    if(typeof hexGarbageRelaxMembers==="function"&&hexGarbageRelaxMembers(g).length){
        hexGarbageRelaxStep(g,0);
    }
    hexGarbageApplyContinuousRests(g);
    return result;
};
