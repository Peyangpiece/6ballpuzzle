/* Simultaneous current-batch garbage motion.
 *
 * Incoming garbage uses the ordinary fallPath solver, but motionSeq=0 units are
 * integrated ball-by-ball. If two tangent incoming balls are both moving, the
 * generic collision stages used to see the other ball at a stale position and
 * repeatedly push the first ball back. The same happened again in
 * resolveVisualContacts, creating a chain freeze above the first pile contact.
 *
 * This layer keeps one 120 Hz frame on a shared time axis:
 *   1. save every current-batch garbage centre before updateVisuals;
 *   2. let ordinary physics produce each canonical end-of-frame centre;
 *   3. allow moving peers to pass the per-ball *stationary* clamp;
 *   4. after generic contact resolution, restore the canonical centres whenever
 *      they are safe against truly static obstacles;
 *   5. if two moving trajectories genuinely meet, stop only the later/upper
 *      trajectory at the first tangent point when the other can continue.
 *
 * Pre-batch frozen pile balls and already-resting current-batch balls are never
 * moved by this layer. No synthetic destination is invented: every moving ball
 * stays on the segment joining its previous and canonical frame positions.
 */
(function installGarbageSimultaneousMotion(){
    if(typeof window==="undefined"||window.__hexGarbageSimultaneousMotion)return;
    window.__hexGarbageSimultaneousMotion=true;

    const ARC_FINISH_EPS=0.040;
    const STATIC_MIN_DIST=0.999999;
    const PAIR_MIN_DIST=1.000000;
    const SWEEP_SAMPLES=16;

    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        return out;
    }
    function boardEntryById(g,id){return boardEntries(g).find(q=>q.ball.id===id)||null;}
    function ballById(g,id){return boardEntryById(g,id)?.ball||null;}
    function currentGarbage(ball){return !!ball?.isGarbage&&!ball.garbagePhaseFrozen;}
    function activeCurrentGarbage(ball){
        return currentGarbage(ball)&&Array.isArray(ball.fallPath)&&ball.fallPath.length>0;
    }
    function physicalDist(ax,ay,bx,by){return Math.hypot((ax-bx)*0.5,(ay-by)*HEX_ROW_H);}
    function lerpPoint(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
    function samePhysicalPoint(a,b,eps=1e-6){
        return Array.isArray(a)&&Array.isArray(b)&&physicalDist(a[0],a[1],b[0],b[1])<=eps;
    }
    function cloneSeg(seg){
        if(!seg)return null;
        return{
            ...seg,
            from:Array.isArray(seg.from)?[...seg.from]:seg.from,
            to:Array.isArray(seg.to)?[...seg.to]:seg.to,
            pivot:Array.isArray(seg.pivot)?[...seg.pivot]:seg.pivot,
            topPivot:Array.isArray(seg.topPivot)?[...seg.topPivot]:seg.topPivot,
            followSupportIds:Array.isArray(seg.followSupportIds)?[...seg.followSupportIds]:seg.followSupportIds
        };
    }
    function clearSegmentVisualState(v){
        if(!v)return;
        delete v._segKey;delete v._segP;delete v._segStartVisualY;
        delete v._segAngle;delete v._segProgress;delete v._segArcTotal;
        delete v._segStartAngle;delete v._segTargetAngle;delete v._segDir;
        delete v._pendingPathComplete;
    }
    function restoreSegmentIfCompleted(ball,record){
        const seg=record?.seg;
        if(!ball||!seg?.to)return;
        const cur=Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
        const same=cur?.to&&Math.abs(cur.to[0]-seg.to[0])<1e-9&&Math.abs(cur.to[1]-seg.to[1])<1e-9;
        if(same)return;
        if(!Array.isArray(ball.fallPath))ball.fallPath=[];
        ball.fallPath.unshift(cloneSeg(seg));
    }

    // Per-ball visual clamp: while the current ball is itself moving, another
    // current-batch ball with a live path is not a stationary obstacle. Static
    // pile/floor contacts remain handled by the original clamp.
    const baseVisualPointSafe=visualPointSafe;
    visualPointSafe=function(g,id,x,y,minDist=STATIC_MIN_DIST){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))
            return baseVisualPointSafe(g,id,x,y,minDist);
        const moving=ballById(g,id);
        if(!activeCurrentGarbage(moving))return baseVisualPointSafe(g,id,x,y,minDist);
        const hidden=[];
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov)continue;
            const other=ballById(g,oid);
            if(!activeCurrentGarbage(other))continue;
            hidden.push([oid,ov]);
        }
        if(!hidden.length)return baseVisualPointSafe(g,id,x,y,minDist);
        for(const [oid] of hidden)g.vis.delete(oid);
        try{return baseVisualPointSafe(g,id,x,y,minDist);}
        finally{for(const [oid,ov] of hidden)g.vis.set(oid,ov);}
    };

    function pointSafeAgainstStatic(g,id,x,y,seg,frameMoving){
        const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        if(y>maxY+1e-7)return false;
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            if(frameMoving?.has(oid))continue;
            if(Array.isArray(seg?.pivot)&&samePhysicalPoint([ov.x,ov.y],seg.pivot))continue;
            if(physicalDist(x,y,ov.x,ov.y)<STATIC_MIN_DIST-1e-7)return false;
        }
        return true;
    }

    function endpointSafeAgainstStatic(g,entry,seg){
        return !!entry?.v&&Array.isArray(seg?.to)&&pointSafeAgainstStatic(
            g,entry.ball.id,seg.to[0],seg.to[1],seg,new Set(
                boardEntries(g).filter(q=>activeCurrentGarbage(q.ball)).map(q=>q.ball.id)
            )
        );
    }

    function finishNearCanonicalArcs(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return 0;
        let finished=0;
        for(const entry of boardEntries(g)){
            const {ball,v}=entry;
            if(!activeCurrentGarbage(ball)||!v)continue;
            const seg=ball.fallPath[0];
            if(!seg?.pivot||seg.topPivot||Number(seg.motionSeq)!==0||!Array.isArray(seg.to))continue;
            const remain=physicalDist(v.x,v.y,seg.to[0],seg.to[1]);
            if(remain>ARC_FINISH_EPS+1e-10||!endpointSafeAgainstStatic(g,entry,seg))continue;
            v.x=seg.to[0];v.y=Math.max(v.y,seg.to[1]);
            ball.fallPath.shift();clearSegmentVisualState(v);
            const next=ball.fallPath[0];
            if(next){v.vy=Math.max(0.0001,v.vy||0);v.motionSpeed=Math.max(0.0001,v.motionSpeed||0,next.pivot?SLIDE_SPEED:0);}
            else{delete ball.fallPath;v.vy=0;v.motionSpeed=0;}
            finished++;
        }
        return finished;
    }

    function captureFrameStart(g){
        const map=new Map();
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return map;
        for(const q of boardEntries(g)){
            if(!currentGarbage(q.ball)||!q.v)continue;
            map.set(q.ball.id,{
                pre:[q.v.x,q.v.y],
                seg:cloneSeg(Array.isArray(q.ball.fallPath)?q.ball.fallPath[0]:null),
                hadPath:activeCurrentGarbage(q.ball),
                seq:Number(q.ball.garbageSourceSeq)||0,
                role:Number(q.ball.garbageSourceRole)||0
            });
        }
        return map;
    }
    function captureCanonicalEnd(g,start){
        const canonical=new Map(),moving=new Set();
        for(const [id,r] of start){
            const q=boardEntryById(g,id);if(!q?.v)continue;
            canonical.set(id,{x:q.v.x,y:q.v.y,vy:q.v.vy||0,motionSpeed:q.v.motionSpeed||0});
            if(r.hadPath||physicalDist(r.pre[0],r.pre[1],q.v.x,q.v.y)>1e-8)moving.add(id);
        }
        return{start,canonical,moving};
    }

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const start=captureFrameStart(g);
        const r=baseUpdateVisuals(g,dt);
        finishNearCanonicalArcs(g);
        if(start.size)g._garbageFrameMotion=captureCanonicalEnd(g,start);
        else g._garbageFrameMotion=null;
        return r;
    };

    function staticSnapshot(g,frame){
        const snap=new Map();
        for(const q of boardEntries(g)){
            if(!q.v)continue;
            // Frozen pre-batch pile is absolutely fixed. Current-batch garbage
            // that did not move in this frame is also a receiving obstacle for
            // this one contact solve (it may become mobile again via gravity on
            // a later frame if support opens).
            if(q.ball.garbagePhaseFrozen||(currentGarbage(q.ball)&&!frame?.moving?.has(q.ball.id))){
                snap.set(q.ball.id,{x:q.v.x,y:q.v.y,vy:q.v.vy||0,motionSpeed:q.v.motionSpeed||0});
            }
        }
        return snap;
    }
    function restoreSnapshot(g,snap){
        for(const [id,s] of snap){const v=g.vis.get(id);if(v){v.x=s.x;v.y=s.y;v.vy=s.vy;v.motionSpeed=s.motionSpeed;}}
    }
    function restoreCanonicalMovers(g,frame){
        if(!frame)return;
        for(const id of frame.moving){
            const q=boardEntryById(g,id),c=frame.canonical.get(id),r=frame.start.get(id);
            if(!q?.v||!c)continue;
            const seg=r?.seg;
            if(!pointSafeAgainstStatic(g,id,c.x,c.y,seg,frame.moving))continue;
            q.v.x=c.x;q.v.y=c.y;q.v.vy=c.vy;q.v.motionSpeed=c.motionSpeed;
        }
    }

    function pairFirstContact(a0,a1,b0,b1){
        const dist=t=>{const a=lerpPoint(a0,a1,t),b=lerpPoint(b0,b1,t);return physicalDist(a[0],a[1],b[0],b[1]);};
        let prevT=0,prevD=dist(0);
        for(let i=1;i<=SWEEP_SAMPLES;i++){
            const t=i/SWEEP_SAMPLES,d=dist(t);
            // Tangent pairs moving apart are not a collision. Only enter when
            // distance decreases through the one-diameter boundary.
            if(d<PAIR_MIN_DIST-1e-8 && (prevD>=PAIR_MIN_DIST-1e-8||d<prevD-1e-9)){
                let lo=prevT,hi=t;
                for(let k=0;k<20;k++){
                    const m=(lo+hi)*0.5;
                    if(dist(m)<PAIR_MIN_DIST)hi=m;else lo=m;
                }
                return Math.max(0,lo-1e-7);
            }
            prevT=t;prevD=d;
        }
        return null;
    }
    function clampRecordTo(g,id,record,pos){
        const q=boardEntryById(g,id);if(!q?.v)return;
        q.v.x=pos[0];q.v.y=Math.max(record.pre[1],pos[1]);
        restoreSegmentIfCompleted(q.ball,record);
        clearSegmentVisualState(q.v);
        q.v.vy=Math.max(0.0001,q.v.vy||0);
        q.v.motionSpeed=Math.max(0.0001,q.v.motionSpeed||0);
    }
    function resolveMovingPair(g,frame,aid,bid){
        const ar=frame.start.get(aid),br=frame.start.get(bid),ac=frame.canonical.get(aid),bc=frame.canonical.get(bid);
        const a=boardEntryById(g,aid),b=boardEntryById(g,bid);
        if(!ar||!br||!ac||!bc||!a?.v||!b?.v)return false;
        const a0=ar.pre,b0=br.pre,a1=[a.v.x,a.v.y],b1=[b.v.x,b.v.y];
        const tc=pairFirstContact(a0,a1,b0,b1);
        if(tc===null){
            // Endpoint may have been altered by earlier pair solves.
            if(physicalDist(a1[0],a1[1],b1[0],b1[1])>=PAIR_MIN_DIST-1e-8)return false;
        }
        const t=tc===null?0:tc,ca=lerpPoint(a0,a1,t),cb=lerpPoint(b0,b1,t);
        const aCanContinue=physicalDist(a1[0],a1[1],cb[0],cb[1])>=PAIR_MIN_DIST-1e-7;
        const bCanContinue=physicalDist(ca[0],ca[1],b1[0],b1[1])>=PAIR_MIN_DIST-1e-7;
        let continueA=false,continueB=false;
        if(aCanContinue&&!bCanContinue)continueA=true;
        else if(bCanContinue&&!aCanContinue)continueB=true;
        else if(aCanContinue&&bCanContinue){
            // Lower ball should fall away first. If level, preserve attack order:
            // an earlier six-ball unit is never blocked by a later unit above it.
            if(ca[1]>cb[1]+1e-7)continueA=true;
            else if(cb[1]>ca[1]+1e-7)continueB=true;
            else if(ar.seq<br.seq||(ar.seq===br.seq&&ar.role<=br.role))continueA=true;
            else continueB=true;
        }
        if(continueA){clampRecordTo(g,bid,br,cb);}
        else if(continueB){clampRecordTo(g,aid,ar,ca);}
        else{clampRecordTo(g,aid,ar,ca);clampRecordTo(g,bid,br,cb);}
        return true;
    }
    function resolveFrameMovingPairs(g,frame){
        if(!frame?.moving?.size)return;
        const ids=[...frame.moving].filter(id=>boardEntryById(g,id)?.v);
        for(let pass=0;pass<4;pass++){
            let changed=false;
            for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
                if(resolveMovingPair(g,frame,ids[i],ids[j]))changed=true;
            }
            if(!changed)break;
        }
    }

    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return baseResolveVisualContacts(g);
        const frame=g._garbageFrameMotion;
        if(!frame)return baseResolveVisualContacts(g);
        const fixed=staticSnapshot(g,frame);

        // Keep the ordinary resolver for any contact it understands, then undo
        // only the two effects that are invalid during incoming-garbage motion:
        // movement of fixed receiving balls and backward displacement of movers
        // caused solely by other movers' stale positions.
        baseResolveVisualContacts(g);
        restoreSnapshot(g,fixed);
        restoreCanonicalMovers(g,frame);
        resolveFrameMovingPairs(g,frame);
        restoreSnapshot(g,fixed);
    };

    window.__hexGarbageMovingPeersAreSimultaneous=true;
    window.__hexGarbageFinishNearCanonicalArcs=finishNearCanonicalArcs;
    window.__hexGarbageCanonicalArcDeadlockFixed=true;
    window.__hexGarbageSharedFrameContactSolver=true;
})();