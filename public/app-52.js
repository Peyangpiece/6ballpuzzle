/* Production tolerance for the final contact solver.
 *
 * Ignore only sub-1e-7 packing noise so the solver does not chase floating-
 * point error through already packed rows. Real penetrations, including the
 * seed-7 multi-micro-unit failures, remain above this threshold and are still
 * resolved. Do not prohibit an upward component of a genuine contact response:
 * a settled garbage ball may need to ride up a neighbour's tangent when pushed.
 */
const HEX_RENDER_SOLVER_EPS=1e-7;
const HEX_RENDER_FAST_PASSES=24;

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
