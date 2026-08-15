function prepareGarbageBatch(g) {
    if (g.garbageBatchPrepared) return;
    g.garbageBatchPrepared=true;
    g.garbageClock=0;
    g.garbageSeq=0;
    g.garbageMaterializeIndex=0;
    g.garbagePlans=[];
    g.activeGarbagePacks=[];

    const pending=g.garbShapes.splice(0);
    const shadow=cloneBoardForGarbagePlan(g.board);
    const fullShapePlans=[];
    for (let i=0;i<pending.length;i++) {
        const plan=chooseGarbagePlan(g,shadow,pending[i],i);
        if (!plan) {
            g.garbBlocked=true;
            g.incomingShapes.unshift(...pending.slice(i));
            break;
        }
        reserveGarbagePlan(shadow,plan,-100000-i*100);
        fullShapePlans.push(plan);
    }

    // 形状1セットを1個のおじゃまとして、そのまま落下プランへ入れる。
    // PYRAMID/HEXAGONは6球の塊を崩さず、各セットを0.5秒間隔で開始する。
    // STRAIGHTは23球（12+11）全体を1セットとして一度に開始する。
    let packSeq=0;
    for (const shape of fullShapePlans) {
        g.garbagePlans.push({
            ...shape,
            seq:packSeq,
            delay:packSeq*GARBAGE_PACK_INTERVAL,
            y:GARBAGE_START_Y,
            vy:0,
            landed:false,
            _started:false
        });
        packSeq++;
    }

    g.garbageSeq=packSeq;
    // 実時間の次回投入時刻。フレーム落ち後も複数セットを同時catch-upしない。
    g.garbageNextBallAt=0;
    // 長い攻撃でも旧4.2秒強制投入が割り込まないよう、形状セット数に応じて監視時間を延長。
    g.garbageWatchdogLimit=Math.max(6,(packSeq+g.garbLeft)*GARBAGE_PACK_INTERVAL+6);
    g.ver++;
}
function materializeGarbagePack(g, pack) {
    // 計画時と盤面が変わっていたら、現在盤面で同型の最深合法位置を再探索。
    let ay=(pack.fixedTarget && shapeFitsAt(g.board,pack.pat,pack.ax,pack.targetY))
        ? pack.targetY
        : deepestRigidAnchor(g.board,pack.pat,pack.ax);
    if (ay===null) {
        // 横方向も最寄りから再探索。無理なら上限到達としてゲームオーバー判定へ。
        let best=null;
        for (let ax=0;ax<W2;ax++) {
            const yy=deepestRigidAnchor(g.board,pack.pat,ax);
            if (yy===null) continue;
            const d=Math.abs(ax-pack.ax);
            if (!best || d<best.d) best={ax,ay:yy,d};
        }
        if (!best) { g.garbBlocked=true; return false; }
        pack.ax=best.ax; ay=best.ay;
    }
    pack.targetY=ay;
    for (let i=0;i<pack.pat.length;i++) {
        const [dx,dy]=pack.pat[i];
        const x=pack.ax+dx, y=ay+dy;
        const ball=mkBall(g,pack.colors[i]);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
        normalizePileBallPhysics(ball);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
        g.board[y][x]=ball;
        // 接触瞬間の形状位置から通常球物理へつなぐ。上空から論理セルへワープさせない。
        setVis(g,ball,x,y,0);
    }
    // ここが「最初の接触」。この瞬間から全て通常の堆積球物理。
    normalizeAllNonActivePileBalls(g);

    // Once materialized, garbage is literally pile physics. No pack rigidity,
    // no bulk 0.12s synchronization and no garbage-only settle timing.
    prepareContinuousPileFlow(
        g,"garbage_materialize"
    );
    return true;
}
function updateGarbagePacks(g, dt) {
    g.garbageClock += dt;

    // 形状由来のおじゃまは「形状1セット」ずつ。
    // フレーム落ち後もcatch-up投入はせず、実際に1セットを開始した時刻から次の0.5秒を数える。
    const nextPlan=g.garbagePlans.find(p=>!p._started);
    if (nextPlan && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
        nextPlan._started=true;
        nextPlan.actualStartTime=g.garbageClock;
        g.activeGarbagePacks.push(nextPlan);
        g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;
    }

    for (const p of g.activeGarbagePacks) {
        if (p.landed) continue;
        p.vy += GRAV*dt;
        p.y += p.vy*dt;
        if (p.y >= p.targetY) {
            p.y=p.targetY;
            p.vy=0;
            // 同時フレームで複数が到達しても、投入順を越えて確定させない。
            const earlierPending=g.activeGarbagePacks.some(q=>q.seq<p.seq && !q.landed);
            if (!earlierPending) {
                if (materializeGarbagePack(g,p)) p.landed=true;
                else { p.landed=true; g.garbBlocked=true; }
            }
        }
    }

    // 旧数値互換おじゃまは従来どおり1球を1個として、同じ0.5秒間隔。1更新で複数球を生成しない。
    const shapesDone=g.garbagePlans.every(p=>p.landed);
    if (shapesDone && g.garbLeft>0 && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
        const placed=garbageBall(g);
        if (!placed) {
            g.garbBlocked=true;
            g.incoming+=g.garbLeft;
            g.garbLeft=0;
        } else {
            g.garbLeft-=1;
            g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;

            normalizeAllNonActivePileBalls(g);
            prepareContinuousPileFlow(
                g,"numeric_garbage"
            );
        }
    }
}
function garbageBatchDone(g) {
    return g.garbagePlans.every(p=>p.landed) && g.garbLeft===0 && garbageVisualsDone(g);
}
function finishGarbageVisuals(g) {
    // 特別な補間は無い。通常物理の現在位置をそのまま維持する。
}

