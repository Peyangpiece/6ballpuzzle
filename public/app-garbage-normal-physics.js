/* Incoming garbage uses the ordinary ball physics, with no separate fall model.
 *
 * The only garbage-phase rule retained here is external to the falling balls:
 * balls that were already accumulated when GARBAGE began are frozen until the
 * complete incoming batch has reached rest. Incoming balls themselves are
 * ordinary independent board balls and use settlePass -> fallPath ->
 * updateVisuals exactly like any other released ball.
 */
(function installGarbageNormalPhysics(){
    if(typeof window==="undefined"||window.__hexGarbageNormalPhysics)return;
    window.__hexGarbageNormalPhysics=true;

    const NORMAL_GARBAGE_INTERVAL=0.5;
    const NORMAL_GARBAGE_SETTLE_TOL=0.06;

    // app-17 contained the former garbage-only visual queue/contact gates.
    // Restore the ordinary visual resolver captured before those gates.
    if(typeof __hexdropUpdateVisualsBeforeGarbageQueueGate==="function")
        updateVisuals=__hexdropUpdateVisualsBeforeGarbageQueueGate;
    if(typeof __hexdropResolveVisualContactsBeforeGarbageQueueGate==="function")
        resolveVisualContacts=__hexdropResolveVisualContactsBeforeGarbageQueueGate;
    __hexdropGarbageMotionQueue=function(){return{minSeq:Infinity,queued:new Set()};};

    // A frozen accumulated ball is still a physical support/obstacle; it simply
    // cannot propose its own gravity move until the garbage batch is complete.
    const ordinaryNaturalMotion=hexPhysNaturalMotion;
    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball?.garbagePhaseFrozen)return null;
        return ordinaryNaturalMotion(board,x,y,ignore);
    };

    // Garbage metadata must not create a special HEXAGON-hole exemption. Mixed
    // incoming colours behave exactly like mixed ordinary balls under gravity.
    if(typeof referenceHexagonRingBalls==="function"){
        referenceHexagonRingBalls=function(board,cx,cy){
            const cells=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]],balls=[];
            if(!valid(cx,cy)||board[cy][cx]!==null)return null;
            for(const[dx,dy]of cells){
                const x=cx+dx,y=cy+dy;
                if(!valid(x,y)||!board[y][x])return null;
                balls.push(board[y][x]);
            }
            const c=getC(balls[0]);
            return balls.every(ball=>getC(ball)===c)?balls:null;
        };
    }

    function boardEntries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        return out;
    }
    function withGarbageRenderedAsOrdinary(g,fn){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return fn();
        const hidden=[];
        for(const q of boardEntries(g))if(q.ball.isGarbage){hidden.push(q.ball);q.ball.isGarbage=false;}
        try{return fn();}
        finally{for(const ball of hidden)ball.isGarbage=true;}
    }

    // The renderer/contact resolver now takes the identical branches used by
    // ordinary balls. isGarbage remains available outside those calls only as
    // attack/source metadata and for normal drawing after the call returns.
    const ordinaryUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){return withGarbageRenderedAsOrdinary(g,()=>ordinaryUpdateVisuals(g,dt));};
    const ordinaryResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){return withGarbageRenderedAsOrdinary(g,()=>ordinaryResolveVisualContacts(g));};

    function freezeExistingPile(g){
        const ids=new Set();
        for(const q of boardEntries(g)){
            ids.add(q.ball.id);
            q.ball.garbagePhaseFrozen=true;
            // GARBAGE begins only from a quiescent CHECK point. Remove any stale
            // group metadata so no rigid-body proposal can bypass the freeze.
            hexPhysClearGroupBall(q.ball);
            if(q.v){q.v.vy=0;q.v.motionSpeed=0;}
        }
        g.garbageFrozenPileIds=ids;
        return ids;
    }
    function unfreezeExistingPile(g){
        const ids=g?.garbageFrozenPileIds;
        if(ids instanceof Set){
            for(const q of boardEntries(g))if(ids.has(q.ball.id))delete q.ball.garbagePhaseFrozen;
        }else{
            for(const q of boardEntries(g))delete q.ball.garbagePhaseFrozen;
        }
        g.garbageFrozenPileIds=null;
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

    function makeIncomingBall(g,color,type,seq,role,x,y){
        const ball=mkBall(g,color);
        ball.isGarbage=true;
        ball.garbageType=type||"SINGLE";
        ball.garbageSourceSeq=seq;
        ball.garbageSourceRole=role;
        ball.rigid=false;
        delete ball.garbageBubbleHold;
        delete ball.garbagePileSettled;
        delete ball.garbageInitialRestReached;
        delete ball.garbageSpawnHold;
        delete ball.fixedGarbage;
        hexPhysClearGroupBall(ball);
        g.board[y][x]=ball;
        noteBoardCell(g.board,y,ball);
        setVis(g,ball,x,y,RELEASE_INITIAL_VY);
        const v=g.vis.get(ball.id);
        if(v){v.motionSpeed=RELEASE_INITIAL_VY;v.justReleased=true;}
        return ball;
    }

    function spawnPlannedShape(g,plan){
        if(!plan?.pat?.length)return false;
        const ax=findSpawnAnchor(g,plan.pat,plan.ax);
        if(ax===null)return false;
        plan.ax=ax;
        plan.ballIds=[];
        for(let i=0;i<plan.pat.length;i++){
            const[dx,dy]=plan.pat[i],x=ax+dx,y=GARBAGE_START_Y+dy;
            const ball=makeIncomingBall(g,plan.colors[i],plan.type,plan.seq,i,x,y);
            plan.ballIds.push(ball.id);
        }
        plan._started=true;
        plan.actualStartTime=g.garbageClock;
        plan.landed=false;
        g.ver++;
        return true;
    }

    function spawnSingleNormalGarbage(g){
        const free=TOPS.filter(x=>g.board[GARBAGE_TOP_ROW][x]===null&&visualPointSafe(g,-1,x,GARBAGE_TOP_ROW,HEX_MIN_DIST));
        if(!free.length)return 0;
        const x=free[Math.floor(g.rng()*free.length)];
        const ball=makeIncomingBall(g,Math.floor(g.rng()*COLORS.length),"SINGLE",g.garbageSeq++,0,x,GARBAGE_TOP_ROW);
        if(!Array.isArray(g.garbageLooseIds))g.garbageLooseIds=[];
        g.garbageLooseIds.push(ball.id);
        g.ver++;
        return 1;
    }
    garbageBall=spawnSingleNormalGarbage;

    function startOneOrdinaryGravityBatch(g){
        if(pendingFallPathCount(g)!==0||!nearlySettled(g,NORMAL_GARBAGE_SETTLE_TOL))return false;
        if(!hasLegalGravityMove(g.board))return false;
        const moved=settlePass(g.board);
        if(moved){g.ver++;g.stateT=0;}
        return !!moved;
    }

    prepareGarbageBatch=function(g){
        if(g.garbageBatchPrepared)return;
        g.garbageBatchPrepared=true;
        g.garbageClock=0;
        g.garbageSeq=0;
        g.garbageMaterializeIndex=0;
        g.garbagePlans=[];
        g.activeGarbagePacks=[];
        g.garbageLooseIds=[];
        freezeExistingPile(g);

        const pending=g.garbShapes.splice(0);
        const shadow=cloneBoardForGarbagePlan(g.board);
        for(let i=0;i<pending.length;i++){
            const type=pending[i],plan=chooseGarbagePlan(g,shadow,type,i);
            if(!plan){
                g.garbBlocked=true;
                g.incomingShapes.unshift(...pending.slice(i));
                break;
            }
            const packet={
                ...plan,
                pat:plan.pat.map(([dx,dy])=>[dx,dy]),
                colors:plan.colors.slice(),
                seq:g.garbagePlans.length,
                _started:false,
                landed:false,
                ballIds:[]
            };
            reserveGarbagePlan(shadow,packet,-100000-i*100);
            g.garbagePlans.push(packet);
        }
        g.garbageSeq=g.garbagePlans.length;
        g.garbageNextBallAt=0;
        // The former emergency materializer is intentionally disabled. This
        // batch is resolved only by ordinary gravity; a large value keeps the
        // legacy GARBAGE watchdog from injecting a second physics model.
        g.garbageWatchdogLimit=1e9;
        g.ver++;
    };

    updateGarbagePacks=function(g,dt){
        g.garbageClock+=Math.max(0,dt||0);
        g.activeGarbagePacks=[];

        // Exactly the same checkpoint used by normal SETTLE: do not advance
        // logical gravity until the previous fallPath has visibly completed.
        if(pendingFallPathCount(g)!==0||!nearlySettled(g,NORMAL_GARBAGE_SETTLE_TOL))return;

        // Continue ordinary gravity for all non-frozen balls already present.
        if(startOneOrdinaryGravityBatch(g))return;

        // Reaching this point means every currently released garbage ball is at
        // ordinary physical rest against the frozen pile/floor.
        for(const plan of g.garbagePlans)if(plan._started&&!plan.landed)plan.landed=true;

        const next=g.garbagePlans.find(p=>!p._started);
        if(next&&g.garbageClock+1e-9>=g.garbageNextBallAt){
            if(spawnPlannedShape(g,next)){
                g.garbageNextBallAt+=NORMAL_GARBAGE_INTERVAL;
                startOneOrdinaryGravityBatch(g);
            }
            return;
        }

        if(g.garbagePlans.every(p=>p._started&&p.landed)&&g.garbLeft>0&&g.garbageClock+1e-9>=g.garbageNextBallAt){
            const placed=spawnSingleNormalGarbage(g);
            if(placed>0){
                g.garbLeft--;
                g.garbageNextBallAt+=NORMAL_GARBAGE_INTERVAL;
                startOneOrdinaryGravityBatch(g);
            }else{
                g.garbBlocked=true;
                g.incoming+=g.garbLeft;
                g.garbLeft=0;
            }
        }
    };

    garbageBatchDone=function(g){
        if(!g.garbageBatchPrepared)return false;
        if(!g.garbagePlans.every(p=>p._started&&p.landed))return false;
        if(g.garbLeft!==0)return false;
        if(pendingFallPathCount(g)!==0||!nearlySettled(g,NORMAL_GARBAGE_SETTLE_TOL))return false;
        return !hasLegalGravityMove(g.board);
    };
    garbageVisualsDone=garbageBatchDone;

    finishGarbageVisuals=function(g){
        unfreezeExistingPile(g);
        for(const q of boardEntries(g)){
            delete q.ball.garbagePhaseFrozen;
            delete q.ball.garbageBubbleHold;
            if(q.v){delete q.v.garbageLocalCollisionHeld;delete q.v.garbageQueueHeld;delete q.v.garbageSweepBlocked;}
        }
        g.activeGarbagePacks=[];
        g._pileFlowBallById=null;
        refreshBoardScanMin(g.board);
    };

    // Disable every legacy airborne/contact materializer. No normal incoming
    // ball ever transitions between an airborne packet and a second board
    // representation, so these entry points are deliberately inert.
    materializeGarbagePack=function(){return false;};
    materializeGarbagePackAtContact=function(){return false;};
    materializeGarbageContactsThrough=function(){return 0;};

    window.__hexGarbageUsesNormalPhysics=true;
    window.__hexGarbageAirbornePacketsDisabled=true;
    window.__hexGarbagePredictiveQueueDisabled=true;
    window.__hexGarbageExistingPileFrozenUntilDone=true;
})();
