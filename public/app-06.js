/* HEXDROP garbage entry + render collision guard.
 * Airborne garbage is evaluated ball-by-ball. A falling garbage ball becomes
 * a board/lattice ball only when that exact ball reaches a non-garbage settled
 * pile ball or the floor. Other balls from the same packet stay airborne and
 * continue the same absolute-time free fall. Airborne/gridified garbage never
 * acts as the trigger that gridifies another airborne garbage ball.
 */
const HEX_GARBAGE_SHAPE_INTERVAL=0.5;
const HEX_GARBAGE_BUBBLE_DURATION=0.34;
const HEX_GARBAGE_BUBBLE_POP_DURATION=0.14;
const HEX_GARBAGE_FLIGHT_V0=RELEASE_INITIAL_VY;
const HEX_GARBAGE_CONTACT_EPS=1e-7;
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
        const packet={
            ...plan,
            pat:plan.pat.map(([dx,dy])=>[dx,dy]),
            colors:plan.colors.slice(),
            seq:g.garbagePlans.length,
            y:GARBAGE_START_Y,
            vy:0,
            landed:false,
            _started:false,
            flightAge:0,
            contactY:null,
            totalBalls:plan.pat.length,
            landedCount:0,
            entryBalls:[],
            straightAtomic:type==="STRAIGHT"
        };
        reserveGarbagePlan(shadow,packet,-100000-i*100);
        g.garbagePlans.push(packet);
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
    if(!pack.pat.length)return null;
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
    if(!pack.pat.length)return null;
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
    if(!pack?.pat?.length){pack.landed=true;return true;}
    const index=0,[dx,dy]=pack.pat[index];
    const anchor=atEntry?hexGarbageEntryAnchor(g,{...pack,pat:[[dx,dy]]},false):null;
    const contactAnchorY=atEntry?(anchor?.ay??pack.y):hexGarbageBallContactY(g,pack,index);
    if(!Number.isFinite(contactAnchorY))return false;
    const ok=materializeGarbageBallAtContact(g,pack,index,contactAnchorY);
    return !!ok&&pack.landed;
}

function hexGarbageBoardBallById(g,id){
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball?.id===id)return ball;
    }
    return null;
}

function hexGarbageBallContactY(g,pack,index){
    if(!pack?.pat?.[index])return Infinity;
    const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
    let limit=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H-dy;
    for(const [id,ov] of g.vis.entries()){
        if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
        const obstacle=hexGarbageBoardBallById(g,id);
        if(!obstacle||obstacle.isGarbage)continue;
        const hx=Math.abs((px-ov.x)*.5);
        if(hx>=1-1e-10)continue;
        const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
        limit=Math.min(limit,ov.y-dy-vertical);
    }
    return limit;
}

function hexGarbageFlightContactY(g,pack){
    if(!pack?.pat?.length)return Infinity;
    let limit=Infinity;
    for(let i=0;i<pack.pat.length;i++)limit=Math.min(limit,hexGarbageBallContactY(g,pack,i));
    return limit;
}

function hexGarbageSingleLogicalCell(g,x,visualY){
    let y=Math.min(ROWS-1,Math.floor(visualY+1e-9));
    for(;y>=BOARD_MIN_ROW;y--){
        if(valid(x,y)&&!g.board[y][x])return{x,y};
    }
    return null;
}

