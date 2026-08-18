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
            v.garbageBubbleT=0;
        }
        return ball;
    }

    function findBallById(g,id){
        for(const q of boardEntries(g))if(q.ball.id===id)return q.ball;
        return null;
    }

    function shiftedPoint(p,dx,dy){return Array.isArray(p)?[p[0]+dx,p[1]+dy]:null;}
    function resolveFollowSupportGeometry(g,ball,seg,depth=0,seen=new Set()){
        if(!seg||seg.kind!=="FOLLOW_SUPPORT"||!Array.isArray(seg.from)||!Array.isArray(seg.to))return seg;
        if(depth>10||seen.has(ball.id))return seg;
        const nextSeen=new Set(seen);nextSeen.add(ball.id);
        const supportIds=[...(seg.followSupportIds||[])];
        if(seg.movingSupportId&&!supportIds.includes(seg.movingSupportId))supportIds.unshift(seg.movingSupportId);
        for(const sid of supportIds){
            const support=findBallById(g,sid);
            if(!support||nextSeen.has(support.id)||!Array.isArray(support.fallPath))continue;
            const supportSeg=support.fallPath.find(s=>
                s&&s.motionSeq===seg.motionSeq&&Array.isArray(s.from)&&Array.isArray(s.to)
            );
            if(!supportSeg)continue;
            const base=resolveFollowSupportGeometry(g,support,supportSeg,depth+1,nextSeen);
            if(!base?.from||!base?.to)continue;
            const ox=seg.from[0]-base.from[0],oy=seg.from[1]-base.from[1];
            const expected=[base.to[0]+ox,base.to[1]+oy];
            if(Math.abs(expected[0]-seg.to[0])>1e-6||Math.abs(expected[1]-seg.to[1])>1e-6)continue;
            // FOLLOW_SUPPORT is a rigid positional offset from the moving
            // support during this one ordinary event. Copy the support's exact
            // path geometry and translate its pivot by the same offset. This is
            // mathematically identical to liveBatchPointAt without requiring a
            // global motionSeq queue, so 0.600 s units remain independent.
            return{
                ...seg,
                pivot:shiftedPoint(base.pivot,ox,oy),
                topPivot:shiftedPoint(base.topPivot,ox,oy),
                movingSupportId:0,
                followSupportIds:[],
                kind:base.topPivot?"FOLLOW_RESOLVED_TOP_PIVOT":base.pivot?"FOLLOW_RESOLVED_ARC":"FOLLOW_RESOLVED_TRANSLATE",
                garbageResolvedFollowSupport:true
            };
        }
        // Keep the original metadata if no matching support event can be found;
        // the stress audit treats a resulting stall as a hard failure rather
        // than silently inventing a different physical path.
        return seg;
    }

    function resolveAllFollowSupportGeometry(g,ids){
        // Two-pass replacement: every lookup sees the original motionSeq paths,
        // even when the support is another member of the same six-ball unit.
        const replacements=new Map();
        for(const id of ids){
            const ball=findBallById(g,id);
            if(!ball||!Array.isArray(ball.fallPath))continue;
            replacements.set(ball,ball.fallPath.map(seg=>resolveFollowSupportGeometry(g,ball,seg)));
        }
        for(const [ball,path] of replacements)ball.fallPath=path;
    }

    function expandZeroSeqTopPivotPath(ball){
        if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)return;
        const expanded=[];
        for(const seg of ball.fallPath){
            if(!seg?.topPivot||!Array.isArray(seg.from)||!Array.isArray(seg.to)){
                expanded.push(seg);continue;
            }
            const [px,py]=seg.topPivot;
            const contactRow=(cellCenterYNorm(py)-1-BOARD_TOP_CENTER_N)/HEX_ROW_H;
            if(!(contactRow>seg.from[1]+1e-7)||contactRow>seg.to[1]+1e-6){
                expanded.push(seg);continue;
            }
            const contact=[px,contactRow];
            const fall={
                ...seg,
                from:[...seg.from],to:contact,
                pivot:null,topPivot:null,
                movingSupportId:0,followSupportIds:[],
                kind:"FREE_FALL_TO_SUPPORT",
                motionSeq:0,bundleId:0,groupSize:0,
                continuousChain:true,
                garbageExpandedTopPivot:true
            };
            const arc={
                ...seg,
                from:contact,to:[...seg.to],
                pivot:[px,py],topPivot:null,
                movingSupportId:0,followSupportIds:[],
                kind:"ROLL_FROM_TOP_CONTACT",
                motionSeq:0,bundleId:0,groupSize:0,
                continuousChain:true,
                garbageExpandedTopPivot:true
            };
            expanded.push(fall,arc);
        }
        ball.fallPath=expanded;
    }

    function compileOrdinaryUnitPath(g,ids){
        settleAll(g.board);

        // Resolve canonical coupled geometry BEFORE removing motionSeq, because
        // that event id is the exact link between a FOLLOW_SUPPORT member and
        // the support segment it follows.
        resolveAllFollowSupportGeometry(g,ids);

        for(const id of ids){
            const ball=findBallById(g,id);
            if(!ball||!Array.isArray(ball.fallPath))continue;
            expandZeroSeqTopPivotPath(ball);
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

        const afterLoose=(g.garbageLooseIds||[]).length;
        if(afterLoose>beforeLoose){
            armUnseenLooseEffects(g,g._garbagePresentationKnownIds);
            const start=Number.isFinite(g.garbageClock)?g.garbageClock:0;
            g.garbagePresentationLastUnitStart=start;
            g.garbageNextBallAt=start+GARBAGE_UNIT_INTERVAL;
        }else armUnseenLooseEffects(g,g._garbagePresentationKnownIds);
        return r;
    };

    window.__hexGarbageTopPivotExpandedForIndependentUnits=true;
    window.__hexGarbageFollowSupportResolvedForIndependentUnits=true;
})();