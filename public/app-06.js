/* HEXDROP garbage entry + render collision guard.
 * Garbage shapes are spawn patterns only. After first contact/materialization,
 * every garbage ball uses the same unified pile solver as a normal ball.
 */
const HEX_GARBAGE_SHAPE_INTERVAL=0.5;
const HEX_GARBAGE_BUBBLE_DURATION=0.34;
const HEX_GARBAGE_BUBBLE_POP_DURATION=0.14;
window.__hexdropGarbageInterval=HEX_GARBAGE_SHAPE_INTERVAL;

function prepareGarbageBatch(g){
    if(g.garbageBatchPrepared)return;
    g.garbageBatchPrepared=true;
    g.garbageClock=0;
    g.garbageSeq=0;
    g.garbageMaterializeIndex=0;
    g.garbagePlans=[];
    g.activeGarbagePacks=[];

    const pending=g.garbShapes.splice(0);
    const shadow=cloneBoardForGarbagePlan(g.board);
    for(let i=0;i<pending.length;i++){
        const type=pending[i];
        const plan=chooseGarbagePlan(g,shadow,type,i);
        if(!plan){
            g.garbBlocked=true;
            g.incomingShapes.unshift(...pending.slice(i));
            break;
        }
        reserveGarbagePlan(shadow,plan,-100000-i*100);
        g.garbagePlans.push({
            ...plan,
            seq:g.garbagePlans.length,
            y:GARBAGE_START_Y,
            vy:0,
            landed:false,
            _started:false,
            straightAtomic:type==="STRAIGHT"
        });
    }
    g.garbageSeq=g.garbagePlans.length;
    g.garbageNextBallAt=0;
    g.garbageWatchdogLimit=Math.max(6,(g.garbageSeq+g.garbLeft)*HEX_GARBAGE_SHAPE_INTERVAL+HEX_GARBAGE_BUBBLE_DURATION+6);
    g.ver++;
}

function hexGarbageAnchorVisualSafe(g,pack,ax,ay){
    return pack.pat.every(([dx,dy])=>visualPointSafe(g,-1,ax+dx,ay+dy,HEX_MIN_DIST));
}

function hexGarbageFindAnchor(g,pack,requireVisual=true){
    let ay=shapeFitsAt(g.board,pack.pat,pack.ax,pack.targetY)
        ? pack.targetY
        : deepestRigidAnchor(g.board,pack.pat,pack.ax);
    if(ay!==null&&(!requireVisual||hexGarbageAnchorVisualSafe(g,pack,pack.ax,ay)))return {ax:pack.ax,ay};
    let best=null;
    const minX=Math.min(...pack.pat.map(([x])=>x));
    const maxX=Math.max(...pack.pat.map(([x])=>x));
    for(let ax=-minX;ax<=W2-1-maxX;ax++){
        const yy=deepestRigidAnchor(g.board,pack.pat,ax);
        if(yy===null||(requireVisual&&!hexGarbageAnchorVisualSafe(g,pack,ax,yy)))continue;
        const d=Math.abs(ax-pack.ax);
        if(!best||d<best.d)best={ax,ay:yy,d};
    }
    return best;
}

function hexGarbageEntryAnchor(g,pack,requireVisual=true){
    const parity=((pack.targetY%2)+2)%2,start=parity?-1:-2;
    const minX=Math.min(...pack.pat.map(([x])=>x)),maxX=Math.max(...pack.pat.map(([x])=>x));
    const xs=[];for(let d=0;d<W2;d++){if(pack.ax-d>=-minX)xs.push(pack.ax-d);if(d&&pack.ax+d<=W2-1-maxX)xs.push(pack.ax+d);}
    for(let ay=start;ay>=BOARD_MIN_ROW;ay-=2)for(const ax of xs){
        if(pack.pat.every(([dx,dy])=>valid(ax+dx,ay+dy)&&!g.board[ay+dy][ax+dx])&&
           (!requireVisual||hexGarbageAnchorVisualSafe(g,pack,ax,ay)))return{ax,ay};
    }
    return null;
}

