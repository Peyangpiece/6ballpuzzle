/* ============================================================
 * 6ball GARBAGE ACTIVE-SEGMENT X AUTHORITY v1.2
 *
 * A live garbage ball may receive a SMALL horizontal contact correction, but
 * that correction must never accumulate into a new trajectory.  v1.1 restored
 * exact authored X after every contact pass; that was too strict and erased the
 * ~0.006-lattice separation needed for a legitimate near-tangent contact.
 *
 * v1.2 keeps a narrow local-contact tube around the authored trajectory.  X is
 * restored only when it drifts farther than MAX_LOCAL_CONTACT_X from the current
 * authored segment trajectory.  Thus tiny physical separation remains intact,
 * while multi-cell runaway corrections (the real failure mode) are rejected.
 *
 * For vertical segments the authored X is exactly from.x.  For diagonal/arc
 * segments it is recovered from pileFlowPositionAt at the path-time whose Y best
 * matches the current visual Y.  Matching by Y stays compatible with contact-time
 * holds without rewriting or sharing their private delay state.
 *
 * This layer never changes Y, logical cells, fallPath data, pivots/supports,
 * timing, the frozen pile, or ordinary-piece state.
 * ============================================================ */
(function installGarbageActiveSegmentXAuthorityV12(){
    if(typeof window==="undefined"||window.__sixBallGarbageActiveSegmentXAuthorityV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageActiveSegmentXAuthorityV1=true;
    const baseResolve=resolveVisualContacts;
    const EPS=1e-9;
    const Y_MATCH_PAD=.08;
    const MAX_LOCAL_CONTACT_X=.125;
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

    function trajectoryXForVisualY(g,ball,v,seg,bounds){
        if(Math.abs(bounds.fx-bounds.tx)<=EPS)return bounds.fx;

        const start=Number(seg?.pileFlowStart),end=Number(seg?.pileFlowEnd);
        if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>=start-EPS)){
            if(Number(v.y)<=bounds.fy+Y_MATCH_PAD)return bounds.fx;
            return Math.max(bounds.loX,Math.min(bounds.hiX,Number(v.x)));
        }

        const targetY=Number(v.y);
        if(!Number.isFinite(targetY))return null;
        if(targetY<=bounds.loY-Y_MATCH_PAD){
            return bounds.fy<=bounds.ty?bounds.fx:bounds.tx;
        }
        if(targetY>=bounds.hiY+Y_MATCH_PAD){
            return bounds.fy>=bounds.ty?bounds.fx:bounds.tx;
        }

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

    function restoreRunawayTrajectoryX(g,phase){
        if(!garbagePhase(g))return{phase,changed:0,withinTube:0,totalCorrection:0,maxCorrection:0,corrections:[]};
        const frozen=frozenIds(g.board),seen=new Set(),corrections=[];
        let changed=0,withinTube=0,totalCorrection=0,maxCorrection=0;

        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!ball.isGarbage)continue;
            seen.add(ball);
            if(ball.garbagePhaseFrozen||frozen.has(ball.id))continue;
            const seg=headSegment(ball),bounds=segmentBounds(seg);if(!seg||!bounds)continue;
            const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;

            const target=trajectoryXForVisualY(g,ball,v,seg,bounds);
            if(!Number.isFinite(target))continue;
            const before=v.x,drift=Math.abs(before-target);
            if(drift<=MAX_LOCAL_CONTACT_X+EPS){withinTube++;continue;}

            v.x=target;
            const correction=drift;
            changed++;totalCorrection+=correction;maxCorrection=Math.max(maxCorrection,correction);
            corrections.push({
                id:ball.id,before,after:target,drift,visualY:v.y,
                segment:[bounds.fx,bounds.fy,bounds.tx,bounds.ty],
                kind:seg.kind||null
            });
        }
        return{phase,changed,withinTube,totalCorrection,maxCorrection,corrections};
    }

    resolveVisualContacts=function(g){
        const pre=restoreRunawayTrajectoryX(g,"pre");
        const result=baseResolve(g);
        const post=restoreRunawayTrajectoryX(g,"post");
        const totalChanged=pre.changed+post.changed;
        if(totalChanged){
            window.__sixBallGarbageActiveSegmentXCorrections=
                (window.__sixBallGarbageActiveSegmentXCorrections||0)+totalChanged;
        }
        window.__sixBallLastGarbageActiveSegmentXAuthorityV1={
            pre,post,changed:totalChanged,
            maxCorrection:Math.max(pre.maxCorrection,post.maxCorrection),
            localTube:MAX_LOCAL_CONTACT_X,
            at:Date.now()
        };
        return result;
    };

    window.__sixBallGarbageActiveSegmentXVersion="garbage-active-segment-x-v1.2";
})();
