/* Garbage-shape airborne rigidity.
 * The complete incoming garbage shape is one rigid body until its FIRST real
 * contact with the accumulated pile or floor. A physics frame is never allowed
 * to overshoot that first contact and start splitting the shape below it.
 *
 * At that first contact rigidity is released. Every remaining member is handed
 * to the lattice from its exact current centre. If a member cannot be registered
 * immediately because another rendered ball still occupies the required entry
 * space, the unresolved remainder stays parked at the first-contact anchor and
 * retries on later 120 Hz frames. It is never allowed to continue through the
 * accumulated pile. Once registered, the normal lattice solver owns the ball:
 * it free-falls or rolls on support arcs and is later promoted to accumulated
 * pile by app-garbage-settle-state when its final visual/logical position agrees.
 */
(function installGarbageAirborneRigidity(){
    if(typeof window==="undefined"||window.__hexGarbageAirborneRigidity)return;
    window.__hexGarbageAirborneRigidity=true;

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

    function releaseRemainingAtFirstContact(g,pack,anchorY){
        if(!pack?.pat?.length)return 0;
        let released=0;
        let guard=Math.max(6,pack.pat.length*4);
        while(pack.pat.length&&guard-->0){
            // Lower members enter first. Their logical settle may immediately
            // open the correct support geometry for higher members.
            const order=pack.pat
                .map((slot,index)=>({index,dy:slot[1],dx:slot[0]}))
                .sort((a,b)=>b.dy-a.dy||Math.abs(a.dx)-Math.abs(b.dx)||b.index-a.index);
            let progressed=false;
            for(const q of order){
                if(q.index>=pack.pat.length)continue;
                if(materializeGarbageBallAtContact(g,pack,q.index,anchorY)){
                    released++;
                    progressed=true;
                    break;
                }
            }
            if(!progressed)break;
        }
        return released;
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
            pack._gridReleaseStarted=true;

            return releaseRemainingAtFirstContact(g,pack,first.y);
        }

        // After the first physical contact this object is no longer an airborne
        // rigid body. Any member that could not yet enter the lattice must remain
        // at the original contact-height configuration rather than following the
        // continuously increasing free-flight desiredY through the old pile.
        const anchor=Number.isFinite(pack._pileContactAnchorY)?pack._pileContactAnchorY:pack.y;
        pack.y=anchor;
        pack.contactY=anchor;
        return releaseRemainingAtFirstContact(g,pack,anchor);
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