function materializeGarbagePack(g,pack,atEntry=false){
    clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
    const logicalAnchor=atEntry?hexGarbageEntryAnchor(g,pack,false):hexGarbageFindAnchor(g,pack,false);
    if(!logicalAnchor){g.garbBlocked=true;return false;}
    // A logical cell can already be empty while its previous occupant is still
    // travelling away in render space. Spawning into that stale visual centre
    // created two balls at exactly the same coordinates. Wait a frame (or pick
    // another legal anchor) until every new centre is physically clear.
    const anchor=atEntry?hexGarbageEntryAnchor(g,pack,true):hexGarbageFindAnchor(g,pack,true);
    if(!anchor){pack.visualBlocked=true;return false;}
    delete pack.visualBlocked;
    pack.ax=anchor.ax;
    if(atEntry)pack.entryY=anchor.ay;else pack.targetY=anchor.ay;

    const made=[];
    for(let i=0;i<pack.pat.length;i++){
        const [dx,dy]=pack.pat[i];
        const x=pack.ax+dx,y=(atEntry?pack.entryY:pack.targetY)+dy;
        if(!valid(x,y)||g.board[y][x]){g.garbBlocked=true;return false;}
        const ball=mkBall(g,pack.colors[i]);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
        ball.motionGroupId=0;
        ball.motionGroupSize=0;
        ball.rigid=false;
        g.board[y][x]=ball;noteBoardCell(g.board,y,ball);
        setVis(g,ball,x,y,0);
        made.push(ball);
    }

    // Shape identity ends here. From this exact entry/contact state onward these are
    // independent balls governed by the same support/natural-motion solver.
    for(const ball of made){
        hexPhysClearGroupBall(ball);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
    }
    if(atEntry)pack.entryBalls=made.map((ball,i)=>({id:ball.id,c:ball.c,x:pack.ax+pack.pat[i][0],y:pack.entryY+pack.pat[i][1]}));
    // Resolve at most one canonical physics event now. Any remaining motion
    // continues incrementally while later packs enter, keeping each render
    // frame bounded so the opponent board never disappears during garbage.
    if(settlePass(g.board))g.ver++;
    g.ver++;
    return true;
}

