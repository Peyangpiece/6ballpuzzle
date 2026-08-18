/* Garbage visible-overlap guard.
 *
 * Garbage exists in two representations during a batch: gridified board balls
 * and unresolved members still inside activeGarbagePacks. Neither representation
 * may visually overlap another garbage ball. This layer is collision-only: it
 * never changes which surface is allowed to trigger lattice entry.
 */
(function installGarbageVisibleOverlapGuard(){
    if(typeof window==="undefined"||window.__hexGarbageVisibleOverlapGuard)return;
    window.__hexGarbageVisibleOverlapGuard=true;

    const MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const SWEEP_SAMPLES=72;
    const BISECT_STEPS=18;
    const SEP_EPS=2e-6;

    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

    function unresolvedPackPoints(g){
        const out=[];
        for(const pack of g?.activeGarbagePacks||[]){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat))continue;
            for(let i=0;i<pack.pat.length;i++){
                const q=pack.pat[i];if(q)out.push({pack,index:i,pos:[pack.ax+q[0],pack.y+q[1]]});
            }
        }
        return out;
    }

    function collisionWithPackAt(g,cell,t,points){
        const a=pileFlowPositionAt(g,cell,t);let nearest=null;
        for(const p of points){const d=physDist(a,p.pos);if(d<MIN&&(!nearest||d<nearest.d))nearest={point:p,d};}
        return nearest?{a,...nearest}:null;
    }

    function firstPackSweep(g,cell,t0,t1,points){
        if(!(t1>t0+1e-12)||!points.length)return null;
        const start=collisionWithPackAt(g,cell,t0,points);
        if(start)return{safeT:t0,hitT:t0,point:start.point,startedOverlapping:true};
        let lastSafe=t0;
        for(let i=1;i<=SWEEP_SAMPLES;i++){
            const t=t0+(t1-t0)*(i/SWEEP_SAMPLES),hit=collisionWithPackAt(g,cell,t,points);
            if(!hit){lastSafe=t;continue;}
            let lo=lastSafe,hi=t;
            for(let k=0;k<BISECT_STEPS;k++){const mid=(lo+hi)*.5;if(collisionWithPackAt(g,cell,mid,points))hi=mid;else lo=mid;}
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

    // Gridified garbage must also sweep against unresolved pack members, which
    // are invisible to the ordinary board-only collision guard.
    const baseUpdateScheduledPileFlowVisual=updateScheduledPileFlowVisual;
    updateScheduledPileFlowVisual=function(g,cell,v,dt,pileMemo){
        if(!cell?.isGarbage)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const path=Array.isArray(cell.fallPath)?cell.fallPath:null,seg=path?.[0];
        if(!seg?.pileFlow||!Number.isFinite(seg.pileFlowStart)||!Number.isFinite(seg.pileFlowEnd))
            return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const points=unresolvedPackPoints(g);
        if(!points.length)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const now=Math.max(0,g.pileFlowClock||0),previous=Math.max(seg.pileFlowStart,now-Math.max(0,dt||0));
        const hit=firstPackSweep(g,cell,previous,now,points);
        if(!hit)return baseUpdateScheduledPileFlowVisual(g,cell,v,dt,pileMemo);
        const safe=hit.startedOverlapping?[v.x,v.y]:pileFlowPositionAt(g,cell,hit.safeT),oldY=Number.isFinite(v.y)?v.y:safe[1];
        v.x=safe[0];v.y=Math.max(oldY,safe[1]);v.vy=0;v.motionSpeed=0;v.pileFlow=true;
        v.garbagePairBlocked=true;v.garbagePairBlockCount=(v.garbagePairBlockCount||0)+1;
        shiftSchedule(path,Math.max(1e-9,now-hit.safeT));
        return true;
    };

    function boardGarbageVisuals(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    // A descending unresolved pack is held at the first tangent against any
    // board garbage. This does NOT gridify it and therefore preserves the rule
    // that only the pre-drop pile/floor triggers the airborne -> lattice state.
    function clampPacksAgainstBoardGarbage(g,beforeY){
        const obstacles=boardGarbageVisuals(g);if(!obstacles.length)return;
        const H=HEX_ROW_H;
        for(const pack of g?.activeGarbagePacks||[]){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat)||!pack.pat.length)continue;
            const originalY=beforeY.get(pack)??pack.y;let safeY=pack.y;
            for(const q of pack.pat){
                const px=pack.ax+q[0],dy=q[1];
                for(const {v} of obstacles){
                    const hx=Math.abs((px-v.x)*.5);if(hx>=MIN-1e-12)continue;
                    const vertical=Math.sqrt(Math.max(0,MIN*MIN-hx*hx))/H;
                    const upperLimit=v.y-dy-vertical,pointY=safeY+dy;
                    if(pointY>upperLimit-1e-10&&pointY<=v.y+vertical+1e-7)safeY=Math.min(safeY,upperLimit);
                }
            }
            if(safeY<pack.y-1e-10){
                pack.y=safeY;pack.vy=0;pack._garbagePairHeld=true;pack._garbagePairHoldY=safeY;
                pack._garbagePairHoldCount=(pack._garbagePairHoldCount||0)+1;
            }else if(pack.y>=originalY-1e-10){delete pack._garbagePairHeld;delete pack._garbagePairHoldY;}
        }
    }

    function firstSeq(ball){
        const seg=Array.isArray(ball?.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
        const a=Number(seg?.pileFlowOriginalSeq),b=Number(seg?.motionSeq);
        return Number.isFinite(a)&&a>0?a:(Number.isFinite(b)&&b>0?b:0);
    }
    function immutableOriginal(g,q){return g?.garbageOriginalPileIds instanceof Set&&g.garbageOriginalPileIds.has(q.ball.id);}
    function settled(q){return q.ball.garbagePileSettled===true;}

    function moveHorizontalAway(q,other,needPhysical){
        if(!(needPhysical>1e-12))return 0;
        let dir=Math.sign(q.v.x-other.v.x);
        if(!dir)dir=Math.sign(q.x-other.x);
        if(!dir){const left=q.v.x,right=(W2-1)-q.v.x;dir=right>=left?1:-1;}
        const wanted=needPhysical/.5+SEP_EPS;
        const old=q.v.x;
        let nx=Math.max(0,Math.min(W2-1,old+dir*wanted));
        let gain=Math.abs(nx-old)*.5;
        if(gain<needPhysical*.95){
            const alt=Math.max(0,Math.min(W2-1,old-dir*wanted));
            const altGain=Math.abs(alt-old)*.5;
            if(altGain>gain){nx=alt;gain=altGain;}
        }
        q.v.x=nx;
        if(gain>0){q.v.garbagePairSeparated=true;q.v.garbagePairSeparateCount=(q.v.garbagePairSeparateCount||0)+1;}
        return gain;
    }

    // app-17 intentionally restores queued garbage after its generic resolver.
    // That can restore a small overlap between two waiting members. Apply one
    // final garbage-only hard constraint after every resolver call. Pre-existing
    // pile garbage is immutable; settled pairs are snapped to their exact lattice
    // centres; otherwise the later-moving member yields by the minimum X amount.
    function enforceBoardGarbageSeparation(g){
        const items=boardGarbageVisuals(g);if(items.length<2)return;
        for(let pass=0;pass<48;pass++){
            let changed=false;
            for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
                const a=items[i],b=items[j];
                let dx=(a.v.x-b.v.x)*.5,dy=(a.v.y-b.v.y)*HEX_ROW_H,d=Math.hypot(dx,dy);
                if(d>=MIN-1e-9)continue;
                changed=true;

                if(settled(a)&&settled(b)&&!immutableOriginal(g,a)&&!immutableOriginal(g,b)){
                    a.v.x=a.x;a.v.y=a.y;b.v.x=b.x;b.v.y=b.y;
                    continue;
                }

                const immA=immutableOriginal(g,a),immB=immutableOriginal(g,b);
                if(immA&&immB)continue;
                let mover,other;
                if(immA){mover=b;other=a;}
                else if(immB){mover=a;other=b;}
                else if(settled(a)&&!settled(b)){mover=b;other=a;}
                else if(settled(b)&&!settled(a)){mover=a;other=b;}
                else{
                    const sa=firstSeq(a.ball),sb=firstSeq(b.ball);
                    if(sa!==sb){mover=sa>sb?a:b;other=mover===a?b:a;}
                    else{mover=a.ball.id>b.ball.id?a:b;other=mover===a?b:a;}
                }

                const vertical=Math.abs((mover.v.y-other.v.y)*HEX_ROW_H);
                const requiredHx=vertical<MIN?Math.sqrt(Math.max(0,MIN*MIN-vertical*vertical)):0;
                const currentHx=Math.abs((mover.v.x-other.v.x)*.5);
                let remaining=Math.max(0,requiredHx-currentHx);
                remaining-=moveHorizontalAway(mover,other,remaining);

                if(remaining>1e-7&&!immutableOriginal(g,other)&&!settled(other)){
                    remaining-=moveHorizontalAway(other,mover,remaining);
                }

                // Recheck. Horizontal projection is preferred because garbage
                // may never rebound upward; board geometry normally provides
                // enough lateral room for this final tiny correction.
                dx=(a.v.x-b.v.x)*.5;dy=(a.v.y-b.v.y)*HEX_ROW_H;d=Math.hypot(dx,dy);
                if(d<MIN-5e-7){
                    const q=!immutableOriginal(g,mover)?mover:other;
                    if(q&&!immutableOriginal(g,q)){
                        let dir=Math.sign(q.v.x-(q===a?b.v.x:a.v.x));if(!dir)dir=q.v.x<(W2-1)/2?1:-1;
                        q.v.x=Math.max(0,Math.min(W2-1,q.v.x+dir*((MIN-d)/.5+SEP_EPS)));
                    }
                }
            }
            if(!changed)break;
        }
    }

    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        const out=baseResolveVisualContacts(g);
        enforceBoardGarbageSeparation(g);
        return out;
    };

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        const beforeY=new Map();for(const pack of g?.activeGarbagePacks||[])if(pack)beforeY.set(pack,pack.y);
        const out=baseUpdateGarbagePacks(g,dt);
        clampPacksAgainstBoardGarbage(g,beforeY);
        enforceBoardGarbageSeparation(g);
        return out;
    };

    // Cosmetic future prediction can bypass the just-resolved constraint. During
    // drawSide only, garbage uses the actual resolved g.vis centre. Ordinary pile
    // keeps renderLead and therefore retains its existing smoothness.
    const baseDrawSide=drawSide;
    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        if(!g||!(renderLead>1e-7)||!g.board||!g.vis)return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        const held=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);if(!v||!v.pileFlow)continue;held.push(v);v.pileFlow=false;
        }
        try{return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);}
        finally{for(const v of held)v.pileFlow=true;}
    };

    window.__hexGarbagePairClamp=clampPacksAgainstBoardGarbage;
    window.__hexGarbagePairSeparation=enforceBoardGarbageSeparation;
})();
