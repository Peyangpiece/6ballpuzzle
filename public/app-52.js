/* Production tolerance for the final contact solver.
 *
 * Ignore only sub-1e-7 packing noise so the solver does not chase floating-
 * point error through already packed rows. Real penetrations, including the
 * seed-7 multi-micro-unit failures, remain above this threshold and are still
 * resolved. A settled garbage ball may ride up a neighbour's tangent when
 * genuinely pushed; only an upward component no larger than the numerical
 * tolerance is treated as zero recoil.
 */
const HEX_RENDER_SOLVER_EPS=1e-7;
const HEX_RENDER_FAST_PASSES=24;
const HEX_RENDER_UPWARD_NOISE_EPS=1e-7;

const __hexRenderMoveBeforeNoiseClamp=hexRenderMoveAlongNormal;
hexRenderMoveAlongNormal=function(q,nx,ny,amount,sign){
    const oldY=q?.v?.y;
    const settledGarbage=!!q?.ball?.isGarbage&&!(q.ball.fallPath?.length)&&Math.abs(q.v?.vy||0)<=1e-9&&Math.abs(q.v?.motionSpeed||0)<=1e-9;
    __hexRenderMoveBeforeNoiseClamp(q,nx,ny,amount,sign);
    if(!settledGarbage||!Number.isFinite(oldY)||!Number.isFinite(q?.v?.y))return;
    const upward=oldY-q.v.y;
    if(upward>0&&upward<=HEX_RENDER_UPWARD_NOISE_EPS){
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
