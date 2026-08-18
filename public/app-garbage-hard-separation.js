/* Final garbage-to-garbage motion invariant.
 *
 * app-17 serializes garbage motion, but its historical queue used motionSeq.
 * Scheduled pileFlow deliberately clears motionSeq to zero and preserves the
 * true order in pileFlowOriginalSeq. That let a later garbage member start while
 * an earlier member was still travelling, so two paths could converge on the
 * same intermediate lattice point. Use the preserved original sequence as the
 * authoritative queue order, pause queued schedules in real time, and retain a
 * final continuous separation clamp as a last-resort invariant.
 */
(function installGarbageHardSeparation(){
    if(typeof window==="undefined"||window.__hexGarbageHardSeparation)return;
    window.__hexGarbageHardSeparation=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const EPS=3e-6;
    const BISECT=22;
    const previousByEngine=new WeakMap();

    function segmentSeq(seg){
        const original=Number(seg?.pileFlowOriginalSeq),motion=Number(seg?.motionSeq);
        if(Number.isFinite(original)&&original>0)return original;
        if(Number.isFinite(motion)&&motion>0)return motion;
        return 0;
    }

    __hexdropGarbageMotionQueue=function(g){
        let minSeq=Infinity;
        const queued=new Set(),entries=[];
        if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return{minSeq,queued};
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const seg=ball&&Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
            const seq=segmentSeq(seg);
            if(seq>0){entries.push({id:ball.id,isGarbage:!!ball.isGarbage,seq});minSeq=Math.min(minSeq,seq);}
        }
        if(Number.isFinite(minSeq))for(const e of entries)if(e.isGarbage&&e.seq>minSeq)queued.add(e.id);
        return{minSeq,queued};
    };

    function items(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function immutable(g,q){return g?.garbageOriginalPileIds instanceof Set&&g.garbageOriginalPileIds.has(q.ball.id);}
    function resting(q){
        if(q.ball.garbagePileSettled!==true)return false;
        if(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length)return false;
        if(q.v.pileFlow||q.v._pendingPathComplete)return false;
        return Math.abs(q.v.x-q.x)<=.02&&Math.abs(q.v.y-q.y)<=.02;
    }
    function seq(q){return segmentSeq(Array.isArray(q.ball?.fallPath)&&q.ball.fallPath.length?q.ball.fallPath[0]:null);}
    function distance(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*HEX_ROW_H);}
    function pointDistance(p,q){return Math.hypot((p[0]-q[0])*.5,(p[1]-q[1])*HEX_ROW_H);}

    function snapshot(g){const m=new Map();for(const q of items(g))m.set(q.ball.id,[q.v.x,q.v.y]);previousByEngine.set(g,m);return m;}
    function prevMap(g){return previousByEngine.get(g)||null;}

    function outwardDir(q,other){
        let dir=Math.sign(q.v.x-other.v.x);if(!dir)dir=Math.sign(q.x-other.x);
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

    function clampToPreviousContact(g,mover,other){
        const p0=prevMap(g)?.get(mover.ball.id);if(!p0)return false;
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

    function pauseQueuedSchedules(g,queued,dt){
        if(!queued?.size||!(dt>0))return;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage||!queued.has(ball.id))continue;
            const path=Array.isArray(ball.fallPath)?ball.fallPath:[];
            for(const seg of path){
                if(!seg?.pileFlow)continue;
                if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=dt;
                if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=dt;
            }
            const v=g.vis.get(ball.id);if(v){v.vy=0;v.motionSpeed=0;v.garbageQueueHeld=true;}
        }
    }

    function chooseQueuedMover(a,b,queued){
        const qa=queued.has(a.ball.id),qb=queued.has(b.ball.id);
        if(qa&&!qb)return a;
        if(qb&&!qa)return b;
        if(!qa&&!qb)return null;
        if(seq(a)!==seq(b))return seq(a)>seq(b)?a:b;
        return a.ball.id>b.ball.id?a:b;
    }

    function separateHeldPair(g,a,b,queued){
        const hardA=immutable(g,a)||resting(a),hardB=immutable(g,b)||resting(b);
        if(hardA&&hardB)return false;

        let mover=null,other=null;
        if(hardA&&!hardB){mover=b;other=a;}
        else if(hardB&&!hardA){mover=a;other=b;}
        else{
            mover=chooseQueuedMover(a,b,queued);
            if(!mover)return false;
            other=mover===a?b:a;
        }

        // A locally queued ball is still physically movable for penetration
        // correction. First rewind to the last safe point; unlike the old
        // fixedA&&fixedB escape hatch, never leave an overlap behind merely
        // because both objects are currently held by different constraints.
        if(clampToPreviousContact(g,mover,other))return true;

        let need=requiredHorizontal(a,b);
        if(need>1e-10)need-=pushOut(mover,other,need);
        if(distance(a,b)>=MIN-5e-7)return true;

        // If two queued (non-resting) members are wall-blocked, let the other
        // queued member yield as a last resort. Settled/original pile balls are
        // never moved by this fallback.
        if(!hardA&&!hardB){
            const second=mover===a?b:a;
            if(!immutable(g,second)&&!resting(second)){
                need=requiredHorizontal(a,b);
                if(need>1e-10)pushOut(second,mover,need);
                if(distance(a,b)>=MIN-5e-7)return true;
                if(clampToPreviousContact(g,second,mover))return true;
            }
        }
        return distance(a,b)>=MIN-5e-7;
    }

    function hardSeparate(g){
        const list=items(g);if(list.length<2)return;
        const queued=(typeof __hexdropGarbageMotionQueue==="function"?__hexdropGarbageMotionQueue(g).queued:new Set());
        for(let pass=0;pass<64;pass++){
            let changed=false;
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
                const a=list[i],b=list[j];if(distance(a,b)>=MIN-1e-9)continue;
                changed=true;

                if(resting(a)&&resting(b)&&!immutable(g,a)&&!immutable(g,b)){
                    a.v.x=a.x;a.v.y=a.y;b.v.x=b.x;b.v.y=b.y;continue;
                }

                const hardA=immutable(g,a)||resting(a),hardB=immutable(g,b)||resting(b);
                const queuedA=queued.has(a.ball.id),queuedB=queued.has(b.ball.id);
                const fixedA=hardA||queuedA,fixedB=hardB||queuedB;

                if(fixedA&&fixedB){
                    separateHeldPair(g,a,b,queued);
                    continue;
                }

                let need=requiredHorizontal(a,b);if(need<=1e-10)continue;
                let first,second;
                if(fixedA){first=b;second=null;}
                else if(fixedB){first=a;second=null;}
                else{
                    const later=seq(a)>seq(b)?a:(seq(b)>seq(a)?b:(a.ball.id>b.ball.id?a:b)),earlier=later===a?b:a;
                    const laterRoom=availablePhysical(later,outwardDir(later,earlier));
                    const earlierRoom=availablePhysical(earlier,outwardDir(earlier,later));
                    if(laterRoom>=Math.min(need,earlierRoom)||earlierRoom<=1e-12){first=later;second=earlier;}
                    else{first=earlier;second=later;}
                }

                const other=first===a?b:a,firstRoom=availablePhysical(first,outwardDir(first,other));
                if(firstRoom+1e-10<need&&(fixedA||fixedB)){
                    if(clampToPreviousContact(g,first,other))continue;
                }
                need-=pushOut(first,other,need);
                if(need>1e-8&&second&&!immutable(g,second)&&!resting(second)&&!queued.has(second.ball.id)){
                    need-=pushOut(second,second===a?b:a,need);
                }
                if(distance(a,b)<MIN-5e-7){
                    if(clampToPreviousContact(g,first,other))continue;
                    if(second)clampToPreviousContact(g,second,second===a?b:a);
                }
            }
            if(!changed)break;
        }
    }

    // Freeze queued schedules BEFORE the core visual step. Other moving balls
    // then see the queued garbage at its true fixed position during swept
    // collision prediction; restoring the queued visual can no longer create a
    // post-sweep overlap. Advancing pileFlowClock by dt keeps queued progress
    // unchanged because its start/end times were shifted by the same dt first.
    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        snapshot(g);
        const beforeQueue=typeof __hexdropGarbageMotionQueue==="function"?__hexdropGarbageMotionQueue(g).queued:new Set();
        pauseQueuedSchedules(g,beforeQueue,Math.max(0,dt||0));
        const out=baseUpdateVisuals(g,dt);
        hardSeparate(g);
        return out;
    };

    const baseResolve=resolveVisualContacts;
    resolveVisualContacts=function(g){const out=baseResolve(g);hardSeparate(g);return out;};

    const baseUpdateGarbage=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){const out=baseUpdateGarbage(g,dt);hardSeparate(g);return out;};

    window.__hexHardSeparateGarbage=hardSeparate;
    window.__hexGarbageOriginalSequence=segmentSeq;
})();
