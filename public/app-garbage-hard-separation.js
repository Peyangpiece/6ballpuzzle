/* Garbage-to-garbage continuous frame clamp.
 *
 * Independent garbage trajectories are clamped at their first tangent. When
 * two MOVING garbage balls meet, do not automatically stop both: if the lower
 * (or earlier) ball can continue from the tangent while increasing/maintaining
 * one-diameter separation, only the other ball yields. Explicit moving-support
 * pairs are already solved analytically and are excluded unless they illegally
 * converge on the same endpoint.
 */
(function installGarbageHardSeparation(){
    if(typeof window==="undefined"||window.__hexGarbageHardSeparation)return;
    window.__hexGarbageHardSeparation=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5),SAMPLES=48,BISECT=22,ADVANCE_SAMPLES=24;
    function physicalDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function pointAt(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
    function boardItems(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);if(ball?.isGarbage&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});}return out;}
    function hardStationary(g,q){if(g?.garbageOriginalPileIds instanceof Set&&g.garbageOriginalPileIds.has(q.ball.id))return true;return q.ball.garbagePileSettled===true&&(!Array.isArray(q.ball.fallPath)||q.ball.fallPath.length===0);}
    function firstSeg(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;}
    function follows(seg,id){if(Number(seg?.movingSupportId)===id)return true;return Array.isArray(seg?.followSupportIds)&&seg.followSupportIds.includes(id);}
    function causalSupportPair(a,b){return follows(firstSeg(a.ball),b.ball.id)||follows(firstSeg(b.ball),a.ball.id);}
    function sameEndpoint(a,b){const sa=firstSeg(a.ball),sb=firstSeg(b.ball);return Array.isArray(sa?.to)&&Array.isArray(sb?.to)&&physicalDist(sa.to,sb.to)<1e-7;}
    function causalPairStillValid(a,b){return causalSupportPair(a,b)&&!sameEndpoint(a,b);}
    function motionSeq(ball){const s=firstSeg(ball),a=Number(s?.pileFlowOriginalSeq),b=Number(s?.motionSeq);if(Number.isFinite(a)&&a>0)return a;if(Number.isFinite(b)&&b>0)return b;return Infinity;}
    function scheduleShift(ball,delay,blockerId){
        if(!(delay>1e-10))return;
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        for(let i=0;i<path.length;i++){
            const seg=path[i];if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delay;
            if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delay;
            if(i===0){seg.garbageRealCollisionDelay=true;seg.garbageRealCollisionDelayCount=(seg.garbageRealCollisionDelayCount||0)+1;seg.garbageRealCollisionBlockerId=blockerId;}
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
    function canAdvanceAway(tangent,end,otherTangent){
        let prev=physicalDist(tangent,otherTangent);
        for(let i=1;i<=ADVANCE_SAMPLES;i++){
            const p=pointAt(tangent,end,i/ADVANCE_SAMPLES),d=physicalDist(p,otherTangent);
            if(d<MIN-3e-6)return false;
            if(i<=3&&d<prev-2e-5)return false;
            prev=d;
        }
        return true;
    }
    function choosePreferredWinner(a,b,aT,bT){
        if(Math.abs(aT[1]-bT[1])>.012)return aT[1]>bT[1]?a:b;
        const sa=motionSeq(a.ball),sb=motionSeq(b.ball);if(sa!==sb)return sa<sb?a:b;
        return a.ball.id<b.ball.id?a:b;
    }
    function clampOne(q,start,end,t,other,dt){
        const p=pointAt(start,end,t),lost=Math.max(0,1-t)*Math.max(0,dt||0);
        q.v.x=p[0];q.v.y=Math.max(start[1],p[1]);q.v.vy=0;q.v.motionSpeed=0;
        q.v.garbageFrameContactClamped=true;q.v.garbageFrameContactClampCount=(q.v.garbageFrameContactClampCount||0)+1;q.v.garbageFrameContactBlockerId=other.ball.id;
        scheduleShift(q.ball,lost,other.ball.id);
    }
    function clampGarbageFrame(g,before,dt){
        const list=boardItems(g);if(list.length<2)return;
        const resolvedPairs=new Set();
        for(let pass=0;pass<8;pass++){
            let changed=false;
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
                const a=list[i],b=list[j],pairKey=a.ball.id<b.ball.id?a.ball.id+":"+b.ball.id:b.ball.id+":"+a.ball.id;
                if(resolvedPairs.has(pairKey))continue;
                const a1=[a.v.x,a.v.y],b1=[b.v.x,b.v.y];
                if(causalPairStillValid(a,b)){resolvedPairs.add(pairKey);continue;}
                const a0=movementStart(a,before),b0=movementStart(b,before),hardA=hardStationary(g,a),hardB=hardStationary(g,b);
                if(hardA&&hardB){resolvedPairs.add(pairKey);continue;}
                const sa=hardA?a1:a0,sb=hardB?b1:b0,t=firstUnsafeFraction(sa,a1,sb,b1);if(t===null){resolvedPairs.add(pairKey);continue;}
                changed=true;
                const aT=pointAt(sa,a1,t),bT=pointAt(sb,b1,t);
                if(hardA){clampOne(b,sb,b1,t,a,dt);resolvedPairs.add(pairKey);continue;}
                if(hardB){clampOne(a,sa,a1,t,b,dt);resolvedPairs.add(pairKey);continue;}
                const preferred=choosePreferredWinner(a,b,aT,bT),other=preferred===a?b:a;
                const wT=preferred===a?aT:bT,wEnd=preferred===a?a1:b1,lT=preferred===a?bT:aT;
                if(canAdvanceAway(wT,wEnd,lT)){
                    if(other===a)clampOne(a,sa,a1,t,b,dt);else clampOne(b,sb,b1,t,a,dt);
                    preferred.v.garbageContactYieldWinner=true;resolvedPairs.add(pairKey);continue;
                }
                const otherEnd=other===a?a1:b1;
                if(canAdvanceAway(lT,otherEnd,wT)){
                    if(preferred===a)clampOne(a,sa,a1,t,b,dt);else clampOne(b,sb,b1,t,a,dt);
                    other.v.garbageContactYieldWinner=true;resolvedPairs.add(pairKey);continue;
                }
                clampOne(a,sa,a1,t,b,dt);clampOne(b,sb,b1,t,a,dt);resolvedPairs.add(pairKey);
            }
            if(!changed)break;
        }
    }
    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){const before=new Map();for(const q of boardItems(g))before.set(q.ball.id,[q.v.x,q.v.y]);const out=baseUpdateVisuals(g,dt);clampGarbageFrame(g,before,dt);return out;};
    window.__hexHardSeparateGarbage=function(g){const before=new Map();for(const q of boardItems(g))before.set(q.ball.id,[q.v.x,q.v.y]);clampGarbageFrame(g,before,0);};
    window.__hexGarbageFrameClamp=clampGarbageFrame;
})();
