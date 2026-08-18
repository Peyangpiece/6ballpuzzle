/* Garbage presentation/timing only: no garbage-specific fall equation.
 *
 * One shaped packet (e.g. all six PYRAMID balls) is one incoming unit. Units
 * begin exactly 0.600 s apart. Each unit is inserted as ordinary board balls
 * and `settleAll` compiles the canonical ordinary fallPath, including the
 * original motionSeq waves, topPivot arcs and FOLLOW_SUPPORT dependencies.
 *
 * Different incoming units may overlap in wall-clock time, so the global
 * motionSeq queue cannot be used to render them. Instead, each unit's ordinary
 * event waves are mapped to absolute pileFlowStart/End times beginning at the
 * unit's own spawn time. `pileFlowPointForBall` then evaluates the SAME solver-
 * authored paths and moving-support relations on that unit-local timeline.
 * This preserves normal-ball causality inside a six-ball unit without delaying
 * the next unit beyond the requested 0.600 s cadence.
 *
 * The bubble/pop appearance is visual-only. There is no garbageBubbleHold or
 * spawn hold, so the effect never freezes gravity.
 */
(function installGarbagePresentation(){
    if(typeof window==="undefined"||window.__hexGarbagePresentation)return;
    window.__hexGarbagePresentation=true;

    const GARBAGE_UNIT_INTERVAL=0.600;
    const MIN_EVENT_DURATION=1/120;
    window.__hexGarbageUnitInterval=GARBAGE_UNIT_INTERVAL;
    window.__hexGarbageSpawnEffectPreserved=true;
    window.__hexGarbageTimedUnitsUseOrdinarySolver=true;
    window.__hexGarbageUnitLocalTimeline=true;

    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        return out;
    }
    function garbageEntries(g){
        if(typeof window.__hexGetGarbagePhaseBallCache==="function")
            return window.__hexGetGarbagePhaseBallCache(g).garbage;
        return boardEntries(g).filter(q=>q.ball?.isGarbage);
    }
    function findBallById(g,id){
        if(typeof window.__hexGetGarbagePhaseBallCache==="function"){
            const ball=window.__hexGetGarbagePhaseBallCache(g).byId.get(id);
            if(ball)return ball;
        }
        for(const q of boardEntries(g))if(q.ball.id===id)return q.ball;
        return null;
    }

    function findSpawnAnchor(g,pat,preferredAx){
        const minX=Math.min(...pat.map(([x])=>x)),maxX=Math.max(...pat.map(([x])=>x));
        const candidates=[];
        for(let ax=-minX;ax<=W2-1-maxX;ax++)candidates.push(ax);
        candidates.sort((a,b)=>Math.abs(a-preferredAx)-Math.abs(b-preferredAx)||a-b);
        for(const ax of candidates){
            let safe=true;
            for(const[dx,dy]of pat){
                const x=ax+dx,y=GARBAGE_START_Y+dy;
                if(!valid(x,y)||g.board[y][x]!==null||!visualPointSafe(g,-1,x,y,HEX_MIN_DIST)){safe=false;break;}
            }
            if(safe)return ax;
        }
        return null;
    }

    function makeTimedIncomingBall(g,color,type,seq,role,x,y){
        const ball=mkBall(g,color);
        ball.isGarbage=true;
        ball.garbageType=type||"SINGLE";
        ball.garbageSourceSeq=seq;
        ball.garbageSourceRole=role;
        ball.rigid=false;
        hexPhysClearGroupBall(ball);
        delete ball.garbageBubbleHold;
        delete ball.garbageSpawnHold;
        delete ball.garbagePileSettled;
        delete ball.garbageInitialRestReached;
        delete ball.fixedGarbage;
        g.board[y][x]=ball;
        noteBoardCell(g.board,y,ball);
        setVis(g,ball,x,y,RELEASE_INITIAL_VY);
        if(typeof window.__hexInvalidateGarbagePhaseBallCache==="function")
            window.__hexInvalidateGarbagePhaseBallCache(g);
        const v=g.vis.get(ball.id);
        if(v){
            v.motionSpeed=RELEASE_INITIAL_VY;
            v.justReleased=true;
            v.garbageBubbleT=0;
        }
        return ball;
    }

    function scheduleOrdinaryUnitTimeline(g,ids,unitSeq){
        // Compile exactly the same logical path ordinary balls receive.
        settleAll(g.board);

        const entries=[];
        for(const id of ids){
            const ball=findBallById(g,id);
            if(!ball||!Array.isArray(ball.fallPath))continue;
            for(let index=0;index<ball.fallPath.length;index++){
                const seg=ball.fallPath[index];
                if(!seg?.to)continue;
                entries.push({ball,seg,index,seq:Number(seg.motionSeq)||0});
            }
        }
        if(!entries.length){g.ver++;return;}

        // settleAll's event sequence is the canonical dependency order. Every
        // member of one event gets the same real-time duration, matching the
        // ordinary liveBatch renderer. A later event starts only after the prior
        // event of THIS UNIT, not after another 0.600 s unit.
        const seqs=[...new Set(entries.map(e=>e.seq))].sort((a,b)=>a-b);
        const stateByBall=new Map();
        for(const id of ids){
            const ball=findBallById(g,id),v=ball&&g.vis.get(id);
            stateByBall.set(id,{vy:Math.max(0,v?.vy||RELEASE_INITIAL_VY),speed:Math.max(0,v?.motionSpeed||RELEASE_INITIAL_VY)});
        }
        let cursor=Math.max(0,g.pileFlowClock||0);
        for(const seq of seqs){
            const wave=entries.filter(e=>e.seq===seq);
            let waveDuration=MIN_EVENT_DURATION;
            const endStates=new Map();
            for(const e of wave){
                const start=stateByBall.get(e.ball.id)||{vy:RELEASE_INITIAL_VY,speed:RELEASE_INITIAL_VY};
                const end={...start};
                const natural=Math.max(MIN_EVENT_DURATION,hexMotionDuration(e.seg,end));
                waveDuration=Math.max(waveDuration,natural);
                endStates.set(e.ball.id,end);
            }
            for(const e of wave){
                e.seg.pileFlow=true;
                e.seg.pileFlowStart=cursor;
                e.seg.pileFlowDuration=waveDuration;
                e.seg.pileFlowEnd=cursor+waveDuration;
                e.seg.garbageUnitTimeline=true;
                e.seg.garbageUnitSeq=unitSeq;
                e.seg.garbageOriginalMotionSeq=e.seq;
                // Keep motionSeq for diagnostics/dependency identity. Scheduled
                // pileFlow segments are explicitly excluded from liveBatch.
            }
            for(const [id,end] of endStates)stateByBall.set(id,end);
            cursor+=waveDuration;
        }
        for(const id of ids){
            const ball=findBallById(g,id),v=ball&&g.vis.get(id);
            if(v&&ball?.fallPath?.length){
                v.pileFlow=true;
                v.vy=Math.max(v.vy||0,RELEASE_INITIAL_VY);
                v.motionSpeed=Math.max(v.motionSpeed||0,v.vy||0,0.0001);
            }
        }
        g.ver++;
    }

    function spawnTimedPlan(g,plan){
        if(!plan?.pat?.length||plan._started)return false;
        const ax=findSpawnAnchor(g,plan.pat,plan.ax);
        if(ax===null)return false;
        plan.ax=ax;
        plan.ballIds=[];
        for(let i=0;i<plan.pat.length;i++){
            const[dx,dy]=plan.pat[i],x=ax+dx,y=GARBAGE_START_Y+dy;
            const ball=makeTimedIncomingBall(g,plan.colors[i],plan.type,plan.seq,i,x,y);
            plan.ballIds.push(ball.id);
        }
        plan._started=true;
        plan.actualStartTime=g.garbageClock;
        plan.landed=false;
        scheduleOrdinaryUnitTimeline(g,plan.ballIds,plan.seq);
        g.garbagePresentationLastUnitStart=plan.actualStartTime;
        g.garbageNextBallAt=plan.actualStartTime+GARBAGE_UNIT_INTERVAL;
        return true;
    }

    function armUnseenLooseEffects(g,known){
        for(const {ball,v} of garbageEntries(g)){
            if(known.has(ball.id))continue;
            v.garbageBubbleT=0;
            delete ball.garbageBubbleHold;
            delete ball.garbageSpawnHold;
            known.add(ball.id);
        }
    }

    const basePrepareGarbageBatch=prepareGarbageBatch;
    prepareGarbageBatch=function(g){
        const r=basePrepareGarbageBatch(g);
        g._garbagePresentationKnownIds=new Set();
        for(const {ball} of garbageEntries(g))if(ball.garbagePhaseFrozen)g._garbagePresentationKnownIds.add(ball.id);
        g.garbageNextBallAt=0;
        g.garbagePresentationLastUnitStart=null;
        return r;
    };

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        if(!g._garbagePresentationKnownIds){
            g._garbagePresentationKnownIds=new Set(garbageEntries(g).map(q=>q.ball.id));
        }
        // Advance ordinary GARBAGE bookkeeping/clock, but suppress the old 0.5 s
        // shaped-unit start gate. This layer owns shaped starts at exactly 0.600 s.
        const nextUnstarted=(g.garbagePlans||[]).find(p=>!p._started);
        const scheduledAt=g.garbageNextBallAt;
        if(nextUnstarted)g.garbageNextBallAt=Infinity;
        const beforeLoose=(g.garbageLooseIds||[]).length;
        const r=baseUpdateGarbagePacks(g,dt);
        if(nextUnstarted)g.garbageNextBallAt=scheduledAt;

        const due=(g.garbagePlans||[]).find(p=>!p._started);
        if(due&&g.garbageClock+1e-9>=g.garbageNextBallAt){
            if(spawnTimedPlan(g,due))for(const id of due.ballIds)g._garbagePresentationKnownIds.add(id);
        }

        // Numeric/legacy single garbage still comes from the normal adapter;
        // preserve its appearance and use the same following-unit cadence.
        const afterLoose=(g.garbageLooseIds||[]).length;
        if(afterLoose>beforeLoose){
            armUnseenLooseEffects(g,g._garbagePresentationKnownIds);
            const start=Number.isFinite(g.garbageClock)?g.garbageClock:0;
            g.garbagePresentationLastUnitStart=start;
            g.garbageNextBallAt=start+GARBAGE_UNIT_INTERVAL;
        }else armUnseenLooseEffects(g,g._garbagePresentationKnownIds);
        return r;
    };

    window.__hexGarbageTopPivotExpandedForIndependentUnits=false;
    window.__hexGarbageFollowSupportResolvedForIndependentUnits=false;
    window.__hexGarbagePresentationUsesPhaseCache=true;
})();
