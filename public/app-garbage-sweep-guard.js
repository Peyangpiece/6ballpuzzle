/* Garbage swept-collision guard.
 *
 * Scheduled pileFlow bypasses the generic visual clamp, so guard the complete
 * 120 Hz path against every NON-SUPPORT obstacle. A pivot/topPivot or explicit
 * movingSupportId/followSupportIds identifies the ball that this analytic path
 * is intentionally tangent to; treating that same support as a generic blocker
 * creates a repeated stop at the exact contact point.
 */
(function installGarbageSweepGuard(){
    if(typeof window==="undefined"||window.__hexGarbageSweepGuard)return;
    window.__hexGarbageSweepGuard=true;

    const baseUpdateScheduledPileFlowVisual=updateScheduledPileFlowVisual;
    const SWEEP_MIN=Math.max(0.9990,HEX_MIN_DIST-2e-5);
    const SWEEP_SAMPLES=72;
    const BISECT_STEPS=18;
    const ARC_CONTACT_TOL=0.045;
    const SUPPORT_POS_TOL=0.055;

    function physicalDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function boardBalls(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(ball)out.push(ball);
        }
        return out;
    }
    function isSettledPileBall(ball){if(!ball)return false;if(!ball.isGarbage)return true;return ball.garbagePileSettled===true;}
    function activeSeg(cell){return Array.isArray(cell?.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;}
    function explicitSupport(seg,other){
        if(!seg||!other)return false;
        if(Number(seg.movingSupportId)===other.id)return true;
        return Array.isArray(seg.followSupportIds)&&seg.followSupportIds.includes(other.id);
    }
    function pivotSupportAt(g,seg,other,t){
        const pivot=Array.isArray(seg?.pivot)?seg.pivot:(Array.isArray(seg?.topPivot)?seg.topPivot:null);
        if(!pivot||!other)return false;
        const p=pileFlowPositionAt(g,other,t);
        return Array.isArray(p)&&physicalDist(p,pivot)<=SUPPORT_POS_TOL;
    }
    function isDesignatedSupport(g,cell,other,t){
        const seg=activeSeg(cell);
        return explicitSupport(seg,other)||pivotSupportAt(g,seg,other,t);
    }

    function collisionAt(g,cell,t,obstacles){
        const a=pileFlowPositionAt(g,cell,t);let nearest=null;
        for(const other of obstacles){
            if(isDesignatedSupport(g,cell,other,t))continue;
            const b=pileFlowPositionAt(g,other,t),d=physicalDist(a,b);
            if(d<SWEEP_MIN&&(!nearest||d<nearest.d))nearest={other,pos:b,d};
        }
        return nearest?{a,...nearest}:null;
    }
    function firstSweptCollision(g,cell,t0,t1){
        if(!(t1>t0+1e-12))return null;
        const obstacles=boardBalls(g).filter(b=>b!==cell);if(!obstacles.length)return null;
        let lastSafe=t0;
        for(let i=1;i<=SWEEP_SAMPLES;i++){
            const t=t0+(t1-t0)*(i/SWEEP_SAMPLES),hit=collisionAt(g,cell,t,obstacles);
            if(!hit){lastSafe=t;continue;}
            let lo=lastSafe,hi=t;
            for(let k=0;k<BISECT_STEPS;k++){const mid=(lo+hi)*.5;if(collisionAt(g,cell,mid,obstacles))hi=mid;else lo=mid;}
            const atHit=collisionAt(g,cell,hi,obstacles)||hit;return{safeT:lo,hitT:hi,blocker:atHit.other,blockerPos:atHit.pos};
        }
        return null;
    }
    function shiftRemainingSchedule(path,delay){
        if(!(delay>1e-10)||!Array.isArray(path))return;
        for(const seg of path){if(!seg?.pileFlow)continue;if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delay;if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delay;}
    }
    function tryTangentReroute(g,cell,v,blocker,safePos){
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null,seg=path?.[0];
        if(!seg?.to||seg.topPivot||!blocker||!isSettledPileBall(blocker))return false;
        const blockerPos=pileFlowPositionAt(g,blocker,g.pileFlowClock),d0=physicalDist(safePos,blockerPos),d1=physicalDist(seg.to,blockerPos);
        if(Math.abs(d0-1)>ARC_CONTACT_TOL||Math.abs(d1-1)>ARC_CONTACT_TOL)return false;
        if(seg.to[1]<safePos[1]-1e-6)return false;
        seg.from=[...safePos];seg.pivot=[...blockerPos];delete seg.topPivot;delete seg._hexGravityProfile;delete seg._hexGravityLinear;delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;
        if(Array.isArray(blocker.fallPath)&&blocker.fallPath.length){seg.followSupportIds=[blocker.id];seg.movingSupportId=blocker.id;}else{delete seg.followSupportIds;delete seg.movingSupportId;}
        const state={vy:Math.max(0,v.vy||0),speed:Math.max(SLIDE_SPEED,v.motionSpeed||0)},duration=Math.max(1/120,pileFlowNominalDuration(seg,state));
        seg.pileFlowStart=g.pileFlowClock;seg.pileFlowDuration=duration;seg.pileFlowEnd=g.pileFlowClock+duration;seg.garbageSweepRerouted=true;
        v.vy=Math.max(0,state.vy||0);v.motionSpeed=Math.max(SLIDE_SPEED,state.speed||0);return true;
    }

    updateScheduledPileFlowVisual=function(g,cell,v,dt,pileMemo){
        if(!cell?.isGarbage)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null,seg=path?.[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const now=Math.max(0,g.pileFlowClock||0),previous=Math.max(seg.pileFlowStart,now-Math.max(0,dt||0)),collision=firstSweptCollision(g,cell,previous,now);
        if(!collision)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const safePos=pileFlowPositionAt(g,cell,collision.safeT),oldY=Number.isFinite(v.y)?v.y:safePos[1];
        v.x=safePos[0];v.y=Math.max(oldY,safePos[1]);v.vy=0;v.motionSpeed=0;v.pileFlow=true;v.garbageSweepBlocked=true;v.garbageSweepBlockCount=(v.garbageSweepBlockCount||0)+1;
        v.garbageSweepBlockerId=collision.blocker?.id;
        v.garbageSweepSafeT=collision.safeT;
        v.garbageSweepHitT=collision.hitT;
        seg.garbageSweepBlockerId=collision.blocker?.id;
        seg.garbageSweepBlockCount=(seg.garbageSweepBlockCount||0)+1;
        const delay=Math.max(1e-9,now-collision.safeT);shiftRemainingSchedule(path,delay);
        if(tryTangentReroute(g,cell,v,collision.blocker,[v.x,v.y]))v.garbageSweepBlocked=false;
        return true;
    };
})();
