/* HEXDROP continuous trajectory renderer.
 * The logical unified solver records legal event segments. This file only
 * assigns causal absolute times and evaluates those same trajectories.
 * There is no fixed wave gap and no legacy rescue/fallback scheduler.
 */
function hexMotionPhysicalDist(seg){
    if(!seg?.from||!seg?.to)return 0;
    return Math.hypot((seg.to[0]-seg.from[0])*0.5,(seg.to[1]-seg.from[1])*HEX_ROW_H);
}
function hexMotionDuration(seg,state={vy:0,speed:0}){
    if(!seg?.from||!seg?.to)return 1/120;
    const H=HEX_ROW_H;
    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const startY=cellCenterYNorm(seg.from[1]);
        const supportY=cellCenterYNorm(py);
        const contactY=supportY-1;
        const fallDist=Math.max(0,contactY-startY);
        const v0=Math.max(0,state.vy||0);
        const fallT=fallDist>1e-9
            ?(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallDist)))/Math.max(0.0001,GRAV)
            :0;
        const tx=latticeRealX(seg.to[0]),ty=cellCenterYNorm(seg.to[1]);
        const sx=latticeRealX(px),sy=cellCenterYNorm(py);
        let da=Math.atan2(ty-sy,tx-sx)+Math.PI/2;
        while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const arcT=Math.abs(da)/Math.max(0.0001,SLIDE_SPEED);
        state.speed=SLIDE_SPEED;
        state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(-Math.PI/2+da))/H);
        return Math.max(1/120,fallT+arcT);
    }
    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        state.speed=SLIDE_SPEED;
        state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(a1))/H);
        return Math.max(1/120,Math.abs(da)/Math.max(0.0001,SLIDE_SPEED));
    }
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(Math.abs(dx)<1e-9&&dy>0){
        const dist=dy*H,v0=Math.max(0,state.vy||0);
        const t=(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*dist)))/Math.max(0.0001,GRAV);
        state.vy=v0+GRAV*t;state.speed=Math.max(state.speed||0,state.vy);
        return Math.max(1/120,t);
    }
    const dist=hexMotionPhysicalDist(seg);
    const speed=Math.max(SLIDE_SPEED,state.speed||0);
    state.speed=speed;
    state.vy=Math.max(0,dy*H/Math.max(1e-9,dist/speed));
    return Math.max(1/120,dist/speed);
}
function liveSegDuration(seg){return hexMotionDuration(seg,{vy:0,speed:0});}

function liveSegPoint(seg,t,startState=null,duration=null){
    t=Math.max(0,Math.min(1,t));
    if(!seg?.from||!seg?.to)return [0,0];
    const H=HEX_ROW_H;
    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const sx=latticeRealX(seg.from[0]),sy=cellCenterYNorm(seg.from[1]);
        const cx=latticeRealX(px),cy=cellCenterYNorm(py),contactY=cy-1;
        const fallDist=Math.max(0,contactY-sy);
        // Use the same inherited velocity as hexMotionDuration().  Previously
        // duration carried the incoming velocity while the sampled position
        // silently restarted from rest, producing a speed kink exactly where
        // a free-falling ball first touched a protrusion.
        const v0=Math.max(0,startState?.vy||0);
        const fallT=fallDist>1e-9
            ?(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallDist)))/Math.max(0.0001,GRAV)
            :0;
        const tx=latticeRealX(seg.to[0]),ty=cellCenterYNorm(seg.to[1]);
        let da=Math.atan2(ty-cy,tx-cx)+Math.PI/2;
        while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const arcT=Math.abs(da)/Math.max(0.0001,SLIDE_SPEED);
        const naturalTotal=Math.max(1e-9,fallT+arcT);
        const total=Number.isFinite(duration)?Math.max(1e-9,duration):naturalTotal;
        const elapsed=t*total;
        if(elapsed<=fallT&&fallT>1e-9){
            const q=Math.max(0,Math.min(1,(v0*elapsed+.5*GRAV*elapsed*elapsed)/Math.max(1e-9,fallDist)));
            return [(sx+(cx-sx)*q)/0.5,(sy+(contactY-sy)*q-BOARD_TOP_CENTER_N)/H];
        }
        const q=arcT<=1e-9?1:Math.max(0,Math.min(1,(elapsed-fallT)/arcT));
        const a=-Math.PI/2+da*q;
        return [(cx+Math.cos(a))/0.5,(cy+Math.sin(a)-BOARD_TOP_CENTER_N)/H];
    }
    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const a=a0+da*t;
        return [px+Math.cos(a)/0.5,py+Math.sin(a)/H];
    }
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    let q=t;
    if(Math.abs(dx)<1e-9&&dy>0){
        if(startState&&Number.isFinite(duration)){
            const dist=Math.max(1e-9,dy*H),elapsed=t*Math.max(0,duration);
            q=Math.max(0,Math.min(1,((Math.max(0,startState.vy||0)*elapsed)+.5*GRAV*elapsed*elapsed)/dist));
        }else q=t*t;
    }
    return [seg.from[0]+dx*q,seg.from[1]+dy*q];
}
function pileFlowPoint(seg,t){return liveSegPoint(seg,t);}

