/* Garbage-phase performance isolation.
 *
 * The reference behaviour stays unchanged: airborne garbage is tested per ball,
 * only the ball that reaches settled non-garbage pile/floor gridifies, and pack
 * starts remain 0.5 s apart.  This file only removes duplicate work inside one
 * 120 Hz garbage frame.
 *
 * Before this override hexGarbageBallContactY() iterated g.vis and then scanned
 * the whole logical board again for every visual id.  A 19-ball STRAIGHT could
 * therefore turn a single contact frame into hundreds of thousands of board
 * probes.  Also each materialized member called the full visual contact solver,
 * followed by another identical solver call at the end of updateGarbagePacks().
 *
 * Build the settled non-garbage obstacle list once per garbage update, cache the
 * per-member contact heights for the current packet shape, and defer all nested
 * contact-solver calls to one final solve after the garbage update completes.
 */
function hexGarbagePerfState(g){
    if(!g._hexGarbagePerf)g._hexGarbagePerf={frames:0,obstacleBuilds:0,contactQueries:0,contactCacheHits:0,deferredResolves:0,frameResolves:0};
    return g._hexGarbagePerf;
}

function hexGarbageBuildObstacleFrame(g){
    const obstacles=[];
    const byId=new Map();
    let hasMovingNormal=false;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;
        byId.set(ball.id,ball);
        if(ball.isGarbage)continue;
        const v=g.vis.get(ball.id);
        const vx=v&&Number.isFinite(v.x)?v.x:x;
        const vy=v&&Number.isFinite(v.y)?v.y:y;
        if((Array.isArray(ball.fallPath)&&ball.fallPath.length)||Math.abs(vx-x)>.015||Math.abs(vy-y)>.015)hasMovingNormal=true;
        obstacles.push({id:ball.id,x:vx,y:vy});
    }
    const frame={obstacles,byId,hasMovingNormal};
    g._hexGarbageObstacleFrame=frame;
    hexGarbagePerfState(g).obstacleBuilds++;
    return frame;
}
function hexGarbageObstacleFrame(g){return g._hexGarbageObstacleFrame||hexGarbageBuildObstacleFrame(g);}

const __hexGarbageBoardBallByIdBeforeFrameCache=hexGarbageBoardBallById;
hexGarbageBoardBallById=function(g,id){
    const frame=g?._hexGarbageObstacleFrame;
    if(frame?.byId?.has(id))return frame.byId.get(id);
    return __hexGarbageBoardBallByIdBeforeFrameCache(g,id);
};

const __hexGarbageBallContactYBeforeFrameCache=hexGarbageBallContactY;
hexGarbageBallContactY=function(g,pack,index){
    if(!pack?.pat?.[index])return Infinity;
    const frame=hexGarbageObstacleFrame(g);
    // GARBAGE normally begins only after CHECK found a quiescent pile.  If an
    // invariant violation ever leaves a normal pile ball moving, fall back to
    // the original exact lookup rather than freezing a stale obstacle snapshot.
    if(frame.hasMovingNormal)return __hexGarbageBallContactYBeforeFrameCache(g,pack,index);
    const perf=hexGarbagePerfState(g);perf.contactQueries++;
    const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
    let limit=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H-dy;
    for(const ov of frame.obstacles){
        const hx=Math.abs((px-ov.x)*.5);
        if(hx>=1-1e-10)continue;
        const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
        limit=Math.min(limit,ov.y-dy-vertical);
    }
    return limit;
};

function hexGarbageContactCacheValid(g,pack){
    const c=pack?._hexContactFrame;
    return !!c&&c.clock===g.garbageClock&&c.length===pack.pat.length;
}
function hexGarbageBuildContactFrame(g,pack){
    const values=new Array(pack.pat.length);let min=Infinity;
    for(let i=0;i<pack.pat.length;i++){const y=hexGarbageBallContactY(g,pack,i);values[i]=y;if(y<min)min=y;}
    const c={clock:g.garbageClock,length:pack.pat.length,values,min};
    pack._hexContactFrame=c;
    return c;
}

hexGarbageFlightContactY=function(g,pack){
    if(!pack?.pat?.length)return Infinity;
    if(hexGarbageContactCacheValid(g,pack)){hexGarbagePerfState(g).contactCacheHits++;return pack._hexContactFrame.min;}
    return hexGarbageBuildContactFrame(g,pack).min;
};

materializeGarbageContactsThrough=function(g,pack,desiredY){
    if(!pack?.pat?.length)return 0;
    const cache=hexGarbageContactCacheValid(g,pack)?pack._hexContactFrame:hexGarbageBuildContactFrame(g,pack);
    if(hexGarbageContactCacheValid(g,pack))hexGarbagePerfState(g).contactCacheHits++;
    const hits=[];
    for(let i=0;i<pack.pat.length;i++){
        const cy=cache.values[i];
        if(desiredY+HEX_GARBAGE_CONTACT_EPS>=cy)hits.push({index:i,contactY:cy});
    }
    if(!hits.length)return 0;
    let released=0;
    hits.sort((a,b)=>b.index-a.index);
    for(const hit of hits)if(materializeGarbageBallAtContact(g,pack,hit.index,hit.contactY))released++;
    // Indices change after splicing. Never carry an index-based cache into the
    // next frame or into a second materialization pass.
    delete pack._hexContactFrame;
    return released;
};

// app-18/app-19 have already wrapped resolveVisualContacts by the time app-22
// loads. Keep that complete production solver as the one operation we run at
// the end of a garbage frame.
const __hexResolveVisualContactsBeforeGarbageBatch=resolveVisualContacts;
resolveVisualContacts=function(g){
    if(g?._hexGarbageDeferringVisualSolve){
        g._hexGarbageVisualSolveDirty=true;
        hexGarbagePerfState(g).deferredResolves++;
        return;
    }
    return __hexResolveVisualContactsBeforeGarbageBatch(g);
};

const __hexUpdateGarbagePacksBeforeFrameBatch=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const perf=hexGarbagePerfState(g);perf.frames++;
    g._hexGarbageObstacleFrame=null;
    g._hexGarbageVisualSolveDirty=false;
    g._hexGarbageDeferringVisualSolve=true;
    let result;
    try{
        result=__hexUpdateGarbagePacksBeforeFrameBatch(g,dt);
    }finally{
        g._hexGarbageDeferringVisualSolve=false;
        g._hexGarbageObstacleFrame=null;
    }
    // The original update always requests a final resolve, and individual
    // materializations may request more. They all describe the same completed
    // frame, so one full solve here is sufficient and avoids order-dependent
    // intermediate projections while a packet is being materialized.
    if(g._hexGarbageVisualSolveDirty){
        g._hexGarbageVisualSolveDirty=false;
        perf.frameResolves++;
        __hexResolveVisualContactsBeforeGarbageBatch(g);
    }
    return result;
};
