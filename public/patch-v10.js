/* HEXDROP patch v10: normal-ball motion follows uploaded index-2.html only */
(function installHexdropV10(){
    if(typeof window!=="undefined" && window.__hexdropV10Installed)return;
    if(typeof window!=="undefined")window.__hexdropV10Installed=true;

    // Preserve the current v9 path exclusively for garbage balls.
    const v9VisualPointSafe=visualPointSafe;
    const v9ScheduleFreshPileFlow=scheduleFreshPileFlow;
    const v9PileFlowPointForBall=pileFlowPointForBall;

    const isGarbageBall=(ball)=>!!ball?.isGarbage;
    const groupHasGarbage=(members)=>members.some(m=>isGarbageBall(m?.ball));

    // Exact normal-ball rigid-body policy from the uploaded index-2.html:
    // only the intact 3-ball piece can stay rigid. Once common motion is gone,
    // all members return to ordinary independent pile physics.
    advanceSlopeRigidGroups=function(b,preview=false){
        const groups=slopeRigidGroups(b);
        if(!groups.size)
            return {moved:false,heldIds:new Set(),released:false};

        const heldIds=new Set();
        let released=false;

        const releaseGroup=(members,reason)=>{
            released=true;
            for(const m of members)
                heldIds.delete(m.ball.id);

            if(!preview){
                for(const m of members){
                    m.ball.rigidityBreakReason=reason||"blocked";
                    m.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;
                    normalizePileBallPhysics(m.ball);
                }
            }
        };

        for(const members of groups.values()){
            // Materialized garbage is never permitted to retain rigidity.
            if(groupHasGarbage(members)){
                releaseGroup(members,"garbage_no_rigidity");
                continue;
            }

            // index-2.html has no persistent 2-ball rigid pair.
            if(members.length!==3){
                releaseGroup(members,"member_missing");
                continue;
            }

            for(const m of members){
                heldIds.add(m.ball.id);
                if(!preview){
                    m.ball.rigid=true;
                    m.ball.slopeRigidActive=true;
                    m.ball.slopeRigidPartialPair=false;
                    m.ball.upConvexPairPersistent=false;
                }
            }

            const continuation=rigidBodyContinuation(b,members);

            if(continuation.move){
                if(preview)
                    return {moved:true,heldIds,released};

                applySlopeRigidTranslation(
                    b,members,
                    continuation.dx,
                    continuation.dy
                );

                return {moved:true,heldIds,released};
            }

            releaseGroup(
                members,
                continuation.breakRequired
                    ? (continuation.breakReason||"differential_constraint")
                    : "pile_settled"
            );
        }

        return {moved:false,heldIds,released};
    };

    stripFinishedTripletRigidity=function(g){
        const groups=slopeRigidGroups(g.board);

        for(const members of groups.values()){
            if(groupHasGarbage(members)){
                for(const m of members)normalizePileBallPhysics(m.ball);
                continue;
            }

            if(members.length!==3){
                for(const m of members)normalizePileBallPhysics(m.ball);
                continue;
            }

            const visuallyInFlight=members.some(m=>
                Array.isArray(m.ball.fallPath) &&
                m.ball.fallPath.length>0
            );
            if(visuallyInFlight)continue;

            const c=rigidBodyContinuation(g.board,members);
            if(c.move)continue;

            for(const m of members)
                normalizePileBallPhysics(m.ball);
        }
    };

    function referenceVisualPointSafe(g,id,x,y,minDist=0.999999){
        const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        if(y>maxVisualRowY+1e-7)return false;

        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov)continue;

            if(g._liveBatchIds?.has(id)&&g._liveBatchIds?.has(oid))continue;

            const pivot=g._visualArcPivotById&&g._visualArcPivotById.get(id);
            if(pivot){
                const pdx=(ov.x-pivot[0])*0.5;
                const pdy=(ov.y-pivot[1])*HEX_ROW_H;
                if(pdx*pdx+pdy*pdy<=1e-10)continue;
            }

            const dx=(x-ov.x)*0.5;
            const dy=(y-ov.y)*HEX_ROW_H;
            if(dx*dx+dy*dy<minDist*minDist)return false;
        }
        return true;
    }

    visualPointSafe=function(g,id,x,y,minDist){
        const ball=typeof pileFlowBallById==="function"
            ? pileFlowBallById(g,id)
            : null;
        if(ball && !isGarbageBall(ball))
            return referenceVisualPointSafe(
                g,id,x,y,
                Number.isFinite(minDist)?minDist:0.999999
            );
        return v9VisualPointSafe(g,id,x,y,minDist);
    };

    function referencePileFlowNominalDuration(seg,state){
        const H=HEX_ROW_H;
        const dx=seg.to[0]-seg.from[0];
        const dy=seg.to[1]-seg.from[1];

        if(seg.topPivot){
            const [px,py]=seg.topPivot;
            const contactRow=(cellCenterYNorm(py)-1-BOARD_TOP_CENTER_N)/H;
            const fallRows=Math.max(0,contactRow-seg.from[1]);
            const v0=Math.max(0,state.vy||RELEASE_INITIAL_VY);
            const fallT=fallRows>1e-9
                ? (-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallRows)))/GRAV
                : 0;
            const tx=latticeRealX(seg.to[0]);
            const ty=cellCenterYNorm(seg.to[1]);
            const sx=latticeRealX(px);
            const sy=cellCenterYNorm(py);
            let da=Math.atan2(ty-sy,tx-sx)-(-Math.PI/2);
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            const arcT=Math.abs(da)/SLIDE_SPEED;
            state.vy=Math.max(
                0,
                SLIDE_SPEED*Math.abs(Math.cos(Math.atan2(ty-sy,tx-sx)))/H
            );
            state.speed=SLIDE_SPEED;
            return Math.max(1/120,fallT+arcT);
        }

        if(seg.pivot){
            const [px,py]=seg.pivot;
            const a0=Math.atan2(
                (seg.from[1]-py)*H,
                (seg.from[0]-px)*0.5
            );
            const a1=Math.atan2(
                (seg.to[1]-py)*H,
                (seg.to[0]-px)*0.5
            );
            let da=a1-a0;
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            state.speed=SLIDE_SPEED;
            state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(a1))/H);
            return Math.max(1/120,Math.abs(da)/SLIDE_SPEED);
        }

        if(Math.abs(dx)<1e-9 && dy>0){
            const v0=Math.max(0,state.vy||RELEASE_INITIAL_VY);
            const t=(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*dy)))/GRAV;
            state.vy=v0+GRAV*t;
            state.speed=Math.max(state.speed||0,state.vy*H);
            return Math.max(1/120,t);
        }

        const dist=Math.hypot(dx*0.5,dy*H);
        const speed=Math.max(SLIDE_SPEED,state.speed||0.0001);
        state.speed=speed;
        state.vy=Math.max(0,dy/Math.max(1e-9,dist/speed));
        return Math.max(1/120,dist/speed);
    }

    function referencePileFlowPoint(seg,t){
        t=Math.max(0,Math.min(1,t));
        const H=HEX_ROW_H;
        const qStraight=seg.pileFlowEntry
            ? t*t*(2-t)
            : t;

        if(seg.topPivot)
            return liveSegPoint(seg,t);

        if(seg.pivot){
            const [px,py]=seg.pivot;
            const a0=Math.atan2(
                (seg.from[1]-py)*H,
                (seg.from[0]-px)*0.5
            );
            const a1=Math.atan2(
                (seg.to[1]-py)*H,
                (seg.to[0]-px)*0.5
            );
            let da=a1-a0;
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            const a=a0+da*t;
            return [
                px+Math.cos(a)/0.5,
                py+Math.sin(a)/H
            ];
        }

        return [
            seg.from[0]+(seg.to[0]-seg.from[0])*qStraight,
            seg.from[1]+(seg.to[1]-seg.from[1])*qStraight
        ];
    }

    function referencePileFlowPointForBall(
        g,ball,seg,q,t,depth=0,seen=null,memo=null
    ){
        q=Math.max(0,Math.min(1,q));
        if(!seg||!ball||depth>10)
            return referencePileFlowPoint(seg,q);

        const supportIds=pileFlowSupportIds(seg);
        if(!supportIds.length)
            return referencePileFlowPoint(seg,q);

        if(!seen)seen=new Set();
        if(seen.has(ball.id))
            return referencePileFlowPoint(seg,q);

        const nextSeen=new Set(seen);
        nextSeen.add(ball.id);

        const supports=supportIds
            .map(id=>pileFlowBallById(g,id))
            .filter(Boolean)
            .filter(b=>!nextSeen.has(b.id));

        if(!supports.length)
            return referencePileFlowPoint(seg,q);

        const supportNow=supports.map(s=>
            pileFlowPositionAt(g,s,t,depth+1,nextSeen,memo)
        );
        const expected=referencePileFlowPoint(seg,q);

        if(supports.length>=2){
            const intersections=pileFlowCircleIntersections(
                supportNow[0],supportNow[1]
            );
            if(intersections.length){
                intersections.sort((a,b)=>
                    pileFlowPhysicalDist(a,expected)-
                    pileFlowPhysicalDist(b,expected)
                );
                return intersections[0];
            }
        }

        const support=supports[0];
        const now=supportNow[0];
        const t0=Number.isFinite(seg.pileFlowStart)?seg.pileFlowStart:t;
        const t1=Number.isFinite(seg.pileFlowEnd)?seg.pileFlowEnd:t;
        const s0=pileFlowPositionAt(g,support,t0,depth+1,nextSeen,memo);
        const s1=pileFlowPositionAt(g,support,t1,depth+1,nextSeen,memo);
        const H=HEX_ROW_H;

        let a0=Math.atan2(
            (seg.from[1]-s0[1])*H,
            (seg.from[0]-s0[0])*0.5
        );
        let a1=Math.atan2(
            (seg.to[1]-s1[1])*H,
            (seg.to[0]-s1[0])*0.5
        );
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const a=a0+da*q;

        return [
            now[0]+Math.cos(a)/0.5,
            now[1]+Math.sin(a)/H
        ];
    }

    pileFlowPointForBall=function(
        g,ball,seg,q,t,depth=0,seen=null,memo=null
    ){
        if(ball && !isGarbageBall(ball))
            return referencePileFlowPointForBall(
                g,ball,seg,q,t,depth,seen,memo
            );
        return v9PileFlowPointForBall(
            g,ball,seg,q,t,depth,seen,memo
        );
    };

    function referenceScheduleFreshPileFlow(g,fresh){
        if(!fresh.length)return;

        const stateByBall=new Map();
        for(const q of fresh){
            if(!stateByBall.has(q.ball.id)){
                const v=g.vis.get(q.ball.id);
                stateByBall.set(q.ball.id,{
                    vy:Math.max(0,v?.vy||RELEASE_INITIAL_VY),
                    speed:Math.max(0,v?.motionSpeed||0)
                });
            }
            q.seg._pileNominalDuration=referencePileFlowNominalDuration(
                q.seg,stateByBall.get(q.ball.id)
            );
        }

        const seqs=[...new Set(fresh.map(q=>q.seq))].sort((a,b)=>a-b);
        const bySeq=new Map(seqs.map(seq=>[seq,[]]));
        for(const q of fresh)bySeq.get(q.seq).push(q);

        let previousStart=Math.max(0,g.pileFlowClock||0);

        for(let wi=0;wi<seqs.length;wi++){
            const seq=seqs[wi];
            const entries=bySeq.get(seq);
            const segs=entries.map(q=>q.seg);
            const duration=Math.max(
                1/120,
                ...segs.map(seg=>seg._pileNominalDuration||1/120)
            );

            let earliest=wi===0
                ? Math.max(0,g.pileFlowClock||0)
                : previousStart+PILE_FLOW_MIN_WAVE_GAP;

            for(const {ball,seg} of entries){
                const path=ball.fallPath||[];
                const idx=path.indexOf(seg);
                if(idx>0){
                    for(let j=idx-1;j>=0;j--){
                        const prev=path[j];
                        if(Number.isFinite(prev?.pileFlowEnd)){
                            earliest=Math.max(earliest,prev.pileFlowEnd);
                            break;
                        }
                    }
                }
            }

            const priorEnds=[];
            for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
                const b=valid(x,y)?g.board[y][x]:null;
                if(!b?.fallPath)continue;
                for(const seg of b.fallPath)
                    if(seg?.pileFlow &&
                       Number.isFinite(seg.pileFlowEnd) &&
                       !segs.includes(seg))
                        priorEnds.push(seg.pileFlowEnd);
            }

            const sequentialFallback=Math.max(
                earliest,...priorEnds,earliest
            );
            let start=earliest;
            let safe=false;

            while(
                start<=sequentialFallback+
                    PILE_FLOW_SCHEDULE_STEP+1e-9
            ){
                if(pileFlowWaveSafe(g,segs,start,duration)){
                    safe=true;
                    break;
                }
                start+=PILE_FLOW_SCHEDULE_STEP;
            }

            if(!safe){
                start=sequentialFallback;
                for(const seg of segs){
                    seg.pileFlowStart=start;
                    seg.pileFlowDuration=duration;
                    seg.pileFlowEnd=start+duration;
                }
            }

            previousStart=start;
        }
    }

    scheduleFreshPileFlow=function(g,fresh){
        if(!fresh?.length)return;

        const garbage=[];
        const normal=[];
        for(const q of fresh){
            if(isGarbageBall(q?.ball))garbage.push(q);
            else normal.push(q);
        }

        // Keep the current v9 scheduler untouched for garbage.
        if(garbage.length)
            v9ScheduleFreshPileFlow(g,garbage);

        // Normal balls use the exact scheduling/timing policy from index-2.html.
        if(normal.length)
            referenceScheduleFreshPileFlow(g,normal);
    };

    if(typeof window!=="undefined"){
        window.__hexdropNormalMotionV10={
            source:"uploaded index-2.html",
            normalRigidMembers:3,
            persistentTwoBallPair:false,
            normalPileSharedWaveDuration:true,
            garbageUsesV9:true
        };
    }
})();
