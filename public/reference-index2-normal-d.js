/* index-2 exact normal motion D: copied verbatim from user-provided index-2.html */
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
