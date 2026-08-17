/* Continuous post-contact garbage relaxation.
 *
 * A garbage formation is rigid only until its first real pile/floor contact.
 * At that instant every member is logically reserved on a unique board cell,
 * but its rendered centre stays at the exact continuous contact pose.  The
 * released circles then relax independently at 120 Hz against the live pile,
 * siblings, floor and side walls.  This separates logical ownership from the
 * contact animation and removes the impossible "10 touching STRAIGHT balls ->
 * 9 cells on the next lattice row" snap that caused tunnelling/recoil.
 */
const HEX_GARBAGE_RELAX_MAX_AGE=1.20;
const HEX_GARBAGE_RELAX_STABLE_SPEED=0.075;
const HEX_GARBAGE_RELAX_STABLE_TIME=0.12;
const HEX_GARBAGE_RELAX_OUTWARD_SPEED=0.085;
const HEX_GARBAGE_RELAX_CONTACT_DIST=1.0000002;
const HEX_GARBAGE_RELAX_SOLVER_PASSES=10;

/* Whole-release logical reservation may use one nearby cell above the current
 * continuous centre when the contact formation has more centres than the next
 * lattice row has cells.  This is LOGICAL ONLY: app-40 suppresses the visual
 * handoff to that cell and keeps the ball at its real contact centre. */
hexGarbageWholeReleaseCandidates=function(g,x,visualY){
    const firstY=Math.max(BOARD_MIN_ROW,Math.floor(visualY)-1);
    const lastY=Math.min(ROWS-1,Math.ceil(visualY)+2),out=[];
    for(let y=firstY;y<=lastY;y++){
        for(let dx=-3;dx<=3;dx++){
            const cx=x+dx;
            if(!valid(cx,y)||g.board[y][cx])continue;
            const realDist=Math.hypot((cx-x)*.5,(y-visualY)*HEX_ROW_H);
            if(realDist>1.000001)continue;
            if(!visualPointSafe(g,-1,cx,y,HEX_MIN_DIST))continue;
            if(typeof __hexdropGarbageCellCrossesActivePath==="function"&&
               __hexdropGarbageCellCrossesActivePath(g,cx,y))continue;
            const upward=Math.max(0,visualY-y)*HEX_ROW_H;
            const score=realDist+upward*8+Math.abs(dx)*1e-5;
            out.push({x:cx,y,score});
        }
    }
    out.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    return out;
};

function hexGarbageWithAtomicLogicalReservation(fn){
    const oldSettle=settlePass;
    const oldPrepare=hexGarbagePrepareContinuousPath;
    settlePass=function(){return false;};
    // Keep the renderer at exact contact.  A logical cell is a reservation only
    // until continuous relaxation has finished.
    hexGarbagePrepareContinuousPath=function(){};
    try{return fn();}
    finally{
        settlePass=oldSettle;
        hexGarbagePrepareContinuousPath=oldPrepare;
    }
}

function hexGarbageBeginRelax(ball,v,pack,exactX,exactY){
    if(!ball||!v)return;
    const centre=pack.ax+(pack.pat.reduce((n,s)=>n+s[0],0)/Math.max(1,pack.pat.length));
    let dir=Math.sign(exactX-centre);
    if(!dir)dir=((ball.id||0)&1)?-1:1;
    ball._hexGarbageRelax={
        px:exactX*.5,
        py:cellCenterYNorm(exactY),
        vx:dir*HEX_GARBAGE_RELAX_OUTWARD_SPEED,
        vy:Math.max(0,Number(pack.vy)||0),
        age:0,stableT:0
    };
    ball._hexContinuousSettled=false;
    v.x=exactX;v.y=exactY;
    v.vy=Math.max(0,(Number(pack.vy)||0)/HEX_ROW_H);
    v.motionSpeed=Math.max(RELEASE_INITIAL_VY,Number(pack.vy)||0);
}

/* app-39's release orchestration is retained, but insertion is now truly
 * atomic: no per-member settle and no contact->lattice visual path. */
