/* Swept downward contact for continuous released garbage.
 *
 * A monotone solver must prevent penetration BEFORE it happens.  If an upper
 * released circle advances through a lower support during one 120 Hz step,
 * later overlap projection has only two bad choices: recoil upward or shove the
 * circle sideways through the support chain.  Compute the earliest downward
 * tangent against floor, fixed pile and lower moving siblings, clamp the
 * proposed Y to that tangent, then run the lateral no-overlap solver.  Contact
 * therefore transitions continuously from fall -> tangent -> slide with no
 * upward correction and no tunnelling.
 */
const HEX_GARBAGE_SWEEP_EPS=1e-9;

function hexGarbageSweepTangentY(px,sx,sy,target=HEX_GARBAGE_MONO_CONTACT_DIST){
    const dx=px-sx,adx=Math.abs(dx);
    if(adx>=target)return Infinity;
    return sy-Math.sqrt(Math.max(0,target*target-dx*dx));
}

function hexGarbageSweepClampDown(m,oldY,fixed,moving,prevY){
    let earliest=Math.min(m.r.py,FLOOR_CENTER_N),hit=false;

    for(const s of fixed){
        // Only a centre at the same level or below can support a descending ball.
        if(s.py<oldY-HEX_GARBAGE_SWEEP_EPS)continue;
        const cy=hexGarbageSweepTangentY(m.r.px,s.px,s.py);
        if(!Number.isFinite(cy)||cy<oldY-HEX_GARBAGE_SWEEP_EPS)continue;
        if(cy<earliest-HEX_GARBAGE_SWEEP_EPS){earliest=cy;hit=true;}
    }

    for(const other of moving){
        if(other===m)continue;
        const oy=prevY.get(other.ball.id);
        // Preserve first-contact vertical order.  A sibling that started below
        // this centre may support it; one that started above may not become an
        // artificial ceiling during the same step.
        if(!Number.isFinite(oy)||oy<=oldY+HEX_GARBAGE_SWEEP_EPS)continue;
        const cy=hexGarbageSweepTangentY(m.r.px,other.r.px,other.r.py);
        if(!Number.isFinite(cy)||cy<oldY-HEX_GARBAGE_SWEEP_EPS)continue;
        if(cy<earliest-HEX_GARBAGE_SWEEP_EPS){earliest=cy;hit=true;}
    }

    if(earliest<m.r.py-HEX_GARBAGE_SWEEP_EPS||hit){
        m.r.py=Math.max(oldY,earliest);
        m.r.vy=0;
        return true;
    }
    m.r.py=Math.max(oldY,Math.min(FLOOR_CENTER_N,m.r.py));
    if(m.r.py>=FLOOR_CENTER_N-HEX_GARBAGE_SWEEP_EPS)m.r.vy=0;
    return false;
}

