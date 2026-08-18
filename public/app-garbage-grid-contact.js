/* Garbage -> lattice transition after contact with the pre-existing pile.
 *
 * "Pre-existing pile" means exactly the balls that were already on the board
 * when this garbage batch started. Garbage created by the current batch never
 * becomes a contact trigger for another still-airborne member, even after that
 * earlier garbage member has settled.
 *
 * Once a garbage member touches the pre-existing pile (or the floor), it is
 * registered on the lattice. From that point onward every ordinary motion
 * segment is a canonical lattice transition; diagonal transitions are repaired
 * through the shared support-arc binder rather than allowed to drift off-grid.
 */
(function installGarbageGridAfterOriginalPileContact(){
    if(typeof window==="undefined"||window.__hexGarbageGridAfterOriginalPileContact)return;
    window.__hexGarbageGridAfterOriginalPileContact=true;

    const CONTACT_EPS=3e-6;
    const ARC_TOL=0.05;

    function captureOriginalPile(g){
        const ids=new Set();
        if(g?.board){
            for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                if(ball)ids.add(ball.id);
            }
        }
        g.garbageOriginalPileIds=ids;
        g.garbageOriginalPileCaptureClock=Number.isFinite(g?.garbageClock)?g.garbageClock:0;
        g.garbageOriginalPileGeneration=(g.garbageOriginalPileGeneration||0)+1;
        return ids;
    }

    const basePrepareGarbageBatch=prepareGarbageBatch;
    prepareGarbageBatch=function(g){
        if(!g?.garbageBatchPrepared)captureOriginalPile(g);
        return basePrepareGarbageBatch(g);
    };

    function originalPileBall(g,id){
        if(!g?.garbageOriginalPileIds?.has(id))return null;
        return hexGarbageBoardBallById(g,id);
    }

    function originalPileContactInfo(g,pack,index){
        if(!pack?.pat?.[index])return {y:Infinity,supportId:0,floor:false};
        const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
        let y=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H-dy;
        let supportId=0;
        const ids=g?.garbageOriginalPileIds instanceof Set?g.garbageOriginalPileIds:new Set();
        for(const id of ids){
            const ball=originalPileBall(g,id);if(!ball)continue;
            const ov=g.vis.get(id);if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            const hx=Math.abs((px-ov.x)*.5);
            if(hx>=1-1e-10)continue;
            const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
            const candidate=ov.y-dy-vertical;
            if(candidate<y-CONTACT_EPS){y=candidate;supportId=id;}
            else if(Math.abs(candidate-y)<=CONTACT_EPS&&supportId===0)supportId=id;
        }
        return {y,supportId,floor:supportId===0};
    }

    // Airborne contact is defined only by the pile that existed before this
    // garbage batch, plus the floor. Current-batch garbage remains a visual
    // collider (overlap/tunnelling guards still see it) but never causes the
    // airborne -> lattice state transition.
    hexGarbageBallContactY=function(g,pack,index){
        return originalPileContactInfo(g,pack,index).y;
    };

    function isLatticePoint(p){
        if(!Array.isArray(p)||p.length<2)return false;
        const x=p[0],y=p[1];
        return Number.isInteger(x)&&Number.isInteger(y)&&valid(x,y);
    }

    function gridPathInvariant(ball){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        let entrySeen=false;
        for(const seg of path){
            if(!seg?.from||!seg?.to)continue;
            if(seg.kind==="GARBAGE_PILE_CONTACT_HANDOFF"){
                if(entrySeen||!isLatticePoint(seg.to))return false;
                entrySeen=true;
                continue;
            }
            if(!isLatticePoint(seg.from)||!isLatticePoint(seg.to))return false;
        }
        return true;
    }

    function bindOriginalSupportArc(g,ball,seg,supportId){
        if(!seg||seg.kind!=="GARBAGE_PILE_CONTACT_HANDOFF"||!supportId)return;
        const support=originalPileBall(g,supportId);if(!support)return;
        const sv=g.vis.get(supportId);if(!sv)return;
        const pivot=[sv.x,sv.y],from=seg.from,to=seg.to;
        const d0=hexPhysDist(from[0],from[1],pivot[0],pivot[1]);
        const d1=hexPhysDist(to[0],to[1],pivot[0],pivot[1]);
        // If the chosen entry lattice cell is another tangent point on the same
        // support, force the entry handoff to stay on that support's circle.
        if(Math.abs(d0-1)<=ARC_TOL&&Math.abs(d1-1)<=ARC_TOL){
            seg.pivot=[...pivot];
            seg.followSupportIds=[supportId];
            seg.movingSupportId=supportId;
            seg.garbageOriginalPileEntryArc=true;
        }
    }

    const baseMaterialize=materializeGarbageBallAtContact;
    materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
        const info=originalPileContactInfo(g,pack,index);
        const before=Array.isArray(pack?.entryBalls)?pack.entryBalls.length:0;
        const ok=baseMaterialize(g,pack,index,contactAnchorY);
        if(!ok)return false;

        const entry=pack.entryBalls?.[before]||pack.entryBalls?.[pack.entryBalls.length-1];
        const ball=entry?hexGarbageBoardBallById(g,entry.id):null;
        if(!ball)return ok;

        const isOriginalContact=Number.isFinite(info.y)&&Math.abs(info.y-contactAnchorY)<=CONTACT_EPS;
        ball.garbageGridEntered=true;
        ball.garbageGridEntryGeneration=g.garbageOriginalPileGeneration||0;
        ball.garbageGridEntrySupportId=isOriginalContact?info.supportId:0;
        ball.garbageGridEntryWasFloor=isOriginalContact&&info.floor;
        ball.garbageGridEntryFromOriginalPile=!!(isOriginalContact&&info.supportId);
        if(entry){
            entry.gridAfterContact=true;
            entry.originalPileSupportId=ball.garbageGridEntrySupportId;
        }

        const path=Array.isArray(ball.fallPath)?ball.fallPath:[];
        for(let i=0;i<path.length;i++){
            const seg=path[i];if(!seg?.from||!seg?.to)continue;
            if(seg.kind==="GARBAGE_PILE_CONTACT_HANDOFF"){
                seg.garbageGridEntryHandoff=true;
                if(ball.garbageGridEntrySupportId)bindOriginalSupportArc(g,ball,seg,ball.garbageGridEntrySupportId);
                continue;
            }
            // All post-entry motion is lattice-to-lattice. Re-run the common
            // geometry repair so ROLL transitions bind to the real support and
            // render as unit-radius arcs instead of diagonal chords.
            if(isLatticePoint(seg.from)&&isLatticePoint(seg.to)){
                seg.garbageGridMotion=true;
                repairPileFlowSegmentGeometry(g,ball,seg,"garbage_grid_after_contact");
            }
        }
        ball.garbageGridPathValid=gridPathInvariant(ball);
        return ok;
    };

    window.__hexCaptureGarbageOriginalPile=captureOriginalPile;
    window.__hexGarbageOriginalPileContactInfo=originalPileContactInfo;
    window.__hexGarbageGridPathInvariant=gridPathInvariant;
})();
