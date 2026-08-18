/* Garbage-to-garbage continuous frame clamp.
 *
 * Never repair penetration by inventing a new horizontal position. If two
 * independent garbage balls would enter each other during a 120 Hz interval,
 * stop their REAL trajectories at first tangent. Explicit follower/support
 * pairs are excluded because pileFlowPointForBall already enforces their exact
 * tangent relation; clamping them again creates artificial mid-air sticking.
 */
(function installGarbageHardSeparation(){
    if(typeof window==="undefined"||window.__hexGarbageHardSeparation)return;
    window.__hexGarbageHardSeparation=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5),SAMPLES=48,BISECT=22;
    function physicalDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function pointAt(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
    function boardItems(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);if(ball?.isGarbage&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});}return out;}
    function hardStationary(g,q){if(g?.garbageOriginalPileIds instanceof Set&&g.garbageOriginalPileIds.has(q.ball.id))return true;return q.ball.garbagePileSettled===true&&(!Array.isArray(q.ball.fallPath)||q.ball.fallPath.length===0);}
    function firstSeg(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;}
    function follows(seg,id){
        if(Number(seg?.movingSupportId)===id)return true;
        return Array.isArray(seg?.followSupportIds)&&seg.followSupportIds.includes(id);
    }
    function causalSupportPair(a,b){return follows(firstSeg(a.ball),b.ball.id)||follows(firstSeg(b.ball),a.ball.id);}
    function scheduleShift(ball,delay){
        if(!(delay>1e-10))return;
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        for(let i=0;i<path.length;i++){
            const seg=path[i];if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delay;
            if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delay;
            if(i===0){seg.garbageRealCollisionDelay=true;seg.garbageRealCollisionDelayCount=(seg.garbageRealCollisionDelayCount||0)+1;}
        }
    }
    function firstUnsafeFraction(a0,a1,b0,b1){
        if(physicalDist(a0,b0)<MIN-1e-7)return null;let last=0;
        for(let i=1;i<=SAMPLES;i++){
            const t=i/SAMPLES,pa=pointAt(a0,a1,t),pb=pointAt(b0,b1,t);if(physicalDist(pa,pb)>=MIN-1e-9){last=t;continue;}
            let lo=last,hi=t;for(let k=0;k<BISECT;k++){const mid=(lo+hi)*.5;if(physicalDist(pointAt(a0,a1,mid),pointAt(b0,b1,mid))>=MIN)lo=mid;else hi=mid;}
            return Math.max(0,lo-1e-8);
        }
        return null;
    }
    function movementStart(q,before){const p=before.get(q.ball.id);if(p)return p;const seg=firstSeg(q.ball);if(Array.isArray(seg?.from)&&Number.isFinite(seg.from[0])&&Number.isFinite(seg.from[1]))return[seg.from[0],seg.from[1]];return[q.v.x,q.v.y];}
    function clampGarbageFrame(g,before,dt){
        const list=boardItems(g);if(list.length<2)return;
        for(let pass=0;pass<20;pass++){
            let changed=false;
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
                const a=list[i],b=list[j];
                if(causalSupportPair(a,b))continue;
                const a1=[a.v.x,a.v.y],b1=[b.v.x,b.v.y],a0=movementStart(a,before),b0=movementStart(b,before),hardA=hardStationary(g,a),hardB=hardStationary(g,b);
                if(hardA&&hardB)continue;
                const sa=hardA?a1:a0,sb=hardB?b1:b0,t=firstUnsafeFraction(sa,a1,sb,b1);if(t===null)continue;
                changed=true;const lost=Math.max(0,1-t)*Math.max(0,dt||0);
                if(!hardA){const p=pointAt(sa,a1,t);a.v.x=p[0];a.v.y=Math.max(sa[1],p[1]);a.v.vy=0;a.v.motionSpeed=0;a.v.garbageFrameContactClamped=true;a.v.garbageFrameContactClampCount=(a.v.garbageFrameContactClampCount||0)+1;scheduleShift(a.ball,lost);}
                if(!hardB){const p=pointAt(sb,b1,t);b.v.x=p[0];b.v.y=Math.max(sb[1],p[1]);b.v.vy=0;b.v.motionSpeed=0;b.v.garbageFrameContactClamped=true;b.v.garbageFrameContactClampCount=(b.v.garbageFrameContactClampCount||0)+1;scheduleShift(b.ball,lost);}
            }
            if(!changed)break;
        }
    }
    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){const before=new Map();for(const q of boardItems(g))before.set(q.ball.id,[q.v.x,q.v.y]);const out=baseUpdateVisuals(g,dt);clampGarbageFrame(g,before,dt);return out;};
    window.__hexHardSeparateGarbage=function(g){const before=new Map();for(const q of boardItems(g))before.set(q.ball.id,[q.v.x,q.v.y]);clampGarbageFrame(g,before,0);};
    window.__hexGarbageFrameClamp=clampGarbageFrame;
})();
