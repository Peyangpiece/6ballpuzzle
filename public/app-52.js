/* Production tolerance and unilateral settled-garbage contact.
 *
 * Ignore sub-1e-7 packing noise so the final contact solver does not chase
 * floating-point error for dozens of passes. Real penetrations, including the
 * seed-7 ~3.3e-6 case, remain far above this threshold and are still resolved.
 * A garbage ball with no path and zero motion is already settled; contact
 * projection may move it sideways or downward when physically pushed, but must
 * not introduce the tiny upward recoil that is absent from the reference.
 */
const HEX_RENDER_SOLVER_EPS=1e-7;
const HEX_RENDER_FAST_PASSES=24;

const __hexRenderMoveBeforeMonotoneRest=hexRenderMoveAlongNormal;
hexRenderMoveAlongNormal=function(q,nx,ny,amount,sign){
    const oldY=q?.v?.y;
    const settledGarbage=!!q?.ball?.isGarbage&&!(q.ball.fallPath?.length)&&Math.abs(q.v?.vy||0)<=1e-9&&Math.abs(q.v?.motionSpeed||0)<=1e-9;
    __hexRenderMoveBeforeMonotoneRest(q,nx,ny,amount,sign);
    if(settledGarbage&&Number.isFinite(oldY)&&q.v.y<oldY){
        q.v.y=oldY;
        const rest=q.ball._hexGarbageContinuousRest;
        if(rest)rest.py=cellCenterYNorm(q.v.y);
    }
};

hexEnforceFinalVisualNonOverlap=function(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2)return 0;
    let corrections=0;
    for(let pass=0;pass<HEX_RENDER_FAST_PASSES;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            const pdx=(b.v.x-a.v.x)*0.5,pdy=(b.v.y-a.v.y)*HEX_ROW_H;
            if(Math.abs(pdx)>=1||Math.abs(pdy)>=1)continue;
            const n=hexRenderPairNormal(a,b);
            if(n.d>=1-HEX_RENDER_SOLVER_EPS)continue;
            let ma=hexRenderMobility(g,a),mb=hexRenderMobility(g,b);
            if(ma<=0&&mb<=0)ma=mb=1;
            const total=ma+mb;if(total<=0)continue;
            const push=1-n.d;
            hexRenderMoveAlongNormal(a,n.nx,n.ny,push*(ma/total),-1);
            hexRenderMoveAlongNormal(b,n.nx,n.ny,push*(mb/total),+1);
            changed=true;corrections++;
        }
        if(!changed)break;
    }
    return corrections;
};
