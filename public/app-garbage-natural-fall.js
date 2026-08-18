/* Natural post-contact garbage fall.
 *
 * A garbage formation is rigid only until first real pile/floor contact. At that
 * event every remaining sibling is registered as an independent continuous
 * physics ball at its CURRENT rendered centre/velocity. It is not pile-settled;
 * garbagePileSettled stays false until its own final rest.
 */
(function installNaturalGarbageFall(){
    if(typeof window==="undefined"||window.__hexNaturalGarbageFall)return;
    window.__hexNaturalGarbageFall=true;

    const CONFLICT_MIN=Math.max(0.9990,HEX_MIN_DIST-2e-5);
    const TIME_SAMPLES=16;
    const HORIZON=Math.max(1/120,(typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120)*1.15);
    const CLOSING_EPS=2e-5;
    const previousLocalQueue=new WeakMap();

    function segmentSeq(seg){const a=Number(seg?.pileFlowOriginalSeq),b=Number(seg?.motionSeq);if(Number.isFinite(a)&&a>0)return a;if(Number.isFinite(b)&&b>0)return b;return 0;}
    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function sameDestination(a,b){return Array.isArray(a?.to)&&Array.isArray(b?.to)&&physDist(a.to,b.to)<1e-7;}
    function endpointSwap(a,b){return Array.isArray(a?.from)&&Array.isArray(a?.to)&&Array.isArray(b?.from)&&Array.isArray(b?.to)&&physDist(a.to,b.from)<1e-7&&physDist(b.to,a.from)<1e-7;}
    function startsWithinHorizon(seg,now){const s=Number(seg?.pileFlowStart);return !Number.isFinite(s)||s<=now+HORIZON+1e-10;}

    function motionEntries(g){
        const out=[];if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null,seg=ball&&Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
            if(ball?.isGarbage&&seg?.from&&seg?.to)out.push({ball,seg,seq:segmentSeq(seg)});
        }
        return out;
    }
    function imminentConflict(g,a,b){
        if(!a?.seg||!b?.seg)return false;
        const now=Math.max(0,g?.pileFlowClock||0),as=a.seg,bs=b.seg;
        if((sameDestination(as,bs)||endpointSwap(as,bs))&&startsWithinHorizon(as,now)&&startsWithinHorizon(bs,now))return true;
        const a0=Number(as.pileFlowStart),a1=Number(as.pileFlowEnd),b0=Number(bs.pileFlowStart),b1=Number(bs.pileFlowEnd);
        if(!(Number.isFinite(a0)&&Number.isFinite(a1)&&Number.isFinite(b0)&&Number.isFinite(b1)))return false;
        const lo=Math.max(now,a0,b0),hi=Math.min(now+HORIZON,a1,b1);if(!(hi>lo+1e-10))return false;
        const pa0=pileFlowPositionAt(g,a.ball,lo),pb0=pileFlowPositionAt(g,b.ball,lo);if(!Array.isArray(pa0)||!Array.isArray(pb0))return false;
        const d0=physDist(pa0,pb0);let minFuture=Infinity;
        for(let i=1;i<=TIME_SAMPLES;i++){
            const t=lo+(hi-lo)*(i/TIME_SAMPLES),pa=pileFlowPositionAt(g,a.ball,t),pb=pileFlowPositionAt(g,b.ball,t);
            if(Array.isArray(pa)&&Array.isArray(pb))minFuture=Math.min(minFuture,physDist(pa,pb));
        }
        if(!(minFuture<CONFLICT_MIN))return false;
        if(d0<CONFLICT_MIN&&minFuture>=d0-CLOSING_EPS)return false;
        return minFuture<d0-CLOSING_EPS||d0>=CONFLICT_MIN;
    }
    function localConflictQueue(g){
        const list=motionEntries(g),queued=new Set();let minSeq=Infinity;
        for(const e of list)if(e.seq>0)minSeq=Math.min(minSeq,e.seq);
        for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
            const a=list[i],b=list[j];if(!imminentConflict(g,a,b))continue;
            let later;if(a.seq>0&&b.seq>0&&a.seq!==b.seq)later=a.seq>b.seq?a:b;else if(a.seq!==b.seq)later=a.seq>b.seq?a:b;else later=a.ball.id>b.ball.id?a:b;
            queued.add(later.ball.id);
        }
        return{minSeq,queued};
    }
    __hexdropGarbageMotionQueue=function(){return{minSeq:Infinity,queued:new Set()};};

    function boardBallById(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return b;}return null;}
    function shiftPath(path,delta){if(!Array.isArray(path)||Math.abs(delta)<=1e-12)return;for(const seg of path){if(!seg?.pileFlow)continue;if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delta;if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delta;}}
    function pauseLocalSchedules(g,ids,dt){if(!ids?.size||!(dt>0))return;for(const id of ids){const ball=boardBallById(g,id),path=Array.isArray(ball?.fallPath)?ball.fallPath:null;if(!path?.length)continue;shiftPath(path,dt);const v=g.vis.get(id);if(v){v.vy=0;v.motionSpeed=0;v.garbageLocalCollisionHeld=true;}}}
    function resumeIdsNow(g,ids){if(!ids?.size)return;const clock=Math.max(0,g?.pileFlowClock||0);for(const id of ids){const ball=boardBallById(g,id),path=Array.isArray(ball?.fallPath)?ball.fallPath:null,seg=path?.[0];if(!seg?.pileFlow)continue;if(Number.isFinite(seg.pileFlowStart)&&seg.pileFlowStart>clock+1e-9){shiftPath(path,clock-seg.pileFlowStart);seg.garbageQueueResumeRebased=true;}const v=g.vis.get(id);if(v){delete v.garbageLocalCollisionHeld;delete v.garbageQueueHeld;v.motionSpeed=Math.max(v.motionSpeed||0,0.0001);}}}

    function scheduleGarbageImmediately(g,fresh){
        if(!Array.isArray(fresh)||!fresh.length)return;preparePileFlowDurations(g,fresh);
        const clock=Math.max(0,g?.pileFlowClock||0),lastEnd=new Map(),seen=new Set();
        for(const {ball,seg} of fresh){
            const duration=Math.max(1/120,seg?._pileNominalDuration||1/120),firstForBall=!seen.has(ball.id),start=firstForBall?clock:(lastEnd.get(ball.id)??clock);
            seen.add(ball.id);if(typeof pileFlowAttachCausalSupports==="function")pileFlowAttachCausalSupports(g,ball,seg,start,duration);
            seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;seg.garbageImmediateSchedule=true;seg.garbageImmediateFirstSegment=firstForBall;lastEnd.set(ball.id,seg.pileFlowEnd);
        }
    }
    const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
    scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){if(reason==="garbage_pile_contact"&&Array.isArray(fresh)&&fresh.some(q=>q?.ball?.isGarbage))return scheduleGarbageImmediately(g,fresh);return baseScheduleFreshPileFlow(g,fresh,reason);};

    const baseMaterializeGarbageBallAtContact=materializeGarbageBallAtContact;
    function motionReservesCell(g,cx,cy){
        const target=[cx,cy];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;const v=g.vis.get(ball.id);
            if(v&&physDist([v.x,v.y],target)<0.985)return true;
            for(const seg of Array.isArray(ball.fallPath)?ball.fallPath:[]){if(Array.isArray(seg?.from)&&physDist(seg.from,target)<1e-7)return true;if(Array.isArray(seg?.to)&&physDist(seg.to,target)<1e-7)return true;}
        }
        return false;
    }
    function nearestReleasedLogicalCell(g,x,visualY){
        const first=Math.max(BOARD_MIN_ROW,Math.ceil(visualY-1e-8));let best=null;
        for(let y=first;y<ROWS;y++){
            for(let dx=0;dx<W2;dx++){
                const xs=dx===0?[x]:[x-dx,x+dx];
                for(const cx of xs){if(!Number.isInteger(cx)||!valid(cx,y)||g.board[y][cx]||motionReservesCell(g,cx,y))continue;const score=(y-visualY)*2+Math.abs(cx-x)*.6;if(!best||score<best.score)best={x:cx,y,score};}
                if(best&&best.y===y&&Math.abs(best.x-x)===0)break;
            }
            if(best&&best.y===y)return best;
        }
        return best;
    }
    function forceRegisterReleasedSibling(g,pack,index){
        const slot=pack?.pat?.[index];if(!slot)return false;
        const [dx,dy]=slot,exactX=pack.ax+dx,exactY=pack.y+dy,cell=nearestReleasedLogicalCell(g,exactX,exactY);if(!cell)return false;
        clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
        const color=pack.colors[index],ball=mkBall(g,color);ball.isGarbage=true;ball.garbageType=pack.type;ball.garbageSourceSeq=pack.seq;ball.garbageSourceRole=(pack.totalBalls||0)-(pack.pat.length||0);ball.garbagePileSettled=false;ball.garbageInitialRestReached=false;hexPhysClearGroupBall(ball);ball.rigid=false;
        g.board[cell.y][cell.x]=ball;noteBoardCell(g.board,cell.y,ball);setVis(g,ball,exactX,exactY,Math.max(0,(pack.vy||0)/HEX_ROW_H));
        const v=g.vis.get(ball.id);if(v){v.motionSpeed=Math.max(RELEASE_INITIAL_VY,pack.vy||0);v.garbageBubbleT=pack.bubbleT;v.justReleased=true;v.garbageFreeFlightHandoff=true;v.pileFlow=true;}
        if(!Array.isArray(pack.entryBalls))pack.entryBalls=[];pack.entryBalls.push({id:ball.id,c:ball.c,x:cell.x,y:cell.y,contactX:exactX,contactY:exactY,handoffX:exactX,handoffY:exactY,rigidityRelease:true});pack.landedCount=(pack.landedCount||0)+1;pack.pat.splice(index,1);pack.colors.splice(index,1);
        ball.fallPath=[{from:[exactX,exactY],to:[cell.x,cell.y],kind:"GARBAGE_RIGIDITY_RELEASE_FREE",pileFlow:true,pileFlowEntry:true,pileFlowReason:"garbage_pile_contact",motionSeq:0,garbageRigidityRelease:true}];
        if(settlePass(g.board))g.ver++;
        const path=Array.isArray(ball.fallPath)?ball.fallPath:[],baseSeq=(g._garbageReleaseSeq=(g._garbageReleaseSeq||100000)+path.length+1)-path.length,fresh=[];
        for(let i=0;i<path.length;i++){const seg=path[i];delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;delete seg._hexGravityProfile;delete seg._hexGravityLinear;if(i>0&&typeof repairPileFlowSegmentGeometry==="function")repairPileFlowSegmentGeometry(g,ball,seg,"garbage_pile_contact");seg.pileFlowOriginalSeq=baseSeq+i;seg.motionSeq=0;seg.pileFlow=true;seg.pileFlowReason="garbage_pile_contact";seg.pileFlowEntry=i===0;fresh.push({ball,seg,seq:baseSeq+i});}
        scheduleGarbageImmediately(g,fresh);g.ver++;return true;
    }
    function releaseRemainingSiblingsToContinuousPhysics(g,pack){
        if(!pack||pack._rigidityReleasedAfterFirstContact)return 0;pack._rigidityReleasedAfterFirstContact=true;pack.straightAtomic=false;
        let guard=Math.max(4,(pack.pat?.length||0)*4),released=0;
        while(Array.isArray(pack.pat)&&pack.pat.length&&guard-->0){
            let progressed=false;const order=pack.pat.map((q,i)=>({i,dy:q[1]})).sort((a,b)=>b.dy-a.dy||b.i-a.i);
            for(const hit of order){
                if(hit.i>=pack.pat.length)continue;
                // Rigidity-release handoff is NOT a new pile contact. Prefer the
                // reservation-aware free-ball registration so no sibling can be
                // assigned a cell already occupied by another moving trajectory.
                if(forceRegisterReleasedSibling(g,pack,hit.i)||baseMaterializeGarbageBallAtContact(g,pack,hit.i,pack.y)){released++;progressed=true;break;}
            }
            if(!progressed)break;
        }
        pack._releasedSiblingCount=(pack._releasedSiblingCount||0)+released;if(!pack.pat.length){pack.landed=true;pack.releaseTime=g.garbageClock;}return released;
    }
    materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){const firstContact=!!pack&&!pack._rigidityReleasedAfterFirstContact&&(pack.landedCount||0)===0;const ok=baseMaterializeGarbageBallAtContact(g,pack,index,contactAnchorY);if(ok&&firstContact)releaseRemainingSiblingsToContinuousPhysics(g,pack);return ok;};

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){const before=localConflictQueue(g).queued,previous=previousLocalQueue.get(g)||new Set();resumeIdsNow(g,new Set([...previous].filter(id=>!before.has(id))));pauseLocalSchedules(g,before,Math.max(0,dt||0));const out=baseUpdateVisuals(g,dt);const after=localConflictQueue(g).queued;resumeIdsNow(g,new Set([...before].filter(id=>!after.has(id))));previousLocalQueue.set(g,new Set(after));return out;};

    window.__hexGarbageGlobalQueueDisabled=true;window.__hexGarbageLocalConflictQueue=true;window.__hexGarbagePerBallScheduler=true;window.__hexGarbageImmediateScheduler=true;window.__hexGarbageSiblingsContinuousOnFirstContact=true;window.__hexGarbageForcedReleaseRegistration=true;window.__hexGarbageLocalConflictIds=function(g){return localConflictQueue(g).queued;};
})();
