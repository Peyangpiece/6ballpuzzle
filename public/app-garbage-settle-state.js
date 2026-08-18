/* Garbage pile-state gate.
 * A garbage ball that has lost packet rigidity is NOT accumulated pile yet.
 * It becomes pile only after all of its initial post-contact movement has
 * finished and its rendered centre agrees with the final logical lattice cell.
 * Until then it may collide visually (no overlap), but it must not act as a
 * settled support/contact surface that causes later airborne garbage to hand
 * off early. Promotion is one-way: after the first final settle it remains a
 * normal pile ball even if a later clear makes the pile move again.
 */
(function installGarbageSettleState(){
    if(typeof window==="undefined"||window.__hexGarbageSettleState)return;
    window.__hexGarbageSettleState=true;

    const POS_EPS=0.012;
    const REST_SPEED_EPS=0.02;

    function garbageLogicalCell(g,id){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            if(b?.id===id)return {ball:b,x,y};
        }
        return null;
    }

    function garbagePositionFinal(g,ball,x,y){
        if(!ball?.isGarbage)return false;
        if(Array.isArray(ball.fallPath)&&ball.fallPath.length)return false;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return false;
        if(Math.abs(v.x-x)>POS_EPS||Math.abs(v.y-y)>POS_EPS)return false;
        if(v._pendingPathComplete)return false;
        if(Math.abs(v.vy||0)>REST_SPEED_EPS||Math.abs(v.motionSpeed||0)>REST_SPEED_EPS)return false;

        // pileFlow is a rendering/scheduling flag, not a physical state. A
        // swept-collision block can leave it true after the last segment has
        // already been consumed. If there is no fallPath, the rendered centre is
        // on the final logical cell, and velocity is zero, the motion is over.
        // Clear the stale flag here so the garbage can become accumulated pile.
        if(v.pileFlow){
            v.pileFlow=false;
            v.vy=0;
            v.motionSpeed=0;
            delete v.garbageSweepBlocked;
            delete v.garbageFreeFlightHandoff;
        }
        return true;
    }

    function promoteGarbagePileBall(g,ball,x,y){
        if(ball.garbagePileSettled===true)return true;
        if(!garbagePositionFinal(g,ball,x,y))return false;
        ball.garbagePileSettled=true;
        ball.garbagePileSettledAt=Number.isFinite(g.garbageClock)?g.garbageClock:0;
        return true;
    }

    function refreshGarbagePileState(g){
        if(!g?.board||!g?.vis)return;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage||ball.garbagePileSettled===true)continue;
            promoteGarbagePileBall(g,ball,x,y);
        }
    }

    window.__hexGarbageIsSettledPile=function(g,ball){
        if(!ball)return false;
        if(!ball.isGarbage)return true;
        if(ball.garbagePileSettled===true)return true;
        const cell=garbageLogicalCell(g,ball.id);
        return !!cell&&promoteGarbagePileBall(g,ball,cell.x,cell.y);
    };

    const baseMaterialize=materializeGarbageBallAtContact;
    materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
        const before=Array.isArray(pack?.entryBalls)?pack.entryBalls.length:0;
        const ok=baseMaterialize(g,pack,index,contactAnchorY);
        if(!ok)return false;
        const entry=pack.entryBalls?.[before]||pack.entryBalls?.[pack.entryBalls.length-1];
        const ball=entry?hexGarbageBoardBallById(g,entry.id):null;
        if(ball){
            ball.garbagePileSettled=false;
            delete ball.garbagePileSettledAt;
        }
        refreshGarbagePileState(g);
        return true;
    };

    hexGarbageBallContactY=function(g,pack,index){
        if(!pack?.pat?.[index])return Infinity;
        refreshGarbagePileState(g);
        const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
        let limit=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H-dy;
        for(const [id,ov] of g.vis.entries()){
            if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            const obstacle=hexGarbageBoardBallById(g,id);
            if(!obstacle)continue;
            if(obstacle.isGarbage&&!window.__hexGarbageIsSettledPile(g,obstacle))continue;
            const hx=Math.abs((px-ov.x)*.5);
            if(hx>=1-1e-10)continue;
            const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
            limit=Math.min(limit,ov.y-dy-vertical);
        }
        return limit;
    };

    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        baseUpdateVisuals(g,dt);
        refreshGarbagePileState(g);
    };

    const baseResolveVisualContacts=resolveVisualContacts;
    resolveVisualContacts=function(g){
        baseResolveVisualContacts(g);
        refreshGarbagePileState(g);
    };

    window.__hexRefreshGarbagePileState=refreshGarbagePileState;
})();

