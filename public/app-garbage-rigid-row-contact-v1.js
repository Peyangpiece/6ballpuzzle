/* ============================================================
 * 6ball GARBAGE RIGID ROW CONTACT v1
 *
 * Dense STRAIGHT garbage often reaches a frame as two tangent horizontal rows.
 * The generic pair fallback may repair an unrelated crossing by nudging one
 * member of a row, after which equal-height polishing restores the row and can
 * leave a different row/row contact slightly interpenetrating.
 *
 * Final rule for GARBAGE presentation only:
 * - equal-height live garbage is treated as one horizontal contact row
 * - internal row spacing is never changed here
 * - when a residual overlap involves such a row, translate the WHOLE row by
 *   the smallest horizontal amount that is legal against every external ball
 * - exact tangency is legal
 * - Y, logical cells, fallPath timing, pivots and frozen pile balls are untouched
 * ============================================================ */
(function installGarbageRigidRowContactV1(){
    if(typeof window==="undefined"||window.__sixBallGarbageRigidRowContactV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageRigidRowContactV1=true;

    const baseResolveVisualContactsRigidRowV1=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const LEGAL_DIST=0.9995;
    const SAME_Y_EPS=1e-8;
    const EPS=1e-9;
    const MAX_PASSES=64;
    const MAX_ROW_SHIFT=1.25;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }

    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}

    function entries(g){
        const out=[];
        const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            out.push({ball,v,x,y});
        }
        return out;
    }

    function liveEntries(g,all){
        const frozen=frozenIds(g.board);
        return all.filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&hasLivePath(q.ball));
    }

    function physicalDistance(a,b,ax=a.v.x,bx=b.v.x){
        return Math.hypot((ax-bx)*0.5,(a.v.y-b.v.y)*H);
    }

    function requiredX(a,b){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-EPS)return 0;
        return 2*Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
    }

    function worstIncomingPair(all,live){
        const ids=new Set(live.map(q=>q.ball.id));
        let worst=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=physicalDistance(all[i],all[j]);
            if(d<LEGAL_DIST-EPS&&(!worst||d<worst.d))worst={a:all[i],b:all[j],d};
        }
        return worst;
    }

    function equalHeightRows(live){
        const sorted=live.slice().sort((a,b)=>a.v.y-b.v.y||a.v.x-b.v.x||a.ball.id-b.ball.id);
        const rows=[];
        let current=[];
        let anchor=null;
        for(const q of sorted){
            if(anchor===null||Math.abs(q.v.y-anchor)<=SAME_Y_EPS){
                current.push(q);
                if(anchor===null)anchor=q.v.y;
                continue;
            }
            if(current.length>1)rows.push(current);
            current=[q];anchor=q.v.y;
        }
        if(current.length>1)rows.push(current);
        return rows;
    }

    function rowMembership(rows){
        const out=new Map();
        for(const row of rows)for(const q of row)out.set(q.ball.id,row);
        return out;
    }

    function subtractOpen(intervals,lo,hi){
        if(!(hi>lo+EPS))return intervals;
        const out=[];
        for(const d of intervals){
            if(hi<=d.lo+EPS||lo>=d.hi-EPS){out.push(d);continue;}
            const leftHi=Math.min(d.hi,lo);
            const rightLo=Math.max(d.lo,hi);
            if(leftHi>=d.lo-EPS)out.push({lo:d.lo,hi:leftHi});
            if(d.hi>=rightLo-EPS)out.push({lo:rightLo,hi:d.hi});
        }
        return out.filter(d=>d.hi>=d.lo-EPS);
    }

    function allowedRowShifts(row,all){
        const ids=new Set(row.map(q=>q.ball.id));
        let lo=-Infinity,hi=Infinity;
        for(const q of row){
            lo=Math.max(lo,-q.v.x);
            hi=Math.min(hi,(W2-1)-q.v.x);
        }
        if(lo>hi+EPS)return[];

        let allowed=[{lo,hi}];
        for(const member of row){
            for(const other of all){
                if(ids.has(other.ball.id))continue;
                const req=requiredX(member,other);
                if(req<=EPS)continue;
                const fLo=other.v.x-req-member.v.x;
                const fHi=other.v.x+req-member.v.x;
                allowed=subtractOpen(allowed,fLo,fHi);
                if(!allowed.length)return[];
            }
        }
        return allowed;
    }

    function nearestNonZeroShift(intervals){
        let best=null;
        for(const d of intervals){
            let x;
            if(0<d.lo)x=d.lo;
            else if(0>d.hi)x=d.hi;
            else x=0;
            if(Math.abs(x)<=EPS)continue;
            if(Math.abs(x)>MAX_ROW_SHIFT+EPS)continue;
            if(best===null||Math.abs(x)<Math.abs(best)-EPS)best=x;
        }
        return best;
    }

    function candidateForRow(row,all){
        if(!row||row.length<2)return null;
        const intervals=allowedRowShifts(row,all);
        const dx=nearestNonZeroShift(intervals);
        if(dx===null)return null;
        return{row,dx,cost:dx*dx};
    }

    function applyCandidate(candidate){
        for(const q of candidate.row)q.v.x+=candidate.dx;
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

    resolveVisualContacts=function(g){
        const result=baseResolveVisualContactsRigidRowV1(g);
        if(!garbagePhase(g))return result;

        let all=entries(g);
        let live=liveEntries(g,all);
        if(live.length<2)return result;

        const before=minIncomingDistance(all,live);
        let movedRows=0;
        let totalShift=0;
        let maxShift=0;
        let passes=0;

        for(;passes<MAX_PASSES;passes++){
            const worst=worstIncomingPair(all,live);
            if(!worst)break;

            const rows=equalHeightRows(live);
            const membership=rowMembership(rows);
            const aRow=membership.get(worst.a.ball.id)||null;
            const bRow=membership.get(worst.b.ball.id)||null;
            const candidates=[];
            if(aRow)candidates.push(candidateForRow(aRow,all));
            if(bRow&&bRow!==aRow)candidates.push(candidateForRow(bRow,all));
            const valid=candidates.filter(Boolean).sort((a,b)=>a.cost-b.cost||Math.abs(a.dx)-Math.abs(b.dx));
            if(!valid.length)break;

            const chosen=valid[0];
            applyCandidate(chosen);
            movedRows++;
            totalShift+=Math.abs(chosen.dx);
            maxShift=Math.max(maxShift,Math.abs(chosen.dx));

            all=entries(g);
            live=liveEntries(g,all);
        }

        const after=minIncomingDistance(all,live);
        window.__sixBallLastGarbageRigidRowContactV1={
            before:before.min,beforePair:before.pair,
            after:after.min,afterPair:after.pair,
            movedRows,totalShift,maxShift,passes,at:Date.now()
        };
        if(movedRows){
            window.__sixBallGarbageRigidRowContactCorrections=
                (window.__sixBallGarbageRigidRowContactCorrections||0)+movedRows;
        }
        return result;
    };

    window.__sixBallGarbageRigidRowContactVersion="garbage-rigid-row-contact-v1";
})();
