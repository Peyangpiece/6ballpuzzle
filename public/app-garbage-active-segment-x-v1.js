/* ============================================================
 * 6ball GARBAGE ACTIVE-SEGMENT CONTACT AUTHORITY v1.5
 *
 * Contact may displace a live garbage ball horizontally, but it must remain a
 * LOCAL physical correction.  The inner dense-contact solver can occasionally
 * find a mathematically legal state by moving one body several lattice units in
 * a single pass.  That is a teleport, not a physical contact response.
 *
 * v1.5 keeps the v1.4 teleport guard and closes the important gap it exposed:
 * rejecting a teleport can reveal the REAL contact that the teleport had hidden.
 * In that case we immediately resolve that revealed contact by holding the
 * visually-upper live body upward to tangent contact.  When the current segment
 * has authored time, the lost path time is persisted per ball; a deferred segment
 * simply remains geometrically held until it is legitimately scheduled.
 *
 * Resolution order around the existing contact stack:
 *  1. Attract runaway X toward the authored current trajectory, without crossing
 *     another body.
 *  2. Snapshot live X and run all existing contact solvers.
 *  3. Reject any >1-lattice X jump from that one contact pass and replay at most
 *     one lattice continuously, never tunnelling through a neighbour.
 *  4. If rejecting that jump reveals overlap, hold the visually-upper live body
 *     upward to physical tangency.  No sideways escape is invented here.
 *  5. Attract X toward the authored trajectory again, stopping at first tangency.
 *
 * Existing/frozen/completed bodies never move.  Logical cells, fallPath data,
 * pivots/supports and authored segment times are never rewritten.
 * ============================================================ */
