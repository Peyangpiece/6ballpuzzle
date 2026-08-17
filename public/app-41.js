/* Monotone constrained contact solver for continuous released garbage.
 *
 * app-40 introduced continuous post-contact circles, but its symmetric normal
 * projection could move an upper circle slightly upward while removing
 * penetration.  The reference motion never recoils upward: once garbage starts
 * descending, every rendered centre is monotone in Y.  Resolve contacts with a
 * unilateral constraint instead: keep Y >= the centre's previous Y and obtain
 * missing separation laterally whenever an upward correction would otherwise
 * be required.  A lower circle may still move downward, never upward.
 */
const HEX_GARBAGE_MONO_CONTACT_DIST=1.00001;
const HEX_GARBAGE_MONO_PASSES=32;
const HEX_GARBAGE_MONO_EPS=1e-10;

function hexGarbageMonoSide(px,otherPx,id){
    const dx=px-otherPx;
    if(Math.abs(dx)>1e-9)return Math.sign(dx);
    const maxX=(W2-1)*.5;
    if(px<maxX*.5-1e-9)return 1;
    if(px>maxX*.5+1e-9)return-1;
    return (id&1)?-1:1;
}

function hexGarbageMonoRequiredX(dy,target=HEX_GARBAGE_MONO_CONTACT_DIST){
    const ady=Math.abs(dy);
    if(ady>=target)return 0;
    return Math.sqrt(Math.max(0,target*target-dy*dy));
}

function hexGarbageMonoPlaceLaterally(m,s,target=HEX_GARBAGE_MONO_CONTACT_DIST){
    const maxX=(W2-1)*.5,dy=m.r.py-s.py;
    const req=hexGarbageMonoRequiredX(dy,target);
    if(req<=0)return false;
    let side=hexGarbageMonoSide(m.r.px,s.px,m.ball.id||0);
    let tx=s.px+side*req;
    if(tx<-HEX_GARBAGE_MONO_EPS||tx>maxX+HEX_GARBAGE_MONO_EPS){
        side=-side;tx=s.px+side*req;
    }
    tx=Math.max(0,Math.min(maxX,tx));
    if(Math.abs(tx-m.r.px)<=HEX_GARBAGE_MONO_EPS)return false;
    m.r.px=tx;
    // Remove only the horizontal component that points back into the support.
    if(side>0&&m.r.vx<0)m.r.vx=0;
    if(side<0&&m.r.vx>0)m.r.vx=0;
    return true;
}

hexGarbageRelaxFixedContact=function(m,s){
    let dx=m.r.px-s.px,dy=m.r.py-s.py,d=Math.hypot(dx,dy);
    if(d>=HEX_GARBAGE_MONO_CONTACT_DIST)return false;

    // If the moving circle is below the fixed circle, downward normal
    // separation is legal and is the most direct correction, except at floor.
    if(dy>HEX_GARBAGE_MONO_EPS&&m.r.py<FLOOR_CENTER_N-HEX_GARBAGE_MONO_EPS){
        if(d<1e-9){dx=hexGarbageMonoSide(m.r.px,s.px,m.ball.id||0)*.5;dy=Math.sqrt(.75);d=1;}
        const nx=dx/d,ny=Math.max(0,dy/d),pen=HEX_GARBAGE_MONO_CONTACT_DIST-d;
        const nextY=Math.min(FLOOR_CENTER_N,m.r.py+ny*pen);
        m.r.px+=nx*pen;
        m.r.py=nextY;
        const vn=m.r.vx*nx+m.r.vy*ny;
        if(vn<0){m.r.vx-=vn*nx;m.r.vy-=vn*ny;}
        return true;
    }

    // The common support case has dy < 0.  Never push the upper ball upward;
    // move it sideways to the exact tangent instead.
    return hexGarbageMonoPlaceLaterally(m,s);
};

function hexGarbageMonoPairHorizontal(a,b,target=HEX_GARBAGE_MONO_CONTACT_DIST){
    const maxX=(W2-1)*.5,dy=a.r.py-b.r.py;
    const req=hexGarbageMonoRequiredX(dy,target);
    let dx=a.r.px-b.r.px,ad=Math.abs(dx);
    if(ad>=req-HEX_GARBAGE_MONO_EPS)return false;

    let side=Math.abs(dx)>1e-9?Math.sign(dx):((a.ball.id||0)<(b.ball.id||0)?-1:1);
    const need=req-ad;
    let availA=side>0?maxX-a.r.px:a.r.px;
    let availB=side>0?b.r.px:maxX-b.r.px;
    let moveA=Math.min(need*.5,Math.max(0,availA));
    let moveB=Math.min(need-moveA,Math.max(0,availB));
    if(moveA+moveB<need-HEX_GARBAGE_MONO_EPS){
        const extraA=Math.min(need-moveA-moveB,Math.max(0,availA-moveA));moveA+=extraA;
        const extraB=Math.min(need-moveA-moveB,Math.max(0,availB-moveB));moveB+=extraB;
    }
    a.r.px+=side*moveA;
    b.r.px-=side*moveB;

    // If both side walls make horizontal separation insufficient, only the
    // lower centre may move farther down.  This preserves monotone Y.
    dx=a.r.px-b.r.px;ad=Math.abs(dx);
    if(ad<req-HEX_GARBAGE_MONO_EPS){
        const reqDy=Math.sqrt(Math.max(0,target*target-dx*dx));
        if(a.r.py>=b.r.py){
            a.r.py=Math.min(FLOOR_CENTER_N,Math.max(a.r.py,b.r.py+reqDy));
        }else{
            b.r.py=Math.min(FLOOR_CENTER_N,Math.max(b.r.py,a.r.py+reqDy));
        }
    }

    const nside=Math.sign(a.r.px-b.r.px)||side;
    const rel=(a.r.vx-b.r.vx)*nside;
    if(rel<0){const j=-rel*.5;a.r.vx+=j*nside;b.r.vx-=j*nside;}
    return true;
}

