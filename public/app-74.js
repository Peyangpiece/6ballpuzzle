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
function hex74Tagged(b){return !!b&&Number.isFinite(b._hexHardDropNoUpY);}
function hex74VisualItems(g){
    const a=[];hex74EachBall(g,(ball,x,y)=>{const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))a.push({ball,v,x,y});});return a;
}
function hex74ClampX(x){return Math.max(0,Math.min(W2-1,x));}

/* The normal visual contact solver is free to use a tiny upward projection to
 * remove penetration.  Re-applying only the Y coordinate afterwards was the
 * source of the remaining hard-drop overlap: the solver had already stopped
 * because the pair was tangent, then the one-axis clamp put the pair back
 * inside one another.  Resolve any clamp-created penetration with directions
 * that can never move a hard-dropped centre upward: horizontal first, then
 * downward only when a wall leaves no horizontal room. */
function hex74ResolveNoUpOverlaps(g){
    const H=HEX_ROW_H,EPS=1.000001;
    let changed=false;
    for(let pass=0;pass<32;pass++){
        let any=false;const a=hex74VisualItems(g);
        for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
            const A=a[i],B=a[j],ta=hex74Tagged(A.ball),tb=hex74Tagged(B.ball);
            if(!ta&&!tb)continue;
            let dxp=(B.v.x-A.v.x)*.5,dyp=(B.v.y-A.v.y)*H,d=Math.hypot(dxp,dyp);
            if(d>=EPS-1e-8)continue;

            // Prefer horizontal separation. This preserves monotonic downward
            // motion and is exactly the degree of freedom left by the reference
            // contact pose when a floor/support prevents vertical motion.
            if(Math.abs(dyp)<EPS-1e-9){
                const req=Math.sqrt(Math.max(0,EPS*EPS-dyp*dyp)),need=Math.max(0,(req-Math.abs(dxp))/.5);
                if(need>1e-9){
                    let side=Math.sign(B.v.x-A.v.x);
                    if(!side)side=Math.sign(B.x-A.x)||1;
                    let rem=need;
                    const roomA=side>0?A.v.x:W2-1-A.v.x;
                    const roomB=side>0?W2-1-B.v.x:B.v.x;
                    if(ta&&tb){
                        const ma=Math.min(rem*.5,Math.max(0,roomA)),mb=Math.min(rem*.5,Math.max(0,roomB));
                        A.v.x=hex74ClampX(A.v.x-side*ma);B.v.x=hex74ClampX(B.v.x+side*mb);rem-=ma+mb;
                        if(rem>1e-9){const ea=Math.min(rem,Math.max(0,(side>0?A.v.x:W2-1-A.v.x)));A.v.x=hex74ClampX(A.v.x-side*ea);rem-=ea;}
                        if(rem>1e-9){const eb=Math.min(rem,Math.max(0,(side>0?W2-1-B.v.x:B.v.x)));B.v.x=hex74ClampX(B.v.x+side*eb);rem-=eb;}
                    }else if(ta){
                        const m=Math.min(rem,Math.max(0,roomA));A.v.x=hex74ClampX(A.v.x-side*m);rem-=m;
                        if(rem>1e-9){const n=Math.min(rem,Math.max(0,roomB));B.v.x=hex74ClampX(B.v.x+side*n);rem-=n;}
                    }else{
                        const m=Math.min(rem,Math.max(0,roomB));B.v.x=hex74ClampX(B.v.x+side*m);rem-=m;
                        if(rem>1e-9){const n=Math.min(rem,Math.max(0,roomA));A.v.x=hex74ClampX(A.v.x-side*n);rem-=n;}
                    }
                }
            }

            dxp=(B.v.x-A.v.x)*.5;dyp=(B.v.y-A.v.y)*H;d=Math.hypot(dxp,dyp);
            if(d<EPS-1e-8&&Math.abs(dxp)<EPS-1e-9){
                const reqY=Math.sqrt(Math.max(0,EPS*EPS-dxp*dxp)),needY=Math.max(0,(reqY-Math.abs(dyp))/H);
                if(needY>1e-9){
                    // Downward-only fallback. Prefer the visually lower centre;
                    // never lift either hard-dropped centre to make room.
                    const lower=A.v.y>=B.v.y?A:B,other=lower===A?B:A;
                    let room=(ROWS-1)-lower.v.y,m=Math.min(needY,Math.max(0,room));
                    lower.v.y+=m;
                    if(m<needY-1e-9&&!hex74Tagged(other)){
                        room=(ROWS-1)-other.v.y;const n=Math.min(needY-m,Math.max(0,room));other.v.y+=n;
                    }
                }
            }
            const nd=hexPhysDist(A.v.x,A.v.y,B.v.x,B.v.y);
            if(nd>d+1e-9){any=true;changed=true;}
        }
        if(!any)break;
    }
    return changed;
}

