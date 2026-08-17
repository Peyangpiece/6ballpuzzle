/* Gravity-driven accumulated-pile rendering.
 *
 * Logical resolution stays on the canonical hex grid so the final resting
 * cells, chains and multiplayer state remain deterministic.  Only the motion
 * between those cells changes: once pile rigidity has been released, speed is
 * propagated from segment to segment and gravity determines the time/progress
 * along free-fall, straight downhill and ball-contact arcs.
 *
 * A pivot segment is a frictionless circle contact.  Its speed follows
 * v^2 = v0^2 + 2 g Δy, and the resulting travel-time integral is sampled into
 * a small lookup table.  This removes the constant-speed restart at every
 * logical lattice step while keeping the exact endpoint on the grid.
 */
const HEX_PILE_GRAVITY_PHYSICAL=GRAV*HEX_ROW_H;
const HEX_PILE_GRAVITY_MIN_SPEED=0.35;
const HEX_PILE_GRAVITY_PROFILE_SAMPLES=96;

function hexPileGravityEntrySpeed(state){
    const fromSpeed=Math.max(0,Number(state?.speed)||0);
    const fromVy=Math.max(0,Number(state?.vy)||0)*HEX_ROW_H;
    return Math.max(HEX_PILE_GRAVITY_MIN_SPEED,fromSpeed,fromVy);
}

function hexPileShortestArc(seg){
    if(!seg?.pivot||!seg?.from||!seg?.to)return null;
    const H=HEX_ROW_H;
    const px=seg.pivot[0]*.5,py=seg.pivot[1]*H;
    const fx=seg.from[0]*.5,fy=seg.from[1]*H;
    const tx=seg.to[0]*.5,ty=seg.to[1]*H;
    const r=Math.hypot(fx-px,fy-py);
    if(r<1e-8)return null;
    const a0=Math.atan2(fy-py,fx-px),a1=Math.atan2(ty-py,tx-px);
    let da=a1-a0;
    while(da>Math.PI)da-=TAU;
    while(da<-Math.PI)da+=TAU;
    return{px,py,fx,fy,tx,ty,r,a0,da};
}

function hexBuildPileGravityArcProfile(seg,v0){
    const arc=hexPileShortestArc(seg);
    if(!arc)return null;
    const n=HEX_PILE_GRAVITY_PROFILE_SAMPLES;
    const times=[0],fractions=[0];
    let total=0,prevSpeed=Math.max(HEX_PILE_GRAVITY_MIN_SPEED,v0);
    const arcLength=Math.abs(arc.da)*arc.r;
    if(arcLength<1e-9)return{times:[0,1],fractions:[0,1],duration:1/120,vOut:prevSpeed,vyOut:0};

    for(let i=1;i<=n;i++){
        const s=i/n,ang=arc.a0+arc.da*s;
        const y=arc.py+Math.sin(ang)*arc.r;
        const drop=y-arc.fy;
        const energy=Math.max(HEX_PILE_GRAVITY_MIN_SPEED**2,v0*v0+2*HEX_PILE_GRAVITY_PHYSICAL*drop);
        const speed=Math.sqrt(energy);
        const ds=arcLength/n;
        total+=2*ds/Math.max(1e-6,prevSpeed+speed);
        times.push(total);fractions.push(s);prevSpeed=speed;
    }
    total=Math.max(1/120,total);
    for(let i=1;i<times.length;i++)times[i]/=total;
    times[times.length-1]=1;
    const endAng=arc.a0+arc.da,dir=Math.sign(arc.da||1);
    const tangentY=dir*Math.cos(endAng);
    return{times,fractions,duration:total,vOut:prevSpeed,vyOut:Math.max(0,prevSpeed*tangentY)};
}

function hexPileGravityFraction(seg,q){
    q=Math.max(0,Math.min(1,q));
    if(!seg||seg.topPivot)return q;
    const p=seg._hexGravityProfile;
    if(p?.times?.length>1){
        const times=p.times,fr=p.fractions;
        let lo=0,hi=times.length-1;
        while(lo+1<hi){const m=(lo+hi)>>1;if(times[m]<=q)lo=m;else hi=m;}
        const t0=times[lo],t1=times[hi],f0=fr[lo],f1=fr[hi];
        const k=t1<=t0?0:(q-t0)/(t1-t0);
        return Math.max(0,Math.min(1,f0+(f1-f0)*k));
    }
    if(seg._hexGravityLinear){
        const t=q*seg._hexGravityDuration;
        const d=Math.max(1e-9,seg._hexGravityDistance);
        const s=(seg._hexGravityV0*t+.5*seg._hexGravityAccel*t*t)/d;
        return Math.max(0,Math.min(1,s));
    }
    return q;
}