function materializeGarbageBallAtContact(g,pack,index,contactAnchorY){
    const slot=pack?.pat?.[index];
    if(!slot)return false;
    const [dx,dy]=slot,x=pack.ax+dx,visualY=contactAnchorY+dy;
    const cell=hexGarbageSingleLogicalCell(g,x,visualY);
    if(!cell)return false;

    clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
    const color=pack.colors[index],ball=mkBall(g,color);
    ball.isGarbage=true;
    ball.garbageType=pack.type;
    ball.garbageSourceSeq=pack.seq;
    ball.garbageSourceRole=(pack.totalBalls||0)-(pack.pat.length||0);
    hexPhysClearGroupBall(ball);
    ball.rigid=false;
    g.board[cell.y][cell.x]=ball;noteBoardCell(g.board,cell.y,ball);

    // Airborne garbage is allowed to pass through garbage, but the instant a
    // ball becomes a lattice ball it re-enters the strict no-overlap world.
    // Keep the exact physical contact coordinate when it is already safe;
    // otherwise hand that one ball off at its legal lattice centre. Siblings
    // remain airborne and are not moved or gridified by this correction.
    const handoffY=visualPointSafe(g,-1,cell.x,visualY,HEX_MIN_DIST)?visualY:cell.y;
    setVis(g,ball,cell.x,handoffY,Math.max(0,(pack.vy||0)/HEX_ROW_H));
    const v=g.vis.get(ball.id);
    if(v){
        v.motionSpeed=Math.max(RELEASE_INITIAL_VY,pack.vy||0);
        v.garbageBubbleT=pack.bubbleT;
        v.justReleased=true;
    }

    if(!Array.isArray(pack.entryBalls))pack.entryBalls=[];
    pack.entryBalls.push({id:ball.id,c:ball.c,x:cell.x,y:cell.y,contactY:visualY,handoffY});
    pack.entryY=cell.y;
    pack.lastReleaseTime=g.garbageClock;
    pack.landedCount=(pack.landedCount||0)+1;

    pack.pat.splice(index,1);
    pack.colors.splice(index,1);

    if(settlePass(g.board))g.ver++;
    g.ver++;

    if(pack.pat.length===0){
        pack.landed=true;
        pack.releaseTime=g.garbageClock;
    }
    return true;
}

function materializeGarbageContactsThrough(g,pack,desiredY){
    if(!pack?.pat?.length)return 0;
    let hitIndex=-1,hitY=Infinity;
    for(let i=0;i<pack.pat.length;i++){
        const cy=hexGarbageBallContactY(g,pack,i);
        if(desiredY+HEX_GARBAGE_CONTACT_EPS>=cy&&cy<hitY){hitY=cy;hitIndex=i;}
    }
    if(hitIndex<0)return 0;
    return materializeGarbageBallAtContact(g,pack,hitIndex,hitY)?1:0;
}

function materializeGarbagePackAtContact(g,pack){
    const before=pack?.pat?.length||0;
    materializeGarbageContactsThrough(g,pack,pack?.y??GARBAGE_START_Y);
    return (pack?.pat?.length||0)<before;
}

function updateGarbagePacks(g,dt){
    g.garbageClock+=dt;

    let releasedBubble=false;
    for(let y=boardScanMin(g.board);y<=0;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball?.garbageBubbleHold&&g.garbageClock+1e-9>=(ball.garbageBubbleUntil||0)){delete ball.garbageBubbleHold;releasedBubble=true;}
    }
    if(releasedBubble&&settlePass(g.board))g.ver++;

    const next=g.garbagePlans.find(p=>!p._started);
    if(next&&g.garbageClock+1e-9>=g.garbageNextBallAt){
        const scheduledStart=g.garbageNextBallAt;
        next._started=true;
        next.actualStartTime=scheduledStart;
        next.y=GARBAGE_START_Y;
        next.vy=0;
        next.flightAge=0;
        next.bubbleT=0;
        if(!Number.isFinite(next.totalBalls))next.totalBalls=next.pat.length;
        if(!Number.isFinite(next.landedCount))next.landedCount=0;
        if(!Array.isArray(next.entryBalls))next.entryBalls=[];
        g.activeGarbagePacks.push(next);
        g.garbageNextBallAt=scheduledStart+HEX_GARBAGE_SHAPE_INTERVAL;
    }

    for(const p of g.activeGarbagePacks){
        if(p.landed)continue;
        p.bubbleT=Math.max(0,g.garbageClock-(p.actualStartTime||0));
        if(p.bubbleT+1e-9<HEX_GARBAGE_BUBBLE_DURATION){p.y=GARBAGE_START_Y;p.vy=0;continue;}

        const flightAge=Math.max(0,p.bubbleT-HEX_GARBAGE_BUBBLE_DURATION);
        p.flightAge=flightAge;
        const desiredY=GARBAGE_START_Y+(HEX_GARBAGE_FLIGHT_V0*flightAge+.5*GRAV*flightAge*flightAge)/HEX_ROW_H;
        p.vy=HEX_GARBAGE_FLIGHT_V0+GRAV*flightAge;
        p.y=desiredY;
        p.contactY=hexGarbageFlightContactY(g,p);
        materializeGarbageContactsThrough(g,p,desiredY);
        if(!p.pat.length){p.landed=true;p.releaseTime=g.garbageClock;}
    }

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
