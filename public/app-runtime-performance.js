/* Main-thread runtime performance guards.
 *
 * These adapters remove repeated work only when the answer is provably the same.
 * Motion/collision equations, animation substeps, timings, render coordinates,
 * draw order and final cells are unchanged. Motion-aware paths always fall back
 * to the canonical routines.
 */
(function installRuntimePerformanceGuards(){
    if(typeof window==="undefined"||window.__hexRuntimePerformanceGuards)return;
    if(typeof safeActiveFallOffset!=="function"||typeof landingShadowVisualCells!=="function"||typeof resolveVisualContacts!=="function")return;
    window.__hexRuntimePerformanceGuards=true;

    const baseSafeActiveFallOffset=safeActiveFallOffset;
    const baseLandingShadowVisualCells=landingShadowVisualCells;
    const baseResolveVisualContacts=resolveVisualContacts;
    const baseRigidShadowPixelPlacement=typeof rigidShadowPixelPlacement==="function"?rigidShadowPixelPlacement:null;
    const baseDrawBall=typeof drawBall==="function"?drawBall:null;
    const baseHexGarbageBoardBallById=typeof hexGarbageBoardBallById==="function"?hexGarbageBoardBallById:null;

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

    function staticVisualColliders(g){
        if(!boardStaticForActivePlay(g))return null;
        const scanMin=boardScanMin(g.board),ver=Number(g.ver)||0;
        const cache=g._perfStaticVisualColliders;
        if(cache&&cache.ver===ver&&cache.scanMin===scanMin)return cache.items;
        const items=[];
        for(let y=scanMin;y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball)continue;
            const v=g.vis.get(ball.id)||{x,y};
            items.push({x:v.x,y:v.y,id:ball.id});
        }
        g._perfStaticVisualColliders={ver,scanMin,items};
        return items;
    }

    function logicalBallByIdMap(g){
        if(!g?.board)return null;
        const scanMin=boardScanMin(g.board),ver=Number(g.ver)||0;
        const cache=g._perfLogicalBallById;
        if(cache&&cache.ver===ver&&cache.scanMin===scanMin)return cache.map;
        const map=new Map();
        for(let y=scanMin;y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)map.set(ball.id,ball);
        }
        g._perfLogicalBallById={ver,scanMin,map};
        return map;
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

    if(baseRigidShadowPixelPlacement){
        rigidShadowPixelPlacement=function(g,shadowCells,pos,D,X,Y,BW,BH){
            const colliders=staticVisualColliders(g);
            if(!colliders)return baseRigidShadowPixelPlacement(g,shadowCells,pos,D,X,Y,BW,BH);
            if(!shadowCells||!shadowCells.length)return [];
            const pts=shadowCells.map(([sx,sy,sc])=>{const [px,py]=pos(sx,sy);return{px,py,sc};});
            const floorCenter=Y+BH-D*.5;
            let dy=0;
            const deepest=Math.max(...pts.map(p=>p.py));
            if(deepest+dy>floorCenter)dy=floorCenter-deepest;
            for(let pass=0;pass<4;pass++){
                let changed=false;
                for(const gp of pts){
                    const gx=gp.px,gy=gp.py+dy;
                    for(const q of colliders){
                        const [bpX,bpY]=pos(q.x,q.y);
                        const ddx=Math.abs(gx-bpX);if(ddx>=D-1e-6)continue;
                        const vert=Math.sqrt(Math.max(0,D*D-ddx*ddx));
                        const ceiling=bpY-vert;
                        if(gy>ceiling+1e-6){dy-=gy-ceiling;changed=true;}
                    }
                }
                if(!changed)break;
            }
            const finalDeepest=Math.max(...pts.map(p=>p.py+dy));
            if(finalDeepest>floorCenter)dy-=finalDeepest-floorCenter;
            return pts.map(p=>[p.px,p.py+dy,p.sc]);
        };
    }

    if(baseDrawBall){
        drawBall=function(ctx,cx,cy,d,ci,o={}){
            const alpha=o.alpha===undefined?1:o.alpha;
            const scale=o.scale===undefined?1:o.scale;
            const sq=o.sq===undefined?0:o.sq;
            const aura=o.aura===undefined?0:o.aura;
            const ring=o.ring===undefined?0:o.ring;
            // Settled, unsquashed balls are by far the hottest render path.
            // The canonical routine only save()s, sets globalAlpha=1, draws the
            // already-decoded PNG, then restore()s. When the parent alpha is
            // already 1, the direct drawImage below is pixel-identical and has
            // no context-state side effects, so two state-stack operations per
            // ball per frame can be removed safely.
            if(alpha===1&&scale===1&&sq===0&&aura===0&&ring===0&&d>1.2&&
               ctx?.globalAlpha===1&&typeof imgReady==="function"&&imgReady(ci)){
                ctx.drawImage(BALL_IMG[ci],cx-d/2,cy-d/2,d,d);
                return;
            }
            return baseDrawBall(ctx,cx,cy,d,ci,o);
        };
    }

    if(baseHexGarbageBoardBallById){
        hexGarbageBoardBallById=function(g,id){
            const map=logicalBallByIdMap(g);
            return map?.get(id)||null;
        };
    }

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

    window.__hexRuntimePerformanceVersion="runtime-perf-v2";
    window.__hexStaticBoardContactPassSkipped=true;
    window.__hexActiveCollisionColliderCache=true;
    window.__hexLandingShadowColliderCache=true;
    window.__hexRigidShadowVisualColliderCache=!!baseRigidShadowPixelPlacement;
    window.__hexDefaultBallDrawFastPath=!!baseDrawBall;
    window.__hexGarbageBoardIdLookupCache=!!baseHexGarbageBoardBallById;
    window.__hexPerformanceBehaviorParityRequired=true;
})();
