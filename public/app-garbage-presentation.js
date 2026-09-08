/* Garbage presentation only.
 *
 * Spawn cadence and fall physics belong exclusively to
 * app-garbage-normal-physics.js and the later continuous-gravity authority.
 * This layer only arms the bubble/pop visual when a new incoming garbage ball
 * appears on the board. It never changes garbageNextBallAt, fallPath, solver
 * order, targets, rigidity, collision rules or settle timing.
 */
(function installGarbagePresentation(){
    if(typeof window==="undefined"||window.__hexGarbagePresentation)return;
    if(typeof prepareGarbageBatch!=="function"||typeof updateGarbagePacks!=="function")return;
    window.__hexGarbagePresentation=true;

    function garbageEntries(g){
        if(typeof window.__hexGetGarbagePhaseBallCache==="function")
            return window.__hexGetGarbagePhaseBallCache(g).garbage;
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball?.isGarbage)out.push({ball,v:g.vis.get(ball.id)});
        }
        return out;
    }

    function knownSet(g){
        if(!(g._garbagePresentationKnownIds instanceof Set))
            g._garbagePresentationKnownIds=new Set();
        return g._garbagePresentationKnownIds;
    }

    function armNewVisuals(g){
        const known=knownSet(g);
        let armed=0;
        for(const {ball,v} of garbageEntries(g)){
            if(known.has(ball.id))continue;
            known.add(ball.id);
            if(v){
                v.garbageBubbleT=0;
                armed++;
            }
            delete ball.garbageBubbleHold;
            delete ball.garbageSpawnHold;
        }
        if(armed){
            window.__sixBallLastGarbagePresentationArm={
                count:armed,
                clock:Number(g.garbageClock)||0,
                at:Date.now()
            };
        }
        return armed;
    }

    const basePrepareGarbageBatch=prepareGarbageBatch;
    prepareGarbageBatch=function(g){
        const r=basePrepareGarbageBatch(g);
        g._garbagePresentationKnownIds=new Set(
            garbageEntries(g)
                .filter(q=>q.ball?.garbagePhaseFrozen)
                .map(q=>q.ball.id)
        );
        armNewVisuals(g);
        return r;
    };

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        const r=baseUpdateGarbagePacks(g,dt);
        armNewVisuals(g);
        return r;
    };

    window.__hexGarbageUnitInterval=HEX_GARBAGE_SHAPE_INTERVAL;
    window.__hexGarbageSpawnEffectPreserved=true;
    window.__hexGarbagePresentationVisualOnly=true;
    window.__hexGarbagePresentationChangesCadence=false;
    window.__hexGarbagePresentationChangesPhysics=false;
    window.__hexGarbageUnitLocalTimeline=false;
})();