/* Garbage -> lattice transition after contact with the PRE-EXISTING pile.
 * Pre-existing pile means exactly the balls that were already on the board when
 * this garbage batch started. Garbage created by the current batch can still
 * collide visually, but never triggers another airborne member's lattice entry.
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

    hexGarbageBallContactY=function(g,pack,index){
        return originalPileContactInfo(g,pack,index).y;
    };

    function isLatticePoint(p){
        if(!Array.isArray(p)||p.length<2)return false;
        return Number.isInteger(p[0])&&Number.isInteger(p[1])&&valid(p[0],p[1]);
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

    function bindOriginalSupportArc(g,seg,supportId){
        if(!seg||seg.kind!=="GARBAGE_PILE_CONTACT_HANDOFF"||!supportId)return;
        const support=originalPileBall(g,supportId);if(!support)return;
        const sv=g.vis.get(supportId);if(!sv)return;
        const pivot=[sv.x,sv.y],from=seg.from,to=seg.to;
        const d0=hexPhysDist(from[0],from[1],pivot[0],pivot[1]);
        const d1=hexPhysDist(to[0],to[1],pivot[0],pivot[1]);
        if(Math.abs(d0-1)<=ARC_TOL&&Math.abs(d1-1)<=ARC_TOL){
            seg.pivot=[...pivot];
            seg.followSupportIds=[supportId];
            seg.movingSupportId=supportId;
            seg.garbageOriginalPileEntryArc=true;
        }
    }

    const baseGridMaterialize=materializeGarbageBallAtContact;
    materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
        const info=originalPileContactInfo(g,pack,index);
        const before=Array.isArray(pack?.entryBalls)?pack.entryBalls.length:0;
        const ok=baseGridMaterialize(g,pack,index,contactAnchorY);
        if(!ok)return false;
        const entry=pack.entryBalls?.[before]||pack.entryBalls?.[pack.entryBalls.length-1];
        const ball=entry?hexGarbageBoardBallById(g,entry.id):null;
        if(!ball)return ok;

        const isOriginalContact=Number.isFinite(info.y)&&Math.abs(info.y-contactAnchorY)<=CONTACT_EPS;
        ball.garbageGridEntered=true;
        ball.garbageGridEntryGeneration=g.garbageOriginalPileGeneration||0;
        ball.garbageGridEntrySupportId=isOriginalContact?info.supportId:0;
        ball.garbageGridEntryWasFloor=!!(isOriginalContact&&info.floor);
        ball.garbageGridEntryFromOriginalPile=!!(isOriginalContact&&info.supportId);
        if(entry){entry.gridAfterContact=true;entry.originalPileSupportId=ball.garbageGridEntrySupportId;}

        const path=Array.isArray(ball.fallPath)?ball.fallPath:[];
        for(const seg of path){
            if(!seg?.from||!seg?.to)continue;
            if(seg.kind==="GARBAGE_PILE_CONTACT_HANDOFF"){
                seg.garbageGridEntryHandoff=true;
                if(ball.garbageGridEntrySupportId)bindOriginalSupportArc(g,seg,ball.garbageGridEntrySupportId);
                continue;
            }
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
