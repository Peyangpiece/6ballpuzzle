/* ============================================================
 * 6ball RUNTIME PERFORMANCE AUTHORITATIVE v4
 *
 * Performance only. Physics decisions, destinations, timing and
 * rendered geometry remain authoritative in the existing layers.
 *
 * v4 removes hot-frame allocation/scan work by:
 * - caching contact items per logical board version
 * - reusing numeric spatial buckets (no string keys / pair arrays)
 * - checking only nearby contact candidates
 * - using squared-distance rejection before expensive hypot()
 * - indexing static colliders by logical x column for active-piece
 *   fall clamps and landing-shadow collision tests
 *
 * Difficult contact frames restore their pre-pass coordinates and
 * delegate to the complete v3 solver, so speed never replaces safety.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallRuntimePerformanceV4)return;
    window.__sixBallRuntimePerformanceV4=true;

    const baseSafeActiveFallOffsetV4=
        typeof safeActiveFallOffset==="function"?safeActiveFallOffset:null;
    const baseLandingShadowVisualCellsV4=
        typeof landingShadowVisualCells==="function"?landingShadowVisualCells:null;
    const baseResolveVisualContactsV4=
        typeof resolveVisualContacts==="function"?resolveVisualContacts:null;

    function staticActiveBoard(g){
        return !!(
            g&&g.board&&g.vis&&
            g.state==="PLAYING"&&g.piece&&
            g._visualMovingIds instanceof Set&&
            g._visualMovingIds.size===0
        );
    }

    function staticColumnIndex(g){
        if(!staticActiveBoard(g))return null;
        const scanMin=boardScanMin(g.board),ver=Number(g.ver)||0;
        const cached=g._perfV4StaticColumns;
        if(cached&&cached.ver===ver&&cached.scanMin===scanMin&&cached.board===g.board){
            return cached;
        }

        let items=null;
        const shared=g._perfStaticLogicalColliders;
        if(shared&&shared.ver===ver&&shared.scanMin===scanMin&&Array.isArray(shared.items)){
            items=shared.items;
        }else{
            items=[];
            for(let y=scanMin;y<ROWS;y++)for(let x=0;x<W2;x++){
                if(!valid(x,y))continue;
                const ball=g.board[y][x];
                if(ball)items.push({x,y,id:ball.id});
            }
            /* Share the same scan with the v2 cache instead of forcing the
             * older layer to rescan the board later in the same version. */
            g._perfStaticLogicalColliders={ver,scanMin,items};
        }

        const columns=new Map();
        for(const q of items){
            let list=columns.get(q.x);
            if(!list){list=[];columns.set(q.x,list);}
            list.push(q);
        }
        const out={ver,scanMin,board:g.board,items,columns};
        g._perfV4StaticColumns=out;
        return out;
    }

    function visitColumns(index,center,radius,fn){
        const lo=Math.floor(center-radius)-1;
        const hi=Math.ceil(center+radius)+1;
        for(let x=lo;x<=hi;x++){
            const list=index.columns.get(x);
            if(!list)continue;
            for(let i=0;i<list.length;i++)fn(list[i]);
        }
    }

    if(baseSafeActiveFallOffsetV4){
        safeActiveFallOffset=function(g,cells,dx,dOff,desired){
            const index=staticColumnIndex(g);
            if(!index)return baseSafeActiveFallOffsetV4(g,cells,dx,dOff,desired);
            const H=HEX_ROW_H,R=1.000001;
            let safe=desired;
            for(let i=0;i<cells.length;i++){
                const center=cells[i][0]+dx;
                const ax=center*.5,ay0=(cells[i][1]+dOff)*H;
                const floorOffset=((ROWS-1)*H-ay0)/H;
                if(floorOffset<safe)safe=floorOffset;
                visitColumns(index,center,R*2,q=>{
                    const hx=Math.abs(ax-q.x*.5);
                    if(hx>=R)return;
                    const vertical=Math.sqrt(Math.max(0,R*R-hx*hx));
                    const off=(q.y*H-vertical-ay0)/H;
                    if(off<safe)safe=off;
                });
            }
            g._perfV4ActiveColumnQueries=(g._perfV4ActiveColumnQueries||0)+1;
            return Math.max(0,Math.min(desired,safe));
        };
    }

    if(baseLandingShadowVisualCellsV4){
        landingShadowVisualCells=function(g){
            const index=staticColumnIndex(g);
            if(!index)return baseLandingShadowVisualCellsV4(g);
            const cs=landingShadowCells(g);
            if(!cs||!g?.piece)return null;
            const dxGrid=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;
            let constrained=false;

            for(let i=0;i<cs.length&&!constrained;i++){
                const sx0=cs[i][0],sy=cs[i][1],center=sx0+dxGrid;
                const sxN=latticeRealX(center),syN=cellCenterYNorm(sy);
                visitColumns(index,center,2,q=>{
                    if(constrained)return;
                    const ddx=Math.abs(sxN-latticeRealX(q.x));
                    if(ddx>=1-1e-9)return;
                    const contact=(cellCenterYNorm(q.y)-syN)-Math.sqrt(Math.max(0,1-ddx*ddx));
                    const floor=FLOOR_CENTER_N-syN;
                    if(contact>=-1e-8&&contact<floor-1e-8)constrained=true;
                });
            }

            if(!constrained){
                let lowest=-Infinity;
                for(let i=0;i<cs.length;i++)lowest=Math.max(lowest,cellCenterYNorm(cs[i][1]));
                const rowOffset=(FLOOR_CENTER_N-lowest)/HEX_ROW_H;
                g._perfV4ShadowColumnQueries=(g._perfV4ShadowColumnQueries||0)+1;
                return cs.map(([x,y,c])=>[x+dxGrid,y+rowOffset,c]);
            }

            let maxDown=Infinity;
            for(let i=0;i<cs.length;i++)maxDown=Math.min(maxDown,FLOOR_CENTER_N-cellCenterYNorm(cs[i][1]));
            for(let i=0;i<cs.length;i++){
                const sx0=cs[i][0],sy=cs[i][1],center=sx0+dxGrid;
                const sxN=latticeRealX(center),syN=cellCenterYNorm(sy);
                visitColumns(index,center,2,q=>{
                    const ddx=Math.abs(sxN-latticeRealX(q.x));
                    if(ddx>=1-1e-9)return;
                    const d=(cellCenterYNorm(q.y)-syN)-Math.sqrt(Math.max(0,1-ddx*ddx));
                    if(d>=-1e-8)maxDown=Math.min(maxDown,Math.max(0,d));
                });
            }
            if(!Number.isFinite(maxDown))maxDown=0;
            const rowOffset=Math.max(0,maxDown)/HEX_ROW_H;
            g._perfV4ShadowColumnQueries=(g._perfV4ShadowColumnQueries||0)+1;
            return cs.map(([x,y,c])=>[x+dxGrid,y+rowOffset,c]);
        };
    }

    if(baseResolveVisualContactsV4){
        resolveVisualContacts=function(g){
            const movingIds=g?._visualMovingIds;
            if(!(movingIds instanceof Set)||movingIds.size===0){
                return baseResolveVisualContactsV4(g);
            }
            if(!g?.board||!g?.vis)return baseResolveVisualContactsV4(g);

            const scanMin=boardScanMin(g.board),ver=Number(g.ver)||0;
            let ws=g._perfV4ContactWorkspace;
            if(!ws||ws.ver!==ver||ws.scanMin!==scanMin||ws.board!==g.board||ws.vis!==g.vis){
                const items=[];
                for(let y=scanMin;y<ROWS;y++)for(let x=0;x<W2;x++){
                    if(!valid(x,y))continue;
                    const ball=g.board[y][x];
                    if(!ball)continue;
                    const v=g.vis.get(ball.id);
                    if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
                    items.push({ball,v,x,y,moving:false,startX:0,startY:0});
                }
                ws={
                    ver,scanMin,board:g.board,vis:g.vis,items,
                    buckets:new Map(),usedBuckets:[]
                };
                g._perfV4ContactWorkspace=ws;
                g._perfV4ContactWorkspaceBuilds=(g._perfV4ContactWorkspaceBuilds||0)+1;
            }

            const items=ws.items;
            if(items.length<2)return;

            let movingSeen=0,anyMoving=false;
            for(let i=0;i<items.length;i++){
                const q=items[i],v=g.vis.get(q.ball.id);
                if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y)){
                    return baseResolveVisualContactsV4(g);
                }
                q.v=v;
                q.startX=v.x;q.startY=v.y;
                const direct=movingIds.has(q.ball.id);
                if(direct)movingSeen++;
                q.moving=direct||(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length>0);
                if(q.moving)anyMoving=true;
            }
            /* A moving id not represented by this cached logical-board version
             * means the cache cannot prove equivalence. Use the established v3
             * path immediately. */
            if(movingSeen<movingIds.size||!anyMoving){
                return baseResolveVisualContactsV4(g);
            }

            const H=HEX_ROW_H,MIN=1,CONTACT_LIMIT=MIN-1e-9;
            const CONTACT_LIMIT2=CONTACT_LIMIT*CONTACT_LIMIT;
            const SAFE_LIMIT2=0.999999*0.999999;
            const floorMax=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;

            function shift(q,px,py){
                if(q.ball?.isGarbage&&py<0){
                    const mag=Math.hypot(px,py);
                    let dir=Math.sign(px);
                    if(!dir)dir=Math.sign(q.x-q.v.x)||((q.ball.id&1)?1:-1);
                    px=dir*mag;py=0;
                }
                const ox=q.v.x,oy=q.v.y;
                q.v.x=Math.max(0,Math.min(W2-1,q.v.x+px/.5));
                if(q.ball?.isGarbage){
                    const proposed=q.v.y+py/H;
                    q.v.y=Math.min(floorMax,Math.max(q.v.y,Math.min(q.y,proposed)));
                }else{
                    q.v.y=Math.min(floorMax,q.v.y+py/H);
                }
                return[(q.v.x-ox)*.5,(q.v.y-oy)*H];
            }

            function solvePair(a,b){
                if(!a.moving&&!b.moving)return false;
                let dx=(a.v.x-b.v.x)*.5,dy=(a.v.y-b.v.y)*H;
                const d2=dx*dx+dy*dy;
                if(d2>=CONTACT_LIMIT2)return false;
                /* Math.hypot is retained for actual contacts so the separation
                 * result remains bit-for-bit as close to v3 as possible. */
                let d=Math.hypot(dx,dy);
                if(d<1e-10){
                    const logicalDx=(a.x-b.x)*.5,logicalDy=(a.y-b.y)*H;
                    const ld=Math.hypot(logicalDx,logicalDy);
                    if(ld>1e-10){dx=logicalDx/ld;dy=logicalDy/ld;}
                    else{dx=a.ball.id<b.ball.id?-1:1;dy=0;}
                    d=0;
                }else{dx/=d;dy/=d;}
                const missing=MIN-d;
                const wa=a.moving&&!b.moving?1:(!a.moving&&b.moving?0:.5),wb=1-wa;
                shift(a,dx*missing*wa,dy*missing*wa);
                shift(b,-dx*missing*wb,-dy*missing*wb);

                for(let retry=0;retry<3;retry++){
                    const rx=(a.v.x-b.v.x)*.5,ry=(a.v.y-b.v.y)*H;
                    const rd2=rx*rx+ry*ry;
                    if(rd2>=CONTACT_LIMIT2)break;
                    const rd=Math.hypot(rx,ry);
                    const nx=rd>1e-10?rx/rd:dx,ny=rd>1e-10?ry/rd:dy;
                    const need=MIN-rd;
                    const first=(a.moving&&!b.moving)?a:(b.moving&&!a.moving?b:(retry&1?a:b));
                    const sign=first===a?1:-1;
                    const moved=shift(first,nx*need*sign,ny*need*sign);
                    const gain=Math.hypot(moved[0],moved[1]);
                    if(gain<need*.25){
                        const other=first===a?b:a;
                        shift(other,-nx*need*sign,-ny*need*sign);
                    }
                }
                return true;
            }

            const KEY_STRIDE=4096;
            function bucketKey(bx,by){return bx*KEY_STRIDE+by;}
            function rebuildBuckets(){
                for(let i=0;i<ws.usedBuckets.length;i++)ws.usedBuckets[i].length=0;
                ws.usedBuckets.length=0;
                for(let i=0;i<items.length;i++){
                    const q=items[i],bx=Math.floor(q.v.x*.5),by=Math.floor(q.v.y*H);
                    const key=bucketKey(bx,by);
                    let list=ws.buckets.get(key);
                    if(!list){list=[];ws.buckets.set(key,list);}
                    if(list.length===0)ws.usedBuckets.push(list);
                    list.push(i);
                }
            }

            let candidateChecks=0;
            function visitNearbyPairs(fn){
                rebuildBuckets();
                for(let i=0;i<items.length;i++){
                    const q=items[i],bx=Math.floor(q.v.x*.5),by=Math.floor(q.v.y*H);
                    for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
                        const list=ws.buckets.get(bucketKey(bx+ox,by+oy));
                        if(!list)continue;
                        for(let k=0;k<list.length;k++){
                            const j=list[k];
                            if(j<=i)continue;
                            const other=items[j];
                            if(!q.moving&&!other.moving)continue;
                            candidateChecks++;
                            if(fn(q,other)===false)return false;
                        }
                    }
                }
                return true;
            }

            let passes=0;
            for(;passes<8;passes++){
                let changed=false;
                visitNearbyPairs((a,b)=>{
                    if(solvePair(a,b))changed=true;
                    return true;
                });
                if(!changed)break;
            }

            let unresolved=false;
            visitNearbyPairs((a,b)=>{
                const dx=(a.v.x-b.v.x)*.5,dy=(a.v.y-b.v.y)*H;
                if(dx*dx+dy*dy<SAFE_LIMIT2){unresolved=true;return false;}
                return true;
            });

            g._perfV4CandidatePairChecks=(g._perfV4CandidatePairChecks||0)+candidateChecks;
            g._perfV4ContactPasses=(g._perfV4ContactPasses||0)+passes+1;

            if(unresolved){
                /* Restore the frame exactly before delegating. This is stricter
                 * than v3's fallback and prevents a failed fast attempt from
                 * influencing the canonical result. */
                for(let i=0;i<items.length;i++){
                    items[i].v.x=items[i].startX;
                    items[i].v.y=items[i].startY;
                }
                g._perfV4CanonicalContactFallbacks=(g._perfV4CanonicalContactFallbacks||0)+1;
                return baseResolveVisualContactsV4(g);
            }

            g._perfV4FastContactFrames=(g._perfV4FastContactFrames||0)+1;
        };
    }

    window.__hexRuntimePerformanceVersion="runtime-perf-v4";
    window.__hexMovingContactWorkspaceCache=true;
    window.__hexNumericContactBuckets=true;
    window.__hexContactPairArrayEliminated=true;
    window.__hexContactSquaredDistancePrefilter=true;
    window.__hexStaticColliderColumnIndex=true;
    window.__hexPerformanceBehaviorParityRequired=true;
})();
