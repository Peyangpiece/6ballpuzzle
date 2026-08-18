/* Garbage visible-overlap guard.
 *
 * Two distinct representations coexist during a garbage batch:
 *   1) gridified garbage balls in g.board / g.vis;
 *   2) unresolved members still inside activeGarbagePacks.
 * The normal visual resolver sees only (1). After the first-contact lattice
 * handoff was made more faithful, a gridified member could therefore pass very
 * slightly through a still-unresolved sibling even though board-to-board
 * collision tests all passed.
 *
 * This layer closes that representation gap without changing the rule for what
 * causes lattice entry. Current-batch garbage still NEVER becomes the contact
 * trigger for another airborne member. It is only a collision obstacle:
 * - gridified garbage is swept against unresolved pack centres;
 * - a descending unresolved pack is clamped at first contact with board garbage;
 * - cosmetic renderLead is disabled for garbage so drawing cannot reintroduce
 *   an overlap after physics has already resolved it.
 */
(function installGarbageVisibleOverlapGuard(){
    if(typeof window==="undefined"||window.__hexGarbageVisibleOverlapGuard)return;
    window.__hexGarbageVisibleOverlapGuard=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const SWEEP_SAMPLES=72;
    const BISECT_STEPS=18;

    function physDist(a,b){
        return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);
    }

    function unresolvedPackPoints(g){
        const out=[];
        for(const pack of g?.activeGarbagePacks||[]){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat))continue;
            for(let i=0;i<pack.pat.length;i++){
                const q=pack.pat[i];
                if(!q)continue;
                out.push({pack,index:i,pos:[pack.ax+q[0],pack.y+q[1]]});
            }
        }
        return out;
    }

    function collisionWithPackAt(g,cell,t,points){
        if(!points.length)return null;
        const a=pileFlowPositionAt(g,cell,t);
        let nearest=null;
        for(const p of points){
            const d=physDist(a,p.pos);
            if(d<MIN&&(!nearest||d<nearest.d))nearest={point:p,d};
        }
        return nearest?{a,...nearest}:null;
    }

    function firstPackSweep(g,cell,t0,t1,points){
        if(!(t1>t0+1e-12)||!points.length)return null;
        const start=collisionWithPackAt(g,cell,t0,points);
        if(start)return{safeT:t0,hitT:t0,point:start.point,startedOverlapping:true};
        let lastSafe=t0;
        for(let i=1;i<=SWEEP_SAMPLES;i++){
            const t=t0+(t1-t0)*(i/SWEEP_SAMPLES);
            const hit=collisionWithPackAt(g,cell,t,points);
            if(!hit){lastSafe=t;continue;}
            let lo=lastSafe,hi=t;
            for(let k=0;k<BISECT_STEPS;k++){
                const mid=(lo+hi)*.5;
                if(collisionWithPackAt(g,cell,mid,points))hi=mid;else lo=mid;
            }
            const atHit=collisionWithPackAt(g,cell,hi,points)||hit;
            return{safeT:lo,hitT:hi,point:atHit.point,startedOverlapping:false};
        }
        return null;
    }

    function shiftSchedule(path,delay){
        if(!(delay>1e-10)||!Array.isArray(path))return;
        for(const seg of path){
            if(!seg?.pileFlow)continue;
            if(Number.isFinite(seg.pileFlowStart))seg.pileFlowStart+=delay;
            if(Number.isFinite(seg.pileFlowEnd))seg.pileFlowEnd+=delay;
        }
    }

    // app-garbage-sweep-guard already protects board-ball obstacles. This outer
    // wrapper adds unresolved pack members, which are not present in g.board.
    const baseUpdateScheduledPileFlowVisual=updateScheduledPileFlowVisual;
    updateScheduledPileFlowVisual=function(g,cell,v,dt,pileMemo){
        if(!cell?.isGarbage)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
        const seg=path?.[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))
            return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);

        const points=unresolvedPackPoints(g);
        if(!points.length)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);

        const now=Math.max(0,g.pileFlowClock||0);
        const previous=Math.max(seg.pileFlowStart,now-Math.max(0,dt||0));
        const hit=firstPackSweep(g,cell,previous,now,points);
        if(!hit)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);

        // If overlap already existed at the beginning of this tick, do not move
        // the gridified ball farther into it. The pack-side clamp below removes
        // the overlap before the frame is rendered.
        const safe=hit.startedOverlapping?[v.x,v.y]:pileFlowPositionAt(g,cell,hit.safeT);
        const oldY=Number.isFinite(v.y)?v.y:safe[1];
        v.x=safe[0];
        v.y=Math.max(oldY,safe[1]);
        v.vy=0;
        v.motionSpeed=0;
        v.pileFlow=true;
        v.garbagePairBlocked=true;
        v.garbagePairBlockCount=(v.garbagePairBlockCount||0)+1;

        const delay=Math.max(1e-9,now-hit.safeT);
        shiftSchedule(path,delay);
        return true;
    };

    function boardGarbageVisuals(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    // Clamp only the pack's downward display motion. This is collision-only and
    // never calls materializeGarbageBallAtContact, so same-batch garbage does not
    // become a lattice-entry trigger. Moving the whole pack preserves its rigid
    // shape while it waits for the board garbage below to clear/settle.
    function clampPacksAgainstBoardGarbage(g,beforeY){
        const obstacles=boardGarbageVisuals(g);
        if(!obstacles.length)return;
        const H=HEX_ROW_H;

        for(const pack of g?.activeGarbagePacks||[]){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat)||!pack.pat.length)continue;
            const originalY=beforeY.get(pack) ?? pack.y;
            let safeY=pack.y;

            for(const q of pack.pat){
                const px=pack.ax+q[0],dy=q[1];
                for(const {v} of obstacles){
                    const hx=Math.abs((px-v.x)*.5);
                    if(hx>=MIN-1e-12)continue;
                    const vertical=Math.sqrt(Math.max(0,MIN*MIN-hx*hx))/H;
                    const upperLimit=v.y-dy-vertical;
                    const pointY=safeY+dy;
                    // Incoming/unresolved members approach obstacles from above.
                    // If the new free-flight position would enter the forbidden
                    // circle, stop exactly at the upper tangent/contact height.
                    if(pointY>upperLimit-1e-10&&pointY<=v.y+vertical+1e-7){
                        safeY=Math.min(safeY,upperLimit);
                    }
                }
            }

            if(safeY<pack.y-1e-10){
                // Continuous collision: normally safeY lies between the previous
                // and proposed Y. If an old frame already overlapped, allow the
                // minimal upward correction once so the rendered frame is valid.
                pack.y=safeY;
                pack.vy=0;
                pack._garbagePairHeld=true;
                pack._garbagePairHoldY=safeY;
                pack._garbagePairHoldCount=(pack._garbagePairHoldCount||0)+1;
            }else if(pack.y>=originalY-1e-10){
                delete pack._garbagePairHeld;
                delete pack._garbagePairHoldY;
            }
        }
    }

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        const beforeY=new Map();
        for(const pack of g?.activeGarbagePacks||[])if(pack)beforeY.set(pack,pack.y);
        const out=baseUpdateGarbagePacks(g,dt);
        clampPacksAgainstBoardGarbage(g,beforeY);
        return out;
    };

    // drawSide adds up to one 120 Hz tick of cosmetic future prediction. During
    // drawing only, make garbage use its already collision-resolved g.vis centre.
    // Ordinary pile renderLead remains enabled.
    const baseDrawSide=drawSide;
    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        if(!g||!(renderLead>1e-7)||!g.board||!g.vis){
            return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        }

        const held=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);
            if(!v||!v.pileFlow)continue;
            held.push(v);
            v.pileFlow=false;
        }

        try{
            return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        }finally{
            for(const v of held)v.pileFlow=true;
        }
    };

    window.__hexGarbagePairClamp=clampPacksAgainstBoardGarbage;
})();
