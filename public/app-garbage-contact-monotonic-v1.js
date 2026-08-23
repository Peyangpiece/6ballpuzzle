/* ============================================================
 * 6ball GARBAGE CONTACT MONOTONICITY v1
 *
 * Final safety invariant for GARBAGE presentation:
 *
 * A contact solver is allowed to repair an already-overlapping analytic frame,
 * but it is never allowed to turn a collision-free analytic frame into an
 * overlapping one.  Dense STRAIGHT rows frequently sit at exact tangency; a
 * later horizontal row projection must not sacrifice one of those valid wall
 * contacts while repairing an unrelated pair.
 *
 * This layer does not invent a correction.  It only rejects a contact-solver
 * result when the pre-solve analytic positions were already globally legal and
 * the post-solve positions are not.  In that case the authoritative trajectory
 * positions are restored exactly.
 * ============================================================ */
(function installGarbageContactMonotonicV1(){
    if(
        typeof window==="undefined" ||
        window.__sixBallGarbageContactMonotonicV1
    ){
        return;
    }

    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageContactMonotonicV1=true;

    const baseResolveVisualContactsMonotonicV1=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const LEGAL_DIST=0.9995;
    const EPS=1e-9;


    function garbagePhase(g){
        return !!(
            g &&
            g.state==="RESOLVING" &&
            g.phase==="GARBAGE" &&
            Array.isArray(g.board)
        );
    }


    function entries(g){
        const out=[];
        if(!Array.isArray(g?.board))return out;
        const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++){
            for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                if(!ball||seen.has(ball))continue;
                seen.add(ball);
                const v=g.vis?.get?.(ball.id);
                if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
                out.push({ball,v,x,y});
            }
        }
        return out;
    }


    function liveGarbage(q){
        return !!(
            q?.ball?.isGarbage &&
            !q.ball.garbagePhaseFrozen &&
            Array.isArray(q.ball.fallPath) &&
            q.ball.fallPath.length>0
        );
    }


    function snapshot(g){
        const out=new Map();
        for(const q of entries(g)){
            if(!liveGarbage(q))continue;
            out.set(q.ball.id,{
                x:q.v.x,
                y:q.v.y,
                vy:q.v.vy,
                motionSpeed:q.v.motionSpeed,
                pileFlow:q.v.pileFlow
            });
        }
        return out;
    }


    function minDistance(g){
        const all=entries(g);
        const liveIds=new Set(all.filter(liveGarbage).map(q=>q.ball.id));
        let min=Infinity;
        let pair=null;
        for(let i=0;i<all.length;i++){
            for(let j=i+1;j<all.length;j++){
                if(!liveIds.has(all[i].ball.id)&&!liveIds.has(all[j].ball.id))continue;
                const dx=(all[i].v.x-all[j].v.x)*.5;
                const dy=(all[i].v.y-all[j].v.y)*H;
                const d=Math.hypot(dx,dy);
                if(d<min){
                    min=d;
                    pair=[all[i].ball.id,all[j].ball.id];
                }
            }
        }
        return{min,pair};
    }


    function restore(g,state){
        let changed=0;
        for(const q of entries(g)){
            const s=state.get(q.ball.id);
            if(!s)continue;
            if(Math.abs(q.v.x-s.x)>EPS||Math.abs(q.v.y-s.y)>EPS)changed++;
            q.v.x=s.x;
            q.v.y=s.y;
            q.v.vy=s.vy;
            q.v.motionSpeed=s.motionSpeed;
            q.v.pileFlow=s.pileFlow;
        }
        return changed;
    }


    resolveVisualContacts=function(g){
        if(!garbagePhase(g))return baseResolveVisualContactsMonotonicV1(g);

        const state=snapshot(g);
        const before=minDistance(g);
        const result=baseResolveVisualContactsMonotonicV1(g);
        const after=minDistance(g);

        if(
            Number.isFinite(before.min) &&
            before.min>=LEGAL_DIST-EPS &&
            Number.isFinite(after.min) &&
            after.min<LEGAL_DIST-EPS
        ){
            const restored=restore(g,state);
            window.__sixBallGarbageContactMonotonicRestores=
                (window.__sixBallGarbageContactMonotonicRestores||0)+1;
            window.__sixBallLastGarbageContactMonotonicV1={
                restored,
                before:before.min,
                beforePair:before.pair,
                rejectedAfter:after.min,
                rejectedPair:after.pair,
                at:Date.now()
            };
            return result;
        }

        window.__sixBallLastGarbageContactMonotonicV1={
            restored:0,
            before:before.min,
            beforePair:before.pair,
            after:after.min,
            afterPair:after.pair,
            at:Date.now()
        };
        return result;
    };


    window.__sixBallGarbageContactMonotonicVersion=
        "garbage-contact-monotonic-v1";
})();
