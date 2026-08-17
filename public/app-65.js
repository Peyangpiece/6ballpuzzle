/* Garbage scheduling regression repair.
 *
 * Reference/spec invariant:
 * - every incoming garbage BALL starts individually;
 * - consecutive start times are at least 0.5 s apart;
 * - a dropped/render-stalled frame never catches up by starting several balls
 *   close together;
 * - technique placement planning is retained, but a multi-ball shape packet is
 *   decomposed into single-ball entry plans (lower rows before upper rows);
 * - normal play does not resume merely because the old eight-packet chunk has
 *   finished while more technique garbage is still pending.
 */
const HEX65_GARBAGE_BALL_INTERVAL=0.5;
window.__hexdropGarbageInterval=HEX65_GARBAGE_BALL_INTERVAL;

function hex65SingleBallPlanFromSlot(pack,slot,index,serial){
    const [dx,dy]=slot;
    const color=pack.colors?.[index];
    const targetY=Number.isFinite(pack.targetY)?pack.targetY+dy:pack.targetY;
    return{
        ...pack,
        ax:pack.ax+dx,
        targetY,
        pat:[[0,0]],
        colors:[color],
        seq:serial,
        y:GARBAGE_START_Y,
        vy:0,
        landed:false,
        _started:false,
        flightAge:0,
        contactY:null,
        totalBalls:1,
        landedCount:0,
        entryBalls:[],
        straightAtomic:false,
        _hexSourceShapeSeq:pack.seq,
        _hexSourceShapeRole:index,
        _hexSourceShapeDx:dx,
        _hexSourceShapeDy:dy
    };
}
function hex65ExpandPlansToBalls(plans){
    const out=[];
    for(const pack of plans||[]){
        if(!pack?.pat?.length)continue;
        const slots=pack.pat.map((slot,index)=>({slot:[slot[0],slot[1]],index,color:pack.colors?.[index]}));
        // Lower members must enter first so later upper members never wait for a
        // support that only exists in the future.  Within one row, preserve the
        // original pattern order for deterministic reproduction.
        slots.sort((a,b)=>b.slot[1]-a.slot[1]||a.index-b.index);
        for(const s of slots){
            const clone={...pack,colors:Array.isArray(pack.colors)?pack.colors.slice():[]};
            // Preserve the slot's original colour after sorting.
            clone.colors[s.index]=s.color;
            out.push(hex65SingleBallPlanFromSlot(clone,s.slot,s.index,out.length));
        }
    }
    return out;
}

const __hex65PrepareGarbageBatchBeforeBallSplit=prepareGarbageBatch;
prepareGarbageBatch=function(g){
    if(g.garbageBatchPrepared)return;
    __hex65PrepareGarbageBatchBeforeBallSplit(g);
    if(!g.garbageBatchPrepared)return;
    const expanded=hex65ExpandPlansToBalls(g.garbagePlans);
    g.garbagePlans=expanded;
    g.activeGarbagePacks=[];
    g.garbageSeq=expanded.length;
    g.garbageMaterializeIndex=0;
    g.garbageNextBallAt=Math.max(0,Number(g.garbageClock)||0);
    g.garbageWatchdogLimit=Math.max(
        6,
        (expanded.length+(Number(g.garbLeft)||0))*HEX65_GARBAGE_BALL_INTERVAL+
        HEX_GARBAGE_BUBBLE_DURATION+6
    );
};

const __hex65UpdateGarbagePacksBeforeNoCatchup=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const h=Math.max(0,Number(dt)||0);
    const next=(g.garbagePlans||[]).find(p=>!p._started);
    // If a browser pause made the due time stale, schedule this ONE ball for
    // the end of the current physics update.  Never backdate its start.
    if(next&&Number.isFinite(g.garbageNextBallAt)&&
       g.garbageNextBallAt<(Number(g.garbageClock)||0)-1e-9){
        g.garbageNextBallAt=(Number(g.garbageClock)||0)+h;
    }
    const beforeStarted=new Set((g.garbagePlans||[]).filter(p=>p._started).map(p=>p));
    const result=__hex65UpdateGarbagePacksBeforeNoCatchup(g,h);
    const started=(g.garbagePlans||[]).find(p=>p._started&&!beforeStarted.has(p));
    if(started){
        // app-06 bases the next deadline on its scheduled time.  Make the
        // rendered/physical start that actually occurred the sole authority.
        const actual=Number(g.garbageClock)||0;
        started.actualStartTime=actual;
        started._hexActualStartTime=actual;
        started.bubbleT=0;
        started.flightAge=0;
        started.y=GARBAGE_START_Y;
        started.vy=0;
        g.garbageNextBallAt=actual+HEX65_GARBAGE_BALL_INTERVAL;
    }
    return result;
};

/* The CHECK phase still chunks incomingShapes to eight for an old performance
 * guard.  Keep that internal chunking harmless by chaining the next chunk in
 * the same GARBAGE phase before normal play can resume. */
const __hex65GarbageBatchDoneBeforeContinuousQueue=garbageBatchDone;
garbageBatchDone=function(g){
    const done=__hex65GarbageBatchDoneBeforeContinuousQueue(g);
    if(!done)return false;
    if(Array.isArray(g.incomingShapes)&&g.incomingShapes.length){
        g.garbShapes=g.incomingShapes.splice(0);
        g.garbagePlans=[];
        g.activeGarbagePacks=[];
        g.garbageBatchPrepared=false;
        g.garbageSeq=0;
        g.garbageMaterializeIndex=0;
        // Keep the full 0.5 s gap across the old batch boundary too.
        g.garbageNextBallAt=(Number(g.garbageClock)||0)+HEX65_GARBAGE_BALL_INTERVAL;
        g.stateT=0;
        return false;
    }
    return true;
};