// Continuous visual collision gate: never let an animated ball enter another ball.
// Unlike the old post-collision pushback, this clamps the current segment before contact,
// so there is no lateral kick, oscillation, or easing-like correction.
function visualPointSafe(g, id, x, y, minDist = 0.999999) {
    const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    if (y > maxVisualRowY + 1e-7) return false;

    for (const [oid, ov] of g.vis.entries()) {
        if (oid === id || !ov) continue;

        if(g._liveBatchIds?.has(id)&&g._liveBatchIds?.has(oid))continue;

        const pivot = g._visualArcPivotById && g._visualArcPivotById.get(id);
        if (pivot) {
            const pdx = (ov.x - pivot[0]) * 0.5;
            const pdy = (ov.y - pivot[1]) * HEX_ROW_H;
            // This obstacle is the exact support around which the ball is being
            // placed on a radius-1 circle. The arc math itself enforces contact;
            // a straight chord sweep would falsely report penetration.
            if (pdx*pdx + pdy*pdy <= 1e-10) continue;
        }

        const dx=(x-ov.x)*0.5;
        const dy=(y-ov.y)*HEX_ROW_H;
        if (dx*dx+dy*dy < minDist*minDist) return false;
    }
    return true;
}

function visualSegmentSafe(g,id,ox,oy,nx,ny,minDist=0.999999){
    // Continuous/swept test. 24 samples per rendered step is conservative for
    // the very short fixed-step movements used here.
    for(let i=1;i<=24;i++){
        const t=i/24;
        const x=ox+(nx-ox)*t;
        const y=oy+(ny-oy)*t;
        if(!visualPointSafe(g,id,x,y,minDist))return false;
    }
    return true;
}

function clampVisualSegment(g, id, ox, oy, nx, ny) {
    if (visualSegmentSafe(g,id,ox,oy,nx,ny)) return [nx,ny,1];

    // Binary-search the largest safe fraction of THIS frame's movement.
    let lo=0,hi=1;
    for(let i=0;i<18;i++){
        const m=(lo+hi)*0.5;
        const x=ox+(nx-ox)*m;
        const y=oy+(ny-oy)*m;
        if(visualSegmentSafe(g,id,ox,oy,x,y))lo=m;
        else hi=m;
    }

    if(lo>1e-5){
        return [ox+(nx-ox)*lo,oy+(ny-oy)*lo,lo];
    }

    // If already touching, do not teleport through the other ball.
    // Stay exactly where it was and retry next fixed-step after the blocker moves.
    return [ox,oy,0];
}




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

function pileFlowPointForBall(g,ball,seg,q,t,depth=0,seen=null,memo=null){
    q=Math.max(0,Math.min(1,q));
    if(!seg||!ball||depth>10)
        return pileFlowPoint(seg,q);

    if(!seen)seen=new Set();
    if(seen.has(ball.id))
        return pileFlowPoint(seg,q);
    seen.add(ball.id);

    try{
        let supportA=null,supportB=null;
        const takeSupport=(id)=>{
            if(!id)return;
            const b=pileFlowBallById(g,id);
            if(!b||seen.has(b.id))return;
            if(!supportA)supportA=b;
            else if(!supportB&&supportA.id!==b.id)supportB=b;
        };

        // Preserve movingSupportId priority, then add at most one distinct
        // follow support. A pile ball can geometrically depend on at most two
        // tangent supports, so building arrays/Sets here only creates GC load.
        takeSupport(seg.movingSupportId);
        if(Array.isArray(seg.followSupportIds))
            for(const id of seg.followSupportIds){
                takeSupport(id);
                if(supportA&&supportB)break;
            }

        if(!supportA)
            return pileFlowPoint(seg,q);

        const nowA=pileFlowPositionAt(g,supportA,t,depth+1,seen,memo);
        const expected=pileFlowPoint(seg,q);

        if(supportB){
            const nowB=pileFlowPositionAt(g,supportB,t,depth+1,seen,memo);
            const intersections=pileFlowCircleIntersections(nowA,nowB);
            if(intersections.length===1)return intersections[0];
            if(intersections.length>=2){
                const d0=pileFlowPhysicalDist(intersections[0],expected);
                const d1=pileFlowPhysicalDist(intersections[1],expected);
                return d0<=d1?intersections[0]:intersections[1];
            }
        }

        // One moving support (or a temporarily unsolvable two-support state):
        // follow it at exactly one ball diameter.
        const t0=Number.isFinite(seg.pileFlowStart)?seg.pileFlowStart:t;
        const t1=Number.isFinite(seg.pileFlowEnd)?seg.pileFlowEnd:t;
        const s0=pileFlowPositionAt(g,supportA,t0,depth+1,seen,memo);
        const s1=pileFlowPositionAt(g,supportA,t1,depth+1,seen,memo);
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
            nowA[0]+Math.cos(a)/0.5,
            nowA[1]+Math.sin(a)/H
        ];
    }finally{
        seen.delete(ball.id);
    }
}

