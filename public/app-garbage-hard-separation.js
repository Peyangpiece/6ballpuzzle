/* Final garbage-to-garbage distance invariant.
 *
 * app-garbage-visible-overlap closes the board/airborne representation gap.
 * This final projection handles board-edge cases where a queued garbage ball is
 * already at x=0/x=W2-1: it must never be pushed back toward the other ball just
 * because the outward side has no room. The other movable garbage ball yields
 * instead. Pre-drop pile garbage remains immutable.
 */
(function installGarbageHardSeparation(){
    if(typeof window==="undefined"||window.__hexGarbageHardSeparation)return;
    window.__hexGarbageHardSeparation=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const EPS=3e-6;

    function items(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function immutable(g,q){return g?.garbageOriginalPileIds instanceof Set&&g.garbageOriginalPileIds.has(q.ball.id);}
    function settled(q){return q.ball.garbagePileSettled===true;}
    function seq(q){
        const s=Array.isArray(q.ball?.fallPath)&&q.ball.fallPath.length?q.ball.fallPath[0]:null;
        const a=Number(s?.pileFlowOriginalSeq),b=Number(s?.motionSeq);
        return Number.isFinite(a)&&a>0?a:(Number.isFinite(b)&&b>0?b:0);
    }
    function distance(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*HEX_ROW_H);}

    function outwardDir(q,other){
        let dir=Math.sign(q.v.x-other.v.x);
        if(!dir)dir=Math.sign(q.x-other.x);
        if(!dir){
            const left=q.v.x,right=(W2-1)-q.v.x;
            dir=right>=left?1:-1;
        }
        return dir;
    }
    function availablePhysical(q,dir){
        return Math.max(0,(dir>0?(W2-1)-q.v.x:q.v.x)*.5);
    }
    function pushOut(q,other,physical){
        if(!(physical>1e-12))return 0;
        const dir=outwardDir(q,other),avail=availablePhysical(q,dir);
        const take=Math.min(physical+EPS,avail);
        if(!(take>0))return 0;
        q.v.x+=dir*(take/.5);
        q.v.x=Math.max(0,Math.min(W2-1,q.v.x));
        q.v.garbageHardSeparated=true;
        q.v.garbageHardSeparateCount=(q.v.garbageHardSeparateCount||0)+1;
        return take;
    }

    function requiredHorizontal(a,b){
        const vy=Math.abs((a.v.y-b.v.y)*HEX_ROW_H);
        if(vy>=MIN)return 0;
        const need=Math.sqrt(Math.max(0,MIN*MIN-vy*vy));
        return Math.max(0,need-Math.abs((a.v.x-b.v.x)*.5));
    }

    function hardSeparate(g){
        const list=items(g);if(list.length<2)return;
        for(let pass=0;pass<64;pass++){
            let changed=false;
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
                const a=list[i],b=list[j];
                if(distance(a,b)>=MIN-1e-9)continue;
                changed=true;

                // Fully settled current-batch garbage has authoritative lattice
                // centres. Restore those rather than accumulating display drift.
                if(settled(a)&&settled(b)&&!immutable(g,a)&&!immutable(g,b)){
                    a.v.x=a.x;a.v.y=a.y;b.v.x=b.x;b.v.y=b.y;
                    continue;
                }

                const ia=immutable(g,a),ib=immutable(g,b);
                if(ia&&ib)continue;
                let need=requiredHorizontal(a,b);
                if(need<=1e-10)continue;

                let first,second;
                if(ia){first=b;second=null;}
                else if(ib){first=a;second=null;}
                else if(settled(a)&&!settled(b)){first=b;second=null;}
                else if(settled(b)&&!settled(a)){first=a;second=null;}
                else{
                    // Prefer the later logical sequence, unless it has no room in
                    // the physically-away direction and the other ball does.
                    const later=seq(a)>seq(b)?a:(seq(b)>seq(a)?b:(a.ball.id>b.ball.id?a:b));
                    const earlier=later===a?b:a;
                    const laterRoom=availablePhysical(later,outwardDir(later,earlier));
                    const earlierRoom=availablePhysical(earlier,outwardDir(earlier,later));
                    if(laterRoom>=Math.min(need,earlierRoom)||earlierRoom<=1e-12){first=later;second=earlier;}
                    else{first=earlier;second=later;}
                }

                need-=pushOut(first,first===a?b:a,need);
                if(need>1e-8&&second&&!immutable(g,second)&&!settled(second))need-=pushOut(second,second===a?b:a,need);

                // If the preferred ball was wall-blocked and the other ball was
                // initially omitted only because it was settled current-batch
                // garbage, keep the settled ball fixed. The moving ball's sweep
                // route will remain paused by the existing collision guard rather
                // than being pushed through the settled ball.
            }
            if(!changed)break;
        }
    }

    const baseResolve=resolveVisualContacts;
    resolveVisualContacts=function(g){const out=baseResolve(g);hardSeparate(g);return out;};

    const baseUpdateGarbage=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){const out=baseUpdateGarbage(g,dt);hardSeparate(g);return out;};

    window.__hexHardSeparateGarbage=hardSeparate;
})();
