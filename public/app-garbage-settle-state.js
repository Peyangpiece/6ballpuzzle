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
        if(v.pileFlow)return false;
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

    // Every newly hand-offed garbage member starts in the moving/non-pile state.
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

    // Airborne garbage may contact ordinary pile balls or garbage whose INITIAL
    // landing has already fully settled. De-rigidified moving garbage is excluded.
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

    // Promote exactly when rendering reaches the final lattice position.
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
