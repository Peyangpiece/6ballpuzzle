/* ============================================================
 * 6ball GARBAGE MIN-DISPLACEMENT CROSSING v1
 *
 * Final post-pass for dense garbage rows.
 *
 * The authoritative garbage solver keeps equal-height incoming rows coherent.
 * In one dense crossing case an outsider can become trapped between a tangent
 * fixed support and a wall-anchored live row.  Preserving the outsider's
 * current side then has no legal infinitesimal correction: the nearest legal
 * solution is to pass the outsider to the opposite side of the pinned row.
 *
 * This layer runs AFTER app-garbage-freeze-authoritative-v1.js and changes only
 * visual X positions of live incoming garbage during GARBAGE.  Logical cells,
 * Y/path timing, segment metadata, the frozen pile and ordinary ball physics are
 * untouched.  For a residual row/outsider overlap it evaluates BOTH sides and
 * chooses the globally legal candidate with the smallest horizontal movement.
 * Exact tangency remains legal.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageMinDisplacementCrossingV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    const baseResolveVisualContacts=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const OVERLAP_LIMIT=0.9995;
    const LEGAL_LIMIT=0.999999;
    const SAME_Y_EPS=1e-8;
    const EPS=1e-9;

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&g.board&&g.vis);}
    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}

    function boardEntries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const v=ball&&g.vis.get(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function liveEntries(g,all){
        const frozen=g.board?.__hexGarbageFrozenIds instanceof Set?g.board.__hexGarbageFrozenIds:new Set();
        return all.filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&hasLivePath(q.ball));
    }

    function physicalDistance(a,b,ax=a.v.x){
        return Math.hypot((ax-b.v.x)*0.5,(a.v.y-b.v.y)*H);
    }

    function requiredX(a,b){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST)return 0;
        return 2*Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
    }

    function equalHeightMembership(live){
        const order=live.slice().sort((a,b)=>a.v.y-b.v.y||a.v.x-b.v.x||a.ball.id-b.ball.id);
        const membership=new Map();
        let group=[];
        let anchor=null;
        function flush(){
            if(group.length>1){
                const ids=group.map(q=>q.ball.id);
                for(const q of group)membership.set(q.ball.id,ids);
            }
            group=[];anchor=null;
        }
        for(const q of order){
            if(anchor===null||Math.abs(q.v.y-anchor)<=SAME_Y_EPS){
                group.push(q);
                if(anchor===null)anchor=q.v.y;
            }else{
                flush();group=[q];anchor=q.v.y;
            }
        }
        flush();
        return membership;
    }

    function legalAtX(movable,x,blockers){
        if(!Number.isFinite(x)||x<-EPS||x>W2-1+EPS)return false;
        for(const b of blockers){
            if(!b||b.ball.id===movable.ball.id)continue;
            if(physicalDistance(movable,b,x)<LEGAL_LIMIT)return false;
        }
        return true;
    }

    function nearestLegalPinnedCandidate(movable,pinned,blockers){
        const req=requiredX(movable,pinned);
        if(req<=0)return null;
        const current=movable.v.x;
        const currentSide=current<=pinned.v.x?-1:1;
        const raw=[];

        function add(side,x){
            if(!Number.isFinite(x))return;
            const boundary=side<0?pinned.v.x-req:pinned.v.x+req;
            const nx=side<0?Math.min(x,boundary):Math.max(x,boundary);
            raw.push({side,x:nx});
        }

        for(const side of[-1,1]){
            const boundary=side<0?pinned.v.x-req:pinned.v.x+req;
            add(side,current);
            add(side,boundary);
            add(side,side<0?0:W2-1);
            for(const b of blockers){
                if(!b||b.ball.id===movable.ball.id)continue;
                const r=requiredX(movable,b);
                if(r<=0)continue;
                add(side,b.v.x-r);
                add(side,b.v.x+r);
            }
        }

        let best=null;
        const seen=new Set();
        for(const c of raw){
            const x=Math.max(0,Math.min(W2-1,c.x));
            const sideBoundary=c.side<0?pinned.v.x-req:pinned.v.x+req;
            if(c.side<0&&x>sideBoundary+1e-7)continue;
            if(c.side>0&&x<sideBoundary-1e-7)continue;
            const key=c.side+":"+x.toFixed(12);
            if(seen.has(key))continue;
            seen.add(key);
            if(!legalAtX(movable,x,blockers))continue;
            const cost=Math.abs(x-current);
            const sidePenalty=c.side===currentSide?0:1;
            const logicalPenalty=Math.abs(x-movable.x);
            if(!best||cost<best.cost-1e-10||
               (Math.abs(cost-best.cost)<=1e-10&&sidePenalty<best.sidePenalty)||
               (Math.abs(cost-best.cost)<=1e-10&&sidePenalty===best.sidePenalty&&logicalPenalty<best.logicalPenalty-1e-10)){
                best={x,side:c.side,cost,sidePenalty,logicalPenalty};
            }
        }
        return best;
    }

    function residualRowOutsider(live){
        const membership=equalHeightMembership(live);
        let worst=null;
        for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
            const a=live[i],b=live[j];
            const d=physicalDistance(a,b);
            if(d>=OVERLAP_LIMIT)continue;
            const aRow=membership.has(a.ball.id),bRow=membership.has(b.ball.id);
            if(aRow===bRow)continue;
            const pinned=aRow?a:b;
            const movable=aRow?b:a;
            if(!worst||d<worst.d)worst={d,pinned,movable};
        }
        return worst;
    }

    function minIncomingDistance(all,live){
        const ids=new Set(live.map(q=>q.ball.id));
        let min=Infinity,pair=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=physicalDistance(all[i],all[j]);
            if(d<min){min=d;pair=[all[i].ball.id,all[j].ball.id];}
        }
        return{min,pair};
    }

    function repairResidualCrossings(g){
        if(!garbagePhase(g))return 0;
        let moves=0;
        let flips=0;
        let totalShift=0;
        const movedIds=[];
        const maxIter=256;

        for(let iter=0;iter<maxIter;iter++){
            const all=boardEntries(g);
            const live=liveEntries(g,all);
            if(live.length<2)break;
            const issue=residualRowOutsider(live);
            if(!issue)break;

            const blockers=all.filter(q=>q.ball.id!==issue.movable.ball.id);
            const before=issue.movable.v.x;
            const beforeSide=before<=issue.pinned.v.x?-1:1;
            const candidate=nearestLegalPinnedCandidate(issue.movable,issue.pinned,blockers);
            if(!candidate||Math.abs(candidate.x-before)<=EPS)break;

            issue.movable.v.x=candidate.x;
            moves++;
            totalShift+=Math.abs(candidate.x-before);
            if(candidate.side!==beforeSide)flips++;
            movedIds.push(issue.movable.ball.id);
        }

        const all=boardEntries(g);
        const live=liveEntries(g,all);
        const final=minIncomingDistance(all,live);
        const info={
            moves,flips,totalShift,
            movedIds:[...new Set(movedIds)],
            finalMinDistance:Number.isFinite(final.min)?final.min:null,
            finalPair:final.pair,
            ok:!Number.isFinite(final.min)||final.min>=OVERLAP_LIMIT,
            at:Date.now()
        };
        window.__sixBallLastGarbageMinDisplacementRepair=info;
        if(moves)window.__sixBallGarbageMinDisplacementRepairs=(window.__sixBallGarbageMinDisplacementRepairs||0)+moves;
        if(window.__sixBallLastGarbageConstraintSolve&&typeof window.__sixBallLastGarbageConstraintSolve==="object"){
            window.__sixBallLastGarbageConstraintSolve.postMinDisplacement=info;
        }
        return moves;
    }

    resolveVisualContacts=function(g){
        const result=baseResolveVisualContacts(g);
        if(garbagePhase(g))repairResidualCrossings(g);
        return result;
    };

    window.__sixBallGarbageMinDisplacementCrossingV1=true;
    window.__sixBallGarbageMinDisplacementCrossingVersion="garbage-min-displacement-crossing-v1.0";
})();
