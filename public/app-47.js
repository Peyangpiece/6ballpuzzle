/* Render-boundary swept-contact invariant.
 *
 * Keep the previous rendered continuous centre for every relaxing garbage ball.
 * After the full app-44/app-46 solver stack has run, reject any same-frame
 * result that crossed a support tangent.  The corrected centre is never above
 * its previous rendered centre, so there is no visible recoil; penetration is
 * removed inside the same frame before updateVisuals can expose it.
 */
const HEX_GARBAGE_RENDER_SWEEP_TARGET=1.00001;
const HEX_GARBAGE_RENDER_SWEEP_PASSES=24;

function hexGarbageRenderSweepPrev(g){
    const out=new Map();
    for(const m of hexGarbageRelaxMembers(g)){
        out.set(m.ball.id,{px:m.r.px,py:m.r.py,groupKey:m.r.groupKey});
    }
    return out;
}

function hexGarbageRenderSweepTangent(px,sx,sy){
    const dx=px-sx,adx=Math.abs(dx);
    if(adx>=HEX_GARBAGE_RENDER_SWEEP_TARGET)return Infinity;
    return sy-Math.sqrt(Math.max(0,HEX_GARBAGE_RENDER_SWEEP_TARGET*HEX_GARBAGE_RENDER_SWEEP_TARGET-dx*dx));
}

function hexGarbageRenderSweepClampUpper(upper,lower,upperPrevY){
    const tangent=hexGarbageRenderSweepTangent(upper.r.px,lower.r.px,lower.r.py);
    if(!Number.isFinite(tangent)||tangent<upperPrevY-1e-9)return false;
    if(upper.r.py<=tangent+1e-9)return false;
    upper.r.py=Math.max(upperPrevY,tangent);
    upper.r.vy=0;
    return true;
}

function hexGarbageRenderSweepClampFixed(m,s,prevY){
    const tangent=hexGarbageRenderSweepTangent(m.r.px,s.px,s.py);
    if(!Number.isFinite(tangent)||tangent<prevY-1e-9)return false;
    if(m.r.py<=tangent+1e-9)return false;
    m.r.py=Math.max(prevY,tangent);m.r.vy=0;return true;
}

function hexGarbageEnforceRenderSweep(g,prev){
    let moving=hexGarbageRelaxMembers(g);
    if(!moving.length)return 0;
    const ids=new Set(moving.map(m=>m.ball.id)),fixed=hexGarbageRelaxFixed(g,ids);
    let corrections=0;

    // First prevent vertical support crossings using the previous rendered
    // ordering.  This catches the exact first-contact STRAIGHT case where the
    // tentative 120 Hz fall crossed a tangent before lateral projection.
    for(let pass=0;pass<HEX_GARBAGE_RENDER_SWEEP_PASSES;pass++){
        let changed=false;
        moving=hexGarbageRelaxMembers(g);
        for(const m of moving){
            const pm=prev.get(m.ball.id);if(!pm)continue;
            for(const s of fixed){
                if(s.py<=pm.py+1e-9)continue;
                if(hexGarbageRenderSweepClampFixed(m,s,pm.py)){changed=true;corrections++;}
            }
        }
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
            const a=moving[i],b=moving[j],pa=prev.get(a.ball.id),pb=prev.get(b.ball.id);
            if(!pa||!pb)continue;
            if(pa.py<pb.py-1e-9){
                if(hexGarbageRenderSweepClampUpper(a,b,pa.py)){changed=true;corrections++;}
            }else if(pb.py<pa.py-1e-9){
                if(hexGarbageRenderSweepClampUpper(b,a,pb.py)){changed=true;corrections++;}
            }
        }

        // Restore one-diameter separation after the vertical clamps.  The
        // app-42 signed-order pair solver cannot let siblings cross horizontally.
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
            const a=moving[i],b=moving[j];
            if(Math.hypot(a.r.px-b.r.px,a.r.py-b.r.py)<HEX_GARBAGE_RENDER_SWEEP_TARGET-1e-9){
                if(hexGarbageRelaxPair(a,b)){changed=true;corrections++;}
            }
        }
        for(const m of moving){
            const pm=prev.get(m.ball.id);if(!pm)continue;
            m.r.py=Math.min(FLOOR_CENTER_N,Math.max(pm.py,m.r.py));
            hexGarbageRelaxWallFloor(m);
        }
        if(!changed)break;
    }

    // These are the coordinates that updateVisuals/rendering must see.
    for(const m of hexGarbageRelaxMembers(g)){
        m.v.x=m.r.px/.5;
        m.v.y=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=Math.max(0,m.r.vy/HEX_ROW_H);
        m.v.motionSpeed=Math.hypot(m.r.vx,m.r.vy);
    }
    return corrections;
}

const __hexGarbageRelaxStepBeforeRenderSweepInvariant=hexGarbageRelaxStep;
hexGarbageRelaxStep=function(g,dt){
    const prev=hexGarbageRenderSweepPrev(g);
    const result=__hexGarbageRelaxStepBeforeRenderSweepInvariant(g,dt);
    hexGarbageEnforceRenderSweep(g,prev);
    return result;
};
