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

        // Before first pile/floor contact the packet is indivisible. Find the
        // earliest physical contact of ANY member, and do not let the common
        // packet anchor travel one substep farther than that point.
        if(!pack._pileContactStarted){
            const first=firstRigidContact(g,pack);
            if(!first||desiredY+HEX_GARBAGE_CONTACT_EPS<first.y)return 0;

            pack.y=first.y;
            pack.contactY=first.y;
            pack._pileContactStarted=true;
            pack._pileContactAnchorY=first.y;
            pack._pileContactClock=Number.isFinite(g?.garbageClock)?g.garbageClock:0;

            // Contacts that are geometrically simultaneous are released in the
            // same event. Snapshot original indices and process high->low so a
            // splice cannot change the identity of another tied member.
            let released=0;
            const tied=first.hits.slice().sort((a,b)=>b.index-a.index);
            for(const hit of tied){
                if(hit.index>=pack.pat.length)continue;
                if(materializeGarbageBallAtContact(g,pack,hit.index,first.y))released++;
            }
            return released;
        }

        // Once contact has happened, the shape is allowed to break naturally;
        // each remaining member is handled by the reference pile-contact solver.
        return baseMaterializeThrough(g,pack,desiredY);
    };

    // Reference garbage never rebounds upward after it has joined the pile.
    // Some generic visual-contact projections can request a tiny upward shift
    // even though the pre-solve position was already physically valid. Preserve
    // the old Y in that case; horizontal/downward corrections remain untouched.
    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        const before=new Map();
        if(g?.vis&&g?.board){
            for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                const v=ball&&g.vis.get(ball.id);
                if(ball?.isGarbage&&v&&Number.isFinite(v.y))before.set(ball.id,v.y);
            }
        }

        baseResolveVisualContacts(g);

        for(const [id,oldY] of before){
            const v=g.vis.get(id);
            if(!v||!Number.isFinite(v.y))continue;
            if(v.y<oldY-1e-9){
                v.y=oldY;
                v.vy=Math.max(0,v.vy||0);
                v.motionSpeed=Math.max(0,v.motionSpeed||0);
            }
        }
    };
})();
