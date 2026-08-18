/* Garbage-shape airborne rigidity.
 * The complete incoming garbage shape is one rigid body until its FIRST real
 * contact with the accumulated pile or floor. A physics frame is never allowed
 * to overshoot that first contact and start splitting the shape below it.
 *
 * At that first contact rigidity is released. All members are immediately
 * offered a lattice entry from their exact current centres so their future cells
 * are reserved before another member can settle into them. Any member that still
 * cannot register safely remains parked at the first-contact anchor and retries;
 * the unresolved remainder never continues through the accumulated pile. Once
 * registered, normal lattice gravity/support arcs own the ball, and the settle
 * state promotes it to accumulated pile after its final visual position rests.
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

    function releaseAvailableAtFirstContact(g,pack,anchorY){
        if(!pack?.pat?.length)return 0;
        let released=0,guard=Math.max(6,pack.pat.length*4);
        while(pack.pat.length&&guard-->0){
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

            return releaseAvailableAtFirstContact(g,pack,first.y);
        }

        const anchor=Number.isFinite(pack._pileContactAnchorY)?pack._pileContactAnchorY:pack.y;
        pack.y=anchor;
        pack.contactY=anchor;
        return releaseAvailableAtFirstContact(g,pack,anchor);
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

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const before=snapshotGarbageY(g);
        baseUpdateVisuals(g,dt);
        restoreNoUpward(g,before);
    };

    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        const before=snapshotGarbageY(g);
        baseResolveVisualContacts(g);
        restoreNoUpward(g,before);
    };
})();