(function installGarbageActiveSegmentContactAuthorityV15(){
    if(typeof window==="undefined"||window.__sixBallGarbageActiveSegmentXAuthorityV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageActiveSegmentXAuthorityV1=true;
    const baseResolve=resolveVisualContacts;
    const baseUpdateScheduled=typeof updateScheduledPileFlowVisual==="function"?updateScheduledPileFlowVisual:null;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const FRAME=typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120;
    const CONTACT_DIST=.9998;
    const LEGAL_DIST=.9995;
    const MAX_CONTACT_X_STEP=1;
    const MAX_POST_GUARD_HOLD_ROWS=2.25;
    const MAX_HOLD_PASSES=128;
    const EPS=1e-9;
    const X_CLEARANCE=2e-6;
    const Y_CLEARANCE=2e-6;
    const Y_MATCH_PAD=.08;
    const SAMPLE_COUNT=48;
    const REFINE_STEPS=24;
    const postGuardDelayByGame=new WeakMap();

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);}
    function frozenIds(board){const out=new Set(),cached=board?.__hexGarbageFrozenIds;if(cached instanceof Set)for(const id of cached)out.add(id);return out;}
    function finitePoint(p){return Array.isArray(p)&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]));}
    function livePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}
    function headSegment(ball){return livePath(ball)?ball.fallPath[0]:null;}
    function segmentBounds(seg){
        const fx=Number(seg?.from?.[0]),fy=Number(seg?.from?.[1]),tx=Number(seg?.to?.[0]),ty=Number(seg?.to?.[1]);
        if(![fx,fy,tx,ty].every(Number.isFinite))return null;
        return{fx,fy,tx,ty,loX:Math.min(fx,tx),hiX:Math.max(fx,tx),loY:Math.min(fy,ty),hiY:Math.max(fy,ty)};
    }
    function pathPoint(g,ball,t){
        if(typeof pileFlowPositionAt!=="function"||!Number.isFinite(t))return null;
        try{const p=pileFlowPositionAt(g,ball,Math.max(0,t));return finitePoint(p)?[Number(p[0]),Number(p[1])]:null;}catch(_){return null;}
    }
    function entries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball||seen.has(ball))continue;seen.add(ball);
            const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function liveEntries(g){
        const frozen=frozenIds(g.board);
        return entries(g).filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&livePath(q.ball));
    }
    function liveIds(g){return new Set(liveEntries(g).map(q=>q.ball.id));}
    function distance(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);}
    function worstIncoming(g){
        const all=entries(g),ids=liveIds(g);let worst=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=distance(all[i],all[j]);if(d<LEGAL_DIST-EPS&&(!worst||d<worst.d))worst={a:all[i],b:all[j],d};
        }
        return worst;
    }

    function gameDelayMap(g,create=true){let m=postGuardDelayByGame.get(g);if(!m&&create){m=new Map();postGuardDelayByGame.set(g,m);}return m||null;}
    function delayRecord(g,id,create=true){const m=gameDelayMap(g,create);if(!m)return null;let r=m.get(id);if(!r&&create){r={delay:0,lastClock:-Infinity};m.set(id,r);}return r||null;}
    function currentDelay(g,id){return Math.max(0,Number(delayRecord(g,id,false)?.delay)||0);}
    function clearDelay(g,id){gameDelayMap(g,false)?.delete(id);}

    // This wrapper composes with the persistent-delay wrapper installed by the
    // contact finalizer.  Each layer subtracts only the time it personally owns.
    if(baseUpdateScheduled){
        updateScheduledPileFlowVisual=function(g,cell,v,dt){
            if(!garbagePhase(g)||!cell?.isGarbage)return baseUpdateScheduled(g,cell,v,dt);
            const frozen=frozenIds(g.board);
            if(cell.garbagePhaseFrozen||frozen.has(cell.id)||!livePath(cell)){
                clearDelay(g,cell.id);return baseUpdateScheduled(g,cell,v,dt);
            }
            const delay=currentDelay(g,cell.id);if(delay<=EPS)return baseUpdateScheduled(g,cell,v,dt);
            const wall=Number(g.pileFlowClock)||0;g.pileFlowClock=Math.max(0,wall-delay);
            try{const r=baseUpdateScheduled(g,cell,v,dt);if(!livePath(cell))clearDelay(g,cell.id);return r;}
            finally{g.pileFlowClock=wall;}
        };
    }

    function trajectoryXForVisualY(g,ball,v,seg,bounds){
        if(Math.abs(bounds.fx-bounds.tx)<=EPS)return bounds.fx;
        const start=Number(seg?.pileFlowStart),end=Number(seg?.pileFlowEnd);
        if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>=start-EPS)){
            if(Number(v.y)<=bounds.fy+Y_MATCH_PAD)return bounds.fx;
            return Math.max(bounds.loX,Math.min(bounds.hiX,Number(v.x)));
        }
        const targetY=Number(v.y);if(!Number.isFinite(targetY))return null;
        if(targetY<=bounds.loY-Y_MATCH_PAD)return bounds.fy<=bounds.ty?bounds.fx:bounds.tx;
        if(targetY>=bounds.hiY+Y_MATCH_PAD)return bounds.fy>=bounds.ty?bounds.fx:bounds.tx;
        let bestP=pathPoint(g,ball,start),bestErr=Infinity,bestIndex=0;
        for(let i=0;i<=SAMPLE_COUNT;i++){
            const t=start+(end-start)*(i/SAMPLE_COUNT),p=pathPoint(g,ball,t);if(!p)continue;
            const err=Math.abs(p[1]-targetY);if(err<bestErr){bestErr=err;bestP=p;bestIndex=i;}
        }
        if(!bestP)return Math.max(bounds.loX,Math.min(bounds.hiX,Number(v.x)));
        let lo=start+(end-start)*(Math.max(0,bestIndex-1)/SAMPLE_COUNT),hi=start+(end-start)*(Math.min(SAMPLE_COUNT,bestIndex+1)/SAMPLE_COUNT);
        for(let i=0;i<REFINE_STEPS&&hi-lo>1e-10;i++){
            const t1=lo+(hi-lo)/3,t2=hi-(hi-lo)/3,p1=pathPoint(g,ball,t1),p2=pathPoint(g,ball,t2);
            const e1=p1?Math.abs(p1[1]-targetY):Infinity,e2=p2?Math.abs(p2[1]-targetY):Infinity;if(e1<=e2)hi=t2;else lo=t1;
        }
        const p=pathPoint(g,ball,(lo+hi)*.5);if(p&&Math.abs(p[1]-targetY)<=bestErr+Y_MATCH_PAD)bestP=p;
        const x=Number(bestP[0]);return Number.isFinite(x)?Math.max(bounds.loX,Math.min(bounds.hiX,x)):null;
    }

    function closestReachableX(q,target,all){
        const current=Number(q.v.x);target=Math.max(0,Math.min(W2-1,Number(target)));
        if(!Number.isFinite(current)||!Number.isFinite(target)||Math.abs(target-current)<=EPS)return current;
        const dir=target>current?1:-1;let reachable=target;
        for(const o of all){
            if(o.ball.id===q.ball.id||!Number.isFinite(o.v.x)||!Number.isFinite(o.v.y))continue;
            const dy=Math.abs((q.v.y-o.v.y)*H);if(dy>=CONTACT_DIST-EPS)continue;
            const reqX=2*Math.sqrt(Math.max(0,CONTACT_DIST*CONTACT_DIST-dy*dy));if(reqX<=EPS)continue;
            const left=o.v.x-reqX-X_CLEARANCE,right=o.v.x+reqX+X_CLEARANCE;
            if(dir>0){
                if(current<=left+EPS&&target>left)reachable=Math.min(reachable,left);
                else if(current>left&&current<right){if(!(current>=o.v.x&&target>current))reachable=Math.min(reachable,current);}
            }else{
                if(current>=right-EPS&&target<right)reachable=Math.max(reachable,right);
                else if(current>left&&current<right){if(!(current<=o.v.x&&target<current))reachable=Math.max(reachable,current);}
            }
        }
        return dir>0?Math.max(current,Math.min(target,reachable)):Math.min(current,Math.max(target,reachable));
    }

    function snapshotLiveX(g){return new Map(liveEntries(g).map(q=>[q.ball.id,q.v.x]));}
    function rejectContactTeleports(g,before){
        if(!garbagePhase(g)||!(before instanceof Map))return{changed:0,blocked:0,maxAttempt:0,repairs:[]};
        const offenders=liveEntries(g).map(q=>({q,start:before.get(q.ball.id),desired:q.v.x}))
            .filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.desired)&&Math.abs(r.desired-r.start)>MAX_CONTACT_X_STEP+EPS)
            .sort((a,b)=>Math.abs(b.desired-b.start)-Math.abs(a.desired-a.start)||a.q.ball.id-b.q.ball.id);
        const repairs=[];let changed=0,blocked=0,maxAttempt=0;
        for(const r of offenders){
            const attempt=r.desired-r.start;maxAttempt=Math.max(maxAttempt,Math.abs(attempt));r.q.v.x=r.start;
            const localTarget=r.start+Math.sign(attempt)*MAX_CONTACT_X_STEP,repaired=closestReachableX(r.q,localTarget,entries(g));
            r.q.v.x=repaired;const kept=repaired-r.start;changed++;if(Math.abs(kept)<Math.abs(attempt)-EPS)blocked++;
            repairs.push({id:r.q.ball.id,start:r.start,attempted:r.desired,attempt,kept,repaired,localTarget});
        }
        return{changed,blocked,maxAttempt,repairs};
    }

    function requiredRowSeparation(a,b){
        const dx=Math.abs((a.v.x-b.v.x)*.5);if(dx>=CONTACT_DIST-EPS)return 0;
        return Math.sqrt(Math.max(0,CONTACT_DIST*CONTACT_DIST-dx*dx))/H;
    }
    function registerPostGuardDelay(g,q,oldY,newY){
        if(!(newY<oldY-EPS))return 0;
        const seg=headSegment(q.ball),start=Number(seg?.pileFlowStart),end=Number(seg?.pileFlowEnd);
        if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>=start-EPS))return 0;
        const record=delayRecord(g,q.ball.id,true),wall=Number(g.pileFlowClock)||0;
        if(Math.abs(record.lastClock-wall)<=EPS)return 0;
        const effectiveNow=Math.max(start,wall-record.delay),targetY=newY;
        const nowP=pathPoint(g,q.ball,effectiveNow),startP=pathPoint(g,q.ball,start);let extra=0;
        if(nowP&&startP&&Number.isFinite(nowP[1])&&Number.isFinite(startP[1])&&nowP[1]>=startP[1]-EPS){
            if(targetY<=startP[1]+EPS)extra=Math.max(0,effectiveNow-start);
            else if(targetY<nowP[1]-EPS){
                let lo=start,hi=effectiveNow;
                for(let i=0;i<32;i++){
                    const mid=(lo+hi)*.5,p=pathPoint(g,q.ball,mid);if(!p)break;
                    if(p[1]<targetY)lo=mid;else hi=mid;
                }
                extra=Math.max(0,effectiveNow-hi);
            }
        }
        if(extra<=EPS){const vy=Math.max(1e-6,Number(q.v.vy)||0);extra=Math.min(Math.max(0,end-start),Math.max(0,(oldY-newY)/vy));}
        extra=Math.max(0,Math.min(Math.max(0,effectiveNow-start),extra));
        record.delay+=extra;record.lastClock=wall;return extra;
    }

    function postGuardVerticalHold(g,enabled){
        if(!enabled||!garbagePhase(g))return{active:false,changed:0,passes:0,held:[],failure:null};
        const heldRows=new Map(),held=[];let changed=0,passes=0,failure=null;
        for(;passes<MAX_HOLD_PASSES;passes++){
            const pair=worstIncoming(g);if(!pair)break;
            const ids=liveIds(g),dy=pair.a.v.y-pair.b.v.y;
            let upper=null,lower=null;
            if(dy<-EPS&&ids.has(pair.a.ball.id)){upper=pair.a;lower=pair.b;}
            else if(dy>EPS&&ids.has(pair.b.ball.id)){upper=pair.b;lower=pair.a;}
            else{
                failure={reason:"post_guard_horizontal_required",pair:[pair.a.ball.id,pair.b.ball.id],distance:pair.d};break;
            }
            const req=requiredRowSeparation(upper,lower);if(req<=EPS){failure={reason:"post_guard_no_vertical_requirement",pair:[upper.ball.id,lower.ball.id],distance:pair.d};break;}
            const targetY=lower.v.y-req-Y_CLEARANCE,need=upper.v.y-targetY;
            if(need<=EPS){failure={reason:"post_guard_no_vertical_progress",pair:[upper.ball.id,lower.ball.id],distance:pair.d};break;}
            const used=heldRows.get(upper.ball.id)||0,remaining=Math.max(0,MAX_POST_GUARD_HOLD_ROWS-used),shift=Math.min(need,remaining);
            if(shift<=EPS){failure={reason:"post_guard_hold_budget",id:upper.ball.id,pair:[upper.ball.id,lower.ball.id],distance:pair.d};break;}
            const oldY=upper.v.y,newY=oldY-shift,addedDelay=registerPostGuardDelay(g,upper,oldY,newY);
            upper.v.y=newY;if(Number.isFinite(upper.v.vy))upper.v.vy=0;
            heldRows.set(upper.ball.id,used+shift);held.push({id:upper.ball.id,against:lower.ball.id,rows:shift,addedDelay,fromY:oldY,toY:newY});changed++;
            if(shift+EPS<need){failure={reason:"post_guard_hold_budget",id:upper.ball.id,pair:[upper.ball.id,lower.ball.id],distance:pair.d};break;}
        }
        const final=worstIncoming(g);if(final&&!failure)failure={reason:"post_guard_pass_limit",pair:[final.a.ball.id,final.b.ball.id],distance:final.d};
        return{active:true,ok:!final,changed,passes:passes+1,held,failure,finalDistance:final?.d??null,finalPair:final?[final.a.ball.id,final.b.ball.id]:null};
    }

    function restoreTowardTrajectory(g,phase){
        if(!garbagePhase(g))return{phase,changed:0,blocked:0,totalCorrection:0,maxCorrection:0,corrections:[]};
        const frozen=frozenIds(g.board),seen=new Set(),candidates=[],corrections=[];let changed=0,blocked=0,totalCorrection=0,maxCorrection=0;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball||seen.has(ball)||!ball.isGarbage)continue;seen.add(ball);
            if(ball.garbagePhaseFrozen||frozen.has(ball.id))continue;
            const seg=headSegment(ball),bounds=segmentBounds(seg);if(!seg||!bounds)continue;
            const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            const target=trajectoryXForVisualY(g,ball,v,seg,bounds);if(Number.isFinite(target))candidates.push({ball,v,seg,bounds,target,drift:Math.abs(v.x-target)});
        }
        candidates.sort((a,b)=>b.drift-a.drift||a.ball.id-b.ball.id);
        for(const q of candidates){
            if(q.drift<=EPS)continue;const before=q.v.x,after=closestReachableX(q,q.target,entries(g));if(Math.abs(after-before)<=EPS){blocked++;continue;}
            q.v.x=after;const correction=Math.abs(after-before),remaining=Math.abs(after-q.target);if(remaining>EPS)blocked++;
            changed++;totalCorrection+=correction;maxCorrection=Math.max(maxCorrection,correction);
            corrections.push({id:q.ball.id,before,after,target:q.target,corrected:correction,remaining,blocked:remaining>EPS,visualY:q.v.y,segment:[q.bounds.fx,q.bounds.fy,q.bounds.tx,q.bounds.ty],kind:q.seg.kind||null});
        }
        return{phase,changed,blocked,totalCorrection,maxCorrection,corrections};
    }

    resolveVisualContacts=function(g){
        const pre=restoreTowardTrajectory(g,"pre"),beforeInner=snapshotLiveX(g),result=baseResolve(g);
        const teleportGuard=rejectContactTeleports(g,beforeInner);
        const verticalHold=postGuardVerticalHold(g,teleportGuard.changed>0);
        const post=restoreTowardTrajectory(g,"post"),totalChanged=pre.changed+teleportGuard.changed+verticalHold.changed+post.changed;
        if(totalChanged)window.__sixBallGarbageActiveSegmentXCorrections=(window.__sixBallGarbageActiveSegmentXCorrections||0)+totalChanged;
        window.__sixBallLastGarbageActiveSegmentXAuthorityV1={pre,teleportGuard,verticalHold,post,changed:totalChanged,maxCorrection:Math.max(pre.maxCorrection,post.maxCorrection),delays:[...gameDelayMap(g,false)||[]].map(([id,r])=>({id,delay:r.delay})),at:Date.now()};
        return result;
    };

    window.__sixBallGarbageActiveSegmentXVersion="garbage-active-segment-contact-v1.5";
})();
