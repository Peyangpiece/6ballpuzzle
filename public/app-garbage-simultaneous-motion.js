/* Garbage contact resolution after unit-local ordinary timelines.
 *
 * Incoming garbage now uses scheduled canonical ordinary fallPath geometry, so
 * the former "restore every moving ball to its predicted canonical position"
 * layer is both unnecessary and harmful: it could undo resolveVisualContacts
 * and recreate large overlaps.
 *
 * The ordinary contact solver is authoritative for all incoming-garbage pairs.
 * The only correction retained here enforces the phase rule that the pile which
 * existed before this garbage batch is kinematic. We snapshot those frozen
 * centres, run the ordinary solver, restore the frozen centres exactly, then
 * move only current-batch garbage enough to recover one-diameter contact. A few
 * ordinary-solver passes are allowed so any secondary current/current contact
 * created by that one-sided correction is resolved by the same normal physics.
 */
(function installGarbageSimultaneousMotion(){
    if(typeof window==="undefined"||window.__hexGarbageSimultaneousMotion)return;
    window.__hexGarbageSimultaneousMotion=true;

    const MIN_DIST=1.000000;
    const FLOOR_MAX=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;

    function boardEntries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,x,y,v});
        }
        return out;
    }
    function frozenSnapshot(g){
        const out=new Map();
        const ids=g?.garbageFrozenPileIds instanceof Set?g.garbageFrozenPileIds:null;
        if(!ids)return out;
        for(const q of boardEntries(g))if(ids.has(q.ball.id))out.set(q.ball.id,{
            x:q.v.x,y:q.v.y,vy:q.v.vy||0,motionSpeed:q.v.motionSpeed||0
        });
        return out;
    }
    function restoreFrozen(g,snap){
        for(const[id,s]of snap){
            const v=g.vis.get(id);if(!v)continue;
            v.x=s.x;v.y=s.y;v.vy=s.vy;v.motionSpeed=s.motionSpeed;
        }
    }
    function physicalDist(a,b){return Math.hypot((a.x-b.x)*0.5,(a.y-b.y)*HEX_ROW_H);}
    function moveCurrentAwayFromFrozen(g,snap){
        if(!snap.size)return false;
        let changed=false;
        const current=boardEntries(g).filter(q=>q.ball.isGarbage&&!snap.has(q.ball.id));
        for(const q of current){
            for(const[id,s]of snap){
                if(id===q.ball.id)continue;
                let dx=(q.v.x-s.x)*0.5,dy=(q.v.y-s.y)*HEX_ROW_H,d=Math.hypot(dx,dy);
                if(d>=MIN_DIST-1e-9)continue;
                changed=true;
                if(d<1e-10){
                    const sign=Math.sign(q.x-s.x)||((q.ball.id&1)?1:-1);
                    dx=sign;dy=0;d=1;
                }else{dx/=d;dy/=d;}

                // A falling ball above its frozen support must never be kicked
                // upward. Resolve that penetration horizontally to the tangent
                // x coordinate while keeping its current y. This is the same
                // visible direction rule previously used for garbage contacts,
                // but the frozen support itself is never displaced.
                const realDy=(q.v.y-s.y)*HEX_ROW_H;
                if(realDy<0&&Math.abs(realDy)<MIN_DIST){
                    const needX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-realDy*realDy));
                    let sign=Math.sign(q.v.x-s.x);
                    if(!sign)sign=Math.sign(q.x-s.x)||((q.ball.id&1)?1:-1);
                    q.v.x=s.x+(sign*needX)/0.5;
                    q.v.x=Math.max(0,Math.min(W2-1,q.v.x));
                }else{
                    const missing=MIN_DIST-Math.max(0,d===1&&Math.abs(dx)===1&&dy===0?0:physicalDist(q.v,s));
                    const mag=Math.max(0,missing)+1e-7;
                    q.v.x=Math.max(0,Math.min(W2-1,q.v.x+(dx*mag)/0.5));
                    // Only downward/level correction is allowed for current
                    // garbage; never introduce an upward snap.
                    if(dy>0)q.v.y=Math.min(FLOOR_MAX,q.v.y+(dy*mag)/HEX_ROW_H);
                }
            }
        }
        return changed;
    }

    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return baseResolveVisualContacts(g);
        const snap=frozenSnapshot(g);
        if(!snap.size)return baseResolveVisualContacts(g);

        // Ordinary solver owns all current/current interaction. Restore the
        // pre-batch pile after each pass, then finish any remaining frozen/current
        // penetration one-sidedly. Repeating converges secondary contacts without
        // ever allowing the frozen pile to drift.
        for(let pass=0;pass<4;pass++){
            baseResolveVisualContacts(g);
            restoreFrozen(g,snap);
            const touched=moveCurrentAwayFromFrozen(g,snap);
            restoreFrozen(g,snap);
            if(!touched)break;
        }
        restoreFrozen(g,snap);
    };

    window.__hexGarbageMovingPeersAreSimultaneous=true;
    window.__hexGarbageSharedFrameContactSolver=false;
    window.__hexGarbageCanonicalPositionRollbackDisabled=true;
    window.__hexGarbageFrozenPileContactIsOneSided=true;
})();