/* Final post-contact projection for garbage.
 * resolveVisualContacts may apply a tiny visual correction after updateVisuals.
 * Re-run the same swept first-contact clamp on exactly that correction so the
 * generic resolver cannot reintroduce a sub-diameter garbage overlap.
 */
(function installGarbagePostResolveClamp(){
    if(typeof window==="undefined"||window.__hexGarbagePostResolveClamp)return;
    window.__hexGarbagePostResolveClamp=true;

    const baseResolveVisualContacts=resolveVisualContacts;
    function snapshotGarbage(g){
        const before=new Map();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage)continue;
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))before.set(ball.id,[v.x,v.y]);
        }
        return before;
    }

    resolveVisualContacts=function(g){
        const before=snapshotGarbage(g);
        const out=baseResolveVisualContacts(g);
        if(typeof window.__hexGarbageFrameClamp==="function")window.__hexGarbageFrameClamp(g,before,0);
        return out;
    };
})();