function hexContinuousSegments(g){
    const out=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath))continue;
        for(let i=0;i<ball.fallPath.length;i++){
            const seg=ball.fallPath[i];
            if(seg?.to)out.push({ball,seg,index:i,seq:Number(seg.motionSeq)||0});
        }
    }
    return out;
}
function hexScheduleContinuousPaths(g,reason="continuous"){
    const all=hexContinuousSegments(g);
    if(!all.length)return {balls:0,segments:0};
    g._pileFlowBallById=new Map(all.map(q=>[q.ball.id,q.ball]));
    const now=Math.max(0,g.pileFlowClock||0);
    const lastEndByBall=new Map();
    const endByBallSeq=new Map();
    const stateByBall=new Map();
    const seqs=[...new Set(all.map(q=>q.seq))].sort((a,b)=>a-b);

    for(const seq of seqs){
        const entries=all.filter(q=>q.seq===seq);
        const durations=[];
        let start=now;
        for(const q of entries){
            start=Math.max(start,lastEndByBall.get(q.ball.id)||now);
            for(const sid of q.seg.followSupportIds||[]){
                // Following a moving support is simultaneous when it belongs to
                // this event. Only an earlier support event is a causal wait.
                const dep=endByBallSeq.get(sid+":"+(seq-1));
                if(Number.isFinite(dep))start=Math.max(start,dep);
            }
            if(!stateByBall.has(q.ball.id)){
                const v=g.vis.get(q.ball.id);
                stateByBall.set(q.ball.id,{vy:Math.max(0,v?.vy||0),speed:Math.max(0,v?.motionSpeed||0)});
            }
            const motionState=stateByBall.get(q.ball.id),startState={...motionState};
            const duration=hexMotionDuration(q.seg,motionState);
            q._pileDuration=duration;q._pileStartState=startState;
            durations.push(duration);
        }
        const duration=Math.max(1/120,...durations);
        for(const q of entries){
            q.seg.pileFlow=true;
            q.seg.pileFlowReason=reason;
            q.seg.pileFlowStart=start;
            q.seg.pileFlowDuration=duration;
            q.seg.pileFlowEnd=start+duration;
            q.seg.pileFlowStartVy=Math.max(0,q._pileStartState?.vy||0);
            q.seg.pileFlowNaturalDuration=q._pileDuration||duration;
            q.seg.continuousChain=true;
            lastEndByBall.set(q.ball.id,start+duration);
            endByBallSeq.set(q.ball.id+":"+seq,start+duration);
        }
    }
    return {balls:new Set(all.map(q=>q.ball.id)).size,segments:all.length};
}
function markPileFlowPaths(g,reason="continuous"){return hexScheduleContinuousPaths(g,reason);}
function scheduleFreshPileFlow(g,fresh){return hexScheduleContinuousPaths(g,"continuous");}
function repairPileFlowSegmentGeometry(){return;}

function updateScheduledPileFlowVisual(g,cell,v,dt,memo=null){
    const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
    if(!path||!path.length)return false;

    while(path.length&&path[0]?.pileFlow&&Number.isFinite(path[0].pileFlowEnd)&&g.pileFlowClock>=path[0].pileFlowEnd-1e-10){
        v.x=path[0].to[0];v.y=path[0].to[1];
        path.shift();
    }
    if(!path.length){
        delete cell.fallPath;v.pileFlow=false;v.vy=0;v.motionSpeed=0;return true;
    }
    const seg=path[0];
    if(!seg?.pileFlow)return false;
    if(g.pileFlowClock<seg.pileFlowStart-1e-10)return true;

    const oldX=v.x,oldY=v.y;
    const [nx0,ny0]=pileFlowPositionAt(g,cell,g.pileFlowClock,0,null,memo);
    let nx=nx0,ny=ny0;

    // Render collision uses the same no-overlap invariant. This is a clamp to
    // first contact, not a fallback motion or lateral correction.
    const clamped=clampVisualSegment(g,cell.id,oldX,oldY,nx,ny);
    nx=clamped[0];ny=clamped[1];
    v.x=nx;v.y=ny;
    if(seg.pivot)g._visualArcPivotById?.set(cell.id,seg.pivot);
    else if(seg.topPivot)g._visualArcPivotById?.set(cell.id,seg.topPivot);
    const physical=Math.hypot((v.x-oldX)*0.5,(v.y-oldY)*HEX_ROW_H);
    v.motionSpeed=physical/Math.max(1e-9,dt);
    v.vy=Math.max(0,(v.y-oldY)*HEX_ROW_H/Math.max(1e-9,dt));
    v.pileFlow=true;
    return true;
}

