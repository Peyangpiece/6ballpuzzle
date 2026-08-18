/* HEXDROP hard-drop post-contact continuity.
 *
 * A guide/contact pose may be a stable continuous position between bookkeeping
 * lattice centres. Once SETTLE has accepted that pose, promote the temporary
 * app-68 hold to a persistent continuous rest instead of leaving a stale hold
 * flag forever. If support later disappears, the first real fallPath is
 * rebased from that exact rest point.
 *
 * Hard-dropped balls also carry downward impact momentum. Final visual contact
 * correction must never make those three balls visibly recoil upward from the
 * contact pose; downward and lateral pile motion remain unrestricted.
 */
const __hex74HardDropBeforeContinuity=hardDrop;
const __hex74UpdateVisualsBeforeContinuity=updateVisuals;
const __hex74StepBeforeContinuity=stepEngine;
const __hex74NearlySettledBeforeContinuity=nearlySettled;
const __hex74RenderMobilityBeforeContinuity=typeof hexRenderMobility==="function"?hexRenderMobility:null;

function hex74EachBall(g,fn){
    if(!g?.board)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;if(b)fn(b,x,y);
    }
}
function hex74FindById(g,id){
    let out=null;
    hex74EachBall(g,(b,x,y)=>{if(!out&&b.id===id)out={b,x,y};});
    return out;
}
function hex74StableContactMarker(b){return b?.hardDropContactHold||b?._hexHardDropContinuousRest||null;}

hardDrop=function(g){
    const before=g?.nextId;
    __hex74HardDropBeforeContinuity(g);
    if(!g||!Number.isFinite(before))return;
    for(let id=before;id<before+3;id++){
        const q=hex74FindById(g,id);if(!q)continue;
        const v=g.vis.get(id);if(!v)continue;
        q.b._hexHardDropNoUpY=v.y;
    }
};

if(__hex74RenderMobilityBeforeContinuity){
    // hexRenderMobility's canonical signature is (game, visualItem). The prior
    // revision treated the first argument as a ball, so the stable-contact test
    // never matched and final overlap projection could move the held contact.
    hexRenderMobility=function(g,q){
        if(hex74StableContactMarker(q?.ball))return 0;
        return __hex74RenderMobilityBeforeContinuity(g,q);
    };
}

nearlySettled=function(g,tol){
    if(!g?.board)return __hex74NearlySettledBeforeContinuity(g,tol);
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;if(!cell)continue;
        const v=g.vis.get(cell.id);
        if(Array.isArray(cell.fallPath)&&cell.fallPath.length)return false;
        const rest=hex74StableContactMarker(cell);
        if(rest){
            if(!v||Math.abs(v.y-rest.y)>tol||Math.abs(v.x-rest.x)>tol)return false;
            continue;
        }
        if(v&&(Math.abs(v.y-y)>tol||Math.abs(v.x-x)>tol))return false;
    }
    return true;
};

updateVisuals=function(g,dt){
    // A later logical move releases a stable contact rest and starts rendering
    // from the exact physical position rather than from the lattice centre.
    hex74EachBall(g,(b,x,y)=>{
        const rest=b._hexHardDropContinuousRest;if(!rest)return;
        const path=Array.isArray(b.fallPath)?b.fallPath:null;
        if(path&&path.length){
            const seg=path[0];if(seg?.from)seg.from=[rest.x,rest.y];
            delete b._hexHardDropContinuousRest;
        }else if(x!==rest.ax||y!==rest.ay){
            delete b._hexHardDropContinuousRest;
        }
    });
    __hex74UpdateVisualsBeforeContinuity(g,dt);
    hex74EachBall(g,(b,x,y)=>{
        const rest=b._hexHardDropContinuousRest;if(!rest)return;
        if(x!==rest.ax||y!==rest.ay){delete b._hexHardDropContinuousRest;return;}
        const v=g.vis.get(b.id);if(!v)return;
        v.x=rest.x;v.y=rest.y;v.vy=0;v.motionSpeed=0;
    });
};

stepEngine=function(g,dt){
    if(!g)return __hex74StepBeforeContinuity(g,dt);
    const prevY=new Map();
    hex74EachBall(g,(b)=>{
        if(!Number.isFinite(b._hexHardDropNoUpY))return;
        const v=g.vis.get(b.id);if(v)prevY.set(b.id,v.y);
    });

    const result=__hex74StepBeforeContinuity(g,dt);

    hex74EachBall(g,(b,x,y)=>{
        const v=g.vis.get(b.id);

        // SETTLE has accepted this fractional contact and advanced to CHECK (or
        // beyond). Convert the temporary hold to a normal continuous rest.
        const hold=b.hardDropContactHold;
        const path=Array.isArray(b.fallPath)?b.fallPath:null;
        if(hold&&(!path||!path.length)&&(g.state!=="RESOLVING"||g.phase!=="SETTLE")){
            b._hexHardDropContinuousRest={x:hold.x,y:hold.y,ax:x,ay:y};
            delete b.hardDropContactHold;
        }

        const rest=b._hexHardDropContinuousRest;
        if(rest&&v&&x===rest.ax&&y===rest.ay&&(!path||!path.length)){
            v.x=rest.x;v.y=rest.y;v.vy=0;v.motionSpeed=0;
        }

        // Clamp only upward recoil. Any equal/downward displacement selected by
        // pile physics is preserved, so slides, splits and gravity still run.
        if(Number.isFinite(b._hexHardDropNoUpY)&&v){
            const py=prevY.get(b.id);
            const floor=Number.isFinite(py)?py:b._hexHardDropNoUpY;
            if(v.y<floor-1e-9){v.y=floor;if(Number.isFinite(v.vy)&&v.vy<0)v.vy=0;}
            b._hexHardDropNoUpY=Math.max(b._hexHardDropNoUpY,v.y);
            if((g.state!=="RESOLVING"||g.phase!=="SETTLE")&&(!path||!path.length)){
                delete b._hexHardDropNoUpY;
            }
        }
    });
    return result;
};
