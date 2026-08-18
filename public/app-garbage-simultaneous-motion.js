/* Garbage contact resolution after unit-local ordinary timelines.
 *
 * The ordinary resolveVisualContacts solver remains authoritative. The GARBAGE
 * phase adds only a one-sided receiving-pile rule:
 *
 *  - balls present before the batch are absolutely fixed until the batch ends;
 *  - a current-batch garbage ball whose fallPath is empty is visually fixed to
 *    its CURRENT logical lattice cell for this contact frame only;
 *  - that temporary receiving-ball status is NOT garbagePhaseFrozen. If support
 *    changes, the deep-settle gravity pass may give it a new fallPath on the
 *    very next physics frame and it becomes movable again.
 *
 * This prevents generic contact correction from leaving a finished garbage ball
 * permanently offset from its logical cell (pending=0 but nearlySettled=false),
 * while preserving the user's rule that newly accumulated garbage can collapse
 * again during the same attack.
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
    function preBatchIds(g){return g?.garbageFrozenPileIds instanceof Set?g.garbageFrozenPileIds:null;}
    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}

    function receivingSnapshot(g){
        const out=new Map(),pre=preBatchIds(g);
        for(const q of boardEntries(g)){
            if(pre?.has(q.ball.id)){
                out.set(q.ball.id,{x:q.v.x,y:q.v.y,vy:q.v.vy||0,motionSpeed:q.v.motionSpeed||0,preBatch:true});
                continue;
            }
            if(q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!hasLivePath(q.ball)){
                // Logical lattice occupancy is the canonical final centre once
                // this ball has no path. Normalize before the ordinary contact
                // pass so a stale previous-frame correction cannot keep the
                // entire batch permanently "not nearly settled".
                q.v.x=q.x;q.v.y=q.y;q.v.vy=0;q.v.motionSpeed=0;
                out.set(q.ball.id,{x:q.x,y:q.y,vy:0,motionSpeed:0,preBatch:false});
            }
        }
        return out;
    }
    function restoreReceiving(g,snap){
        for(const[id,s]of snap){const v=g.vis.get(id);if(v){v.x=s.x;v.y=s.y;v.vy=s.vy;v.motionSpeed=s.motionSpeed;}}
    }
    function physicalDistXY(ax,ay,bx,by){return Math.hypot((ax-bx)*0.5,(ay-by)*HEX_ROW_H);}

    function moveLiveGarbageAwayFromReceiving(g,snap){
        if(!snap.size)return false;
        let changed=false;
        const live=boardEntries(g).filter(q=>q.ball.isGarbage&&!snap.has(q.ball.id)&&hasLivePath(q.ball));
        for(const q of live){
            for(const[id,s]of snap){
                if(id===q.ball.id)continue;
                let px=(q.v.x-s.x)*0.5,py=(q.v.y-s.y)*HEX_ROW_H;
                const dist=Math.hypot(px,py);
                if(dist>=MIN_DIST-1e-9)continue;
                changed=true;

                // Never correct an incoming ball upward. If it is above a
                // receiving ball, keep y and move horizontally to the tangent
                // x coordinate. This preserves monotone falling motion.
                if(py<0&&Math.abs(py)<MIN_DIST){
                    const needX=Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-py*py));
                    let sign=Math.sign(px);
                    if(!sign)sign=Math.sign(q.x-s.x)||((q.ball.id&1)?1:-1);
                    q.v.x=Math.max(0,Math.min(W2-1,s.x+(sign*needX)/0.5));
                    continue;
                }

                let ux=0,uy=0;
                if(dist>1e-10){ux=px/dist;uy=py/dist;}
                else{ux=Math.sign(q.x-s.x)||((q.ball.id&1)?1:-1);uy=0;}
                const missing=MIN_DIST-dist+1e-7;
                q.v.x=Math.max(0,Math.min(W2-1,q.v.x+(ux*missing)/0.5));
                if(uy>0)q.v.y=Math.min(FLOOR_MAX,q.v.y+(uy*missing)/HEX_ROW_H);
            }
        }
        return changed;
    }

    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return baseResolveVisualContacts(g);
        const snap=receivingSnapshot(g);
        if(!snap.size)return baseResolveVisualContacts(g);

        // Current/current moving contacts are handled by the ordinary solver.
        // Receiving balls are restored after every pass. A one-sided correction
        // then finishes only the penetration caused by restoring them.
        for(let pass=0;pass<4;pass++){
            baseResolveVisualContacts(g);
            restoreReceiving(g,snap);
            const touched=moveLiveGarbageAwayFromReceiving(g,snap);
            restoreReceiving(g,snap);
            if(!touched)break;
        }
        restoreReceiving(g,snap);
    };

    window.__hexGarbageMovingPeersAreSimultaneous=true;
    window.__hexGarbageSharedFrameContactSolver=false;
    window.__hexGarbageCanonicalPositionRollbackDisabled=true;
    window.__hexGarbageFrozenPileContactIsOneSided=true;
    window.__hexGarbageRestingBallsStayOnLattice=true;
})();