/* Group-atomic completion for continuous released garbage.
 *
 * Members from one first-contact formation must remain in the same continuous
 * coordinate world until ALL of them are stable.  Finishing one member early
 * lets legacy visual code canonicalize that one circle to its logical
 * reservation while siblings are still moving; the canonicalized centre then
 * appears as a new obstacle inside their trajectories.  Freeze locally-stable
 * members at their exact continuous centres, keep them as physical supports,
 * and finalize/remap the whole release group atomically only when every member
 * is stable and a near-current lattice matching exists.
 */
const HEX_GARBAGE_GROUP_FINALIZE_MAX_REAL_DIST=0.24;
const HEX_GARBAGE_GROUP_FINALIZE_SEARCH_ROWS=2;
const HEX_GARBAGE_GROUP_FINALIZE_SEARCH_X=3;
let HEX_GARBAGE_GROUP_SERIAL=1;

const __hexGarbageBeginRelaxBeforeGroupAtomic=hexGarbageBeginRelax;
hexGarbageBeginRelax=function(ball,v,pack,exactX,exactY){
    __hexGarbageBeginRelaxBeforeGroupAtomic(ball,v,pack,exactX,exactY);
    const r=ball?._hexGarbageRelax;if(!r)return;
    if(!pack._hexContinuousGroupKey){
        pack._hexContinuousGroupKey="garbage-contact-"+(HEX_GARBAGE_GROUP_SERIAL++);
    }
    r.groupKey=pack._hexContinuousGroupKey;
    r.groupExpected=Number(pack.totalBalls)||0;
    r.groupFrozen=false;
    r.groupFinalized=false;
};

function hexGarbageGroupMembers(g,key){
    const out=[];
    if(!g?.board||!key)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const r=ball?._hexGarbageRelax;
        const v=ball?g.vis.get(ball.id):null;
        if(ball&&r?.groupKey===key&&v)out.push({ball,r,v,lx:x,ly:y});
    }
    return out;
}
function hexGarbageAllRelaxGroups(g){
    const map=new Map();
    for(const m of hexGarbageRelaxMembers(g)){
        const key=m.r?.groupKey;if(!key)continue;
        if(!map.has(key))map.set(key,[]);
        map.get(key).push(m);
    }
    return map;
}
function hexGarbageHasContinuousGroups(g){
    if(!g?.board)return false;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball?._hexGarbageRelax?.groupKey)return true;
    }
    return false;
}

