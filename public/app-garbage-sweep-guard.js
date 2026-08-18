/* Garbage swept-collision guard.
 *
 * Scheduled pileFlow normally bypasses the generic clampVisualSegment path in
 * updateVisuals. That is intentional for analytic pile collapse, but it also
 * meant a de-rigidified garbage ball could move from one non-overlapping frame
 * endpoint to another while its in-between trajectory crossed an accumulated
 * ball. Guard the complete 120 Hz time interval, pause a blocked garbage path
 * at first physical contact, and convert a blocked diagonal into a tangent arc
 * when the destination is reachable around the settled support.
 */
(function installGarbageSweepGuard(){
    if(typeof window==="undefined"||window.__hexGarbageSweepGuard)return;
    window.__hexGarbageSweepGuard=true;

    const baseUpdateScheduledPileFlowVisual=updateScheduledPileFlowVisual;
    const SWEEP_MIN=Math.max(0.9990,HEX_MIN_DIST-2e-5);
    const SWEEP_SAMPLES=72;
    const BISECT_STEPS=18;
    const ARC_CONTACT_TOL=0.045;

    function physicalDist(a,b){
        return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);
    }

    function boardBalls(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push(ball);
        }
        return out;
    }

    function isSettledPileBall(ball){
        if(!ball)return false;
        if(!ball.isGarbage)return true;
        return ball.garbagePileSettled===true;
    }

    function collisionAt(g,cell,t,obstacles){
        const a=pileFlowPositionAt(g,cell,t);
        let nearest=null;
        for(const other of obstacles){
            const b=pileFlowPositionAt(g,other,t);
            const d=physicalDist(a,b);
            if(d<SWEEP_MIN&&(!nearest||d<nearest.d))nearest={other,pos:b,d};
        }
        return nearest?{a,...nearest}:null;
    }

    function firstSweptCollision(g,cell,t0,t1){
        if(!(t1>t0+1e-12))return null;
        const obstacles=boardBalls(g).filter(b=>b!==cell);
        if(!obstacles.length)return null;
        let lastSafe=t0;
        for(let i=1;i<=SWEEP_SAMPLES;i++){
            const t=t0+(t1-t0)*(i/SWEEP_SAMPLES);
            const hit=collisionAt(g,cell,t,obstacles);
            if(!hit){lastSafe=t;continue;}
            let lo=lastSafe,hi=t;
            for(let k=0;k<BISECT_STEPS;k++){
                const mid=(lo+hi)*.5;
                if(collisionAt(g,cell,mid,obstacles))hi=mid;else lo=mid;
            }
            const atHit=collisionAt(g,cell,hi,obstacles)||hit;
            return {safeT:lo,hitT:hi,blocker:atHit.other,blockerPos:atHit.pos};
        }
        return null;
    }

    function shiftRemainingSchedule(path,delay){
        if(!(delay>1e-10)||!Array.isArray(path))return;
        for(const seg of path){
            if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delay;
            if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delay;
        }
    }

    function tryTangentReroute(g,cell,v,blocker,safePos){
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
        const seg=path?.[0];
        if(!seg?.to||seg.topPivot||!blocker||!isSettledPileBall(blocker))return false;
        const blockerPos=pileFlowPositionAt(g,blocker,g.pileFlowClock);
        const d0=physicalDist(safePos,blockerPos),d1=physicalDist(seg.to,blockerPos);
        if(Math.abs(d0-1)>ARC_CONTACT_TOL||Math.abs(d1-1)>ARC_CONTACT_TOL)return false;
        if(seg.to[1]<safePos[1]-1e-6)return false;

        seg.from=[...safePos];
        seg.pivot=[...blockerPos];
        delete seg.topPivot;
        delete seg._hexGravityProfile;
        delete seg._hexGravityLinear;
        delete seg.pileFlowStart;
        delete seg.pileFlowDuration;
        delete seg.pileFlowEnd;

        if(Array.isArray(blocker.fallPath)&&blocker.fallPath.length){
            seg.followSupportIds=[blocker.id];
            seg.movingSupportId=blocker.id;
        }else{
            delete seg.followSupportIds;
            delete seg.movingSupportId;
        }

        const state={vy:Math.max(0,v.vy||0),speed:Math.max(SLIDE_SPEED,v.motionSpeed||0)};
        const duration=Math.max(1/120,pileFlowNominalDuration(seg,state));
        seg.pileFlowStart=g.pileFlowClock;
        seg.pileFlowDuration=duration;
        seg.pileFlowEnd=g.pileFlowClock+duration;
        seg.garbageSweepRerouted=true;
        v.vy=Math.max(0,state.vy||0);
        v.motionSpeed=Math.max(SLIDE_SPEED,state.speed||0);
        return true;
    }

    updateScheduledPileFlowVisual=function(g,cell,v,dt,pileMemo){
        if(!cell?.isGarbage)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
        const seg=path?.[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))
            return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);

        const now=Math.max(0,g.pileFlowClock||0);
        const previous=Math.max(seg.pileFlowStart,now-Math.max(0,dt||0));
        const collision=firstSweptCollision(g,cell,previous,now);
        if(!collision)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);

        const safePos=pileFlowPositionAt(g,cell,collision.safeT);
        const oldY=Number.isFinite(v.y)?v.y:safePos[1];
        v.x=safePos[0];
        v.y=Math.max(oldY,safePos[1]);
        v.vy=0;
        v.motionSpeed=0;
        v.pileFlow=true;
        v.garbageSweepBlocked=true;
        v.garbageSweepBlockCount=(v.garbageSweepBlockCount||0)+1;

        // Freeze only this garbage ball's analytic schedule at the exact
        // collision time. Moving blockers can then clear without the absolute
        // clock skipping the ball through them on the following frame.
        const delay=Math.max(1e-9,now-collision.safeT);
        shiftRemainingSchedule(path,delay);

        // If the blocked destination is the adjacent lattice point around a
        // settled support, change the remaining route to the support circle.
        // This reproduces the visible roll/slide rather than leaving a pause.
        if(tryTangentReroute(g,cell,v,collision.blocker,[v.x,v.y])){
            v.garbageSweepBlocked=false;
        }
        return true;
    };
})();