/* Final post-contact projection for garbage.
 *
 * resolveVisualContacts can make a tiny visual correction AFTER the scheduled
 * swept clamp. Usually the current frame's pre-resolve positions are a safe
 * start and the normal first-contact clamp is enough. If a tiny penetration was
 * already inherited from the previous frame, retain the last FULL one-diameter
 * safe garbage snapshot and use that real previous position as the sweep start.
 */
(function installGarbagePostResolveClamp(){
    if(typeof window==="undefined"||window.__hexGarbagePostResolveClamp)return;
    window.__hexGarbagePostResolveClamp=true;

    const baseResolveVisualContacts=resolveVisualContacts;
    const SAFE_MIN=Math.max(1,HEX_MIN_DIST-2e-5);
    const lastSafeByEngine=new WeakMap();

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
    function physicalDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function snapshotSafe(map){
        const pts=[...map.values()];
        for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(physicalDist(pts[i],pts[j])<SAFE_MIN)return false;
        return true;
    }

    resolveVisualContacts=function(g){
        const before=snapshotGarbage(g);
        if(snapshotSafe(before))lastSafeByEngine.set(g,new Map(before));

        const out=baseResolveVisualContacts(g);
        if(typeof window.__hexGarbageFrameClamp==="function")window.__hexGarbageFrameClamp(g,before,0);

        let after=snapshotGarbage(g);
        if(!snapshotSafe(after)){
            const fallback=lastSafeByEngine.get(g);
            if(fallback&&typeof window.__hexGarbageFrameClamp==="function"){
                window.__hexGarbageFrameClamp(g,fallback,0);
                after=snapshotGarbage(g);
            }
        }
        if(snapshotSafe(after))lastSafeByEngine.set(g,new Map(after));
        return out;
    };
})();