function prepareContinuousPileFlow(g,reason="continuous"){
    const before=physicsSignature(g);
    settleAll(g.board);
    const after=physicsSignature(g);
    const tagged=hexScheduleContinuousPaths(g,reason);
    const moved=before!==after||tagged.segments>0;
    if(moved)g.ver++;
    return {moved,...tagged};
}

function collectLiveMotionBatch(g){
    let seq=Infinity;
    const all=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell||!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
        const seg=cell.fallPath[0];
        if(!seg?.to||seg.pileFlow||!seg.motionSeq)continue;
        const v=g.vis.get(cell.id);if(!v)continue;
        const startState={vy:Math.max(0,v?.vy||0),speed:Math.max(0,v?.motionSpeed||0)};
        const endState={...startState},duration=hexMotionDuration(seg,endState);
        all.push({cell,v,x,y,seg,duration,startState,endState});
        seq=Math.min(seq,seg.motionSeq);
    }
    if(!Number.isFinite(seq))return null;
    const members=all.filter(m=>m.seg.motionSeq===seq);
    return {seq,members,byId:new Map(members.map(m=>[m.cell.id,m])),duration:Math.max(1/120,...members.map(m=>m.duration))};
}

function liveBatchPointAt(batch,member,t,states,memo=new Map(),stack=new Set()){
    if(!member)return [0,0];
    const id=member.cell.id;
    if(memo.has(id))return memo.get(id);
    if(member.seg.kind==="FOLLOW_SUPPORT"&&!stack.has(id)){
        const sid=member.seg.followSupportIds?.[0],support=batch.byId?.get(sid);
        if(support){
            stack.add(id);
            const sp=liveBatchPointAt(batch,support,t,states,memo,stack);
            stack.delete(id);
            const out=[member.seg.from[0]+sp[0]-support.seg.from[0],member.seg.from[1]+sp[1]-support.seg.from[1]];
            memo.set(id,out);return out;
        }
    }
    const st=states?.get(id),out=liveSegPoint(member.seg,t,st?.startState,st?.naturalDuration);
    memo.set(id,out);return out;
}

// Pure render-time sampling for the small fixed-step look-ahead used by the
// canvas renderer. The old call site referenced this function without a
// definition, aborting requestAnimationFrame as soon as a pile collapse began.
function pileFlowPositionAt(g,cell,clock,index=0,state=null,memo=null){
    const path=Array.isArray(cell?.fallPath)?cell.fallPath:null;
    const v=cell?g?.vis?.get(cell.id):null;
    if(!path||!path.length)return [v?.x??0,v?.y??0];
    const key=cell.id+":"+index+":"+clock;
    if(memo?.has(key))return memo.get(key);
    let point=[v?.x??path[0]?.from?.[0]??0,v?.y??path[0]?.from?.[1]??0];
    for(let i=Math.max(0,index);i<path.length;i++){
        const seg=path[i];if(!seg?.to)continue;
        if(!seg.pileFlow){point=[...seg.from];break;}
        if(clock<seg.pileFlowStart){point=[...seg.from];break;}
        if(clock<=seg.pileFlowEnd){
            const t=(clock-seg.pileFlowStart)/Math.max(1e-9,seg.pileFlowDuration);
            if(seg.kind==="FOLLOW_SUPPORT"){
                const sid=seg.followSupportIds?.[0],support=g?._pileFlowBallById?.get(sid);
                if(support){
                    const supportPath=Array.isArray(support.fallPath)?support.fallPath:[];
                    const supportIndex=Math.max(0,supportPath.findIndex(q=>q?.motionSeq===seg.motionSeq));
                    const sp=pileFlowPositionAt(g,support,clock,supportIndex,null,memo);
                    const supportSeg=supportPath[supportIndex];
                    point=supportSeg?.from?[seg.from[0]+sp[0]-supportSeg.from[0],seg.from[1]+sp[1]-supportSeg.from[1]]:liveSegPoint(seg,t,{vy:seg.pileFlowStartVy||0},seg.pileFlowNaturalDuration||seg.pileFlowDuration);
                }else point=liveSegPoint(seg,t,{vy:seg.pileFlowStartVy||0},seg.pileFlowNaturalDuration||seg.pileFlowDuration);
            }else point=liveSegPoint(seg,t,{vy:seg.pileFlowStartVy||0},seg.pileFlowNaturalDuration||seg.pileFlowDuration);
            break;
        }
        point=[...seg.to];
    }
    if(memo)memo.set(key,point);
    return point;
}
