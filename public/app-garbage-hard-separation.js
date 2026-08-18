/* Final garbage-to-garbage distance invariant.
 *
 * app-garbage-visible-overlap closes the board/airborne representation gap.
 * This final projection handles board-edge cases where a queued garbage ball is
 * already at x=0/x=W2-1. A moving garbage ball that has no lateral escape is
 * clamped back to its first contact along this frame's actual motion segment;
 * it is never pushed toward the other ball. Pre-drop pile remains immutable.
 */
(function installGarbageHardSeparation(){
    if(typeof window==="undefined"||window.__hexGarbageHardSeparation)return;
    window.__hexGarbageHardSeparation=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const EPS=3e-6;
    const BISECT=22;
    const previousByEngine=new WeakMap();

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
    function pointDistance(p,q){return Math.hypot((p[0]-q[0])*.5,(p[1]-q[1])*HEX_ROW_H);}

    function snapshot(g){
        const m=new Map();
        for(const q of items(g))m.set(q.ball.id,[q.v.x,q.v.y]);
        previousByEngine.set(g,m);
        return m;
    }
    function prevMap(g){return previousByEngine.get(g)||null;}

    function outwardDir(q,other){
        let dir=Math.sign(q.v.x-other.v.x);
        if(!dir)dir=Math.sign(q.x-other.x);
        if(!dir){const left=q.v.x,right=(W2-1)-q.v.x;dir=right>=left?1:-1;}
        return dir;
    }
    function availablePhysical(q,dir){return Math.max(0,(dir>0?(W2-1)-q.v.x:q.v.x)*.5);}
    function pushOut(q,other,physical){
        if(!(physical>1e-12))return 0;
        const dir=outwardDir(q,other),avail=availablePhysical(q,dir),take=Math.min(physical+EPS,avail);
        if(!(take>0))return 0;
        q.v.x=Math.max(0,Math.min(W2-1,q.v.x+dir*(take/.5)));
        q.v.garbageHardSeparated=true;q.v.garbageHardSeparateCount=(q.v.garbageHardSeparateCount||0)+1;
        return take;
    }
    function requiredHorizontal(a,b){
        const vy=Math.abs((a.v.y-b.v.y)*HEX_ROW_H);if(vy>=MIN)return 0;
        return Math.max(0,Math.sqrt(Math.max(0,MIN*MIN-vy*vy))-Math.abs((a.v.x-b.v.x)*.5));
    }

    // Continuous fallback for a moving ball pinned against a side wall. Previous
    // frame must be safe; binary-search the current frame's segment and keep the
    // deepest point whose centre is still one full diameter from the fixed ball.
    function clampToPreviousContact(g,mover,other){
        const pm=prevMap(g),p0=pm?.get(mover.ball.id);if(!p0)return false;
        const p1=[mover.v.x,mover.v.y],op=[other.v.x,other.v.y];
        if(pointDistance(p0,op)<MIN-1e-7)return false;
        if(pointDistance(p1,op)>=MIN-1e-9)return true;
        let lo=0,hi=1;
        for(let k=0;k<BISECT;k++){
            const t=(lo+hi)*.5,p=[p0[0]+(p1[0]-p0[0])*t,p0[1]+(p1[1]-p0[1])*t];
            if(pointDistance(p,op)>=MIN)lo=t;else hi=t;
        }
        const t=Math.max(0,lo-1e-7);
        mover.v.x=p0[0]+(p1[0]-p0[0])*t;
        mover.v.y=Math.max(p0[1],p0[1]+(p1[1]-p0[1])*t);
        mover.v.vy=0;mover.v.motionSpeed=0;
        mover.v.garbageHardContactClamped=true;
        mover.v.garbageHardContactClampCount=(mover.v.garbageHardContactClampCount||0)+1;
        return pointDistance([mover.v.x,mover.v.y],op)>=MIN-5e-7;
    }

    function hardSeparate(g){
        const list=items(g);if(list.length<2)return;
        for(let pass=0;pass<64;pass++){
            let changed=false;
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
                const a=list[i],b=list[j];if(distance(a,b)>=MIN-1e-9)continue;
                changed=true;

                if(settled(a)&&settled(b)&&!immutable(g,a)&&!immutable(g,b)){
                    a.v.x=a.x;a.v.y=a.y;b.v.x=b.x;b.v.y=b.y;continue;
                }

                const ia=immutable(g,a),ib=immutable(g,b);if(ia&&ib)continue;
                let need=requiredHorizontal(a,b);if(need<=1e-10)continue;
                let first,second;
                if(ia){first=b;second=null;}
                else if(ib){first=a;second=null;}
                else if(settled(a)&&!settled(b)){first=b;second=null;}
                else if(settled(b)&&!settled(a)){first=a;second=null;}
                else{
                    const later=seq(a)>seq(b)?a:(seq(b)>seq(a)?b:(a.ball.id>b.ball.id?a:b)),earlier=later===a?b:a;
                    const laterRoom=availablePhysical(later,outwardDir(later,earlier));
                    const earlierRoom=availablePhysical(earlier,outwardDir(earlier,later));
                    if(laterRoom>=Math.min(need,earlierRoom)||earlierRoom<=1e-12){first=later;second=earlier;}
                    else{first=earlier;second=later;}
                }

                const other=first===a?b:a;
                const firstRoom=availablePhysical(first,outwardDir(first,other));
                // If the only movable ball is wall-blocked, prefer continuous
                // time-of-impact clamping over any sideways correction.
                if(firstRoom+1e-10<need&&(!second||settled(other)||immutable(g,other))){
                    if(clampToPreviousContact(g,first,other))continue;
                }

                need-=pushOut(first,other,need);
                if(need>1e-8&&second&&!immutable(g,second)&&!settled(second)){
                    need-=pushOut(second,second===a?b:a,need);
                }

                if(distance(a,b)<MIN-5e-7){
                    // Last resort is still a time clamp, never a push toward the
                    // neighbour. Try whichever non-fixed ball actually moved.
                    if(!immutable(g,first)&&clampToPreviousContact(g,first,other))continue;
                    if(second&&!immutable(g,second))clampToPreviousContact(g,second,second===a?b:a);
                }
            }
            if(!changed)break;
        }
    }

    // Loaded last: retain the true start-of-frame garbage centres so later queue
    // restoration layers cannot erase the collision history needed by the clamp.
    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){snapshot(g);const out=baseUpdateVisuals(g,dt);hardSeparate(g);return out;};

    const baseResolve=resolveVisualContacts;
    resolveVisualContacts=function(g){const out=baseResolve(g);hardSeparate(g);return out;};

    const baseUpdateGarbage=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){const out=baseUpdateGarbage(g,dt);hardSeparate(g);return out;};

    window.__hexHardSeparateGarbage=hardSeparate;
})();
