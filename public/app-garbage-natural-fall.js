/* Natural post-contact garbage fall.
 *
 * After first real pile/floor contact, garbage members are independent balls.
 * They must NOT be serialized globally by motion sequence: that freezes every
 * later member in mid-air even when nothing physically supports or blocks it.
 *
 * Two scheduled paths can still converge on the same intermediate cell. Only
 * those genuinely conflicting paths are locally ordered. Independent paths are
 * scheduled from the current clock immediately and runtime swept collision is
 * responsible for stopping them at the first real contact.
 */
(function installNaturalGarbageFall(){
    if(typeof window==="undefined"||window.__hexNaturalGarbageFall)return;
    window.__hexNaturalGarbageFall=true;

    const CONFLICT_MIN=Math.max(0.9990,HEX_MIN_DIST-2e-5);
    const TIME_SAMPLES=40;
    const GEOM_SAMPLES=28;

    function segmentSeq(seg){
        const a=Number(seg?.pileFlowOriginalSeq),b=Number(seg?.motionSeq);
        if(Number.isFinite(a)&&a>0)return a;
        if(Number.isFinite(b)&&b>0)return b;
        return 0;
    }
    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function simplePoint(seg,q){
        if(typeof pileFlowPoint==="function"){
            const p=pileFlowPoint(seg,q);
            if(Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))return p;
        }
        const f=seg?.from,t=seg?.to;
        if(!Array.isArray(f)||!Array.isArray(t))return null;
        return [f[0]+(t[0]-f[0])*q,f[1]+(t[1]-f[1])*q];
    }
    function sameDestination(a,b){return Array.isArray(a?.to)&&Array.isArray(b?.to)&&physDist(a.to,b.to)<1e-7;}
    function endpointSwap(a,b){
        return Array.isArray(a?.from)&&Array.isArray(a?.to)&&Array.isArray(b?.from)&&Array.isArray(b?.to)&&
            physDist(a.to,b.from)<1e-7&&physDist(b.to,a.from)<1e-7;
    }

    function scheduledConflict(g,a,b){
        if(!a?.seg||!b?.seg)return false;
        if(sameDestination(a.seg,b.seg)||endpointSwap(a.seg,b.seg))return true;

        const as=a.seg,bs=b.seg,now=Math.max(0,g?.pileFlowClock||0);
        const a0=Number(as.pileFlowStart),a1=Number(as.pileFlowEnd),b0=Number(bs.pileFlowStart),b1=Number(bs.pileFlowEnd);
        if(Number.isFinite(a0)&&Number.isFinite(a1)&&Number.isFinite(b0)&&Number.isFinite(b1)){
            const lo=Math.max(now,a0,b0),hi=Math.min(a1,b1);
            if(hi>lo+1e-10){
                for(let i=0;i<=TIME_SAMPLES;i++){
                    const t=lo+(hi-lo)*(i/TIME_SAMPLES);
                    const pa=pileFlowPositionAt(g,a.ball,t),pb=pileFlowPositionAt(g,b.ball,t);
                    if(Array.isArray(pa)&&Array.isArray(pb)&&physDist(pa,pb)<CONFLICT_MIN)return true;
                }
            }
            return false;
        }

        for(let i=0;i<=GEOM_SAMPLES;i++){
            const q=i/GEOM_SAMPLES,pa=simplePoint(as,q),pb=simplePoint(bs,q);
            if(pa&&pb&&physDist(pa,pb)<CONFLICT_MIN)return true;
        }
        return false;
    }

    function entries(g){
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

    __hexdropGarbageMotionQueue=function(g){
        const list=entries(g),queued=new Set();let minSeq=Infinity;
        for(const e of list)if(e.seq>0)minSeq=Math.min(minSeq,e.seq);
        for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
            const a=list[i],b=list[j];if(!scheduledConflict(g,a,b))continue;
            let later;
            if(a.seq>0&&b.seq>0&&a.seq!==b.seq)later=a.seq>b.seq?a:b;
            else if(a.seq!==b.seq)later=a.seq>b.seq?a:b;
            else later=a.ball.id>b.ball.id?a:b;
            queued.add(later.ball.id);
        }
        return {minSeq,queued};
    };

    function scheduleGarbageImmediately(g,fresh){
        if(!Array.isArray(fresh)||!fresh.length)return;
        preparePileFlowDurations(g,fresh);
        const clock=Math.max(0,g?.pileFlowClock||0);
        for(const {ball,seg} of fresh){
            const duration=Math.max(1/120,seg?._pileNominalDuration||1/120);
            const start=pileFlowPreviousEnd(ball,seg,clock);
            if(typeof pileFlowAttachCausalSupports==="function")pileFlowAttachCausalSupports(g,ball,seg,start,duration);
            seg.pileFlowStart=start;
            seg.pileFlowDuration=duration;
            seg.pileFlowEnd=start+duration;
            seg.garbageImmediateSchedule=true;
        }
    }

    // Do not pre-delay garbage contact paths because another ball may collide
    // with them later in the predicted future. Start now, then let the 120 Hz
    // swept collision guards stop/reroute at the actual first contact. Only
    // subsequent segments of the SAME ball wait for their own previous end.
    const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
    scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){
        if(reason==="garbage_pile_contact"&&Array.isArray(fresh)&&fresh.some(q=>q?.ball?.isGarbage)){
            return scheduleGarbageImmediately(g,fresh);
        }
        return baseScheduleFreshPileFlow(g,fresh,reason);
    };

    window.__hexGarbageGlobalQueueDisabled=false;
    window.__hexGarbageLocalConflictQueue=true;
    window.__hexGarbagePerBallScheduler=true;
    window.__hexGarbageImmediateScheduler=true;
})();
