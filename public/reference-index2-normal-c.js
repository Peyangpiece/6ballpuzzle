/* index-2 exact normal motion C: copied verbatim from user-provided index-2.html */
function pileFlowPoint(seg,t){
    t=Math.max(0,Math.min(1,t));
    const H=HEX_ROW_H;

    // The first free-fall interval eases into motion but exits with non-zero
    // velocity. Every later straight interval is linear, so lattice boundaries
    // can never become visible stop points.
    const qStraight=seg.pileFlowEntry
        ? t*t*(2-t)
        : t;

    if(seg.topPivot){
        // Existing top-contact geometry is retained, but the complete interval
        // is driven by one continuous wave clock.
        return liveSegPoint(seg,t);
    }

    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2(
            (seg.from[1]-py)*H,
            (seg.from[0]-px)*0.5
        );
        const a1=Math.atan2(
            (seg.to[1]-py)*H,
            (seg.to[0]-px)*0.5
        );
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const a=a0+da*t;
        return [
            px+Math.cos(a)/0.5,
            py+Math.sin(a)/H
        ];
    }

    return [
        seg.from[0]+(seg.to[0]-seg.from[0])*qStraight,
        seg.from[1]+(seg.to[1]-seg.from[1])*qStraight
    ];
}

function pileFlowNominalDuration(seg,state){
    const H=HEX_ROW_H;
    const dx=seg.to[0]-seg.from[0];
    const dy=seg.to[1]-seg.from[1];

    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const contactRow=(cellCenterYNorm(py)-1-BOARD_TOP_CENTER_N)/H;
        const fallRows=Math.max(0,contactRow-seg.from[1]);
        const v0=Math.max(0,state.vy||RELEASE_INITIAL_VY);
        const fallT=fallRows>1e-9
            ? (-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallRows)))/GRAV
            : 0;
        const tx=latticeRealX(seg.to[0]);
        const ty=cellCenterYNorm(seg.to[1]);
        const sx=latticeRealX(px);
        const sy=cellCenterYNorm(py);
        let da=Math.atan2(ty-sy,tx-sx)-(-Math.PI/2);
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const arcT=Math.abs(da)/SLIDE_SPEED;
        state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(Math.atan2(ty-sy,tx-sx)))/H);
        state.speed=SLIDE_SPEED;
        return Math.max(1/120,fallT+arcT);
    }

    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        state.speed=SLIDE_SPEED;
        state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(a1))/H);
        return Math.max(1/120,Math.abs(da)/SLIDE_SPEED);
    }

    if(Math.abs(dx)<1e-9 && dy>0){
        const v0=Math.max(0,state.vy||RELEASE_INITIAL_VY);
        const t=(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*dy)))/GRAV;
        state.vy=v0+GRAV*t;
        state.speed=Math.max(state.speed||0,state.vy*H);
        return Math.max(1/120,t);
    }

    const dist=Math.hypot(dx*0.5,dy*H);
    const speed=Math.max(SLIDE_SPEED,state.speed||0.0001);
    state.speed=speed;
    state.vy=Math.max(0,dy/Math.max(1e-9,dist/speed));
    return Math.max(1/120,dist/speed);
}

