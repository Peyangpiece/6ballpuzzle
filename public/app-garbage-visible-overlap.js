/* Garbage visible-overlap guard.
 *
 * Physics is stepped at 120 Hz and resolveVisualContacts runs before rendering.
 * drawSide adds up to one physics tick of renderLead by evaluating pileFlow in
 * the future. That extrapolation is intentionally cosmetic and used to smooth
 * ordinary pile collapse, but it bypasses the garbage swept/contact guards and
 * can therefore draw two garbage balls inside each other even when their actual
 * resolved centres are collision-safe.
 *
 * During drawSide only, suppress pileFlow extrapolation for garbage visuals.
 * The physical state, fallPath, schedules, support arcs and logical cells are
 * untouched; the renderer simply uses the already collision-resolved g.vis
 * centre for incoming/gridified garbage. Ordinary pile renderLead is preserved.
 */
(function installGarbageVisibleOverlapGuard(){
    if(typeof window==="undefined"||window.__hexGarbageVisibleOverlapGuard)return;
    window.__hexGarbageVisibleOverlapGuard=true;

    const baseDrawSide=drawSide;

    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        if(!g||!(renderLead>1e-7)||!g.board||!g.vis){
            return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        }

        const held=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);
            if(!v||!v.pileFlow)continue;
            held.push(v);
            v.pileFlow=false;
        }

        try{
            return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        }finally{
            for(const v of held)v.pileFlow=true;
        }
    };
})();
