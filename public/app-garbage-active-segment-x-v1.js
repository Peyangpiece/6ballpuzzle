/* ============================================================
 * 6ball GARBAGE ACTIVE-SEGMENT X AUTHORITY v1.3
 *
 * Contact is allowed to displace a live garbage ball horizontally, but that
 * displacement must not accumulate into a replacement trajectory.  A hard X
 * reset was also wrong: it could erase the exact separation just produced by the
 * contact solver and re-introduce overlap.
 *
 * v1.3 makes authored trajectory X an ATTRACTOR rather than a hard clamp:
 *  - reconstruct the X of the current authored fallPath segment;
 *  - move the visual X back toward that trajectory only as far as continuous
 *    non-penetration allows;
 *  - stop at the first tangent contact when another body blocks the return.
 *
 * This has no arbitrary "local correction" width.  A 0.006 or 0.18 lattice
 * contact correction survives when physically required, while a multi-cell
 * runaway correction collapses back to the authored trajectory whenever the
 * space between is clear.  The return cannot tunnel through another ball.
 *
 * For vertical segments authored X is exactly from.x.  For diagonal/arc segments
 * it is recovered from pileFlowPositionAt at the path-time whose Y best matches
 * current visual Y, so persistent contact-time holds remain compatible.
 *
 * This layer changes X only.  It never changes Y, logical cells, fallPath data,
 * pivots/supports, timing, the frozen pile, or ordinary-piece state.
 * ============================================================ */
