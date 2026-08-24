/* ============================================================
 * 6ball GARBAGE ACTIVE-SEGMENT X AUTHORITY v1.4
 *
 * Contact may displace a live garbage ball horizontally, but it must remain a
 * LOCAL physical correction.  The remaining production failure showed an inner
 * rescue moving one HEXAGON ball more than five lattice units in one contact
 * pass, crossing a settled STRAIGHT ball, then clamping it on the far side.  No
 * later non-tunnelling correction can undo that crossing safely.
 *
 * v1.4 adds a boundary around the entire inner contact stack:
 *  - snapshot live X before resolveVisualContacts;
 *  - let all existing authoritative contact solvers run;
 *  - if any one ball moved by more than one lattice unit in that single pass,
 *    reject the excess as a contact teleport and replay only a local, continuously
 *    non-penetrating move from its pre-contact X;
 *  - then attract every live ball back toward authored segment X, stopping at the
 *    first tangent contact rather than erasing required separation.
 *
 * One lattice unit matches the existing min-displacement solver's explicit
 * maxLocalShift=1 contract.  Small coordinated corrections are untouched.
 *
 * This layer changes X only.  It never changes Y, logical cells, fallPath data,
 * pivots/supports, timing, the frozen pile, or ordinary-piece state.
 * ============================================================ */