hardDrop=function(g){
    const before=g?.nextId;
    __hex74HardDropBeforeContinuity(g);
    if(!g||!Number.isFinite(before))return;
    for(let id=before;id<before+3;id++){
        const q=hex74FindById(g,id);if(!q)continue;
        const v=g.vis.get(id);if(!v)continue;
        q.b._hexHardDropNoUpY=v.y;
        q.b._hexHardDropContactX=v.x;
        q.b._hexHardDropContactY=v.y;
    }
};

if(__hex74RenderMobilityBeforeContinuity){
    // hexRenderMobility's canonical signature is (game, visualItem).
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
    hex74EachBall(g,(b)=>{if(hex74Tagged(b)){const v=g.vis.get(b.id);if(v)prevY.set(b.id,v.y);}});

    const result=__hex74StepBeforeContinuity(g,dt);

    hex74EachBall(g,(b,x,y)=>{
        const v=g.vis.get(b.id);if(!v)return;
        const hold=b.hardDropContactHold;
        const path=Array.isArray(b.fallPath)?b.fallPath:null;

        // A hard-drop pose with no logical movement is already a valid physical
        // contact pose (it came directly from the landing guide). Preserve both
        // coordinates, not just Y. This avoids undoing a collision solver's Y
        // correction while leaving its compensating X correction behind.
        if(hold&&(!path||!path.length)){
            v.x=hold.x;v.y=hold.y;v.vy=0;v.motionSpeed=0;
        }

        // SETTLE has accepted this fractional contact and advanced to CHECK (or
        // beyond). Convert the temporary hold to a normal continuous rest.
        if(hold&&(!path||!path.length)&&(g.state!=="RESOLVING"||g.phase!=="SETTLE")){
            b._hexHardDropContinuousRest={x:hold.x,y:hold.y,ax:x,ay:y};
            delete b.hardDropContactHold;
        }

        const rest=b._hexHardDropContinuousRest;
        if(rest&&x===rest.ax&&y===rest.ay&&(!path||!path.length)){
            v.x=rest.x;v.y=rest.y;v.vy=0;v.motionSpeed=0;
        }

        if(hex74Tagged(b)){
            const py=prevY.get(b.id),floor=Number.isFinite(py)?py:b._hexHardDropNoUpY;
            if(v.y<floor-1e-9){v.y=floor;if(Number.isFinite(v.vy)&&v.vy<0)v.vy=0;}
            b._hexHardDropNoUpY=Math.max(b._hexHardDropNoUpY,v.y);
        }
    });

    // The no-up constraint is applied after the legacy solver, so repair only
    // contacts touched by those tagged hard-drop balls with horizontal/downward
    // motion. This preserves both invariants in the same final frame: no recoil
    // and no overlap.
    hex74ResolveNoUpOverlaps(g);

    hex74EachBall(g,(b)=>{
        if(!hex74Tagged(b))return;
        const path=Array.isArray(b.fallPath)?b.fallPath:null;
        if((g.state!=="RESOLVING"||g.phase!=="SETTLE")&&(!path||!path.length)){
            delete b._hexHardDropNoUpY;delete b._hexHardDropContactX;delete b._hexHardDropContactY;
        }
    });
    return result;
};
