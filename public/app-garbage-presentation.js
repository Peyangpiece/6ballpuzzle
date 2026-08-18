/* Garbage presentation/timing only: no garbage-specific fall equation.
 *
 * One shaped packet (e.g. all six PYRAMID balls) is one incoming unit.
 * Units begin 0.600 s apart. Every unit is inserted as ordinary board balls,
 * then the canonical settleAll/hexPhysNaturalMotion solver compiles its normal
 * fallPath. The familiar bubble/pop appearance is visual-only: there is no
 * garbageBubbleHold or spawn hold, so the effect never freezes gravity.
 */
(function installGarbagePresentation(){
    if(typeof window==="undefined"||window.__hexGarbagePresentation)return;
    window.__hexGarbagePresentation=true;

    const GARBAGE_UNIT_INTERVAL=0.600;
    window.__hexGarbageUnitInterval=GARBAGE_UNIT_INTERVAL;
    window.__hexGarbageSpawnEffectPreserved=true;
    window.__hexGarbageTimedUnitsUseOrdinarySolver=true;

    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        return out;
    }
    function garbageEntries(g){return boardEntries(g).filter(q=>q.ball?.isGarbage);}

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
        const v=g.vis.get(ball.id);
        if(v){
            v.motionSpeed=RELEASE_INITIAL_VY;
            v.justReleased=true;
            // Restore the reference appearance at the exact unit start without
            // restoring the old effect hold/freeze behavior.
            v.garbageBubbleT=0;
        }
        return ball;
    }

    function findBallById(g,id){
        for(const q of boardEntries(g))if(q.ball.id===id)return q.ball;
        return null;
    }

    function compileOrdinaryUnitPath(g,ids){
        // Canonical physics only. settleAll repeatedly calls settlePass, which
        // calls hexPhysNaturalMotion and appends the same pivot/topPivot paths
        // used by ordinary released balls.
        settleAll(g.board);

        // A later 0.600 s unit must not wait behind the global motionSeq of an
        // earlier unit. Clearing only the batch-sequence tag selects app-08's
        // ordinary per-ball fallPath renderer; geometry, gravity, pivots and
        // collision resolver are unchanged.
        for(const id of ids){
            const ball=findBallById(g,id);
            if(!ball||!Array.isArray(ball.fallPath))continue;
            for(const seg of ball.fallPath){
                seg.motionSeq=0;
                delete seg.pileFlow;
                delete seg.pileFlowStart;
                delete seg.pileFlowEnd;
                delete seg.pileFlowDuration;
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
        compileOrdinaryUnitPath(g,plan.ballIds);
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

        // Let the normal adapter advance its clock, settle completed paths and
        // manage legacy loose singles, but prevent it from using its old 0.5 s
        // shaped-packet start gate while an unstarted shaped unit exists.
        const nextUnstarted=(g.garbagePlans||[]).find(p=>!p._started);
        const scheduledAt=g.garbageNextBallAt;
        if(nextUnstarted)g.garbageNextBallAt=Infinity;
        const beforeLoose=(g.garbageLooseIds||[]).length;
        const r=baseUpdateGarbagePacks(g,dt);
        if(nextUnstarted)g.garbageNextBallAt=scheduledAt;

        const due=(g.garbagePlans||[]).find(p=>!p._started);
        if(due&&g.garbageClock+1e-9>=g.garbageNextBallAt){
            if(spawnTimedPlan(g,due)){
                for(const id of due.ballIds)g._garbagePresentationKnownIds.add(id);
            }
        }

        // Numeric/legacy single garbage still comes from the normal adapter;
        // preserve its appearance and keep its following unit no earlier than
        // 0.600 s as well.
        const afterLoose=(g.garbageLooseIds||[]).length;
        if(afterLoose>beforeLoose){
            armUnseenLooseEffects(g,g._garbagePresentationKnownIds);
            const start=Number.isFinite(g.garbageClock)?g.garbageClock:0;
            g.garbagePresentationLastUnitStart=start;
            g.garbageNextBallAt=start+GARBAGE_UNIT_INTERVAL;
        }else armUnseenLooseEffects(g,g._garbagePresentationKnownIds);
        return r;
    };
})();
