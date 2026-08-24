/* ============================================================
 * 6ball GARBAGE ACTIVE-SEGMENT X AUTHORITY v1.1
 *
 * A live garbage ball may receive temporary horizontal contact corrections, but
 * those corrections must never replace the authored X of the segment the ball is
 * actually traversing.  Clamping only to [from.x,to.x] was insufficient: a ball
 * could be pushed to the opposite endpoint of a diagonal/arc segment and overlap
 * a neighbour even though the authored arc itself was collision-free.
 *
 * v1.1 therefore restores the X coordinate of the CURRENT authored trajectory,
 * both before and after the existing contact stack.  For vertical segments this
 * is exactly from.x.  For diagonal/arc segments the authoritative X is recovered
 * from pileFlowPositionAt at the path-time whose Y best matches the ball's current
 * visual Y.  Matching by Y makes this compatible with contact-time holds without
 * needing to rewrite or share their private delay state.
 *
 * This layer never changes Y, logical cells, fallPath data, pivots/supports,
 * timing, the frozen pile, or ordinary-piece state.
 * ============================================================ */
(function installGarbageActiveSegmentXAuthorityV11(){
    if(typeof window==="undefined"||window.__sixBallGarbageActiveSegmentXAuthorityV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageActiveSegmentXAuthorityV1=true;
    const baseResolve=resolveVisualContacts;
    const EPS=1e-9;
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

    /*
     * Find the authored point on the head segment whose Y is closest to the
     * current visual Y.  pileFlowPositionAt owns the actual arc/interpolation;
     * this code only inverts it by Y.  A coarse scan followed by a local ternary
     * refinement is intentionally used instead of assuming linear or monotonic X.
     */
    function trajectoryXForVisualY(g,ball,v,seg,bounds){
        if(Math.abs(bounds.fx-bounds.tx)<=EPS)return bounds.fx;

        const start=Number(seg?.pileFlowStart),end=Number(seg?.pileFlowEnd);
        if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>=start-EPS)){
            // A deferred, not-yet-clocked segment is physically waiting at from.
            if(Number(v.y)<=bounds.fy+Y_MATCH_PAD)return bounds.fx;
            return Math.max(bounds.loX,Math.min(bounds.hiX,Number(v.x)));
        }

        const targetY=Number(v.y);
        if(!Number.isFinite(targetY))return null;
        // If a contact hold has the ball slightly before/after the segment's
        // lattice Y span, the physical endpoint is authoritative.
        if(targetY<=bounds.loY-Y_MATCH_PAD){
            return bounds.fy<=bounds.ty?bounds.fx:bounds.tx;
        }
        if(targetY>=bounds.hiY+Y_MATCH_PAD){
            return bounds.fy>=bounds.ty?bounds.fx:bounds.tx;
        }

        let bestT=start,bestP=pathPoint(g,ball,start),bestErr=Infinity,bestIndex=0;
        for(let i=0;i<=SAMPLE_COUNT;i++){
            const t=start+(end-start)*(i/SAMPLE_COUNT);
            const p=pathPoint(g,ball,t);if(!p)continue;
            const err=Math.abs(p[1]-targetY);
            if(err<bestErr){bestErr=err;bestT=t;bestP=p;bestIndex=i;}
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
        const t=(lo+hi)*.5,p=pathPoint(g,ball,t);
        if(p&&Math.abs(p[1]-targetY)<=bestErr+Y_MATCH_PAD)bestP=p;

        const x=Number(bestP[0]);
        return Number.isFinite(x)?Math.max(bounds.loX,Math.min(bounds.hiX,x)):null;
    }

    function restoreActiveTrajectoryX(g,phase){
        if(!garbagePhase(g))return{phase,changed:0,totalCorrection:0,maxCorrection:0,corrections:[]};
        const frozen=frozenIds(g.board),seen=new Set(),corrections=[];
        let changed=0,totalCorrection=0,maxCorrection=0;

        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!ball.isGarbage)continue;
            seen.add(ball);
            if(ball.garbagePhaseFrozen||frozen.has(ball.id))continue;
            const seg=headSegment(ball),bounds=segmentBounds(seg);if(!seg||!bounds)continue;
            const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;

            const target=trajectoryXForVisualY(g,ball,v,seg,bounds);
            if(!Number.isFinite(target))continue;
            const before=v.x;
            if(Math.abs(target-before)<=EPS)continue;
            v.x=target;
            const correction=Math.abs(target-before);
            changed++;totalCorrection+=correction;maxCorrection=Math.max(maxCorrection,correction);
            corrections.push({
                id:ball.id,before,after:target,visualY:v.y,
                segment:[bounds.fx,bounds.fy,bounds.tx,bounds.ty],
                kind:seg.kind||null
            });
        }
        return{phase,changed,totalCorrection,maxCorrection,corrections};
    }

    resolveVisualContacts=function(g){
        const pre=restoreActiveTrajectoryX(g,"pre");
        const result=baseResolve(g);
        // This POST pass is the final authority.  Inner rescue layers are allowed
        // to explore X, but cannot leave a live body off its authored trajectory.
        const post=restoreActiveTrajectoryX(g,"post");
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

    window.__sixBallGarbageActiveSegmentXVersion="garbage-active-segment-x-v1.1";
})();