hexGarbageRelaxStep=function(g,dt){
    const moving=hexGarbageRelaxMembers(g);if(!moving.length)return 0;
    const ids=new Set(moving.map(m=>m.ball.id)),fixed=hexGarbageRelaxFixed(g,ids);
    const h=Math.max(0,Math.min(PHYSICS_FRAME,dt));
    const prevY=new Map();

    // Tentative semi-implicit step.  Horizontal motion is allowed before the
    // sweep so the tangent corresponds to the actual continuous sliding line.
    for(const m of moving){
        prevY.set(m.ball.id,m.r.py);
        m.r.vy=Math.max(0,m.r.vy+GRAV*h);
        m.r.px+=m.r.vx*h;
        const maxX=(W2-1)*.5;
        if(m.r.px<0){m.r.px=0;if(m.r.vx<0)m.r.vx=0;}
        if(m.r.px>maxX){m.r.px=maxX;if(m.r.vx>0)m.r.vx=0;}
        m.r.py+=m.r.vy*h;
        m.r.age+=h;
    }

    // Process lower centres first.  Their swept/floor-limited locations are then
    // authoritative supports for upper siblings in this same physics frame.
    const verticalOrder=moving.slice().sort((a,b)=>prevY.get(b.ball.id)-prevY.get(a.ball.id)||a.ball.id-b.ball.id);
    let contacts=0;
    for(const m of verticalOrder){
        if(hexGarbageSweepClampDown(m,prevY.get(m.ball.id),fixed,moving,prevY))contacts++;
    }

    // Lateral constrained convergence from app-41/app-42.  Y may increase only
    // for a lower ball when width is exhausted; never decrease below prevY.
    for(let pass=0;pass<HEX_GARBAGE_MONO_PASSES;pass++){
        let changed=false;
        for(const m of moving){
            const minY=prevY.get(m.ball.id);
            const beforeX=m.r.px,beforeY=m.r.py;
            hexGarbageRelaxWallFloor(m);
            m.r.py=Math.min(FLOOR_CENTER_N,Math.max(minY,m.r.py));
            if(Math.abs(beforeX-m.r.px)>1e-12||Math.abs(beforeY-m.r.py)>1e-12){changed=true;contacts++;}
            for(const s of fixed){
                const d=Math.hypot(m.r.px-s.px,m.r.py-s.py);
                if(d<HEX_GARBAGE_MONO_CONTACT_DIST-1e-10&&hexGarbageRelaxFixedContact(m,s)){changed=true;contacts++;}
                m.r.py=Math.min(FLOOR_CENTER_N,Math.max(minY,m.r.py));
                hexGarbageRelaxWallFloor(m);
            }
        }
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
            const a=moving[i],b=moving[j];
            const d=Math.hypot(a.r.px-b.r.px,a.r.py-b.r.py);
            if(d<HEX_GARBAGE_MONO_CONTACT_DIST-1e-10&&hexGarbageRelaxPair(a,b)){changed=true;contacts++;}
            a.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(a.ball.id),a.r.py));
            b.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(b.ball.id),b.r.py));
            hexGarbageRelaxWallFloor(a);hexGarbageRelaxWallFloor(b);
        }
        if(!changed)break;
    }

    // One second sweep catches support geometry changed by the lateral solve.
    // It can only limit additional DOWNWARD movement to a tangent; it never
    // moves a centre upward relative to the previous rendered frame.
    for(const m of verticalOrder){
        const oldY=prevY.get(m.ball.id);
        if(m.r.py>oldY+HEX_GARBAGE_SWEEP_EPS){
            if(hexGarbageSweepClampDown(m,oldY,fixed,moving,prevY))contacts++;
        }
    }

    // Final same-frame separation after the second sweep.
    for(let pass=0;pass<24;pass++){
        let changed=false;
        for(const m of moving)for(const s of fixed){
            if(Math.hypot(m.r.px-s.px,m.r.py-s.py)<HEX_GARBAGE_MONO_CONTACT_DIST-1e-9){
                if(hexGarbageRelaxFixedContact(m,s)){changed=true;contacts++;}
                m.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(m.ball.id),m.r.py));
                hexGarbageRelaxWallFloor(m);
            }
        }
        for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
            const a=moving[i],b=moving[j];
            if(Math.hypot(a.r.px-b.r.px,a.r.py-b.r.py)<HEX_GARBAGE_MONO_CONTACT_DIST-1e-9){
                if(hexGarbageRelaxPair(a,b)){changed=true;contacts++;}
                a.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(a.ball.id),a.r.py));
                b.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(b.ball.id),b.r.py));
                hexGarbageRelaxWallFloor(a);hexGarbageRelaxWallFloor(b);
            }
        }
        if(!changed)break;
    }

    for(const m of moving){
        m.r.py=Math.min(FLOOR_CENTER_N,Math.max(prevY.get(m.ball.id),m.r.py));
        m.r.vx*=.997;
        m.r.vy=Math.max(0,m.r.vy);
        const speed=Math.hypot(m.r.vx,m.r.vy);
        if(speed<=HEX_GARBAGE_RELAX_STABLE_SPEED)m.r.stableT+=h;else m.r.stableT=0;
        if(m.r.stableT>=HEX_GARBAGE_RELAX_STABLE_TIME||m.r.age>=HEX_GARBAGE_RELAX_MAX_AGE){
            m.r.vx=0;m.r.vy=0;
            m.ball._hexContinuousSettled=true;
            delete m.ball._hexGarbageRelax;
        }
        m.v.x=m.r.px/.5;
        m.v.y=(m.r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        m.v.vy=Math.max(0,m.r.vy/HEX_ROW_H);
        m.v.motionSpeed=Math.hypot(m.r.vx,m.r.vy);
    }
    return contacts;
};
