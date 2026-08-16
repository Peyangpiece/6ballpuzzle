// Pile/garbage collapse overlap-scheduler constants.
// Kept in app-07 so this two-file patch is self-contained on the current main branch.
const PILE_FLOW_SCHEDULE_STEP = 1 / 240;
const PILE_FLOW_MIN_WAVE_GAP = 1 / 120;
const PILE_FLOW_MIN_DIST = 0.9998;
const PILE_FLOW_COLLISION_SAMPLES = 144;

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

function pileFlowBallById(g,id){
    if(!id)return null;
    if(g._pileFlowBallById?.has(id))
        return g._pileFlowBallById.get(id);

    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;
        if(b?.id===id)return b;
    }
    return null;
}

function pileFlowPhysicalDist(a,b){
    return Math.hypot(
        (a[0]-b[0])*0.5,
        (a[1]-b[1])*HEX_ROW_H
    );
}

function pileFlowSupportIds(seg){
    const ids=[];
    if(Array.isArray(seg?.followSupportIds))
        for(const id of seg.followSupportIds)
            if(id&&!ids.includes(id))ids.push(id);
    if(seg?.movingSupportId&&!ids.includes(seg.movingSupportId))
        ids.unshift(seg.movingSupportId);
    return ids;
}

function pileFlowCircleIntersections(a,b){
    const H=HEX_ROW_H;
    const ax=a[0]*0.5, ay=a[1]*H;
    const bx=b[0]*0.5, by=b[1]*H;
    const dx=bx-ax,dy=by-ay;
    const d=Math.hypot(dx,dy);

    if(d<1e-8||d>2+1e-6)return [];

    const half=d*0.5;
    const h=Math.sqrt(Math.max(0,1-half*half));
    const mx=(ax+bx)*0.5,my=(ay+by)*0.5;
    const ux=-dy/d,uy=dx/d;

    return [
        [(mx+ux*h)/0.5,(my+uy*h)/H],
        [(mx-ux*h)/0.5,(my-uy*h)/H]
    ];
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

function scheduleFreshPileFlow(g,fresh){
    if(!fresh.length)return;

    // Nominal duration is computed per ball with carried velocity; wave members
    // then share the longest duration so same-wave collision sweeps retain the
    // exact normalized-time relation used by the logical solver.
    const stateByBall=new Map();
    for(const q of fresh){
        if(!stateByBall.has(q.ball.id)){
            const v=g.vis.get(q.ball.id);
            stateByBall.set(q.ball.id,{
                vy:Math.max(0,v?.vy||RELEASE_INITIAL_VY),
                speed:Math.max(0,v?.motionSpeed||0)
            });
        }
        q.seg._pileNominalDuration=pileFlowNominalDuration(
            q.seg,stateByBall.get(q.ball.id)
        );
    }

    const seqs=[...new Set(fresh.map(q=>q.seq))].sort((a,b)=>a-b);
    const bySeq=new Map(seqs.map(seq=>[seq,[]]));
    for(const q of fresh)bySeq.get(q.seq).push(q);

    let previousStart=Math.max(0,g.pileFlowClock||0);

    for(let wi=0;wi<seqs.length;wi++){
        const seq=seqs[wi];
        const entries=bySeq.get(seq);
        const segs=entries.map(q=>q.seg);
        const duration=Math.max(
            1/120,
            ...segs.map(seg=>seg._pileNominalDuration||1/120)
        );

        let earliest=wi===0
            ? Math.max(0,g.pileFlowClock||0)
            : previousStart+PILE_FLOW_MIN_WAVE_GAP;

        // A single ball can never execute two logical segments at once.
        for(const {ball} of entries){
            const path=ball.fallPath||[];
            const idx=path.indexOf(entries.find(q=>q.ball===ball)?.seg);
            if(idx>0){
                for(let j=idx-1;j>=0;j--){
                    const prev=path[j];
                    if(Number.isFinite(prev?.pileFlowEnd)){
                        earliest=Math.max(earliest,prev.pileFlowEnd);
                        break;
                    }
                }
            }
        }

        // Find the earliest collision-free overlap. This removes the old fixed
        // 0.12s bulk-step definition: a wave waits only as long as geometry
        // actually requires, then starts while earlier waves are still moving.
        const priorEnds=[];
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            if(!b?.fallPath)continue;
            for(const seg of b.fallPath)
                if(seg?.pileFlow && Number.isFinite(seg.pileFlowEnd) && !segs.includes(seg))
                    priorEnds.push(seg.pileFlowEnd);
        }
        const sequentialFallback=Math.max(earliest,...priorEnds,earliest);
        let start=earliest;
        let safe=false;

        while(start<=sequentialFallback+PILE_FLOW_SCHEDULE_STEP+1e-9){
            if(pileFlowWaveSafe(g,segs,start,duration)){
                safe=true;
                break;
            }
            start+=PILE_FLOW_SCHEDULE_STEP;
        }

        if(!safe){
            start=sequentialFallback;
            for(const seg of segs){
                seg.pileFlowStart=start;
                seg.pileFlowDuration=duration;
                seg.pileFlowEnd=start+duration;
            }
        }

        previousStart=start;
    }
}