(function installGarbageActiveSegmentXAuthorityV14(){
    if(typeof window==="undefined"||window.__sixBallGarbageActiveSegmentXAuthorityV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageActiveSegmentXAuthorityV1=true;
    const baseResolve=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const CONTACT_DIST=.9998;
    const MAX_CONTACT_X_STEP=1;
    const EPS=1e-9;
    const X_CLEARANCE=2e-6;
    const Y_MATCH_PAD=.08;
    const SAMPLE_COUNT=48;
    const REFINE_STEPS=24;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }
    function frozenIds(board){
        const out=new Set(),cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }
    function finitePoint(p){return Array.isArray(p)&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]));}
    function headSegment(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;}
    function segmentBounds(seg){
        const fx=Number(seg?.from?.[0]),fy=Number(seg?.from?.[1]);
        const tx=Number(seg?.to?.[0]),ty=Number(seg?.to?.[1]);
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
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;seen.add(ball);
            const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function liveEntries(g){
        const frozen=frozenIds(g.board);
        return entries(g).filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length>0);
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
        let lo=start+(end-start)*(Math.max(0,bestIndex-1)/SAMPLE_COUNT);
        let hi=start+(end-start)*(Math.min(SAMPLE_COUNT,bestIndex+1)/SAMPLE_COUNT);
        for(let i=0;i<REFINE_STEPS&&hi-lo>1e-10;i++){
            const t1=lo+(hi-lo)/3,t2=hi-(hi-lo)/3,p1=pathPoint(g,ball,t1),p2=pathPoint(g,ball,t2);
            const e1=p1?Math.abs(p1[1]-targetY):Infinity,e2=p2?Math.abs(p2[1]-targetY):Infinity;
            if(e1<=e2)hi=t2;else lo=t1;
        }
        const p=pathPoint(g,ball,(lo+hi)*.5);if(p&&Math.abs(p[1]-targetY)<=bestErr+Y_MATCH_PAD)bestP=p;
        const x=Number(bestP[0]);return Number.isFinite(x)?Math.max(bounds.loX,Math.min(bounds.hiX,x)):null;
    }

    // For fixed Y every neighbour excludes one horizontal X interval.  Return
    // the furthest continuously reachable X from current toward target.
    function closestReachableX(q,target,all){
        const current=Number(q.v.x);target=Math.max(0,Math.min(W2-1,Number(target)));
        if(!Number.isFinite(current)||!Number.isFinite(target)||Math.abs(target-current)<=EPS)return current;
        const dir=target>current?1:-1;let reachable=target;
        for(const o of all){
            if(o.ball.id===q.ball.id||!Number.isFinite(o.v.x)||!Number.isFinite(o.v.y))continue;
            const dy=Math.abs((q.v.y-o.v.y)*H);if(dy>=CONTACT_DIST-EPS)continue;
            const requiredX=2*Math.sqrt(Math.max(0,CONTACT_DIST*CONTACT_DIST-dy*dy));if(requiredX<=EPS)continue;
            const left=o.v.x-requiredX-X_CLEARANCE,right=o.v.x+requiredX+X_CLEARANCE;
            if(dir>0){
                if(current<=left+EPS&&target>left)reachable=Math.min(reachable,left);
                else if(current>left&&current<right){
                    // Permit escape only when moving away from the neighbour centre.
                    if(current>=o.v.x&&target>current){}else reachable=Math.min(reachable,current);
                }
            }else{
                if(current>=right-EPS&&target<right)reachable=Math.max(reachable,right);
                else if(current>left&&current<right){
                    if(current<=o.v.x&&target<current){}else reachable=Math.max(reachable,current);
                }
            }
        }
        return dir>0?Math.max(current,Math.min(target,reachable)):Math.min(current,Math.max(target,reachable));
    }

    function snapshotLiveX(g){return new Map(liveEntries(g).map(q=>[q.ball.id,q.v.x]));}

    function rejectContactTeleports(g,before){
        if(!garbagePhase(g)||!(before instanceof Map))return{changed:0,blocked:0,maxAttempt:0,repairs:[]};
        const live=liveEntries(g),repairs=[];let changed=0,blocked=0,maxAttempt=0;
        // Only non-local moves are touched; small coordinated solver output remains exact.
        const offenders=live.map(q=>({q,start:before.get(q.ball.id),desired:q.v.x}))
            .filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.desired)&&Math.abs(r.desired-r.start)>MAX_CONTACT_X_STEP+EPS)
            .sort((a,b)=>Math.abs(b.desired-b.start)-Math.abs(a.desired-a.start)||a.q.ball.id-b.q.ball.id);
        for(const r of offenders){
            const attempt=r.desired-r.start;maxAttempt=Math.max(maxAttempt,Math.abs(attempt));
            r.q.v.x=r.start;
            const localTarget=r.start+Math.sign(attempt)*MAX_CONTACT_X_STEP;
            const repaired=closestReachableX(r.q,localTarget,entries(g));
            r.q.v.x=repaired;
            const kept=repaired-r.start;
            changed++;if(Math.abs(kept)<Math.abs(attempt)-EPS)blocked++;
            repairs.push({id:r.q.ball.id,start:r.start,attempted:r.desired,attempt,kept,repaired,localTarget});
        }
        return{changed,blocked,maxAttempt,repairs};
    }

    function restoreTowardTrajectory(g,phase){
        if(!garbagePhase(g))return{phase,changed:0,blocked:0,totalCorrection:0,maxCorrection:0,corrections:[]};
        const frozen=frozenIds(g.board),seen=new Set(),corrections=[];let changed=0,blocked=0,totalCorrection=0,maxCorrection=0;
        const candidates=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball||seen.has(ball)||!ball.isGarbage)continue;seen.add(ball);
            if(ball.garbagePhaseFrozen||frozen.has(ball.id))continue;
            const seg=headSegment(ball),bounds=segmentBounds(seg);if(!seg||!bounds)continue;
            const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            const target=trajectoryXForVisualY(g,ball,v,seg,bounds);if(!Number.isFinite(target))continue;
            candidates.push({ball,v,seg,bounds,target,drift:Math.abs(v.x-target)});
        }
        candidates.sort((a,b)=>b.drift-a.drift||a.ball.id-b.ball.id);
        for(const q of candidates){
            if(q.drift<=EPS)continue;const before=q.v.x,after=closestReachableX(q,q.target,entries(g));
            if(Math.abs(after-before)<=EPS){blocked++;continue;}
            q.v.x=after;const correction=Math.abs(after-before),remaining=Math.abs(after-q.target);if(remaining>EPS)blocked++;
            changed++;totalCorrection+=correction;maxCorrection=Math.max(maxCorrection,correction);
            corrections.push({id:q.ball.id,before,after,target:q.target,corrected:correction,remaining,blocked:remaining>EPS,visualY:q.v.y,segment:[q.bounds.fx,q.bounds.fy,q.bounds.tx,q.bounds.ty],kind:q.seg.kind||null});
        }
        return{phase,changed,blocked,totalCorrection,maxCorrection,corrections};
    }

    resolveVisualContacts=function(g){
        const preAttractor=restoreTowardTrajectory(g,"pre");
        const beforeInner=snapshotLiveX(g);
        const result=baseResolve(g);
        const teleportGuard=rejectContactTeleports(g,beforeInner);
        const postAttractor=restoreTowardTrajectory(g,"post");
        const totalChanged=preAttractor.changed+teleportGuard.changed+postAttractor.changed;
        if(totalChanged)window.__sixBallGarbageActiveSegmentXCorrections=(window.__sixBallGarbageActiveSegmentXCorrections||0)+totalChanged;
        window.__sixBallLastGarbageActiveSegmentXAuthorityV1={pre:preAttractor,teleportGuard,post:postAttractor,changed:totalChanged,maxCorrection:Math.max(preAttractor.maxCorrection,postAttractor.maxCorrection),at:Date.now()};
        return result;
    };

    window.__sixBallGarbageActiveSegmentXVersion="garbage-active-segment-x-v1.4";
})();
