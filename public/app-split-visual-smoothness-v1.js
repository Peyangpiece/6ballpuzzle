/* Split visual smoothness authority v1.
 *
 * Visual-only layer. It must never decide whether rigidity releases, whether a
 * split occurs, or which side receives the solo/pair. The authoritative solver
 * and fallPath continue to run unchanged. This wrapper restores the solver's
 * raw visual state before every update, lets the original updateVisuals advance
 * normally, then presents only ordinary split motion through a constant-speed
 * display follower.
 *
 * Because raw state is restored before the next solver tick, this layer cannot
 * affect collision, rigidity, split direction, path completion or timing.
 */
(function installSplitVisualSmoothnessV1(){
if(typeof window==="undefined"||window.__sixBallSplitVisualSmoothnessV1)return;
if(typeof updateVisuals!=="function"||typeof ordinarySplitSegmentNoLift!=="function")return;

window.__sixBallSplitVisualSmoothnessV1=true;
const baseUpdateVisuals=updateVisuals;
const gameState=new WeakMap();
const H=(typeof HEX_ROW_H==="number"&&HEX_ROW_H>0)?HEX_ROW_H:0.8660254037844386;
const REAL_SPEED=Math.max(5.5,(typeof PIECE_SNAP_SPEED==="number"?PIECE_SNAP_SPEED*0.62:5.5));
const EPS=1e-7;

function currentSegment(cell){
    const p=Array.isArray(cell?.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;
    if(!p)return null;
    return p.to?p:{from:null,to:p,pivot:null};
}
function isOrdinarySplit(cell){
    const seg=currentSegment(cell);
    return !!(seg&&ordinarySplitSegmentNoLift(cell,seg));
}
function scan(g,fn){
    if(!g?.board)return;
    const min=typeof boardScanMin==="function"?boardScanMin(g.board):0;
    for(let y=min;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(typeof valid==="function"&&!valid(x,y))continue;
        const cell=g.board[y]?.[x];
        if(cell)fn(cell,x,y);
    }
}
function rawRestore(g,s){
    for(const [id,r] of s.raw){
        const v=g.vis?.get(id);
        if(!v)continue;
        v.x=r.x;v.y=r.y;
        if(Number.isFinite(r.vy))v.vy=r.vy;
        if(Number.isFinite(r.motionSpeed))v.motionSpeed=r.motionSpeed;
    }
}
function chase(prev,target,dt){
    const dx=(target.x-prev.x)*0.5;
    const dy=(target.y-prev.y)*H;
    const dist=Math.hypot(dx,dy);
    if(dist<=EPS)return {x:target.x,y:Math.max(prev.y,target.y),done:true};
    const step=Math.min(dist,REAL_SPEED*Math.max(0,dt));
    const q=step/dist;
    const x=prev.x+(dx*q)/0.5;
    const proposedY=prev.y+(dy*q)/H;
    // Split completion is already no-lift authoritative. Keep that invariant in
    // the presentation layer too: screen y may stay or increase, never rise.
    const y=Math.max(prev.y,proposedY);
    return {x,y,done:step>=dist-EPS};
}

updateVisuals=function(g,dt){
    let s=gameState.get(g);
    if(!s){s={raw:new Map(),display:new Map(),active:new Set()};gameState.set(g,s);}

    // The original integrator always starts from its own unfiltered output.
    rawRestore(g,s);

    const before=new Set();
    scan(g,cell=>{if(isOrdinarySplit(cell))before.add(cell.id);});

    baseUpdateVisuals(g,dt);

    const alive=new Set();
    scan(g,cell=>{
        alive.add(cell.id);
        const v=g.vis?.get(cell.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return;
        const now=isOrdinarySplit(cell);
        const active=before.has(cell.id)||now||s.active.has(cell.id);
        if(!active){s.raw.delete(cell.id);s.display.delete(cell.id);return;}

        const raw={x:v.x,y:v.y,vy:v.vy,motionSpeed:v.motionSpeed};
        s.raw.set(cell.id,raw);
        const prev=s.display.get(cell.id)||{x:raw.x,y:raw.y};
        const out=chase(prev,raw,dt);
        v.x=out.x;v.y=out.y;
        s.display.set(cell.id,{x:out.x,y:out.y});

        const stillHasPath=Array.isArray(cell.fallPath)&&cell.fallPath.length>0;
        if(now||before.has(cell.id)||stillHasPath||!out.done)s.active.add(cell.id);
        else{
            s.active.delete(cell.id);
            s.raw.delete(cell.id);
            s.display.delete(cell.id);
        }
    });

    for(const id of Array.from(s.raw.keys()))if(!alive.has(id)){s.raw.delete(id);s.display.delete(id);s.active.delete(id);}
};

window.__sixBallSplitVisualOnly=true;
window.__sixBallSplitVisualConstantSpeed=true;
window.__sixBallSplitVisualNeverChangesRigidity=true;
window.__sixBallSplitVisualNeverChangesDirection=true;
window.__sixBallSplitVisualNeverChangesFallPath=true;
window.__sixBallSplitVisualRealSpeed=REAL_SPEED;
window.__sixBallSplitVisualSmoothnessVersion="split-visual-smoothness-v1";
})();
