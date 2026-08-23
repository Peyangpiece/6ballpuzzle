/* Garbage presentation/timing only: no garbage-specific fall equation.
 *
 * One shaped packet (e.g. all six PYRAMID balls) is one incoming unit. Units
 * begin exactly 0.600 s apart. Each unit is inserted as ordinary board balls
 * and `settleAll` compiles the canonical ordinary fallPath, including the
 * original motionSeq waves, topPivot arcs and FOLLOW_SUPPORT dependencies.
 *
 * Different incoming units may overlap in wall-clock time. The unit therefore
 * keeps its own start boundary, but every freshly compiled segment is now passed
 * through the CURRENT pile-flow scheduler instead of assigning absolute times
 * here. That scheduler owns real swept-path collision checks, continuous gravity
 * timing and selective temporal separation of only conflicting members.
 *
 * This is important: presentation must never manufacture a second unswept
 * timeline beside the authoritative garbage physics. The bubble/pop appearance
 * remains visual-only; there is no garbageBubbleHold or spawn hold.
 */
(function installGarbagePresentation(){
    if(typeof window==="undefined"||window.__hexGarbagePresentation)return;
    window.__hexGarbagePresentation=true;

    const GARBAGE_UNIT_INTERVAL=0.600;
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

        const fresh=[];
        for(const id of ids){
            const ball=findBallById(g,id);
            if(!ball||!Array.isArray(ball.fallPath))continue;
            let first=true;
            for(let index=0;index<ball.fallPath.length;index++){
                const seg=ball.fallPath[index];
                if(!seg?.to||seg.pileFlow)continue;

                if(typeof repairPileFlowSegmentGeometry==="function"){
                    repairPileFlowSegmentGeometry(g,ball,seg,"garbage_unit_timeline");
                }

                const seq=Number(seg.motionSeq)||0;
                seg.pileFlowOriginalSeq=seq;
                seg.pileFlow=true;
                seg.pileFlowEntry=first;
                seg.pileFlowReason="garbage_unit_timeline";
                seg.garbageUnitTimeline=true;
                seg.garbageUnitSeq=unitSeq;
                seg.garbageOriginalMotionSeq=seq;

                // pileFlowWaveSafe evaluates the real path only when this owner
                // reference is present. Keep it through scheduling, then remove
                // it just like markPileFlowPaths does.
                seg._pileFlowBall=ball;
                fresh.push({ball,seg,seq});
                first=false;
            }
        }

        if(!fresh.length){
            g.ver++;
            return;
        }

        // CRITICAL: do not assign pileFlowStart/End in this presentation layer.
        // At runtime this symbol points at the final wrapped garbage scheduler:
        // continuous gravity + real swept-path temporal separation.
        scheduleFreshPileFlowWave(g,fresh);

        const liveIds=new Set();
        for(const {ball,seg} of fresh){
            liveIds.add(ball.id);
            const v=g.vis.get(ball.id);
            if(v){
                v.pileFlow=true;
                v.vy=Math.max(v.vy||0,RELEASE_INITIAL_VY);
                v.motionSpeed=Math.max(v.motionSpeed||0,v.vy||0,0.0001);
            }
            delete seg._pileNominalDuration;
            delete seg._pileFlowBall;
        }

        window.__sixBallLastGarbagePresentationSchedule={
            unitSeq,
            balls:liveIds.size,
            segments:fresh.length,
            scheduler:
                window.__sixBallGarbageTemporalTrajectoryVersion||
                window.__sixBallGarbageContinuousVersion||
                "pile-flow",
            at:Date.now()
        };

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
    window.__hexGarbagePresentationDelegatesPathSchedule=true;
})();
