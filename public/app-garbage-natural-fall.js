/* Natural post-contact garbage fall.
 *
 * A garbage formation is rigid only until first real pile/floor contact. At that
 * event every remaining sibling is registered as an independent continuous
 * physics ball at its CURRENT rendered centre/velocity. It is not pile-settled;
 * garbagePileSettled stays false until its own final rest.
 *
 * IMPORTANT: there is NO predictive/global wait queue here. Unsupported garbage
 * always advances immediately. Only the actual 120 Hz swept collision guards may
 * stop a ball at a real first-contact point.
 */
(function installNaturalGarbageFall(){
    if(typeof window==="undefined"||window.__hexNaturalGarbageFall)return;
    window.__hexNaturalGarbageFall=true;

    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

    // Disable app-17's legacy whole-visual garbage queue. Predictive local holds
    // are also disabled; real swept collision is the only permitted brake.
    __hexdropGarbageMotionQueue=function(){return{minSeq:Infinity,queued:new Set()};};

    function scheduleGarbageImmediately(g,fresh){
        if(!Array.isArray(fresh)||!fresh.length)return;
        preparePileFlowDurations(g,fresh);
        const clock=Math.max(0,g?.pileFlowClock||0),lastEnd=new Map(),seen=new Set();
        for(const {ball,seg} of fresh){
            const duration=Math.max(1/120,seg?._pileNominalDuration||1/120);
            const firstForBall=!seen.has(ball.id);
            const start=firstForBall?clock:(lastEnd.get(ball.id)??clock);
            seen.add(ball.id);
            if(typeof pileFlowAttachCausalSupports==="function")pileFlowAttachCausalSupports(g,ball,seg,start,duration);
            seg.pileFlowStart=start;
            seg.pileFlowDuration=duration;
            seg.pileFlowEnd=start+duration;
            seg.garbageImmediateSchedule=true;
            seg.garbageImmediateFirstSegment=firstForBall;
            lastEnd.set(ball.id,seg.pileFlowEnd);
        }
    }

    const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
    scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){
        if(reason==="garbage_pile_contact"&&Array.isArray(fresh)&&fresh.some(q=>q?.ball?.isGarbage))return scheduleGarbageImmediately(g,fresh);
        return baseScheduleFreshPileFlow(g,fresh,reason);
    };

    const baseMaterializeGarbageBallAtContact=materializeGarbageBallAtContact;

    function motionReservesCell(g,cx,cy){
        const target=[cx,cy];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;
            const v=g.vis.get(ball.id);
            if(v&&physDist([v.x,v.y],target)<0.985)return true;
            for(const seg of Array.isArray(ball.fallPath)?ball.fallPath:[]){
                if(Array.isArray(seg?.from)&&physDist(seg.from,target)<1e-7)return true;
                if(Array.isArray(seg?.to)&&physDist(seg.to,target)<1e-7)return true;
            }
        }
        return false;
    }

    function nearestReleasedLogicalCell(g,x,visualY){
        const first=Math.max(BOARD_MIN_ROW,Math.ceil(visualY-1e-8));
        let best=null;
        for(let y=first;y<ROWS;y++){
            for(let dx=0;dx<W2;dx++){
                const xs=dx===0?[x]:[x-dx,x+dx];
                for(const cx of xs){
                    if(!Number.isInteger(cx)||!valid(cx,y)||g.board[y][cx]||motionReservesCell(g,cx,y))continue;
                    const score=(y-visualY)*2+Math.abs(cx-x)*.6;
                    if(!best||score<best.score)best={x:cx,y,score};
                }
                if(best&&best.y===y&&Math.abs(best.x-x)===0)break;
            }
            if(best&&best.y===y)return best;
        }
        return best;
    }

    function forceRegisterReleasedSibling(g,pack,index){
        const slot=pack?.pat?.[index];if(!slot)return false;
        const [dx,dy]=slot,exactX=pack.ax+dx,exactY=pack.y+dy;
        const cell=nearestReleasedLogicalCell(g,exactX,exactY);if(!cell)return false;

        clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
        const color=pack.colors[index],ball=mkBall(g,color);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
        ball.garbageSourceSeq=pack.seq;
        ball.garbageSourceRole=(pack.totalBalls||0)-(pack.pat.length||0);
        ball.garbagePileSettled=false;
        ball.garbageInitialRestReached=false;
        hexPhysClearGroupBall(ball);ball.rigid=false;

        g.board[cell.y][cell.x]=ball;noteBoardCell(g.board,cell.y,ball);
        setVis(g,ball,exactX,exactY,Math.max(0,(pack.vy||0)/HEX_ROW_H));
        const v=g.vis.get(ball.id);
        if(v){
            v.motionSpeed=Math.max(RELEASE_INITIAL_VY,pack.vy||0);
            v.garbageBubbleT=pack.bubbleT;
            v.justReleased=true;
            v.garbageFreeFlightHandoff=true;
            v.pileFlow=true;
        }

        if(!Array.isArray(pack.entryBalls))pack.entryBalls=[];
        pack.entryBalls.push({id:ball.id,c:ball.c,x:cell.x,y:cell.y,contactX:exactX,contactY:exactY,handoffX:exactX,handoffY:exactY,rigidityRelease:true});
        pack.landedCount=(pack.landedCount||0)+1;
        pack.pat.splice(index,1);pack.colors.splice(index,1);

        ball.fallPath=[{from:[exactX,exactY],to:[cell.x,cell.y],kind:"GARBAGE_RIGIDITY_RELEASE_FREE",pileFlow:true,pileFlowEntry:true,pileFlowReason:"garbage_pile_contact",motionSeq:0,garbageRigidityRelease:true}];
        if(settlePass(g.board))g.ver++;

        const path=Array.isArray(ball.fallPath)?ball.fallPath:[];
        const baseSeq=(g._garbageReleaseSeq=(g._garbageReleaseSeq||100000)+path.length+1)-path.length;
        const fresh=[];
        for(let i=0;i<path.length;i++){
            const seg=path[i];
            delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;
            delete seg._hexGravityProfile;delete seg._hexGravityLinear;
            if(i>0&&typeof repairPileFlowSegmentGeometry==="function")repairPileFlowSegmentGeometry(g,ball,seg,"garbage_pile_contact");
            seg.pileFlowOriginalSeq=baseSeq+i;
            seg.motionSeq=0;
            seg.pileFlow=true;
            seg.pileFlowReason="garbage_pile_contact";
            seg.pileFlowEntry=i===0;
            fresh.push({ball,seg,seq:baseSeq+i});
        }
        scheduleGarbageImmediately(g,fresh);g.ver++;
        return true;
    }

    function releaseRemainingSiblingsToContinuousPhysics(g,pack){
        if(!pack||pack._rigidityReleasedAfterFirstContact)return 0;
        pack._rigidityReleasedAfterFirstContact=true;
        pack.straightAtomic=false;
        let guard=Math.max(4,(pack.pat?.length||0)*4),released=0;
        while(Array.isArray(pack.pat)&&pack.pat.length&&guard-->0){
            let progressed=false;
            const order=pack.pat.map((q,i)=>({i,dy:q[1]})).sort((a,b)=>b.dy-a.dy||b.i-a.i);
            for(const hit of order){
                if(hit.i>=pack.pat.length)continue;
                // Rigidity release is not a new pile contact. Prefer reservation-
                // aware registration so moving trajectories never share a cell.
                if(forceRegisterReleasedSibling(g,pack,hit.i)||baseMaterializeGarbageBallAtContact(g,pack,hit.i,pack.y)){
                    released++;progressed=true;break;
                }
            }
            if(!progressed)break;
        }
        pack._releasedSiblingCount=(pack._releasedSiblingCount||0)+released;
        if(!pack.pat.length){pack.landed=true;pack.releaseTime=g.garbageClock;}
        return released;
    }

    materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
        const firstContact=!!pack&&!pack._rigidityReleasedAfterFirstContact&&(pack.landedCount||0)===0;
        const ok=baseMaterializeGarbageBallAtContact(g,pack,index,contactAnchorY);
        if(ok&&firstContact)releaseRemainingSiblingsToContinuousPhysics(g,pack);
        return ok;
    };

    window.__hexGarbageGlobalQueueDisabled=true;
    window.__hexGarbageLocalConflictQueue=false;
    window.__hexGarbagePerBallScheduler=true;
    window.__hexGarbageImmediateScheduler=true;
    window.__hexGarbageSiblingsContinuousOnFirstContact=true;
    window.__hexGarbageForcedReleaseRegistration=true;
    window.__hexGarbageLocalConflictIds=function(){return new Set();};
})();
