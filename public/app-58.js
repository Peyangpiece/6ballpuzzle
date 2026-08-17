/* Dense-contact convergence after exact-diameter garbage physics.
 *
 * The impossible 1.00001 garbage spacing was removed in app-57. In the fixed
 * seed-1 HEXAGON case the final contact projection is now well-behaved, but its
 * previous 24-pass cap stops mid-convergence: one more 24-pass call moves the
 * minimum distance from ~0.999918 to ~0.9999998 and a few additional passes
 * finish the contact manifold. Keep the same strict penetration tolerance and
 * pair response; only raise the emergency convergence ceiling. Empty/safe
 * frames still exit after the first pass because changed remains false.
 */
const HEX_RENDER_CONVERGENCE_PASSES=72;

hexEnforceFinalVisualNonOverlap=function(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2)return 0;
    let corrections=0;
    for(let pass=0;pass<HEX_RENDER_CONVERGENCE_PASSES;pass++){
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