(function installGarbageActiveSegmentXAuthorityV13(){
    if(typeof window==="undefined"||window.__sixBallGarbageActiveSegmentXAuthorityV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageActiveSegmentXAuthorityV1=true;
    const baseResolve=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const CONTACT_DIST=.9998;
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
    function finitePoint(p){
        return Array.isArray(p)&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]));
    }
    function headSegment(ball){
        return Array.isArray(ball?.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
    }
    function segmentBounds(seg){
        const fx=Number(seg?.from?.[0]),fy=Number(seg?.from?.[1]);
        const tx=Number(seg?.to?.[0]),ty=Number(seg?.to?.[1]);
        if(![fx,fy,tx,ty].every(Number.isFinite))return null;
        return{fx,fy,tx,ty,loX:Math.min(fx,tx),hiX:Math.max(fx,tx),loY:Math.min(fy,ty),hiY:Math.max(fy,ty)};
    }
    function pathPoint(g,ball,t){
        if(typeof pileFlowPositionAt!=="function"||!Number.isFinite(t))return null;
        try{
            const p=pileFlowPositionAt(g,ball,Math.max(0,t));
            return finitePoint(p)?[Number(p[0]),Number(p[1])]:null;
        }catch(_){return null;}
    }
    function entries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function trajectoryXForVisualY(g,ball,v,seg,bounds){
        if(Math.abs(bounds.fx-bounds.tx)<=EPS)return bounds.fx;

        const start=Number(seg?.pileFlowStart),end=Number(seg?.pileFlowEnd);
        if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>=start-EPS)){
            // A deferred segment physically waits at its authored origin.
            if(Number(v.y)<=bounds.fy+Y_MATCH_PAD)return bounds.fx;
            return Math.max(bounds.loX,Math.min(bounds.hiX,Number(v.x)));
        }

        const targetY=Number(v.y);
        if(!Number.isFinite(targetY))return null;
        if(targetY<=bounds.loY-Y_MATCH_PAD)return bounds.fy<=bounds.ty?bounds.fx:bounds.tx;
        if(targetY>=bounds.hiY+Y_MATCH_PAD)return bounds.fy>=bounds.ty?bounds.fx:bounds.tx;

        let bestP=pathPoint(g,ball,start),bestErr=Infinity,bestIndex=0;
        for(let i=0;i<=SAMPLE_COUNT;i++){
            const t=start+(end-start)*(i/SAMPLE_COUNT);
            const p=pathPoint(g,ball,t);if(!p)continue;
            const err=Math.abs(p[1]-targetY);
            if(err<bestErr){bestErr=err;bestP=p;bestIndex=i;}
        }
        if(!bestP)return Math.max(bounds.loX,Math.min(bounds.hiX,Number(v.x)));

        let lo=start+(end-start)*(Math.max(0,bestIndex-1)/SAMPLE_COUNT);
        let hi=start+(end-start)*(Math.min(SAMPLE_COUNT,bestIndex+1)/SAMPLE_COUNT);
        for(let i=0;i<REFINE_STEPS&&hi-lo>1e-10;i++){
            const t1=lo+(hi-lo)/3,t2=hi-(hi-lo)/3;
            const p1=pathPoint(g,ball,t1),p2=pathPoint(g,ball,t2);
            const e1=p1?Math.abs(p1[1]-targetY):Infinity;
            const e2=p2?Math.abs(p2[1]-targetY):Infinity;
            if(e1<=e2)hi=t2;else lo=t1;
        }
        const p=pathPoint(g,ball,(lo+hi)*.5);
        if(p&&Math.abs(p[1]-targetY)<=bestErr+Y_MATCH_PAD)bestP=p;
        const x=Number(bestP[0]);
        return Number.isFinite(x)?Math.max(bounds.loX,Math.min(bounds.hiX,x)):null;
    }

    // For fixed Y, every neighbour excludes one horizontal X interval.  Return
    // the furthest point from `current` toward `target` that can be reached
    // continuously without entering any excluded interval.
    function closestReachableX(q,target,all){
        const current=Number(q.v.x);
        target=Math.max(0,Math.min(W2-1,Number(target)));
        if(!Number.isFinite(current)||!Number.isFinite(target)||Math.abs(target-current)<=EPS)return current;
        const dir=target>current?1:-1;
        let reachable=target;

        for(const o of all){
            if(o.ball.id===q.ball.id||!Number.isFinite(o.v.x)||!Number.isFinite(o.v.y))continue;
            const dy=Math.abs((q.v.y-o.v.y)*H);
            if(dy>=CONTACT_DIST-EPS)continue;
            const requiredX=2*Math.sqrt(Math.max(0,CONTACT_DIST*CONTACT_DIST-dy*dy));
            if(requiredX<=EPS)continue;
            const left=o.v.x-requiredX-X_CLEARANCE;
            const right=o.v.x+requiredX+X_CLEARANCE;

            if(dir>0){
                // We can approach an obstacle from its left but cannot cross it.
                if(current<=left+EPS&&target>left){reachable=Math.min(reachable,left);}
                // If numerical noise already has us inside, never move deeper.
                else if(current>left&&current<right&&target>current){reachable=Math.min(reachable,current);}
            }else{
                if(current>=right-EPS&&target<right){reachable=Math.max(reachable,right);}
                else if(current>left&&current<right&&target<current){reachable=Math.max(reachable,current);}
            }
        }
        if(dir>0)return Math.max(current,Math.min(target,reachable));
        return Math.min(current,Math.max(target,reachable));
    }

    function restoreTowardTrajectory(g,phase){
        if(!garbagePhase(g))return{phase,changed:0,blocked:0,totalCorrection:0,maxCorrection:0,corrections:[]};
        const frozen=frozenIds(g.board),seen=new Set(),corrections=[];
        let changed=0,blocked=0,totalCorrection=0,maxCorrection=0;

        // Largest drift first prevents a badly displaced ball from dictating the
        // local contact geometry of balls already close to their authored path.
        const candidates=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!ball.isGarbage)continue;
            seen.add(ball);
            if(ball.garbagePhaseFrozen||frozen.has(ball.id))continue;
            const seg=headSegment(ball),bounds=segmentBounds(seg);if(!seg||!bounds)continue;
            const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            const target=trajectoryXForVisualY(g,ball,v,seg,bounds);if(!Number.isFinite(target))continue;
            candidates.push({ball,v,seg,bounds,target,drift:Math.abs(v.x-target)});
        }
        candidates.sort((a,b)=>b.drift-a.drift||a.ball.id-b.ball.id);

        for(const q of candidates){
            if(q.drift<=EPS)continue;
            const all=entries(g),before=q.v.x;
            const after=closestReachableX(q,q.target,all);
            if(Math.abs(after-before)<=EPS){blocked++;continue;}
            q.v.x=after;
            const correction=Math.abs(after-before);
            const remaining=Math.abs(after-q.target);
            if(remaining>EPS)blocked++;
            changed++;totalCorrection+=correction;maxCorrection=Math.max(maxCorrection,correction);
            corrections.push({
                id:q.ball.id,before,after,target:q.target,
                corrected:correction,remaining,blocked:remaining>EPS,
                visualY:q.v.y,segment:[q.bounds.fx,q.bounds.fy,q.bounds.tx,q.bounds.ty],
                kind:q.seg.kind||null
            });
        }
        return{phase,changed,blocked,totalCorrection,maxCorrection,corrections};
    }

    resolveVisualContacts=function(g){
        const pre=restoreTowardTrajectory(g,"pre");
        const result=baseResolve(g);
        const post=restoreTowardTrajectory(g,"post");
        const totalChanged=pre.changed+post.changed;
        if(totalChanged){
            window.__sixBallGarbageActiveSegmentXCorrections=
                (window.__sixBallGarbageActiveSegmentXCorrections||0)+totalChanged;
        }
        window.__sixBallLastGarbageActiveSegmentXAuthorityV1={
            pre,post,changed:totalChanged,
            maxCorrection:Math.max(pre.maxCorrection,post.maxCorrection),
            at:Date.now()
        };
        return result;
    };

    window.__sixBallGarbageActiveSegmentXVersion="garbage-active-segment-x-v1.3";
})();
