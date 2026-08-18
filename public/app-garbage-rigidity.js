/* Garbage-shape airborne rigidity.
 * The complete incoming garbage shape is one rigid body until its FIRST real
 * contact with the accumulated pile or floor. A physics frame is never allowed
 * to overshoot that first contact and start splitting the shape below it.
 * Only after the first contact event may individual members hand off to the
 * normal pile-contact / slide / split solver.
 */
(function installGarbageAirborneRigidity(){
    if(typeof window==="undefined"||window.__hexGarbageAirborneRigidity)return;
    window.__hexGarbageAirborneRigidity=true;

    const baseMaterializeThrough=materializeGarbageContactsThrough;
    const CONTACT_TIE_EPS=2e-6;

    function firstRigidContact(g,pack){
        let y=Infinity,hits=[];
        for(let i=0;i<pack.pat.length;i++){
            const cy=hexGarbageBallContactY(g,pack,i);
            if(!Number.isFinite(cy))continue;
            if(cy<y-CONTACT_TIE_EPS){y=cy;hits=[{index:i,cy}];}
            else if(Math.abs(cy-y)<=CONTACT_TIE_EPS)hits.push({index:i,cy});
        }
        return Number.isFinite(y)?{y,hits}:null;
    }

    materializeGarbageContactsThrough=function(g,pack,desiredY){
        if(!pack?.pat?.length)return 0;

        if(!pack._pileContactStarted){
            const first=firstRigidContact(g,pack);
            if(!first||desiredY+HEX_GARBAGE_CONTACT_EPS<first.y)return 0;

            pack.y=first.y;
            pack.contactY=first.y;
            pack._pileContactStarted=true;
            pack._pileContactAnchorY=first.y;
            pack._pileContactClock=Number.isFinite(g?.garbageClock)?g.garbageClock:0;

            let released=0;
            const tied=first.hits.slice().sort((a,b)=>b.index-a.index);
            for(const hit of tied){
                if(hit.index>=pack.pat.length)continue;
                if(materializeGarbageBallAtContact(g,pack,hit.index,first.y))released++;
            }
            return released;
        }

        return baseMaterializeThrough(g,pack,desiredY);
    };

    function snapshotGarbageY(g){
        const before=new Map();
        if(!g?.vis||!g?.board)return before;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const v=ball&&g.vis.get(ball.id);
            if(ball?.isGarbage&&v&&Number.isFinite(v.y))before.set(ball.id,v.y);
        }
        return before;
    }
    function restoreNoUpward(g,before){
        for(const [id,oldY] of before){
            const v=g.vis.get(id);
            if(!v||!Number.isFinite(v.y))continue;
            if(v.y<oldY-1e-9){
                v.y=oldY;
                v.vy=Math.max(0,v.vy||0);
                v.motionSpeed=Math.max(0,v.motionSpeed||0);
                v.gravityMismatch=true;
            }
        }
    }

    // Scheduled pile-flow has an early-return branch inside updateVisuals, so
    // the older per-ball monotonic guard can be bypassed. Guard the complete
    // visual integration call: after first contact garbage may move sideways or
    // down, but never rebound upward. If a stale path finishes above the current
    // physical centre it is discarded by the base integrator and the next frame
    // simply resumes gravity toward the logical cell from this preserved Y.
    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const before=snapshotGarbageY(g);
        baseUpdateVisuals(g,dt);
        restoreNoUpward(g,before);
    };

    // Generic contact projection has the same invariant.
    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        const before=snapshotGarbageY(g);
        baseResolveVisualContacts(g);
        restoreNoUpward(g,before);
    };
})();