hexGarbageReleaseWholePacketAt=function(g,pack,anchorY){
    if(!g||!pack?.pat?.length||!Number.isFinite(anchorY))return 0;
    if(!pack._hexSplitTriggered){
        pack._hexSplitTriggered=true;
        pack._hexSplitTriggeredAt=Number(g.garbageClock)||0;
    }
    if(!Number.isFinite(pack._hexWholeReleaseAnchorY))pack._hexWholeReleaseAnchorY=anchorY;
    anchorY=pack._hexWholeReleaseAnchorY;
    pack._hexWholeReleasePending=true;

    // Rebuild the global cell plan before any sibling is inserted.  app-40's
    // candidate set guarantees a full plan for the contact formation whenever
    // enough nearby logical cells actually exist.
    if(!(pack._hexWholeReleasePreExistingIds instanceof Set))pack._hexWholeReleasePreExistingIds=hexGarbageBoardIds(g);
    if(!(pack._hexWholeReleaseSiblingIds instanceof Set))pack._hexWholeReleaseSiblingIds=new Set();
    if(!(pack._hexWholeReleaseCellPlan instanceof Map)){
        pack._hexWholeReleaseCellPlan=hexGarbageBuildWholeReleaseCellPlan(g,pack,anchorY);
    }
    const preExistingIds=pack._hexWholeReleasePreExistingIds;
    const sameReleaseIds=pack._hexWholeReleaseSiblingIds;
    const cellPlan=pack._hexWholeReleaseCellPlan;
    if(!(cellPlan instanceof Map)||cellPlan.size<pack.pat.length){
        pack.y=anchorY;pack.contactY=anchorY;pack.vy=0;
        pack._hexContactBarrierY=anchorY;pack._hexContactClamped=true;
        return 0;
    }

    let released=0;
    hexGarbageWithAtomicLogicalReservation(()=>
      hexGarbageWithWholeReleaseCellPlan(g,cellPlan,()=>{
        for(let i=pack.pat.length-1;i>=0;i--){
            const slot=pack.pat[i];
            const exactX=pack.ax+slot[0],exactY=anchorY+slot[1];
            const beforeEntries=pack.entryBalls?.length||0;
            const ok=hexGarbageWithSameReleaseSiblingsHidden(g,sameReleaseIds,()=>
                materializeGarbageBallAtContact(g,pack,i,anchorY));
            if(!ok)continue;
            released++;
            const entry=pack.entryBalls?.[beforeEntries]||pack.entryBalls?.[pack.entryBalls.length-1];
            const ball=entry?hexGarbageBoardBallById(g,entry.id):null;
            const v=ball?g.vis.get(ball.id):null;
            if(entry?.id&&!preExistingIds.has(entry.id))sameReleaseIds.add(entry.id);
            if(ball&&v)hexGarbageBeginRelax(ball,v,pack,exactX,exactY);
        }
      })
    );

    if(pack.pat.length){
        // A pre-existing path can still delay a reservation.  Keep the exact
        // first-contact pose and retry without resuming free fall.
        pack.y=anchorY;pack.contactY=anchorY;pack.vy=0;
        pack._hexContactBarrierY=anchorY;pack._hexContactClamped=true;
    }else{
        pack.landed=true;
        pack.releaseTime=Number(g.garbageClock)||0;
        hexGarbageClearWholeReleaseContext(pack);
        delete pack._hexContactClamped;
        delete pack._hexContactBarrierY;
    }
    delete pack._hexContactFrame;
    return released;
};

function hexGarbageRelaxMembers(g){
    const out=[];
    if(!g?.board)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const r=ball?._hexGarbageRelax;
        const v=ball?g.vis.get(ball.id):null;
        if(ball&&r&&v)out.push({ball,v,r,lx:x,ly:y});
    }
    return out;
}

function hexGarbageRelaxFixed(g,movingIds){
    const out=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||movingIds.has(ball.id))continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        out.push({id:ball.id,px:v.x*.5,py:cellCenterYNorm(v.y)});
    }
    return out;
}

function hexGarbageRelaxWallFloor(m){
    const maxX=(W2-1)*.5;
    if(m.r.px<0){m.r.px=0;if(m.r.vx<0)m.r.vx=0;}
    if(m.r.px>maxX){m.r.px=maxX;if(m.r.vx>0)m.r.vx=0;}
    if(m.r.py>FLOOR_CENTER_N){m.r.py=FLOOR_CENTER_N;if(m.r.vy>0)m.r.vy=0;}
}

function hexGarbageRelaxFixedContact(m,s){
    let dx=m.r.px-s.px,dy=m.r.py-s.py,d=Math.hypot(dx,dy);
    if(d>=HEX_GARBAGE_RELAX_CONTACT_DIST)return false;
    if(d<1e-9){dx=((m.ball.id||1)&1)?.5:-.5;dy=-Math.sqrt(.75);d=1;}
    const nx=dx/d,ny=dy/d,pen=HEX_GARBAGE_RELAX_CONTACT_DIST-d;
    m.r.px+=nx*pen;m.r.py+=ny*pen;
    const vn=m.r.vx*nx+m.r.vy*ny;
    if(vn<0){m.r.vx-=vn*nx;m.r.vy-=vn*ny;}
    // Light contact friction damps chatter without introducing easing to the
    // established lattice slide paths.
    const tx=-ny,ty=nx,vt=m.r.vx*tx+m.r.vy*ty;
    const keep=.992;m.r.vx+=(keep-1)*vt*tx;m.r.vy+=(keep-1)*vt*ty;
    return true;
}

