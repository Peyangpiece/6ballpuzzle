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

function updateScheduledPileFlowVisual(g,cell,v,dt,memo=null){
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
        g,cell,seg,q,g.pileFlowClock,0,null,memo
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

function liveSegDuration(seg){
    if(!seg)return 1/120;
    const H=HEX_ROW_H;

    if(seg.slopeRigidArc && Number.isFinite(seg.slopeDuration))
        return Math.max(1/120,seg.slopeDuration);

    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const startY=cellCenterYNorm(seg.from[1]);
        const supportY=cellCenterYNorm(py);
        const contactY=supportY-1;
        const fallDist=Math.max(0,contactY-startY);
        const fallT=Math.sqrt(Math.max(0,2*fallDist/Math.max(0.0001,GRAV)));

        const targetX=latticeRealX(seg.to[0]);
        const targetY=cellCenterYNorm(seg.to[1]);
        const supportX=latticeRealX(px);
        const a0=-Math.PI/2;
        const a1=Math.atan2(targetY-supportY,targetX-supportX);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const arcT=Math.abs(da)/SLIDE_SPEED;

        return Math.max(1/120,fallT+arcT);
    }

    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        return Math.max(1/120,Math.abs(da)/SLIDE_SPEED);
    }
    const dx=(seg.to[0]-seg.from[0])*0.5;
    const dy=(seg.to[1]-seg.from[1])*H;
    const dist=Math.hypot(dx,dy);

    // Long/vertical fall: gravity-shaped duration.
    if(Math.abs(seg.to[1]-seg.from[1])>=2 || Math.abs(dx)<1e-9)
        return Math.max(1/120,Math.sqrt(Math.max(0.0001,2*dist/Math.max(0.0001,GRAV))));

    // Contact slide / translating diagonal.
    return Math.max(1/120,dist/SLIDE_SPEED);
}

function liveSegPoint(seg,t){
    const H=HEX_ROW_H;
    t=Math.max(0,Math.min(1,t));

    // On a continuous straight slope, intermediate lattice boundaries are not
    // visible "stops". Only the last slope interval eases into its stable pose.
    const pathT=(seg.slopeRigidArc && seg.slopeTerminal)
        ? 1-(1-t)*(1-t)
        : t;

    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const sx=latticeRealX(seg.from[0]);
        const sy=cellCenterYNorm(seg.from[1]);
        const supportX=latticeRealX(px);
        const supportY=cellCenterYNorm(py);
        const contactX=supportX;
        const contactY=supportY-1;

        const fallDist=Math.max(0,contactY-sy);
        const fallT=Math.sqrt(Math.max(0,2*fallDist/Math.max(0.0001,GRAV)));

        const tx=latticeRealX(seg.to[0]);
        const ty=cellCenterYNorm(seg.to[1]);
        const a0=-Math.PI/2;
        const a1=Math.atan2(ty-supportY,tx-supportX);

        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;

        const arcT=Math.abs(da)/SLIDE_SPEED;
        const total=Math.max(1e-9,fallT+arcT);
        const elapsed=t*total;

        if(elapsed<=fallT && fallT>1e-9){
            const q=elapsed/fallT;
            // Constant-acceleration visual progress.
            const qq=q*q;
            const rx=sx+(contactX-sx)*qq;
            const ry=sy+(contactY-sy)*qq;
            return [
                rx/0.5,
                (ry-BOARD_TOP_CENTER_N)/H
            ];
        }

        const q=arcT<=1e-9 ? 1 : Math.max(0,Math.min(1,(elapsed-fallT)/arcT));
        const ang=a0+da*q;
        const rx=supportX+Math.cos(ang);
        const ry=supportY+Math.sin(ang);

        return [
            rx/0.5,
            (ry-BOARD_TOP_CENTER_N)/H
        ];
    }

    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const a=a0+da*pathT;
        return [px+Math.cos(a)/0.5,py+Math.sin(a)/H];
    }

    const dx=seg.to[0]-seg.from[0];
    const dy=seg.to[1]-seg.from[1];
    const q=(Math.abs(dy)>=2 || Math.abs(dx)<1e-9) ? t*t : t;
    return [seg.from[0]+dx*q,seg.from[1]+dy*q];
}

function collectLiveMotionBatch(g){
    let seq=Infinity;
    const all=[];

    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell||!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
        const seg=cell.fallPath[0];
        if(!seg?.to || seg.pileFlow || !seg.motionSeq)continue;
        const v=g.vis.get(cell.id);
        if(!v)continue;
        all.push({cell,v,x,y,seg,duration:liveSegDuration(seg)});
        seq=Math.min(seq,seg.motionSeq);
    }

    if(!Number.isFinite(seq))return null;
    const members=all.filter(m=>m.seg.motionSeq===seq);
    let duration=1/120;
    for(const m of members)duration=Math.max(duration,m.duration);
    return {seq,members,duration};
}


