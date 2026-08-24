/* ============================================================
 * 6ball GARBAGE ACTIVE-SEGMENT X AUTHORITY v1
 *
 * Contact solvers may make small temporary horizontal corrections, but a live
 * garbage ball must never accumulate those corrections across frames and drift
 * away from the segment it is physically traversing.
 *
 * This final GARBAGE-only wrapper clamps X to the first still-live fallPath
 * segment's authored [from.x,to.x] interval BEFORE the existing contact
 * finalizers run. The contact stack may then resolve any real contact in Y/time
 * or inside that same authored segment.
 *
 * No Y coordinate, logical cell, fallPath data, pivot/support metadata, timing,
 * frozen pile or ordinary-piece state is changed here.
 * ============================================================ */
(function installGarbageActiveSegmentXAuthorityV1(){
    if(typeof window==="undefined"||window.__sixBallGarbageActiveSegmentXAuthorityV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageActiveSegmentXAuthorityV1=true;
    const baseResolve=resolveVisualContacts;
    const EPS=1e-9;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }
    function frozenIds(board){
        const out=new Set(),cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }
    function clampActiveSegmentX(g){
        if(!garbagePhase(g))return{changed:0,maxCorrection:0,corrections:[]};
        const frozen=frozenIds(g.board),seen=new Set(),corrections=[];
        let changed=0,maxCorrection=0,totalCorrection=0;

        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!ball.isGarbage)continue;
            seen.add(ball);
            if(ball.garbagePhaseFrozen||frozen.has(ball.id)||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;

            const seg=ball.fallPath[0];
            const fx=Number(seg?.from?.[0]),tx=Number(seg?.to?.[0]);
            if(!Number.isFinite(fx)||!Number.isFinite(tx))continue;
            const v=g.vis.get(ball.id);
            if(!v||!Number.isFinite(v.x))continue;

            const lo=Math.max(0,Math.min(fx,tx));
            const hi=Math.min(W2-1,Math.max(fx,tx));
            const before=v.x;
            const after=Math.max(lo,Math.min(hi,before));
            if(Math.abs(after-before)<=EPS)continue;

            v.x=after;
            const correction=Math.abs(after-before);
            changed++;totalCorrection+=correction;maxCorrection=Math.max(maxCorrection,correction);
            corrections.push({id:ball.id,before,after,segment:[fx,tx],kind:seg.kind||null});
        }
        return{changed,totalCorrection,maxCorrection,corrections};
    }

    resolveVisualContacts=function(g){
        const info=clampActiveSegmentX(g);
        if(info.changed){
            window.__sixBallGarbageActiveSegmentXCorrections=
                (window.__sixBallGarbageActiveSegmentXCorrections||0)+info.changed;
        }
        window.__sixBallLastGarbageActiveSegmentXAuthorityV1={...info,at:Date.now()};
        return baseResolve(g);
    };

    window.__sixBallGarbageActiveSegmentXVersion="garbage-active-segment-x-v1.0";
})();