function repairPileFlowSegmentGeometry(g,ball,seg){
    if(!seg||seg.pivot||seg.topPivot||!seg.to||!seg.from)
        return;
    if(seg.movingSupportId||
       (Array.isArray(seg.followSupportIds)&&seg.followSupportIds.length))
        return;

    const dx=seg.to[0]-seg.from[0];
    const dy=seg.to[1]-seg.from[1];
    if(dy!==1||Math.abs(dx)!==1)
        return;

    // A diagonal move between two tangent lattice positions is frequently a
    // 60° roll around a same-row or lower-opposite support. Legacy pile code
    // sometimes lost that pivot and rendered the chord through the support,
    // which the collision gate then stopped frame after frame.
    const candidates=[
        [seg.from[0]+2*dx,seg.from[1]],
        [seg.from[0]-dx,seg.from[1]+1]
    ];

    for(const [px,py] of candidates){
        if(!valid(px,py))continue;
        const support=g.board[py][px];
        if(!support||support===ball)continue;

        // Only reconstruct from a support that is visually/static at this
        // contact. Moving supports already carry explicit follow metadata.
        const sp=Array.isArray(support.fallPath)?support.fallPath:[];
        if(sp.length)continue;

        const H=HEX_ROW_H;
        const d0=Math.hypot(
            (seg.from[0]-px)*0.5,
            (seg.from[1]-py)*H
        );
        const d1=Math.hypot(
            (seg.to[0]-px)*0.5,
            (seg.to[1]-py)*H
        );
        if(Math.abs(d0-1)<1e-6&&Math.abs(d1-1)<1e-6){
            seg.pivot=[px,py];
            seg.pileFlowRepairedPivot=true;
            return;
        }
    }
}

function markPileFlowPaths(g,reason="pile_flow"){
    const fresh=[];
    const firstByBall=new Set();

    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)
            continue;
        if(ball.slopeRigidGroupId)
            continue;

        normalizePileBallPhysics(ball);
        if(ball.isGarbage)ball.isGarbage=true;

        const already=ball.fallPath.some(seg=>seg?.pileFlow);
        let isFirst=!already;

        for(const seg of ball.fallPath){
            if(!seg||!seg.to||seg.pileFlow)continue;
            repairPileFlowSegmentGeometry(g,ball,seg);
            const seq=Number(seg.motionSeq)||0;
            seg.pileFlowOriginalSeq=seq;
            seg.motionSeq=0;
            seg.pileFlow=true;
            seg.pileFlowEntry=isFirst;
            seg.pileFlowReason=reason;
            seg._pileFlowBall=ball;
            fresh.push({ball,seg,seq});
            isFirst=false;
        }
    }

    if(!fresh.length)return {balls:0,segments:0};

    g._pileFlowBallById=new Map();
    for(let yy=0;yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
        const bb=valid(xx,yy)?g.board[yy][xx]:null;
        if(bb)g._pileFlowBallById.set(bb.id,bb);
    }

    scheduleFreshPileFlow(g,fresh);

    const ids=new Set();
    for(const {ball,seg} of fresh){
        ids.add(ball.id);
        const v=g.vis.get(ball.id);
        if(v){
            v.pileFlow=true;
            if(Math.abs(v.vy||0)<0.05)
                v.vy=RELEASE_INITIAL_VY;
            v.motionSpeed=Math.max(v.motionSpeed||0,v.vy||0,0.0001);
        }
        delete seg._pileNominalDuration;
        delete seg._pileFlowBall;
    }

    return {balls:ids.size,segments:fresh.length};
}

