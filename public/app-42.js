/* Preserve first-contact horizontal ordering during monotone relaxation.
 *
 * app-41 removed upward recoil.  A long STRAIGHT could still let two released
 * circles exchange horizontal order during iterative lateral projections; once
 * their order flipped, later pair solves could converge both centres onto the
 * same X.  Store each centre's first-contact position and use that immutable
 * ordering for every pair constraint.  The required tangent separation is then
 * signed, so crossing a sibling increases (rather than hides) the violation.
 */
const __hexGarbageBeginRelaxBeforeStableOrder=hexGarbageBeginRelax;
hexGarbageBeginRelax=function(ball,v,pack,exactX,exactY){
    __hexGarbageBeginRelaxBeforeStableOrder(ball,v,pack,exactX,exactY);
    const r=ball?._hexGarbageRelax;
    if(r){
        r.homePx=exactX*.5;
        r.homePy=cellCenterYNorm(exactY);
        r.orderId=Number(ball.id)||0;
    }
};

function hexGarbageStablePairSide(a,b){
    const ah=Number.isFinite(a.r.homePx)?a.r.homePx:a.r.px;
    const bh=Number.isFinite(b.r.homePx)?b.r.homePx:b.r.px;
    if(Math.abs(ah-bh)>1e-9)return Math.sign(ah-bh);
    const ay=Number.isFinite(a.r.homePy)?a.r.homePy:a.r.py;
    const by=Number.isFinite(b.r.homePy)?b.r.homePy:b.r.py;
    if(Math.abs(ay-by)>1e-9){
        // Same contact column on different formation rows: use an immutable id
        // tiebreak so the pair always chooses the same lateral side.
        return (a.r.orderId||a.ball.id||0)<(b.r.orderId||b.ball.id||0)?-1:1;
    }
    return (a.r.orderId||a.ball.id||0)<(b.r.orderId||b.ball.id||0)?-1:1;
}

hexGarbageMonoPairHorizontal=function(a,b,target=HEX_GARBAGE_MONO_CONTACT_DIST){
    const maxX=(W2-1)*.5,dy=a.r.py-b.r.py;
    const req=hexGarbageMonoRequiredX(dy,target);
    if(req<=0)return false;

    const side=hexGarbageStablePairSide(a,b);
    // Signed separation is critical: if the pair has crossed, sep is negative
    // and the solver must undo the crossing plus restore one-diameter tangent.
    let sep=side*(a.r.px-b.r.px);
    if(sep>=req-HEX_GARBAGE_MONO_EPS)return false;
    let need=req-sep;

    const availA=Math.max(0,side>0?maxX-a.r.px:a.r.px);
    const availB=Math.max(0,side>0?b.r.px:maxX-b.r.px);
    let moveA=Math.min(need*.5,availA);
    let moveB=Math.min(need-moveA,availB);
    if(moveA+moveB<need-HEX_GARBAGE_MONO_EPS){
        const x=Math.min(need-moveA-moveB,Math.max(0,availA-moveA));moveA+=x;
        const y=Math.min(need-moveA-moveB,Math.max(0,availB-moveB));moveB+=y;
    }
    a.r.px+=side*moveA;
    b.r.px-=side*moveB;

    sep=side*(a.r.px-b.r.px);
    if(sep<req-HEX_GARBAGE_MONO_EPS){
        // Width exhausted: preserve both Y histories and increase only the
        // lower centre's downward separation if floor space exists.
        const dx=a.r.px-b.r.px;
        const reqDy=Math.sqrt(Math.max(0,target*target-dx*dx));
        if(a.r.py>=b.r.py){
            a.r.py=Math.min(FLOOR_CENTER_N,Math.max(a.r.py,b.r.py+reqDy));
        }else{
            b.r.py=Math.min(FLOOR_CENTER_N,Math.max(b.r.py,a.r.py+reqDy));
        }
    }

    const rel=(a.r.vx-b.r.vx)*side;
    if(rel<0){const j=-rel*.5;a.r.vx+=j*side;b.r.vx-=j*side;}
    return true;
};

hexGarbageRelaxPair=function(a,b){
    const side=hexGarbageStablePairSide(a,b);
    const dy=a.r.py-b.r.py,req=hexGarbageMonoRequiredX(dy,HEX_GARBAGE_MONO_CONTACT_DIST);
    const signed=side*(a.r.px-b.r.px);
    if(Math.hypot(a.r.px-b.r.px,dy)>=HEX_GARBAGE_MONO_CONTACT_DIST&&signed>=req-HEX_GARBAGE_MONO_EPS)return false;
    return hexGarbageMonoPairHorizontal(a,b,HEX_GARBAGE_MONO_CONTACT_DIST);
};
