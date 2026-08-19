/* Main-thread runtime performance guards.
 *
 * These adapters remove repeated work only when the accumulated board is already
 * static. Motion/collision physics, animation substeps, timing and final cells are
 * unchanged. Any board with an authored fallPath or a visual still in transit
 * immediately falls back to the canonical routines.
 */
(function installRuntimePerformanceGuards(){
    if(typeof window==="undefined"||window.__hexRuntimePerformanceGuards)return;
    if(typeof safeActiveFallOffset!=="function"||typeof landingShadowVisualCells!=="function"||typeof resolveVisualContacts!=="function")return;
    window.__hexRuntimePerformanceGuards=true;

    const baseSafeActiveFallOffset=safeActiveFallOffset;
    const baseLandingShadowVisualCells=landingShadowVisualCells;
    const baseResolveVisualContacts=resolveVisualContacts;

    function boardStaticForActivePlay(g){
        return !!g&&g.state==="PLAYING"&&g.piece&&g._visualMovingIds instanceof Set&&g._visualMovingIds.size===0;
    }

    function staticLogicalColliders(g){
        if(!boardStaticForActivePlay(g))return null;
        const scanMin=boardScanMin(g.board),ver=Number(g.ver)||0;
        const cache=g._perfStaticLogicalColliders;
        if(cache&&cache.ver===ver&&cache.scanMin===scanMin)return cache.items;
        const items=[];
        for(let y=scanMin;y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)items.push({x,y,id:ball.id});
        }
        g._perfStaticLogicalColliders={ver,scanMin,items};
        return items;
    }

    safeActiveFallOffset=function(g,cells,dx,dOff,desired){
        const colliders=staticLogicalColliders(g);
        if(!colliders)return baseSafeActiveFallOffset(g,cells,dx,dOff,desired);
        const H=HEX_ROW_H,R=1.000001;let safe=desired;
        for(let i=0;i<cells.length;i++){
            const ax=(cells[i][0]+dx)*.5,ay0=(cells[i][1]+dOff)*H;
            const floorOffset=((ROWS-1)*H-ay0)/H;if(floorOffset<safe)safe=floorOffset;
            for(const q of colliders){
                const bxx=q.x*.5,byy=q.y*H,hx=Math.abs(ax-bxx);
                if(hx>=R)continue;
                const vertical=Math.sqrt(Math.max(0,R*R-hx*hx)),off=(byy-vertical-ay0)/H;
                if(off<safe)safe=off;
            }
        }
        return Math.max(0,Math.min(desired,safe));
    };

    landingShadowVisualCells=function(g){
        const colliders=staticLogicalColliders(g);
        if(!colliders)return baseLandingShadowVisualCells(g);
        const cs=landingShadowCells(g);if(!cs||!g?.piece)return null;
        const dxGrid=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;
        let constrained=false;
        for(const[sx0,sy]of cs){
            const sxN=latticeRealX(sx0+dxGrid),syN=cellCenterYNorm(sy);
            for(const q of colliders){
                const ddx=Math.abs(sxN-latticeRealX(q.x));if(ddx>=1-1e-9)continue;
                const contact=(cellCenterYNorm(q.y)-syN)-Math.sqrt(Math.max(0,1-ddx*ddx));
                const floor=FLOOR_CENTER_N-syN;
                if(contact>=-1e-8&&contact<floor-1e-8){constrained=true;break;}
            }
            if(constrained)break;
        }
        if(!constrained){
            let lowest=-Infinity;for(const[,sy]of cs)lowest=Math.max(lowest,cellCenterYNorm(sy));
            const rowOffset=(FLOOR_CENTER_N-lowest)/HEX_ROW_H;
            return cs.map(([x,y,c])=>[x+dxGrid,y+rowOffset,c]);
        }
        let maxDown=Infinity;
        for(const[,sy]of cs)maxDown=Math.min(maxDown,FLOOR_CENTER_N-cellCenterYNorm(sy));
        for(const[sx0,sy]of cs){
            const sxN=latticeRealX(sx0+dxGrid),syN=cellCenterYNorm(sy);
            for(const q of colliders){
                const ddx=Math.abs(sxN-latticeRealX(q.x));if(ddx>=1-1e-9)continue;
                const d=(cellCenterYNorm(q.y)-syN)-Math.sqrt(Math.max(0,1-ddx*ddx));
                if(d>=-1e-8)maxDown=Math.min(maxDown,Math.max(0,d));
            }
        }
        if(!Number.isFinite(maxDown))maxDown=0;
        const rowOffset=Math.max(0,maxDown)/HEX_ROW_H;
        return cs.map(([x,y,c])=>[x+dxGrid,y+rowOffset,c]);
    };

    resolveVisualContacts=function(g){
        // updateVisuals() has already established _visualMovingIds immediately
        // before this call in stepEngine. A static lattice cannot develop a new
        // board-ball overlap, so the O(n^2) contact pass is redundant here.
        if(boardStaticForActivePlay(g)){
            g._perfStaticContactSkips=(g._perfStaticContactSkips||0)+1;
            return;
        }
        return baseResolveVisualContacts(g);
    };

    window.__hexRuntimePerformanceVersion="runtime-perf-v1";
    window.__hexStaticBoardContactPassSkipped=true;
    window.__hexActiveCollisionColliderCache=true;
    window.__hexLandingShadowColliderCache=true;
})();