function updateGarbagePacks(g,dt){
    g.garbageClock+=dt;

    let releasedBubble=false;
    for(let y=boardScanMin(g.board);y<=0;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball?.garbageBubbleHold&&g.garbageClock+1e-9>=(ball.garbageBubbleUntil||0)){delete ball.garbageBubbleHold;releasedBubble=true;}
    }
    if(releasedBubble&&settlePass(g.board))g.ver++;

    // Start at most one complete shape in one update. Frame drops never create
    // catch-up bursts. PYRAMID/HEXAGON are six-ball units; STRAIGHT is one
    // atomic 19-ball unit. Use the scheduled timestamp so 30/60/120fps all
    // observe the same bubble age and the half-second cadence never drifts.
    const next=g.garbagePlans.find(p=>!p._started);
    if(next&&g.garbageClock+1e-9>=g.garbageNextBallAt){
        const scheduledStart=g.garbageNextBallAt;
        next._started=true;
        next.actualStartTime=scheduledStart;
        next.y=GARBAGE_START_Y;
        next.vy=0;
        next.bubbleT=0;
        g.activeGarbagePacks.push(next);
        g.garbageNextBallAt=scheduledStart+HEX_GARBAGE_SHAPE_INTERVAL;
    }

    for(const p of g.activeGarbagePacks){
        if(p.landed)continue;
        p.bubbleT=Math.max(0,g.garbageClock-(p.actualStartTime||0));
        if(p.bubbleT+1e-9<HEX_GARBAGE_BUBBLE_DURATION)continue;
        // The reference straight attack visibly enters as two top rows and
        // immediately conforms to the uneven pile. Materializing only at a
        // precomputed bottom anchor kept the whole sheet rigid in mid-air.
        // Spawn at the top after the bubble, then give every ball to the same
        // independent gravity/contact solver used by accumulated balls.
        if(materializeGarbagePack(g,p,true)){
            p.bubbleT=HEX_GARBAGE_BUBBLE_DURATION;
            p.releaseTime=g.garbageClock;
            p.landed=true;
            p.vy=0;
        }else if(g.garbBlocked){
            // There is no logical entry at all. This is a true overflow, not a
            // transient render-space conflict.
            p.landed=true;
        }
    }

    // Continue one bounded contact event whenever the previous visible event
    // has finished. This lets early garbage balls keep cascading while the
    // next half-second packet is still bubbling.
    if(pendingFallPathCount(g)===0&&hasLegalGravityMove(g.board)){
        if(settlePass(g.board))g.ver++;
    }

    const shapesDone=g.garbagePlans.every(p=>p.landed);
    if(shapesDone&&g.garbLeft>0&&g.garbageClock+1e-9>=g.garbageNextBallAt){
        const placed=garbageBall(g);
        if(placed===0){
            g.garbBlocked=true;
            g.incoming+=g.garbLeft;
            g.garbLeft=0;
        }else if(placed>0){
            g.garbLeft--;
            g.garbageNextBallAt=g.garbageClock+HEX_GARBAGE_SHAPE_INTERVAL;
            if(settlePass(g.board))g.ver++;
        }
    }
}
function garbageBatchDone(g){
    let bubbleHold=false;for(let y=boardScanMin(g.board);y<=0&&!bubbleHold;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null;if(ball?.garbageBubbleHold){bubbleHold=true;break;}}
    return !bubbleHold&&g.garbagePlans.every(p=>p.landed)&&g.garbLeft===0&&garbageVisualsDone(g);
}
function finishGarbageVisuals(g){}

/* Continuous render-space collision guard. There is no moving-vs-moving
 * exemption: every rendered center must remain at least one diameter apart.
 */
function visualPointSafe(g,id,x,y,minDist=0.999999){
    const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    if(y>maxVisualRowY+1e-7)return false;
    for(const [oid,ov] of g.vis.entries()){
        if(oid===id||!ov)continue;
        const pivot=g._visualArcPivotById?.get(id);
        if(pivot){
            const pdx=(ov.x-pivot[0])*0.5,pdy=(ov.y-pivot[1])*HEX_ROW_H;
            if(pdx*pdx+pdy*pdy<=1e-10)continue;
        }
        const dx=(x-ov.x)*0.5,dy=(y-ov.y)*HEX_ROW_H;
        if(dx*dx+dy*dy<minDist*minDist)return false;
    }
    return true;
}
function visualSegmentSafe(g,id,ox,oy,nx,ny,minDist=0.999999){
    const physical=Math.hypot((nx-ox)*0.5,(ny-oy)*HEX_ROW_H);
    const samples=Math.max(12,Math.min(48,Math.ceil(physical*36)));
    for(let i=1;i<=samples;i++){
        const t=i/samples;
        if(!visualPointSafe(g,id,ox+(nx-ox)*t,oy+(ny-oy)*t,minDist))return false;
    }
    return true;
}
function clampVisualSegment(g,id,ox,oy,nx,ny){
    if(visualSegmentSafe(g,id,ox,oy,nx,ny))return [nx,ny,1];
    let lo=0,hi=1;
    for(let i=0;i<14;i++){
        const m=(lo+hi)*0.5;
        const x=ox+(nx-ox)*m,y=oy+(ny-oy)*m;
        if(visualSegmentSafe(g,id,ox,oy,x,y))lo=m;else hi=m;
    }
    return lo>1e-6?[ox+(nx-ox)*lo,oy+(ny-oy)*lo,lo]:[ox,oy,0];
}