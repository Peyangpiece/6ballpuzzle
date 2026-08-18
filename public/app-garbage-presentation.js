/* Garbage presentation only: no garbage-specific fall physics.
 *
 * One shaped packet (e.g. all six PYRAMID balls) is one incoming unit.
 * Units are scheduled 0.600 s apart. The familiar bubble/pop appearance is
 * restored by attaching garbageBubbleT to newly created ordinary board balls;
 * there is deliberately no garbageBubbleHold, so the ordinary gravity solver
 * keeps moving during the effect.
 */
(function installGarbagePresentation(){
    if(typeof window==="undefined"||window.__hexGarbagePresentation)return;
    window.__hexGarbagePresentation=true;

    const GARBAGE_UNIT_INTERVAL=0.600;
    window.__hexGarbageUnitInterval=GARBAGE_UNIT_INTERVAL;
    window.__hexGarbageSpawnEffectPreserved=true;

    function garbageEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);
            if(v)out.push({ball,v});
        }
        return out;
    }

    function startedPlanCount(g){
        return Array.isArray(g?.garbagePlans)?g.garbagePlans.reduce((n,p)=>n+(p?._started?1:0),0):0;
    }

    function armEffectForNewGarbage(g,known){
        for(const {ball,v} of garbageEntries(g)){
            if(known.has(ball.id))continue;
            // Restore only the visual age. Never restore the old hold/freeze
            // flags: the ball is already an ordinary falling board ball.
            v.garbageBubbleT=0;
            delete ball.garbageBubbleHold;
            delete ball.garbageSpawnHold;
            known.add(ball.id);
        }
    }

    const basePrepareGarbageBatch=prepareGarbageBatch;
    prepareGarbageBatch=function(g){
        const r=basePrepareGarbageBatch(g);
        if(!g._garbagePresentationKnownIds)g._garbagePresentationKnownIds=new Set();
        g._garbagePresentationKnownIds.clear();
        for(const {ball} of garbageEntries(g)){
            // Existing accumulated balls are not an incoming appearance.
            if(ball.garbagePhaseFrozen)g._garbagePresentationKnownIds.add(ball.id);
        }
        g.garbageNextBallAt=0;
        g.garbagePresentationLastUnitStart=null;
        return r;
    };

    const baseUpdateGarbagePacks=updateGarbagePacks;
    updateGarbagePacks=function(g,dt){
        if(!g._garbagePresentationKnownIds){
            g._garbagePresentationKnownIds=new Set();
            for(const {ball} of garbageEntries(g))g._garbagePresentationKnownIds.add(ball.id);
        }
        const beforePlans=startedPlanCount(g);
        const beforeLoose=(g.garbageLooseIds||[]).length;
        const r=baseUpdateGarbagePacks(g,dt);
        const afterPlans=startedPlanCount(g);
        const afterLoose=(g.garbageLooseIds||[]).length;

        if(afterPlans>beforePlans||afterLoose>beforeLoose){
            armEffectForNewGarbage(g,g._garbagePresentationKnownIds);

            let start=Number.isFinite(g.garbageClock)?g.garbageClock:0;
            if(afterPlans>beforePlans){
                const started=(g.garbagePlans||[]).filter(p=>p?._started&&Number.isFinite(p.actualStartTime));
                if(started.length)start=Math.max(...started.map(p=>p.actualStartTime));
            }
            g.garbagePresentationLastUnitStart=start;
            // Override the legacy 0.5 s presentation cadence only. If ordinary
            // physics is still resolving, spawning can safely wait; the next
            // unit can never start EARLIER than exactly 0.600 s after this one.
            g.garbageNextBallAt=start+GARBAGE_UNIT_INTERVAL;
        }else{
            // A new ordinary garbage ball can also be introduced by a caller
            // before/after the wrapped update. Preserve its appearance too.
            armEffectForNewGarbage(g,g._garbagePresentationKnownIds);
        }
        return r;
    };
})();