function pileFlowMemoGet(memo,t,id){
    if(!memo)return null;
    const byTime=memo.get(t);
    return byTime?.get(id)||null;
}
function pileFlowMemoSet(memo,t,id,pos){
    if(!memo)return pos;
    let byTime=memo.get(t);
    if(!byTime){byTime=new Map();memo.set(t,byTime);}
    byTime.set(id,pos);
    return pos;
}

function pileFlowPositionAt(g,ball,t,depth=0,seen=null,memo=null){
    if(!ball)return [0,0];
    if(depth>10){
        const v=g.vis.get(ball.id);
        return v?[v.x,v.y]:[0,0];
    }
    if(seen?.has(ball.id)){
        const v=g.vis.get(ball.id);
        return v?[v.x,v.y]:[0,0];
    }

    const cached=pileFlowMemoGet(memo,t,ball.id);
    if(cached)return cached;

    const path=Array.isArray(ball.fallPath)?ball.fallPath:null;
    let firstScheduled=null;
    if(path){
        for(const seg of path){
            if(seg?.pileFlow &&
               Number.isFinite(seg.pileFlowStart) &&
               Number.isFinite(seg.pileFlowEnd)){
                firstScheduled=seg;
                break;
            }
        }
    }

    if(!firstScheduled){
        if(path){
            for(const seg of path){
                if(seg?.pileFlow&&seg?.from)
                    return pileFlowMemoSet(memo,t,ball.id,[...seg.from]);
            }
        }
        const v=g.vis.get(ball.id);
        if(v)return pileFlowMemoSet(memo,t,ball.id,[v.x,v.y]);
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++)
            if(valid(x,y)&&g.board[y][x]===ball)
                return pileFlowMemoSet(memo,t,ball.id,[x,y]);
        return pileFlowMemoSet(memo,t,ball.id,[0,0]);
    }

    let pos=[...firstScheduled.from];
    for(const seg of path){
        if(!seg?.pileFlow ||
           !Number.isFinite(seg.pileFlowStart) ||
           !Number.isFinite(seg.pileFlowEnd))continue;
        if(t<seg.pileFlowStart-1e-10)
            return pileFlowMemoSet(memo,t,ball.id,pos);
        if(t<=seg.pileFlowEnd+1e-10){
            const q=(t-seg.pileFlowStart)/Math.max(1e-9,seg.pileFlowDuration);
            const out=pileFlowPointForBall(g,ball,seg,q,t,depth,seen,memo);
            return pileFlowMemoSet(memo,t,ball.id,out);
        }
        pos=[...seg.to];
    }
    return pileFlowMemoSet(memo,t,ball.id,pos);
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

    // Cache every ball position once per sample timestamp. The previous version
    // recalculated moving-support chains for every pair, which multiplied work
    // dramatically during a large collapse.
    const samples=Math.max(
        PILE_FLOW_COLLISION_MIN_SAMPLES,
        Math.min(PILE_FLOW_COLLISION_SAMPLES,Math.ceil(duration*120)+4)
    );

    for(let i=0;i<=samples;i++){
        const t=start+duration*(i/samples);
        const memo=new Map();
        const posById=new Map();
        for(const ball of boardBalls)
            posById.set(ball.id,pileFlowPositionAt(g,ball,t,0,null,memo));

        for(const seg of waveSegs){
            const moving=seg._pileFlowBall;
            if(!moving)continue;
            const a=posById.get(moving.id)||pileFlowPositionAt(g,moving,t,0,null,memo);

            for(const other of boardBalls){
                if(other===moving)continue;
                const b=posById.get(other.id);
                if(pileFlowPhysicalDist(a,b)<PILE_FLOW_MIN_DIST){
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

