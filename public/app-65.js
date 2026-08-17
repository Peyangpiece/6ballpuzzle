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
        // Lower members enter first so a later upper member never waits for a
        // support which exists only in the future. Preserve source order inside
        // the same row for deterministic reproduction.
        slots.sort((a,b)=>b.slot[1]-a.slot[1]||a.index-b.index);
        for(const s of slots){
            const clone={...pack,colors:Array.isArray(pack.colors)?pack.colors.slice():[]};
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
    const now=Number(g.garbageClock)||0;
    // A start which would fall anywhere inside a delayed update is moved to the
    // update boundary. This prevents app-06 from backdating the new ball and
    // advancing it through its bubble/flight in the very frame it was created.
    if(next&&Number.isFinite(g.garbageNextBallAt)&&
       g.garbageNextBallAt<now+h-1e-9){
        g.garbageNextBallAt=now+h;
    }
    const beforeStarted=new Set((g.garbagePlans||[]).filter(p=>p._started).map(p=>p));
    const result=__hex65UpdateGarbagePacksBeforeNoCatchup(g,h);
    const started=(g.garbagePlans||[]).find(p=>p._started&&!beforeStarted.has(p));
    if(started){
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
 * guard. Keep that internal chunking harmless by chaining every remaining
 * attack in the same GARBAGE phase before normal play can resume. */
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
        g.garbageNextBallAt=(Number(g.garbageClock)||0)+HEX65_GARBAGE_BALL_INTERVAL;
        g.stateT=0;
        return false;
    }
    return true;
};