hexGarbageRelaxPair=function(a,b){
    const d=Math.hypot(a.r.px-b.r.px,a.r.py-b.r.py);
    if(d>=HEX_GARBAGE_MONO_CONTACT_DIST)return false;
    return hexGarbageMonoPairHorizontal(a,b);
};

hexGarbageRelaxStep=function(g,dt){
    const moving=hexGarbageRelaxMembers(g);if(!moving.length)return 0;
    const ids=new Set(moving.map(m=>m.ball.id)),fixed=hexGarbageRelaxFixed(g,ids);
    const h=Math.max(0,Math.min(PHYSICS_FRAME,dt));
    const prevY=new Map();

    for(const m of moving){
        prevY.set(m.ball.id,m.r.py);
        m.r.vy=Math.max(0,m.r.vy+GRAV*h);
        m.r.px+=m.r.vx*h;
        m.r.py+=m.r.vy*h;
        m.r.age+=h;
        hexGarbageRelaxWallFloor(m);
        // Floor projection can only remove this frame's overshoot, never go
        // above the previously rendered centre.
        m.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(m.ball.id),m.r.py));
    }

    let contacts=0;
    for(let pass=0;pass<HEX_GARBAGE_MONO_PASSES;pass++){
        let changed=false;
        for(const m of moving){
            const minY=prevY.get(m.ball.id);
            const beforeX=m.r.px,beforeY=m.r.py;
            hexGarbageRelaxWallFloor(m);
            m.r.py=Math.min(FLOOR_CENTER_N,Math.max(minY,m.r.py));
            if(Math.abs(beforeX-m.r.px)>1e-12||Math.abs(beforeY-m.r.py)>1e-12){changed=true;contacts++;}
            for(const s of fixed){
                if(hexGarbageRelaxFixedContact(m,s)){changed=true;contacts++;}
                m.r.py=Math.min(FLOOR_CENTER_N,Math.max(minY,m.r.py));
                hexGarbageRelaxWallFloor(m);
            }
        }
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
            if(hexGarbageRelaxPair(moving[i],moving[j])){changed=true;contacts++;}
            moving[i].r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(moving[i].ball.id),moving[i].r.py));
            moving[j].r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(moving[j].ball.id),moving[j].r.py));
            hexGarbageRelaxWallFloor(moving[i]);hexGarbageRelaxWallFloor(moving[j]);
        }
        if(!changed)break;
    }

    // Final constrained projection.  This second short sweep handles the wall
    // interaction of a long STRAIGHT row and leaves a numerical margin above
    // HEX_MIN_DIST instead of relying on the rendering tolerance.
    for(let pass=0;pass<16;pass++){
        let changed=false;
        for(const m of moving)for(const s of fixed){
            if(Math.hypot(m.r.px-s.px,m.r.py-s.py)<HEX_GARBAGE_MONO_CONTACT_DIST-1e-9){
                if(hexGarbageRelaxFixedContact(m,s)){changed=true;contacts++;}
                m.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(m.ball.id),m.r.py));
                hexGarbageRelaxWallFloor(m);
            }
        }
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
            if(Math.hypot(moving[i].r.px-moving[j].r.px,moving[i].r.py-moving[j].r.py)<HEX_GARBAGE_MONO_CONTACT_DIST-1e-9){
                if(hexGarbageRelaxPair(moving[i],moving[j])){changed=true;contacts++;}
                moving[i].r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(moving[i].ball.id),moving[i].r.py));
                moving[j].r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(moving[j].ball.id),moving[j].r.py));
                hexGarbageRelaxWallFloor(moving[i]);hexGarbageRelaxWallFloor(moving[j]);
            }
        }
        if(!changed)break;
    }

    for(const m of moving){
        // Monotone invariant is authoritative at the end of every visible step.
        m.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(m.ball.id),m.r.py));
        m.r.vx*=.997;
        m.r.vy=Math.max(0,m.r.vy);
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
};
