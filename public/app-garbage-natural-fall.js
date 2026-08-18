/* Natural post-contact garbage fall.
 *
 * A garbage formation is one rigid airborne packet ONLY until its first member
 * touches the pre-existing pile/floor. At that exact event the formation loses
 * rigidity completely. Every still-airborne sibling is handed to the same
 * continuous board-ball solver at its CURRENT visual centre and velocity. This
 * is an internal solver registration, not a pile-settled state: released garbage
 * remains garbagePileSettled=false until its own final resting position.
 *
 * This removes the mixed "board ball + still-rigid sibling packet" phase that
 * could pin a large formation in mid-air. After first contact every member uses
 * the ordinary free-fall / tangent-arc / swept-collision path independently.
 */
(function installNaturalGarbageFall(){
    if(typeof window==="undefined"||window.__hexNaturalGarbageFall)return;
    window.__hexNaturalGarbageFall=true;

    const CONFLICT_MIN=Math.max(0.9990,HEX_MIN_DIST-2e-5);
    const TIME_SAMPLES=16;
    const HORIZON=Math.max(1/120,(typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120)*1.15);
    const CLOSING_EPS=2e-5;
    const previousLocalQueue=new WeakMap();

    function segmentSeq(seg){
        const a=Number(seg?.pileFlowOriginalSeq),b=Number(seg?.motionSeq);
        if(Number.isFinite(a)&&a>0)return a;
        if(Number.isFinite(b)&&b>0)return b;
        return 0;
    }
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

    // Never restore a whole garbage visual snapshot. That legacy queue was the
    // direct mechanism behind the floating cluster.
    __hexdropGarbageMotionQueue=function(){return{minSeq:Infinity,queued:new Set()};};

    function boardBallById(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return b;}return null;}
    function shiftPath(path,delta){if(!Array.isArray(path)||Math.abs(delta)<=1e-12)return;for(const seg of path){if(!seg?.pileFlow)continue;if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delta;if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delta;}}
    function pauseLocalSchedules(g,ids,dt){
        if(!ids?.size||!(dt>0))return;
        for(const id of ids){const ball=boardBallById(g,id),path=Array.isArray(ball?.fallPath)?ball.fallPath:null;if(!path?.length)continue;shiftPath(path,dt);const v=g.vis.get(id);if(v){v.vy=0;v.motionSpeed=0;v.garbageLocalCollisionHeld=true;}}
    }
    function resumeIdsNow(g,ids){
        if(!ids?.size)return;const clock=Math.max(0,g?.pileFlowClock||0);
        for(const id of ids){
            const ball=boardBallById(g,id),path=Array.isArray(ball?.fallPath)?ball.fallPath:null,seg=path?.[0];if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart)&&seg.pileFlowStart>clock+1e-9){shiftPath(path,clock-seg.pileFlowStart);seg.garbageQueueResumeRebased=true;}
            const v=g.vis.get(id);if(v){delete v.garbageLocalCollisionHeld;delete v.garbageQueueHeld;v.motionSpeed=Math.max(v.motionSpeed||0,0.0001);}
        }
    }

    function scheduleGarbageImmediately(g,fresh){
        if(!Array.isArray(fresh)||!fresh.length)return;preparePileFlowDurations(g,fresh);const clock=Math.max(0,g?.pileFlowClock||0);
        for(const {ball,seg} of fresh){const duration=Math.max(1/120,seg?._pileNominalDuration||1/120),start=pileFlowPreviousEnd(ball,seg,clock);if(typeof pileFlowAttachCausalSupports==="function")pileFlowAttachCausalSupports(g,ball,seg,start,duration);seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;seg.garbageImmediateSchedule=true;}
    }
    const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
    scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){if(reason==="garbage_pile_contact"&&Array.isArray(fresh)&&fresh.some(q=>q?.ball?.isGarbage))return scheduleGarbageImmediately(g,fresh);return baseScheduleFreshPileFlow(g,fresh,reason);};

    /*
     * Convert every sibling that remains after the first actual contact into an
     * independent board-physics ball immediately. baseMaterialize already uses
     * the final collision-safe contact wrapper (app-garbage-contact), so passing
     * the packet's CURRENT anchor Y preserves exact visual position while it
     * constructs a continuous hand-off route to a nearby logical cell.
     */
    const baseMaterializeGarbageBallAtContact=materializeGarbageBallAtContact;

    function releaseRemainingSiblingsToContinuousPhysics(g,pack){
        if(!pack||pack._rigidityReleasedAfterFirstContact)return;
        pack._rigidityReleasedAfterFirstContact=true;
        pack.straightAtomic=false;
        let guard=Math.max(4,(pack.pat?.length||0)*3),released=0;

        while(Array.isArray(pack.pat)&&pack.pat.length&&guard-->0){
            let progressed=false;
            // Prefer lower siblings first so the logical solver receives physical
            // supports in the same bottom-up order that gravity sees them.
            const order=pack.pat.map((q,i)=>({i,dy:q[1]})).sort((a,b)=>b.dy-a.dy||b.i-a.i);
            for(const hit of order){
                if(hit.i>=pack.pat.length)continue;
                // This is a solver hand-off, not a new pile contact. The exact
                // current packet anchor retains this sibling's current centre.
                if(baseMaterializeGarbageBallAtContact(g,pack,hit.i,pack.y)){
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

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const before=localConflictQueue(g).queued,previous=previousLocalQueue.get(g)||new Set();
        resumeIdsNow(g,new Set([...previous].filter(id=>!before.has(id))));
        pauseLocalSchedules(g,before,Math.max(0,dt||0));
        const out=baseUpdateVisuals(g,dt);
        const after=localConflictQueue(g).queued;
        resumeIdsNow(g,new Set([...before].filter(id=>!after.has(id))));
        previousLocalQueue.set(g,new Set(after));
        return out;
    };

    window.__hexGarbageGlobalQueueDisabled=true;
    window.__hexGarbageLocalConflictQueue=true;
    window.__hexGarbagePerBallScheduler=true;
    window.__hexGarbageImmediateScheduler=true;
    window.__hexGarbagePacketSplitOnContact=true;
    window.__hexGarbageSiblingsContinuousOnFirstContact=true;
    window.__hexGarbageLocalConflictIds=function(g){return localConflictQueue(g).queued;};
})();