const __hexPileNominalDurationBeforeGravity=pileFlowNominalDuration;
pileFlowNominalDuration=function(seg,state){
    if(!seg||!seg.from||!seg.to)return __hexPileNominalDurationBeforeGravity(seg,state);
    delete seg._hexGravityProfile;delete seg._hexGravityLinear;
    const H=HEX_ROW_H,dx=(seg.to[0]-seg.from[0])*.5,dy=(seg.to[1]-seg.from[1])*H;
    const v0=hexPileGravityEntrySpeed(state);
    seg._hexGravityEntrySpeed=v0;

    // The existing top-pivot path already combines true free-fall to contact
    // with a contact arc; retain it rather than duplicating that compound case.
    if(seg.topPivot)return __hexPileNominalDurationBeforeGravity(seg,state);

    if(seg.pivot){
        const profile=hexBuildPileGravityArcProfile(seg,v0);
        if(profile){
            seg._hexGravityProfile=profile;
            state.speed=profile.vOut;
            state.vy=profile.vyOut/H;
            return profile.duration;
        }
    }

    const dist=Math.hypot(dx,dy);
    if(dist>1e-9&&dy>=-1e-9){
        const downhill=Math.max(0,dy/dist);
        const accel=HEX_PILE_GRAVITY_PHYSICAL*downhill;
        let duration;
        if(accel>1e-9)duration=(-v0+Math.sqrt(Math.max(0,v0*v0+2*accel*dist)))/accel;
        else duration=dist/v0;
        duration=Math.max(1/120,duration);
        const vOut=v0+accel*duration;
        seg._hexGravityLinear=true;
        seg._hexGravityDuration=duration;
        seg._hexGravityDistance=dist;
        seg._hexGravityV0=v0;
        seg._hexGravityAccel=accel;
        state.speed=vOut;
        state.vy=dist>1e-9?Math.max(0,(vOut*downhill)/H):0;
        return duration;
    }
    return __hexPileNominalDurationBeforeGravity(seg,state);
};

pileFlowPoint=function(seg,t){
    t=Math.max(0,Math.min(1,t));
    if(seg?.topPivot)return liveSegPoint(seg,t);
    const s=hexPileGravityFraction(seg,t),H=HEX_ROW_H;
    if(seg?.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*.5);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const a=a0+da*s;
        return[px+Math.cos(a)/.5,py+Math.sin(a)/H];
    }
    return[seg.from[0]+(seg.to[0]-seg.from[0])*s,seg.from[1]+(seg.to[1]-seg.from[1])*s];
};

pileFlowPointForBall=function(g,ball,seg,q,t,depth=0,seen=null){
    q=Math.max(0,Math.min(1,q));
    if(!seg||!ball||depth>10)return pileFlowPoint(seg,q);
    const supportIds=pileFlowSupportIds(seg);
    if(!supportIds.length)return pileFlowPoint(seg,q);
    if(!seen)seen=new Set();
    if(seen.has(ball.id))return pileFlowPoint(seg,q);
    const nextSeen=new Set(seen);nextSeen.add(ball.id);
    const supports=supportIds.map(id=>pileFlowBallById(g,id)).filter(Boolean).filter(b=>!nextSeen.has(b.id));
    if(!supports.length)return pileFlowPoint(seg,q);

    const supportNow=supports.map(s=>pileFlowPositionAt(g,s,t,depth+1,nextSeen));
    const expected=pileFlowPoint(seg,q);
    if(supports.length>=2){
        const intersections=pileFlowCircleIntersections(supportNow[0],supportNow[1]);
        if(intersections.length){
            intersections.sort((a,b)=>pileFlowPhysicalDist(a,expected)-pileFlowPhysicalDist(b,expected));
            return intersections[0];
        }
    }

    const flowQ=hexPileGravityFraction(seg,q);
    const support=supports[0],now=supportNow[0];
    const t0=Number.isFinite(seg.pileFlowStart)?seg.pileFlowStart:t;
    const t1=Number.isFinite(seg.pileFlowEnd)?seg.pileFlowEnd:t;
    const s0=pileFlowPositionAt(g,support,t0,depth+1,nextSeen);
    const s1=pileFlowPositionAt(g,support,t1,depth+1,nextSeen);
    const H=HEX_ROW_H;
    let a0=Math.atan2((seg.from[1]-s0[1])*H,(seg.from[0]-s0[0])*.5);
    let a1=Math.atan2((seg.to[1]-s1[1])*H,(seg.to[0]-s1[0])*.5);
    let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
    const a=a0+da*flowQ;
    return[now[0]+Math.cos(a)/.5,now[1]+Math.sin(a)/H];
};
