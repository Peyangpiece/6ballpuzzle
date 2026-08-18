/* Natural post-contact garbage fall.
 *
 * After first real pile/floor contact, garbage members are independent balls.
 * Unsupported members fall concurrently. Only a collision imminent in the next
 * physics frame may hold the later member, and that hold freezes its SCHEDULE,
 * not its rendered snapshot. This bypasses app-17's legacy visual queue restore,
 * which was the direct cause of large garbage clusters hanging in mid-air.
 */
(function installNaturalGarbageFall(){
    if(typeof window==="undefined"||window.__hexNaturalGarbageFall)return;
    window.__hexNaturalGarbageFall=true;

    const CONFLICT_MIN=Math.max(0.9990,HEX_MIN_DIST-2e-5);
    const TIME_SAMPLES=16;
    const HORIZON=Math.max(1/120,(typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120)*1.15);
    const previousLocalQueue=new WeakMap();

    function segmentSeq(seg){
        const a=Number(seg?.pileFlowOriginalSeq),b=Number(seg?.motionSeq);
        if(Number.isFinite(a)&&a>0)return a;
        if(Number.isFinite(b)&&b>0)return b;
        return 0;
    }
    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function sameDestination(a,b){return Array.isArray(a?.to)&&Array.isArray(b?.to)&&physDist(a.to,b.to)<1e-7;}
    function endpointSwap(a,b){
        return Array.isArray(a?.from)&&Array.isArray(a?.to)&&Array.isArray(b?.from)&&Array.isArray(b?.to)&&
            physDist(a.to,b.from)<1e-7&&physDist(b.to,a.from)<1e-7;
    }
    function startsWithinHorizon(seg,now){
        const s=Number(seg?.pileFlowStart);return !Number.isFinite(s)||s<=now+HORIZON+1e-10;
    }

    function motionEntries(g){
        const out=[];
        if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const seg=ball&&Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
            if(!ball?.isGarbage||!seg?.from||!seg?.to)continue;
            out.push({ball,seg,seq:segmentSeq(seg)});
        }
        return out;
    }

    function imminentConflict(g,a,b){
        if(!a?.seg||!b?.seg)return false;
        const now=Math.max(0,g?.pileFlowClock||0),as=a.seg,bs=b.seg;
        if((sameDestination(as,bs)||endpointSwap(as,bs))&&startsWithinHorizon(as,now)&&startsWithinHorizon(bs,now))return true;
        const a0=Number(as.pileFlowStart),a1=Number(as.pileFlowEnd),b0=Number(bs.pileFlowStart),b1=Number(bs.pileFlowEnd);
        if(!(Number.isFinite(a0)&&Number.isFinite(a1)&&Number.isFinite(b0)&&Number.isFinite(b1)))return false;
        const lo=Math.max(now,a0,b0),hi=Math.min(now+HORIZON,a1,b1);
        if(!(hi>lo+1e-10))return false;
        for(let i=0;i<=TIME_SAMPLES;i++){
            const t=lo+(hi-lo)*(i/TIME_SAMPLES);
            const pa=pileFlowPositionAt(g,a.ball,t),pb=pileFlowPositionAt(g,b.ball,t);
            if(Array.isArray(pa)&&Array.isArray(pb)&&physDist(pa,pb)<CONFLICT_MIN)return true;
        }
        return false;
    }

    function localConflictQueue(g){
        const list=motionEntries(g),queued=new Set();let minSeq=Infinity;
        for(const e of list)if(e.seq>0)minSeq=Math.min(minSeq,e.seq);
        for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
            const a=list[i],b=list[j];if(!imminentConflict(g,a,b))continue;
            let later;
            if(a.seq>0&&b.seq>0&&a.seq!==b.seq)later=a.seq>b.seq?a:b;
            else if(a.seq!==b.seq)later=a.seq>b.seq?a:b;
            else later=a.ball.id>b.ball.id?a:b;
            queued.add(later.ball.id);
        }
        return {minSeq,queued};
    }

    // Disable app-17's legacy visual snapshot/restore queue completely. Local
    // conflicts are handled below by schedule-only pauses.
    __hexdropGarbageMotionQueue=function(){return{minSeq:Infinity,queued:new Set()};};

    function boardBallById(g,id){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return b;
        }
        return null;
    }
    function shiftPath(path,delta){
        if(!Array.isArray(path)||Math.abs(delta)<=1e-12)return;
        for(const seg of path){
            if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delta;
            if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delta;
        }
    }
    function pauseLocalSchedules(g,ids,dt){
        if(!ids?.size||!(dt>0))return;
        for(const id of ids){
            const ball=boardBallById(g,id),path=Array.isArray(ball?.fallPath)?ball.fallPath:null;
            if(!path?.length)continue;
            shiftPath(path,dt);
            const v=g.vis.get(id);if(v){v.vy=0;v.motionSpeed=0;v.garbageLocalCollisionHeld=true;}
        }
    }
    function resumeIdsNow(g,ids){
        if(!ids?.size)return;
        const clock=Math.max(0,g?.pileFlowClock||0);
        for(const id of ids){
            const ball=boardBallById(g,id),path=Array.isArray(ball?.fallPath)?ball.fallPath:null,seg=path?.[0];
            if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart)&&seg.pileFlowStart>clock+1e-9){
                shiftPath(path,clock-seg.pileFlowStart);
                seg.garbageQueueResumeRebased=true;
            }
            const v=g.vis.get(id);if(v){delete v.garbageLocalCollisionHeld;delete v.garbageQueueHeld;v.motionSpeed=Math.max(v.motionSpeed||0,0.0001);}
        }
    }

    function scheduleGarbageImmediately(g,fresh){
        if(!Array.isArray(fresh)||!fresh.length)return;
        preparePileFlowDurations(g,fresh);
        const clock=Math.max(0,g?.pileFlowClock||0);
        for(const {ball,seg} of fresh){
            const duration=Math.max(1/120,seg?._pileNominalDuration||1/120);
            const start=pileFlowPreviousEnd(ball,seg,clock);
            if(typeof pileFlowAttachCausalSupports==="function")pileFlowAttachCausalSupports(g,ball,seg,start,duration);
            seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;
            seg.garbageImmediateSchedule=true;
        }
    }
    const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
    scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){
        if(reason==="garbage_pile_contact"&&Array.isArray(fresh)&&fresh.some(q=>q?.ball?.isGarbage))return scheduleGarbageImmediately(g,fresh);
        return baseScheduleFreshPileFlow(g,fresh,reason);
    };

    function finalGarbageProjection(g){
        const list=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
            if(ball?.isGarbage&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))list.push({ball,v,x,y});
        }
        const isHard=q=>{
            if(g?.garbageOriginalPileIds instanceof Set&&g.garbageOriginalPileIds.has(q.ball.id))return true;
            return q.ball.garbagePileSettled===true&&(!Array.isArray(q.ball.fallPath)||q.ball.fallPath.length===0);
        };
        const conflicts=localConflictQueue(g).queued;
        const moveAway=(q,o,n)=>{
            if(!(n>0))return 0;
            let dir=Math.sign(q.v.x-o.v.x);if(!dir)dir=Math.sign(q.x-o.x)||1;
            const room=Math.max(0,(dir>0?(W2-1)-q.v.x:q.v.x)*.5);if(room<=1e-10)return 0;
            const take=Math.min(n,room);q.v.x+=dir*(take/.5);return take;
        };
        for(let pass=0;pass<64;pass++){
            let changed=false;
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
                const a=list[i],b=list[j],dx=(a.v.x-b.v.x)*.5,dy=(a.v.y-b.v.y)*HEX_ROW_H,d=Math.hypot(dx,dy);
                if(d>=1-1e-9)continue;changed=true;
                const ha=isHard(a),hb=isHard(b);if(ha&&hb)continue;
                const targetX=Math.abs(dy)<1?Math.sqrt(Math.max(0,1-dy*dy)):0;
                let need=Math.max(0,targetX-Math.abs(dx))+3e-6,first,second;
                if(ha){first=b;second=null;}else if(hb){first=a;second=null;}
                else{
                    const qa=conflicts.has(a.ball.id),qb=conflicts.has(b.ball.id);
                    if(qa!==qb)first=qa?a:b;
                    else first=segmentSeq(a.ball.fallPath?.[0])>=segmentSeq(b.ball.fallPath?.[0])?a:b;
                    second=first===a?b:a;
                }
                need-=moveAway(first,first===a?b:a,need);
                if(need>1e-8&&second&&!isHard(second))moveAway(second,second===a?b:a,need);
            }
            if(!changed)break;
        }
    }

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const before=localConflictQueue(g).queued,previous=previousLocalQueue.get(g)||new Set();
        const released=new Set([...previous].filter(id=>!before.has(id)));
        resumeIdsNow(g,released);
        pauseLocalSchedules(g,before,Math.max(0,dt||0));
        const out=baseUpdateVisuals(g,dt);
        finalGarbageProjection(g);
        const after=localConflictQueue(g).queued;
        const releasedDuringFrame=new Set([...before].filter(id=>!after.has(id)));
        resumeIdsNow(g,releasedDuringFrame);
        previousLocalQueue.set(g,new Set(after));
        return out;
    };
    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){const out=baseResolveVisualContacts(g);finalGarbageProjection(g);return out;};
    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){const out=baseUpdateGarbagePacks(g,dt);finalGarbageProjection(g);return out;};

    window.__hexGarbageGlobalQueueDisabled=true;
    window.__hexGarbageLocalConflictQueue=true;
    window.__hexGarbagePerBallScheduler=true;
    window.__hexGarbageImmediateScheduler=true;
    window.__hexGarbageLocalConflictIds=function(g){return localConflictQueue(g).queued;};
    window.__hexFinalGarbageProjection=finalGarbageProjection;
})();