function updateScheduledPileFlowVisual(g,cell,v,dt){
    const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
    if(!path||!path.length)return false;

    // Consume every completed scheduled segment at once. No lattice endpoint
    // gets its own render frame.
    while(path.length && path[0]?.pileFlow &&
          Number.isFinite(path[0].pileFlowEnd) &&
          g.pileFlowClock>=path[0].pileFlowEnd-1e-10){
        v.x=path[0].to[0];
        v.y=path[0].to[1];
        path.shift();
    }

    if(!path.length){
        delete cell.fallPath;
        v.pileFlow=false;
        v.vy=0;
        v.motionSpeed=0;
        return true;
    }

    const seg=path[0];
    if(!seg?.pileFlow)return false;

    const oldX=v.x,oldY=v.y;

    if(g.pileFlowClock<seg.pileFlowStart){
        // Causal wait only. Unlike the old batch gate this is the minimum
        // collision-required delay found by the overlap scheduler.
        return true;
    }

    const q=(g.pileFlowClock-seg.pileFlowStart)/Math.max(1e-9,seg.pileFlowDuration);
    const [nx,ny]=pileFlowPointForBall(
        g,cell,seg,q,g.pileFlowClock
    );
    v.x=nx;
    v.y=Math.max(oldY,ny);
    const physicalSpeed=Math.hypot(
        (v.x-oldX)*0.5,
        (v.y-oldY)*HEX_ROW_H
    )/Math.max(1e-9,dt);
    v.motionSpeed=physicalSpeed;
    v.vy=Math.max(0,(v.y-oldY)/Math.max(1e-9,dt));
    return true;
}

function prepareContinuousPileFlow(g,reason="pile_flow"){
    // Pile/garbage animation deliberately has no fixed-size bulk-collapse
    // mode. Its timing is determined by continuous per-ball routes below.

    normalizeAllNonActivePileBalls(g);

    const before=physicsSignature(g);

    // Compute the entire legal collapse first. settleAll records every legal
    // fall/roll segment in fallPath, while the renderer below consumes those
    // paths independently and continuously. Thus lattice cells remain the
    // collision graph, not animation stop points.
    settleAll(g.board);

    const after=physicsSignature(g);
    const tagged=markPileFlowPaths(g,reason);
    const moved=before!==after || tagged.segments>0;

    if(moved)g.ver++;
    return {moved,...tagged};
}


function hexMotionPhysicalDist(seg){
    if(!seg?.from||!seg?.to)return 0;
    return Math.hypot((seg.to[0]-seg.from[0])*0.5,(seg.to[1]-seg.from[1])*HEX_ROW_H);
}
function hexMotionDuration(seg,state={vy:0,speed:0}){
    if(!seg?.from||!seg?.to)return 1/120;
    const H=HEX_ROW_H;
    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const startY=cellCenterYNorm(seg.from[1]);
        const supportY=cellCenterYNorm(py);
        const contactY=supportY-1;
        const fallDist=Math.max(0,contactY-startY);
        const v0=Math.max(0,state.vy||0);
        const fallT=fallDist>1e-9
            ?(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallDist)))/Math.max(0.0001,GRAV)
            :0;
        const tx=latticeRealX(seg.to[0]),ty=cellCenterYNorm(seg.to[1]);
        const sx=latticeRealX(px),sy=cellCenterYNorm(py);
        let da=Math.atan2(ty-sy,tx-sx)+Math.PI/2;
        while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const arcT=Math.abs(da)/Math.max(0.0001,SLIDE_SPEED);
        state.speed=SLIDE_SPEED;
        state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(-Math.PI/2+da))/H);
        return Math.max(1/120,fallT+arcT);
    }
    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        state.speed=SLIDE_SPEED;
        state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(a1))/H);
        return Math.max(1/120,Math.abs(da)/Math.max(0.0001,SLIDE_SPEED));
    }
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(Math.abs(dx)<1e-9&&dy>0){
        const dist=dy*H,v0=Math.max(0,state.vy||0);
        const t=(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*dist)))/Math.max(0.0001,GRAV);
        state.vy=v0+GRAV*t;state.speed=Math.max(state.speed||0,state.vy);
        return Math.max(1/120,t);
    }
    const dist=hexMotionPhysicalDist(seg);
    const speed=Math.max(SLIDE_SPEED,state.speed||0);
    state.speed=speed;
    state.vy=Math.max(0,dy*H/Math.max(1e-9,dist/speed));
    return Math.max(1/120,dist/speed);
}
function liveSegDuration(seg){return hexMotionDuration(seg,{vy:0,speed:0});}

