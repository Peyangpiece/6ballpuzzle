/* HEXDROP patch v6: 0.6s shape garbage, continuous collapse, deferred final-line game over, wall cavity guard */
(function installHexdropV6(){
    if (typeof window !== "undefined" && window.__hexdropV6Installed) return;
    if (typeof window !== "undefined") window.__hexdropV6Installed = true;

    const HEXDROP_GARBAGE_SHAPE_INTERVAL_V6 = 0.6;

    prepareGarbageBatch = function(g) {
        if (g.garbageBatchPrepared) return;
        g.garbageBatchPrepared = true;
        g.garbageClock = 0;
        g.garbageSeq = 0;
        g.garbageMaterializeIndex = 0;
        g.garbagePlans = [];
        g.activeGarbagePacks = [];
        const pending = g.garbShapes.splice(0);
        const shadow = cloneBoardForGarbagePlan(g.board);
        let packSeq = 0;
        for (let i = 0; i < pending.length; i++) {
            const type = pending[i];
            const plan = chooseGarbagePlan(g, shadow, type, i);
            if (!plan) {
                g.garbBlocked = true;
                g.incomingShapes.unshift(...pending.slice(i));
                break;
            }
            reserveGarbagePlan(shadow, plan, -100000 - i * 100);
            g.garbagePlans.push({
                ...plan,
                seq: packSeq++, delay: 0, y: GARBAGE_START_Y, vy: 0,
                landed: false, _started: false, wholeShapeUnit: true,
                straightAtomic: type === "STRAIGHT"
            });
        }
        g.garbageSeq = packSeq;
        g.garbageNextBallAt = 0;
        g.garbageWatchdogLimit = Math.max(7,(packSeq + g.garbLeft) * HEXDROP_GARBAGE_SHAPE_INTERVAL_V6 + 7);
        g.ver++;
    };

    updateGarbagePacks = function(g, dt) {
        g.garbageClock += dt;
        const nextPlan = g.garbagePlans.find(p => !p._started);
        if (nextPlan && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
            nextPlan._started = true;
            nextPlan.actualStartTime = g.garbageClock;
            g.activeGarbagePacks.push(nextPlan);
            g.garbageNextBallAt = g.garbageClock + HEXDROP_GARBAGE_SHAPE_INTERVAL_V6;
        }
        for (const p of g.activeGarbagePacks) {
            if (p.landed) continue;
            p.vy += GRAV * dt;
            p.y += p.vy * dt;
            if (p.y >= p.targetY) {
                p.y = p.targetY; p.vy = 0;
                const earlierPending = g.activeGarbagePacks.some(q => q.seq < p.seq && !q.landed);
                if (!earlierPending) {
                    if (materializeGarbagePack(g,p)) p.landed = true;
                    else { p.landed = true; g.garbBlocked = true; }
                }
            }
        }
        const shapesDone = g.garbagePlans.every(p => p.landed);
        if (shapesDone && g.garbLeft > 0 && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
            const placed = garbageBall(g);
            if (!placed) {
                g.garbBlocked = true; g.incoming += g.garbLeft; g.garbLeft = 0;
            } else {
                g.garbLeft--;
                g.garbageNextBallAt = g.garbageClock + HEXDROP_GARBAGE_SHAPE_INTERVAL_V6;
                normalizeAllNonActivePileBalls(g);
                prepareContinuousPileFlow(g,"numeric_garbage_v6");
            }
        }
    };

    function wallSidesAtV6(x,y){
        let n=0;
        for(const [dx,dy] of DIRS){
            const nx=x+dx,ny=y+dy;
            if(ny<0||ny>=ROWS)continue;
            if(nx<0||nx>=W2)n++;
        }
        return n;
    }

    compactEnclosedGarbageCavities = function(g,createdIds){
        const created=createdIds instanceof Set?createdIds:new Set();
        let moved=0;
        for(let guard=0;guard<18;guard++){
            let target=null;
            for(let y=1;y<ROWS-1&&!target;y++){
                for(let x=0;x<W2;x++){
                    if(!valid(x,y)||g.board[y][x]!==null)continue;
                    const ns=[];
                    for(const [dx,dy] of DIRS){
                        const nx=x+dx,ny=y+dy;
                        if(valid(nx,ny)&&g.board[ny][nx])ns.push({x:nx,y:ny,ball:g.board[ny][nx]});
                    }
                    const wall=wallSidesAtV6(x,y);
                    if(ns.length+wall<5)continue;
                    const preferred=ns.filter(n=>n.ball?.isGarbage&&n.y<=y&&(created.size===0||created.has(n.ball.id)));
                    const anyGarbage=ns.filter(n=>n.ball?.isGarbage&&(created.size===0||created.has(n.ball.id)));
                    const source=preferred[0]||anyGarbage[0];
                    if(!source)continue;
                    target={x,y,source}; break;
                }
            }
            if(!target)break;
            const {x:tx,y:ty,source}=target;
            const ball=source.ball;
            g.board[source.y][source.x]=null;
            g.board[ty][tx]=ball;
            if(!Array.isArray(ball.fallPath))ball.fallPath=[];
            ball.fallPath.push({from:[source.x,source.y],to:[tx,ty],pivot:null,topPivot:null,movingSupportId:0,followSupportIds:[],kind:"garbage_wall_cavity_fill_v6",motionSeq:LIVE_MOTION_SEQ++});
            const vv=g.vis.get(ball.id);
            if(!vv)setVis(g,ball,source.x,source.y,0);
            moved++;
        }
        return moved;
    };

    scheduleFreshPileFlow = function(g,fresh){
        if(!fresh.length)return;
        const stateByBall=new Map();
        for(const q of fresh){
            if(!stateByBall.has(q.ball.id)){
                const v=g.vis.get(q.ball.id);
                stateByBall.set(q.ball.id,{vy:Math.max(0,v?.vy||RELEASE_INITIAL_VY),speed:Math.max(0,v?.motionSpeed||0)});
            }
            q.seg._pileNominalDuration=pileFlowNominalDuration(q.seg,stateByBall.get(q.ball.id));
        }
        const seqs=[...new Set(fresh.map(q=>q.seq))].sort((a,b)=>a-b);
        const bySeq=new Map(seqs.map(seq=>[seq,[]]));
        for(const q of fresh)bySeq.get(q.seq).push(q);
        for(const seq of seqs){
            const entries=bySeq.get(seq),segs=entries.map(q=>q.seg);
            const duration=Math.max(1/120,...segs.map(s=>s._pileNominalDuration||1/120));
            let earliest=Math.max(0,g.pileFlowClock||0);
            for(const {ball,seg} of entries){
                const path=ball.fallPath||[],idx=path.indexOf(seg);
                if(idx>0){
                    for(let j=idx-1;j>=0;j--){
                        const prev=path[j];
                        if(Number.isFinite(prev?.pileFlowEnd)){earliest=Math.max(earliest,prev.pileFlowEnd);break;}
                    }
                }
                for(const sid of pileFlowSupportIds(seg)){
                    const sb=pileFlowBallById(g,sid),sp=Array.isArray(sb?.fallPath)?sb.fallPath:[];
                    for(const ss of sp){
                        if(ss?.pileFlow&&Number.isFinite(ss.pileFlowStart)&&Number.isFinite(ss.pileFlowEnd)){
                            earliest=Math.max(earliest,Math.min(ss.pileFlowStart,ss.pileFlowEnd));break;
                        }
                    }
                }
            }
            let start=earliest;
            let safe=pileFlowWaveSafe(g,segs,start,duration);
            const searchEnd=earliest+Math.max(.30,duration*1.25);
            while(!safe&&start<searchEnd-1e-9){start+=PILE_FLOW_SCHEDULE_STEP;safe=pileFlowWaveSafe(g,segs,start,duration);}
            for(const seg of segs){seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;seg.pileFlowContinuousV6=true;}
        }
    };

    const __prepareContinuousPileFlowV6=prepareContinuousPileFlow;
    prepareContinuousPileFlow=function(g,reason="pile_flow"){
        const out=__prepareContinuousPileFlowV6(g,reason);
        if(String(reason).includes("garbage")){
            const moved=compactEnclosedGarbageCavities(g,new Set());
            if(moved){
                const tagged=markPileFlowPaths(g,"garbage_cavity_continuation_v6");
                out.moved=true;
                out.balls=Math.max(out.balls||0,tagged.balls||0);
                out.segments=(out.segments||0)+(tagged.segments||0);
                g.ver++;
            }
        }
        return out;
    };

    materializeGarbagePack=function(g,pack){
        let ay=(pack.fixedTarget&&shapeFitsAt(g.board,pack.pat,pack.ax,pack.targetY))?pack.targetY:deepestRigidAnchor(g.board,pack.pat,pack.ax);
        if(ay===null){
            let best=null;
            for(let ax=0;ax<W2;ax++){
                const yy=deepestRigidAnchor(g.board,pack.pat,ax);
                if(yy===null)continue;
                const d=Math.abs(ax-pack.ax);
                if(!best||d<best.d)best={ax,ay:yy,d};
            }
            if(!best){g.garbBlocked=true;return false;}
            pack.ax=best.ax;ay=best.ay;
        }
        pack.targetY=ay;
        const createdIds=new Set();
        for(let i=0;i<pack.pat.length;i++){
            const [dx,dy]=pack.pat[i],x=pack.ax+dx,y=ay+dy;
            const ball=mkBall(g,pack.colors[i]);
            ball.isGarbage=true;ball.garbageType=pack.type;
            normalizePileBallPhysics(ball);
            ball.isGarbage=true;ball.garbageType=pack.type;
            g.board[y][x]=ball;setVis(g,ball,x,y,0);createdIds.add(ball.id);
        }
        normalizeAllNonActivePileBalls(g);
        compactEnclosedGarbageCavities(g,createdIds);
        prepareContinuousPileFlow(g,"garbage_materialize_v6");
        return true;
    };

    const __lockV6=lock;
    const __spawnV6=spawn;
    function deferredOverflowEntryYV6(y){let yy=y;while(yy<0)yy+=2;return yy;}
    function finishDeferredLockV6(g,cells,vy){
        const inside=[],over=[];
        for(const [x,y,c] of cells){if(y<0)over.push({x,y,c});else inside.push([x,y,c]);}
        if(!over.length)return false;
        if(inside.some(([x,y])=>!valid(x,y)||g.board[y][x]!==null))return false;
        for(const [x,y,c] of inside){
            const ball=mkBall(g,c);normalizePileBallPhysics(ball);ball.rigid=false;
            g.board[y][x]=ball;setVis(g,ball,x,y,Math.max(RELEASE_INITIAL_VY,vy||0));
        }
        if(!Array.isArray(g.deferredOverflowV6))g.deferredOverflowV6=[];
        g.deferredOverflowV6.push(...over);
        g.gameOverOverflow=over.map(q=>[q.x,q.y,q.c]);
        g.piece=null;g.hardDropAnim=null;g.freeX=null;g.dragging=false;g.activeCluster=null;g.landingSpecial=null;
        g.state="RESOLVING";g.phase="SETTLE";g.stateT=0;emit(g,{t:"land"});
        prepareContinuousPileFlow(g,"deferred_limit_settle_v6");g.ver++;return true;
    }
    lock=function(g,vy=2){
        if(!g?.piece)return;
        if(g.freeX!=null)setColumn(g,g.freeX);
        let cells=pieceCells(g.piece);
        if(cells.some(([,y])=>y<0)){
            settleAll(g.board);
            g.piece=dropPiece(g.board,g.piece);
            cells=pieceCells(g.piece);
            if(cells.some(([,y])=>y<0)&&finishDeferredLockV6(g,cells,vy))return;
        }
        return __lockV6(g,vy);
    };

    function injectDeferredOverflowV6(g){
        const pending=Array.isArray(g.deferredOverflowV6)?g.deferredOverflowV6:[];
        if(!pending.length)return {moved:false,blocked:false};
        const remaining=[];let injected=0;
        for(const q of pending){
            const entryY=deferredOverflowEntryYV6(q.y);
            if(entryY>=0&&entryY<ROWS&&valid(q.x,entryY)&&g.board[entryY][q.x]===null){
                const ball=mkBall(g,q.c);normalizePileBallPhysics(ball);
                g.board[entryY][q.x]=ball;setVis(g,ball,q.x,q.y,0);injected++;
            }else remaining.push(q);
        }
        g.deferredOverflowV6=remaining;
        g.gameOverOverflow=remaining.map(q=>[q.x,q.y,q.c]);
        if(injected){
            prepareContinuousPileFlow(g,"deferred_overflow_reentry_v6");
            g.state="RESOLVING";g.phase="SETTLE";g.stateT=0;g.ver++;
            return {moved:true,blocked:remaining.length>0};
        }
        return {moved:false,blocked:remaining.length>0};
    }
    spawn=function(g){
        if(Array.isArray(g.deferredOverflowV6)&&g.deferredOverflowV6.length){
            const r=injectDeferredOverflowV6(g);
            if(r.moved)return;
            if(r.blocked){die(g,g.deferredOverflowV6.map(q=>[q.x,q.y,q.c]),"LIMIT");return;}
        }
        g.gameOverOverflow=[];
        return __spawnV6(g);
    };

    if(typeof window!=="undefined")window.__hexdropGarbageIntervalV6=HEXDROP_GARBAGE_SHAPE_INTERVAL_V6;
})();
