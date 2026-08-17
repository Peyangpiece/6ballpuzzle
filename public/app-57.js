/* Exact one-diameter contact for continuous garbage.
 *
 * A full STRAIGHT row contains ten balls across exactly nine physical units of
 * board width. The older 1.00001 contact target is therefore geometrically
 * impossible at the walls: the solver keeps trying to create ten micro-gaps,
 * then pushes lower balls down when horizontal space is exhausted. In dense
 * STRAIGHT contact this creates both huge iteration counts and real overlap.
 *
 * The reference balls touch with no visible gap. Keep collision rejection
 * strict, but make the continuous garbage contact manifold exactly one ball
 * diameter, matching the board packing and the final render invariant.
 */
const HEX_GARBAGE_EXACT_CONTACT_DIST=1.0;

hexGarbageMonoRequiredX=function(dy,target=HEX_GARBAGE_EXACT_CONTACT_DIST){
    const ady=Math.abs(dy);
    if(ady>=target)return 0;
    return Math.sqrt(Math.max(0,target*target-dy*dy));
};

hexGarbageMonoPlaceLaterally=function(m,s,target=HEX_GARBAGE_EXACT_CONTACT_DIST){
    const maxX=(W2-1)*.5,dy=m.r.py-s.py;
    const req=hexGarbageMonoRequiredX(dy,target);
    if(req<=0)return false;
    let side=hexGarbageMonoSide(m.r.px,s.px,m.ball.id||0);
    let tx=s.px+side*req;
    if(tx<-HEX_GARBAGE_MONO_EPS||tx>maxX+HEX_GARBAGE_MONO_EPS){side=-side;tx=s.px+side*req;}
    tx=Math.max(0,Math.min(maxX,tx));
    if(Math.abs(tx-m.r.px)<=HEX_GARBAGE_MONO_EPS)return false;
    m.r.px=tx;
    if(side>0&&m.r.vx<0)m.r.vx=0;
    if(side<0&&m.r.vx>0)m.r.vx=0;
    return true;
};

hexGarbageRelaxFixedContact=function(m,s){
    const target=HEX_GARBAGE_EXACT_CONTACT_DIST;
    let dx=m.r.px-s.px,dy=m.r.py-s.py,d=Math.hypot(dx,dy);
    if(d>=target)return false;
    if(dy>HEX_GARBAGE_MONO_EPS&&m.r.py<FLOOR_CENTER_N-HEX_GARBAGE_MONO_EPS){
        if(d<1e-9){dx=hexGarbageMonoSide(m.r.px,s.px,m.ball.id||0)*.5;dy=Math.sqrt(.75);d=1;}
        const nx=dx/d,ny=Math.max(0,dy/d),pen=target-d;
        m.r.px+=nx*pen;
        m.r.py=Math.min(FLOOR_CENTER_N,m.r.py+ny*pen);
        const vn=m.r.vx*nx+m.r.vy*ny;
        if(vn<0){m.r.vx-=vn*nx;m.r.vy-=vn*ny;}
        return true;
    }
    return hexGarbageMonoPlaceLaterally(m,s,target);
};

hexGarbageMonoPairHorizontal=function(a,b,target=HEX_GARBAGE_EXACT_CONTACT_DIST){
    const maxX=(W2-1)*.5,dy=a.r.py-b.r.py;
    const req=hexGarbageMonoRequiredX(dy,target);
    let dx=a.r.px-b.r.px,ad=Math.abs(dx);
    if(ad>=req-HEX_GARBAGE_MONO_EPS)return false;
    let side=Math.abs(dx)>1e-9?Math.sign(dx):((a.ball.id||0)<(b.ball.id||0)?-1:1);
    const need=req-ad;
    const availA=Math.max(0,side>0?maxX-a.r.px:a.r.px);
    const availB=Math.max(0,side>0?b.r.px:maxX-b.r.px);
    let moveA=Math.min(need*.5,availA);
    let moveB=Math.min(need-moveA,availB);
    if(moveA+moveB<need-HEX_GARBAGE_MONO_EPS){
        const extraA=Math.min(need-moveA-moveB,Math.max(0,availA-moveA));moveA+=extraA;
        const extraB=Math.min(need-moveA-moveB,Math.max(0,availB-moveB));moveB+=extraB;
    }
    a.r.px+=side*moveA;b.r.px-=side*moveB;
    dx=a.r.px-b.r.px;ad=Math.abs(dx);
    if(ad<req-HEX_GARBAGE_MONO_EPS){
        const reqDy=Math.sqrt(Math.max(0,target*target-dx*dx));
        if(a.r.py>=b.r.py)a.r.py=Math.min(FLOOR_CENTER_N,Math.max(a.r.py,b.r.py+reqDy));
        else b.r.py=Math.min(FLOOR_CENTER_N,Math.max(b.r.py,a.r.py+reqDy));
    }
    const nside=Math.sign(a.r.px-b.r.px)||side;
    const rel=(a.r.vx-b.r.vx)*nside;
    if(rel<0){const j=-rel*.5;a.r.vx+=j*nside;b.r.vx-=j*nside;}
    return true;
};

hexGarbageRelaxPair=function(a,b){
    const d=Math.hypot(a.r.px-b.r.px,a.r.py-b.r.py);
    if(d>=HEX_GARBAGE_EXACT_CONTACT_DIST)return false;
    return hexGarbageMonoPairHorizontal(a,b,HEX_GARBAGE_EXACT_CONTACT_DIST);
};

hexGarbageSweepTangentY=function(px,sx,sy,target=HEX_GARBAGE_EXACT_CONTACT_DIST){
    const dx=px-sx,adx=Math.abs(dx);
    if(adx>=target)return Infinity;
    return sy-Math.sqrt(Math.max(0,target*target-dx*dx));
};

hexGarbageRenderSweepTangent=function(px,sx,sy){
    const dx=px-sx,adx=Math.abs(dx),target=HEX_GARBAGE_EXACT_CONTACT_DIST;
    if(adx>=target)return Infinity;
    return sy-Math.sqrt(Math.max(0,target*target-dx*dx));
};