function pileFlowPointForBall(g,ball,seg,q,t,depth=0,seen=null){
    q=Math.max(0,Math.min(1,q));
    if(!seg||!ball||depth>10)
        return pileFlowPoint(seg,q);

    const supportIds=pileFlowSupportIds(seg);
    if(!supportIds.length)
        return pileFlowPoint(seg,q);

    if(!seen)seen=new Set();
    if(seen.has(ball.id))
        return pileFlowPoint(seg,q);

    const nextSeen=new Set(seen);
    nextSeen.add(ball.id);

    const supports=supportIds
        .map(id=>pileFlowBallById(g,id))
        .filter(Boolean)
        .filter(b=>!nextSeen.has(b.id));

    if(!supports.length)
        return pileFlowPoint(seg,q);

    const supportNow=supports.map(s=>
        pileFlowPositionAt(g,s,t,depth+1,nextSeen)
    );
    const expected=pileFlowPoint(seg,q);

    // Two moving supports: solve the exact radius-1 circle intersection.
    // Choose the branch nearest the original legal route. This preserves both
    // contacts instead of letting the upper ball cut through either support.
    if(supports.length>=2){
        const intersections=pileFlowCircleIntersections(
            supportNow[0],supportNow[1]
        );
        if(intersections.length){
            intersections.sort((a,b)=>
                pileFlowPhysicalDist(a,expected)-
                pileFlowPhysicalDist(b,expected)
            );
            return intersections[0];
        }
    }

    // One moving support (or a temporarily unsolvable two-support state):
    // follow the support at exactly one ball diameter. The contact angle is
    // interpolated between the legal start/end relations, so a moving support
    // may roll while the follower remains tangent throughout.
    const support=supports[0];
    const now=supportNow[0];
    const t0=Number.isFinite(seg.pileFlowStart)?seg.pileFlowStart:t;
    const t1=Number.isFinite(seg.pileFlowEnd)?seg.pileFlowEnd:t;
    const s0=pileFlowPositionAt(g,support,t0,depth+1,nextSeen);
    const s1=pileFlowPositionAt(g,support,t1,depth+1,nextSeen);
    const H=HEX_ROW_H;

    let a0=Math.atan2(
        (seg.from[1]-s0[1])*H,
        (seg.from[0]-s0[0])*0.5
    );
    let a1=Math.atan2(
        (seg.to[1]-s1[1])*H,
        (seg.to[0]-s1[0])*0.5
    );
    let da=a1-a0;
    while(da>Math.PI)da-=Math.PI*2;
    while(da<-Math.PI)da+=Math.PI*2;
    const a=a0+da*q;

    return [
        now[0]+Math.cos(a)/0.5,
        now[1]+Math.sin(a)/H
    ];
}

function pileFlowPositionAt(g,ball,t,depth=0,seen=null){
    if(!ball)return [0,0];
    if(depth>10){
        const v=g.vis.get(ball.id);
        return v?[v.x,v.y]:[0,0];
    }

    const path=Array.isArray(ball.fallPath)?ball.fallPath:[];
    const scheduled=path.filter(seg=>
        seg?.pileFlow &&
        Number.isFinite(seg.pileFlowStart) &&
        Number.isFinite(seg.pileFlowEnd)
    );

    if(!scheduled.length){
        const future=path.find(seg=>seg?.pileFlow&&seg?.from);
        if(future)return [...future.from];
        const v=g.vis.get(ball.id);
        if(v)return [v.x,v.y];
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++)
            if(valid(x,y)&&g.board[y][x]===ball)return [x,y];
        return [0,0];
    }

    let pos=[...scheduled[0].from];
    for(const seg of scheduled){
        if(t<seg.pileFlowStart-1e-10)
            return pos;
        if(t<=seg.pileFlowEnd+1e-10){
            const q=(t-seg.pileFlowStart)/Math.max(1e-9,seg.pileFlowDuration);
            return pileFlowPointForBall(g,ball,seg,q,t,depth,seen);
        }
        pos=[...seg.to];
    }
    return pos;
}

function pileFlowWaveSafe(g,waveSegs,start,duration){
    for(const seg of waveSegs){
        seg.pileFlowStart=start;
        seg.pileFlowDuration=duration;
        seg.pileFlowEnd=start+duration;
    }

    const boardBalls=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;
        if(b)boardBalls.push(b);
    }

    for(let i=0;i<=PILE_FLOW_COLLISION_SAMPLES;i++){
        const t=start+duration*(i/PILE_FLOW_COLLISION_SAMPLES);

        for(const seg of waveSegs){
            const moving=seg._pileFlowBall;
            if(!moving)continue;
            const a=pileFlowPositionAt(g,moving,t);

            for(const other of boardBalls){
                if(other===moving)continue;
                const b=pileFlowPositionAt(g,other,t);
                const d=pileFlowPhysicalDist(a,b);
                if(d<PILE_FLOW_MIN_DIST){
                    for(const q of waveSegs){
                        delete q.pileFlowStart;
                        delete q.pileFlowDuration;
                        delete q.pileFlowEnd;
                    }
                    return false;
                }
            }
        }
    }
    return true;
}
