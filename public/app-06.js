/* Shared garbage presentation constants and visual collision helpers.
 *
 * The former airborne-packet materializer that lived here was superseded by
 * app-garbage-normal-physics.js. Keeping both implementations meant the same
 * GARBAGE entry points were defined twice and then overwritten later at load
 * time. This file now contains only helpers still used by the current runtime.
 */
const HEX_GARBAGE_SHAPE_INTERVAL=0.5;
const HEX_GARBAGE_BUBBLE_DURATION=0.34;
const HEX_GARBAGE_BUBBLE_POP_DURATION=0.14;
const HEX_GARBAGE_FLIGHT_V0=RELEASE_INITIAL_VY;
window.__hexdropGarbageInterval=HEX_GARBAGE_SHAPE_INTERVAL;

function visualPointSafe(g,id,x,y,minDist=0.999999){
    const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    if(y>maxVisualRowY+1e-7)return false;
    for(const [oid,ov] of g.vis.entries()){
        if(oid===id||!ov)continue;
        const pivot=g._visualArcPivotById?.get(id);
        if(pivot){
            const pdx=(ov.x-pivot[0])*0.5,pdy=(ov.y-pivot[1])*HEX_ROW_H;
            if(pdx*pdx+pdy*pdy<=1e-10)continue;
        }
        const dx=(x-ov.x)*0.5,dy=(y-ov.y)*HEX_ROW_H;
        if(dx*dx+dy*dy<minDist*minDist)return false;
    }
    return true;
}
function visualSegmentSafe(g,id,ox,oy,nx,ny,minDist=0.999999){
    const physical=Math.hypot((nx-ox)*0.5,(ny-oy)*HEX_ROW_H);
    const samples=Math.max(12,Math.min(48,Math.ceil(physical*36)));
    for(let i=1;i<=samples;i++){
        const t=i/samples;
        if(!visualPointSafe(g,id,ox+(nx-ox)*t,oy+(ny-oy)*t,minDist))return false;
    }
    return true;
}
function clampVisualSegment(g,id,ox,oy,nx,ny){
    if(visualSegmentSafe(g,id,ox,oy,nx,ny))return [nx,ny,1];
    let lo=0,hi=1;
    for(let i=0;i<14;i++){
        const m=(lo+hi)*0.5;
        const x=ox+(nx-ox)*m,y=oy+(ny-oy)*m;
        if(visualSegmentSafe(g,id,ox,oy,x,y))lo=m;else hi=m;
    }
    return lo>1e-6?[ox+(nx-ox)*lo,oy+(ny-oy)*lo,lo]:[ox,oy,0];
}
