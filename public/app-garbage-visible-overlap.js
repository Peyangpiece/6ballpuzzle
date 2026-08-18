/* Garbage visible-overlap guard.
 *
 * Gridified garbage and unresolved packet members are advanced by different
 * subsystems in the same 120 Hz frame. Collision checks must compare them at the
 * SAME time within that frame; treating the packet's final position as fixed can
 * falsely hold a board ball that is actually separating from it.
 */
(function installGarbageVisibleOverlapGuard(){
    if(typeof window==="undefined"||window.__hexGarbageVisibleOverlapGuard)return;
    window.__hexGarbageVisibleOverlapGuard=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const SWEEP_SAMPLES=72;
    const BISECT_STEPS=18;

    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function packBaseAt(pack,t,now){
        const to=Number.isFinite(pack?._collisionFrameToY)?pack._collisionFrameToY:pack.y;
        const from=Number.isFinite(pack?._collisionFrameFromY)?pack._collisionFrameFromY:to;
        const start=Number.isFinite(pack?._collisionFrameClock)?pack._collisionFrameClock:now;
        const dur=Math.max(1e-9,Number.isFinite(pack?._collisionFrameDt)?pack._collisionFrameDt:(now-start));
        const u=Math.max(0,Math.min(1,(t-start)/dur));
        return from+(to-from)*u;
    }
    function unresolvedPackPoints(g){
        const out=[];
        for(const pack of g?.activeGarbagePacks||[]){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat))continue;
            for(let i=0;i<pack.pat.length;i++){
                const q=pack.pat[i];if(!q)continue;
                out.push({pack,index:i,x:pack.ax+q[0],dy:q[1]});
            }
        }
        return out;
    }
    function packPointAt(p,t,now){return[p.x,packBaseAt(p.pack,t,now)+p.dy];}

    function collisionWithPackAt(g,cell,t,points,now){
        const a=pileFlowPositionAt(g,cell,t);let nearest=null;
        for(const p of points){
            const pp=packPointAt(p,t,now),d=physDist(a,pp);
            if(d<MIN&&(!nearest||d<nearest.d))nearest={point:p,pos:pp,d};
        }
        return nearest?{a,...nearest}:null;
    }
    function firstPackSweep(g,cell,t0,t1,points){
        if(!(t1>t0+1e-12)||!points.length)return null;
        const now=Math.max(t1,g.pileFlowClock||0);
        const start=collisionWithPackAt(g,cell,t0,points,now);
        let lastSafe=t0;
        // If the pair starts slightly inside but is separating, do not create a
        // permanent hold. Require the future sample to get deeper before blocking.
        const startD=start?.d??Infinity;
        for(let i=1;i<=SWEEP_SAMPLES;i++){
            const t=t0+(t1-t0)*(i/SWEEP_SAMPLES),hit=collisionWithPackAt(g,cell,t,points,now);
            if(!hit){lastSafe=t;continue;}
            if(start&&hit.d>=startD-2e-5){lastSafe=t;continue;}
            let lo=lastSafe,hi=t;
            for(let k=0;k<BISECT_STEPS;k++){
                const mid=(lo+hi)*.5,h=collisionWithPackAt(g,cell,mid,points,now);
                if(h&&(!start||h.d<startD-2e-5))hi=mid;else lo=mid;
            }
            const atHit=collisionWithPackAt(g,cell,hi,points,now)||hit;
            return{safeT:lo,hitT:hi,point:atHit.point,startedOverlapping:!!start};
        }
        return null;
    }
    function shiftSchedule(path,delay){
        if(!(delay>1e-10)||!Array.isArray(path))return;
        for(const seg of path){if(!seg?.pileFlow)continue;if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delay;if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delay;}
    }

    const baseUpdateScheduledPileFlowVisual=updateScheduledPileFlowVisual;
    updateScheduledPileFlowVisual=function(g,cell,v,dt,pileMemo){
        if(!cell?.isGarbage)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null,seg=path?.[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const points=unresolvedPackPoints(g);if(!points.length)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const now=Math.max(0,g.pileFlowClock||0),previous=Math.max(seg.pileFlowStart,now-Math.max(0,dt||0)),hit=firstPackSweep(g,cell,previous,now,points);
        if(!hit)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const safe=pileFlowPositionAt(g,cell,hit.safeT),oldY=Number.isFinite(v.y)?v.y:safe[1];
        v.x=safe[0];v.y=Math.max(oldY,safe[1]);v.vy=0;v.motionSpeed=0;v.pileFlow=true;
        v.garbagePairBlocked=true;v.garbagePairBlockCount=(v.garbagePairBlockCount||0)+1;
        shiftSchedule(path,Math.max(1e-9,now-hit.safeT));
        return true;
    };

    function boardGarbageVisuals(g){
        const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage)continue;const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y,moving:Array.isArray(ball.fallPath)&&ball.fallPath.length>0});
        }return out;
    }

    // Packet-side clamp is only needed against truly stationary board garbage.
    // Moving board garbage is compared on the shared frame clock above.
    function clampPacksAgainstStationaryBoardGarbage(g,beforeY){
        const obstacles=boardGarbageVisuals(g).filter(q=>!q.moving);if(!obstacles.length)return;
        const H=HEX_ROW_H;
        for(const pack of g?.activeGarbagePacks||[]){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat)||!pack.pat.length)continue;
            const oldY=beforeY.get(pack)??pack.y,proposedY=pack.y;let safeY=proposedY;
            for(const q of pack.pat){
                const px=pack.ax+q[0],dy=q[1];
                for(const {v} of obstacles){
                    const hx=Math.abs((px-v.x)*.5);if(hx>=MIN-1e-12)continue;
                    const vertical=Math.sqrt(Math.max(0,MIN*MIN-hx*hx))/H,upper=v.y-dy-vertical;
                    if(oldY+dy<=upper+1e-9&&proposedY+dy>upper+1e-10)safeY=Math.min(safeY,upper);
                }
            }
            safeY=Math.max(oldY,Math.min(proposedY,safeY));
            if(safeY<proposedY-1e-10){pack.y=safeY;pack.vy=0;pack._garbagePairHeld=true;pack._garbagePairHoldCount=(pack._garbagePairHoldCount||0)+1;}
            else delete pack._garbagePairHeld;
        }
    }

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        const beforeY=new Map();
        for(const p of g?.garbagePlans||[])if(p)beforeY.set(p,p.y);
        const frameClock=Math.max(0,g?.pileFlowClock||0),out=baseUpdateGarbagePacks(g,dt);
        clampPacksAgainstStationaryBoardGarbage(g,beforeY);
        for(const p of g?.activeGarbagePacks||[]){
            if(!p)continue;
            p._collisionFrameFromY=beforeY.get(p)??p.y;
            p._collisionFrameToY=p.y;
            p._collisionFrameClock=frameClock;
            p._collisionFrameDt=Math.max(0,dt||0);
        }
        return out;
    };

    const baseDrawSide=drawSide;
    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        if(!g||!(renderLead>1e-7)||!g.board||!g.vis)return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        const held=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage)continue;const v=g.vis.get(ball.id);if(!v||!v.pileFlow)continue;held.push(v);v.pileFlow=false;}
        try{return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);}finally{for(const v of held)v.pileFlow=true;}
    };

    window.__hexGarbagePairClamp=clampPacksAgainstStationaryBoardGarbage;
})();
