/* Game-over garbage rendering parity.
 *
 * Settled garbage is ordinary accumulated pile by the time a result is decided.
 * Use the board renderer's physical sink presentation for former garbage too.
 * The full reference capture shows balls leaving through the bottom clip, not
 * disappearing via a garbage-specific or short-distance alpha fade.
 *
 * Keep the gameplay/physics and the existing result timing untouched. During
 * GAMEOVER only, route those former-garbage bubble draws through drawBall with
 * the exact same row-based deathAlpha used by drawSide. Outside GAMEOVER the
 * original bubble renderer is called unchanged.
 */
(function installGameoverGarbageFade(){
    if(typeof window==="undefined"||window.__hexGameoverGarbageFade)return;
    if(typeof drawSide!=="function"||typeof drawGarbageBubbleBall!=="function"||typeof drawBall!=="function")return;
    window.__hexGameoverGarbageFade=true;

    const baseDrawSide=drawSide;
    const baseDrawGarbageBubbleBall=drawGarbageBubbleBall;
    let renderState=null;

    function rowDeathAlpha(g,y){
        return typeof gameOverBallVisualState==="function"
            ?gameOverBallVisualState(g?.stateT||0,y).alpha:1;
    }
    function activeGarbageBubbleCount(g){
        let n=0;
        if(!Array.isArray(g?.activeGarbagePacks))return n;
        for(const pack of g.activeGarbagePacks){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat))continue;
            n+=pack.pat.length;
        }
        return n;
    }
    function boardGarbageBubbleRows(g){
        const rows=[];
        if(!g?.board)return rows;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const cell=valid(x,y)?g.board[y][x]:null;
            if(!cell?.isGarbage)continue;
            const v=g.vis?.get?.(cell.id);
            if(Number.isFinite(v?.garbageBubbleT))rows.push(y);
        }
        return rows;
    }

    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        const prev=renderState;
        if(g?.state==="GAMEOVER"){
            renderState={
                g,
                activeRemaining:activeGarbageBubbleCount(g),
                boardRows:boardGarbageBubbleRows(g),
                boardIndex:0
            };
        }else renderState=null;
        try{return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);}
        finally{renderState=prev;}
    };

    drawGarbageBubbleBall=function(ctx,cx,cy,d,ci,age){
        const st=renderState;
        if(!st||st.g?.state!=="GAMEOVER")return baseDrawGarbageBubbleBall(ctx,cx,cy,d,ci,age);

        // An unfinished airborne packet should not normally coexist with a
        // decided result, but if it does, it must disappear too. Use the same
        // physical sink already applied by drawSide, without a separate fade.
        if(st.activeRemaining>0){
            st.activeRemaining--;
            const alpha=rowDeathAlpha(st.g,ROWS-1);
            return drawBall(ctx,cx,cy,d,ci,{alpha});
        }

        // Board calls occur in the same y/x traversal used to build boardRows,
        // so this reproduces drawSide's exact per-row stagger rather than adding
        // a garbage-specific timing curve.
        const y=st.boardRows[st.boardIndex++];
        const alpha=rowDeathAlpha(st.g,Number.isFinite(y)?y:ROWS-1);
        return drawBall(ctx,cx,cy,d,ci,{alpha});
    };

    window.__hexGameoverGarbageFadeVersion="gameover-garbage-v1";
    window.__hexGameoverAllBoardBallsShareDeathFade=true;
})();