function hexGarbageRelaxPair(a,b){
    let dx=a.r.px-b.r.px,dy=a.r.py-b.r.py,d=Math.hypot(dx,dy);
    if(d>=HEX_GARBAGE_RELAX_CONTACT_DIST)return false;
    if(d<1e-9){dx=((a.ball.id||1)<(b.ball.id||2))?-.5:.5;dy=-Math.sqrt(.75);d=1;}
    const nx=dx/d,ny=dy/d,pen=(HEX_GARBAGE_RELAX_CONTACT_DIST-d)*.5;
    a.r.px+=nx*pen;a.r.py+=ny*pen;b.r.px-=nx*pen;b.r.py-=ny*pen;
    const rvx=a.r.vx-b.r.vx,rvy=a.r.vy-b.r.vy,vn=rvx*nx+rvy*ny;
    if(vn<0){const j=-vn*.5;a.r.vx+=j*nx;a.r.vy+=j*ny;b.r.vx-=j*nx;b.r.vy-=j*ny;}
    return true;
}

function hexGarbageRelaxStep(g,dt){
    const moving=hexGarbageRelaxMembers(g);if(!moving.length)return 0;
    const ids=new Set(moving.map(m=>m.ball.id)),fixed=hexGarbageRelaxFixed(g,ids);
    const h=Math.max(0,Math.min(PHYSICS_FRAME,dt));
    for(const m of moving){
        m.r.vy+=GRAV*h;
        m.r.px+=m.r.vx*h;m.r.py+=m.r.vy*h;
        m.r.age+=h;
    }
    let contacts=0;
    for(let pass=0;pass<HEX_GARBAGE_RELAX_SOLVER_PASSES;pass++){
        let changed=false;
        for(const m of moving){
            const beforeX=m.r.px,beforeY=m.r.py;hexGarbageRelaxWallFloor(m);
            if(beforeX!==m.r.px||beforeY!==m.r.py){changed=true;contacts++;}
            for(const s of fixed)if(hexGarbageRelaxFixedContact(m,s)){changed=true;contacts++;}
        }
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++)if(hexGarbageRelaxPair(moving[i],moving[j])){changed=true;contacts++;}
        for(const m of moving)hexGarbageRelaxWallFloor(m);
        if(!changed)break;
    }
    for(const m of moving){
        m.r.vx*=.997;
        const speed=Math.hypot(m.r.vx,m.r.vy);
        if(speed<=HEX_GARBAGE_RELAX_STABLE_SPEED)m.r.stableT+=h;else m.r.stableT=0;
        if(m.r.stableT>=HEX_GARBAGE_RELAX_STABLE_TIME||m.r.age>=HEX_GARBAGE_RELAX_MAX_AGE){
            m.r.vx=0;m.r.vy=0;
            m.ball._hexContinuousSettled=true;
            delete m.ball._hexGarbageRelax;
        }
        m.v.x=m.r.px/.5;
        m.v.y=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=Math.max(0,m.r.vy/HEX_ROW_H);
        m.v.motionSpeed=Math.hypot(m.r.vx,m.r.vy);
    }
    return contacts;
}

function hexGarbageRelaxAdvance(g,dt){
    let remain=Math.max(0,Number(dt)||0),guard=0;
    while(remain>1e-10&&guard++<16){const h=Math.min(PHYSICS_FRAME,remain);hexGarbageRelaxStep(g,h);remain-=h;}
}

/* If a later clear/support change gives a continuous-settled garbage ball a
 * normal lattice path, bridge from its current rendered centre into that path
 * before the standard visual integrator sees it. */
function hexGarbageBridgeContinuousSettled(g){
    if(!g?.board)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball?._hexContinuousSettled||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        if(!ball.fallPath[0]?.garbageContinuousHandoff){
            hexGarbagePrepareContinuousPath(g,ball,{id:ball.id,x,y},[v.x,v.y]);
        }
        delete ball._hexContinuousSettled;
    }
}

const __hexUpdateGarbagePacksBeforeContinuousRelax=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const result=__hexUpdateGarbagePacksBeforeContinuousRelax(g,dt);
    hexGarbageRelaxAdvance(g,dt);
    return result;
};

const __hexUpdateVisualsBeforeContinuousGarbageBridge=updateVisuals;
updateVisuals=function(g,dt){
    hexGarbageBridgeContinuousSettled(g);
    const result=__hexUpdateVisualsBeforeContinuousGarbageBridge(g,dt);
    // Relaxing centres are authoritative; older settled/canonical visual layers
    // must not pull them toward their logical reservation cells.
    for(const m of hexGarbageRelaxMembers(g)){
        m.v.x=m.r.px/.5;m.v.y=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=Math.max(0,m.r.vy/HEX_ROW_H);m.v.motionSpeed=Math.hypot(m.r.vx,m.r.vy);
    }
    return result;
};

const __hexResolveVisualContactsBeforeContinuousGarbageRelax=resolveVisualContacts;
resolveVisualContacts=function(g){
    const result=__hexResolveVisualContactsBeforeContinuousGarbageRelax(g);
    // Re-apply/solve the continuous released centres after the legacy projection
    // so no later layer can reintroduce overlap or logical-grid suction.
    if(hexGarbageRelaxMembers(g).length)hexGarbageRelaxStep(g,0);
    return result;
};