function hexGarbageGroupNonMemberVisualSafe(g,memberIds,cx,cy){
    const px=cx*.5,py=cellCenterYNorm(cy),limit=HEX_MIN_DIST-1e-8;
    for(const [id,v] of g.vis.entries()){
        if(memberIds.has(id)||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        const dx=px-v.x*.5,dy=py-cellCenterYNorm(v.y);
        if(Math.hypot(dx,dy)<limit)return false;
    }
    return true;
}

function hexGarbageGroupCandidateCells(g,m,memberIds){
    const vx=m.r.px/.5,vy=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    const baseY=Math.round(vy),baseX=Math.round(vx),out=[];
    for(let y=Math.max(BOARD_MIN_ROW,baseY-HEX_GARBAGE_GROUP_FINALIZE_SEARCH_ROWS);
        y<=Math.min(ROWS-1,baseY+HEX_GARBAGE_GROUP_FINALIZE_SEARCH_ROWS);y++){
        for(let x=baseX-HEX_GARBAGE_GROUP_FINALIZE_SEARCH_X;x<=baseX+HEX_GARBAGE_GROUP_FINALIZE_SEARCH_X;x++){
            if(!valid(x,y))continue;
            const occupant=g.board[y][x];
            if(occupant&&!memberIds.has(occupant.id))continue;
            const dist=Math.hypot((x-vx)*.5,(y-vy)*HEX_ROW_H);
            if(dist>HEX_GARBAGE_GROUP_FINALIZE_MAX_REAL_DIST+1e-10)continue;
            if(!hexGarbageGroupNonMemberVisualSafe(g,memberIds,x,y))continue;
            out.push({x,y,dist,score:dist+Math.abs(x-vx)*1e-7+Math.abs(y-vy)*1e-8});
        }
    }
    out.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    return out;
}

function hexGarbageMatchGroupCells(g,members){
    const memberIds=new Set(members.map(m=>m.ball.id));
    const items=members.map((m,index)=>({index,m,candidates:hexGarbageGroupCandidateCells(g,m,memberIds)}));
    if(items.some(i=>!i.candidates.length))return null;
    items.sort((a,b)=>a.candidates.length-b.candidates.length||a.index-b.index);
    const cellOwner=new Map(),choice=new Map();
    const key=c=>c.x+","+c.y;
    function assign(item,seenCells,seenItems){
        if(seenItems.has(item.index))return false;
        const nextItems=new Set(seenItems);nextItems.add(item.index);
        for(const c of item.candidates){
            const ck=key(c);if(seenCells.has(ck))continue;
            const nextCells=new Set(seenCells);nextCells.add(ck);
            const owner=cellOwner.get(ck);
            if(owner===undefined||assign(items.find(q=>q.index===owner),nextCells,nextItems)){
                cellOwner.set(ck,item.index);choice.set(item.index,c);return true;
            }
        }
        return false;
    }
    for(const item of items)if(!assign(item,new Set(),new Set()))return null;
    const plan=new Map();
    for(const item of items){const c=choice.get(item.index);if(!c)return null;plan.set(item.m.ball.id,c);}
    return plan;
}

function hexGarbageRestoreGroupBoard(g,snapshot){
    for(const s of snapshot)g.board[s.y][s.x]=s.ball;
}
function hexGarbageFinalizeGroup(g,key,members){
    if(!members.length||members.some(m=>!m.r.groupFrozen))return false;
    const expected=Math.max(...members.map(m=>Number(m.r.groupExpected)||0));
    if(expected&&members.length!==expected)return false;

    const snapshot=members.map(m=>({ball:m.ball,y:m.ly,x:m.lx}));
    for(const s of snapshot)if(g.board[s.y][s.x]===s.ball)g.board[s.y][s.x]=null;
    const plan=hexGarbageMatchGroupCells(g,members);
    if(!plan){
        hexGarbageRestoreGroupBoard(g,snapshot);
        return false;
    }

    // The new cells are unique by matching; install every logical location in
    // one operation before releasing any member from continuous authority.
    for(const m of members){
        const c=plan.get(m.ball.id);
        if(!c){hexGarbageRestoreGroupBoard(g,snapshot);return false;}
        g.board[c.y][c.x]=m.ball;
        if(typeof noteBoardCell==="function")noteBoardCell(g.board,c.y,m.ball);
    }
    if(typeof clearBoardEquilibriumLocks==="function")clearBoardEquilibriumLocks(g.board);

    for(const m of members){
        const c=plan.get(m.ball.id);
        m.r.groupFinalized=true;
        m.v.x=c.x;m.v.y=c.y;m.v.vy=0;m.v.motionSpeed=0;
        m.ball.fallPath=[];
        delete m.ball._hexContinuousSettled;
        delete m.ball._hexGarbageRelax;
        m.ball._hexGarbageGroupFinalized=true;
    }
    g.ver=(g.ver||0)+1;
    return true;
}

function hexGarbageUnfreezeGroupForMoreRelax(members){
    for(const m of members){
        m.r.groupFrozen=false;
        m.r.stableT=0;
        // Prevent the max-age branch from immediately freezing it again.
        m.r.age=Math.min(Number(m.r.age)||0,HEX_GARBAGE_RELAX_MAX_AGE*.55);
        m.r.vx=0;m.r.vy=0;
    }
}

function hexGarbageTryFinalizeGroups(g){
    let finalized=0;
    for(const [key,members] of hexGarbageAllRelaxGroups(g)){
        if(!members.length||members.some(m=>!m.r.groupFrozen))continue;
        if(hexGarbageFinalizeGroup(g,key,members)){finalized++;continue;}
        // All members are locally stable but not yet close enough to a unique
        // lattice packing. Resume the WHOLE group together; never one member.
        hexGarbageUnfreezeGroupForMoreRelax(members);
    }
    return finalized;
}

const __hexGarbageRelaxStepBeforeGroupAtomic=hexGarbageRelaxStep;
hexGarbageRelaxStep=function(g,dt){
    const before=hexGarbageRelaxMembers(g);
    const frozen=[];

    // Locally-stable members stay at continuous centres and act as fixed support
    // while siblings finish. Remove them only from the moving-set for this call.
    for(const m of before){
        if(!m.r.groupFrozen)continue;
        frozen.push({ball:m.ball,r:m.r,v:m.v,x:m.v.x,y:m.v.y,vy:m.v.vy,motion:m.v.motionSpeed});
        delete m.ball._hexGarbageRelax;
    }

    let result;
    try{result=__hexGarbageRelaxStepBeforeGroupAtomic(g,dt);}
    finally{
        for(const f of frozen){
            f.ball._hexGarbageRelax=f.r;
            f.v.x=f.r.px/.5;f.v.y=(f.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
            f.v.vy=0;f.v.motionSpeed=0;
            delete f.ball._hexContinuousSettled;
        }
    }

    // The wrapped solver signals local completion by deleting the relax state.
    // Convert that signal into a frozen continuous member instead of letting the
    // legacy renderer canonicalize it independently.
    for(const m of before){
        if(m.r.groupFrozen)continue;
        if(m.ball._hexGarbageRelax)continue;
        m.r.groupFrozen=true;m.r.vx=0;m.r.vy=0;
        m.ball._hexGarbageRelax=m.r;
        delete m.ball._hexContinuousSettled;
        m.v.x=m.r.px/.5;m.v.y=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=0;m.v.motionSpeed=0;
    }

    hexGarbageTryFinalizeGroups(g);
    return result;
};

// Do not let the GARBAGE phase end while any first-contact group still owns
// continuous centres; otherwise normal play could observe logical/visual drift.
const __hexGarbageBatchDoneBeforeGroupAtomic=garbageBatchDone;
garbageBatchDone=function(g){
    return __hexGarbageBatchDoneBeforeGroupAtomic(g)&&!hexGarbageHasContinuousGroups(g);
};