function liveSegPoint(seg,t,startState=null,duration=null){
    t=Math.max(0,Math.min(1,t));
    if(!seg?.from||!seg?.to)return [0,0];
    const H=HEX_ROW_H;
    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const sx=latticeRealX(seg.from[0]),sy=cellCenterYNorm(seg.from[1]);
        const cx=latticeRealX(px),cy=cellCenterYNorm(py),contactY=cy-1;
        const fallDist=Math.max(0,contactY-sy);
        const v0=Math.max(0,startState?.vy||0);
        const fallT=fallDist>1e-9
            ?(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallDist)))/Math.max(0.0001,GRAV)
            :0;
        const tx=latticeRealX(seg.to[0]),ty=cellCenterYNorm(seg.to[1]);
        let da=Math.atan2(ty-cy,tx-cx)+Math.PI/2;
        while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const arcT=Math.abs(da)/Math.max(0.0001,SLIDE_SPEED);
        const naturalTotal=Math.max(1e-9,fallT+arcT);
        const total=Number.isFinite(duration)?Math.max(1e-9,duration):naturalTotal;
        const elapsed=t*total;
        if(elapsed<=fallT&&fallT>1e-9){
            const q=Math.max(0,Math.min(1,(v0*elapsed+.5*GRAV*elapsed*elapsed)/Math.max(1e-9,fallDist)));
            return [(sx+(cx-sx)*q)/0.5,(sy+(contactY-sy)*q-BOARD_TOP_CENTER_N)/H];
        }
        const q=arcT<=1e-9?1:Math.max(0,Math.min(1,(elapsed-fallT)/arcT));
        const a=-Math.PI/2+da*q;
        return [(cx+Math.cos(a))/0.5,(cy+Math.sin(a)-BOARD_TOP_CENTER_N)/H];
    }
    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const a=a0+da*t;
        return [px+Math.cos(a)/0.5,py+Math.sin(a)/H];
    }
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    let q=t;
    if(Math.abs(dx)<1e-9&&dy>0){
        if(startState&&Number.isFinite(duration)){
            const dist=Math.max(1e-9,dy*H),elapsed=t*Math.max(0,duration);
            q=Math.max(0,Math.min(1,((Math.max(0,startState.vy||0)*elapsed)+.5*GRAV*elapsed*elapsed)/dist));
        }else q=t*t;
    }
    return [seg.from[0]+dx*q,seg.from[1]+dy*q];
}

function collectLiveMotionBatch(g){
    let seq=Infinity;
    const all=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell||!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
        const seg=cell.fallPath[0];
        if(!seg?.to||seg.pileFlow||!seg.motionSeq)continue;
        const v=g.vis.get(cell.id);if(!v)continue;
        const startState={vy:Math.max(0,v?.vy||0),speed:Math.max(0,v?.motionSpeed||0)};
        const endState={...startState},duration=hexMotionDuration(seg,endState);
        all.push({cell,v,x,y,seg,duration,startState,endState});
        seq=Math.min(seq,seg.motionSeq);
    }
    if(!Number.isFinite(seq))return null;
    const members=all.filter(m=>m.seg.motionSeq===seq);
    return {seq,members,byId:new Map(members.map(m=>[m.cell.id,m])),duration:Math.max(1/120,...members.map(m=>m.duration))};
}

function liveBatchPointAt(batch,member,t,states,memo=new Map(),stack=new Set()){
    if(!member)return [0,0];
    const id=member.cell.id;
    if(memo.has(id))return memo.get(id);
    if(member.seg.kind==="FOLLOW_SUPPORT"&&!stack.has(id)){
        const sid=member.seg.followSupportIds?.[0],support=batch.byId?.get(sid);
        if(support){
            stack.add(id);
            const sp=liveBatchPointAt(batch,support,t,states,memo,stack);
            stack.delete(id);
            const out=[member.seg.from[0]+sp[0]-support.seg.from[0],member.seg.from[1]+sp[1]-support.seg.from[1]];
            memo.set(id,out);return out;
        }
    }
    const st=states?.get(id),out=liveSegPoint(member.seg,t,st?.startState,st?.naturalDuration);
    memo.set(id,out);return out;
}
