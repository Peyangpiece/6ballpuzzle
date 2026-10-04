/* Every-cleared-ball disappearance FX invariant.
 *
 * Technique formation FX intentionally highlight only the six cells that form
 * the PYRAMID/HEXAGON/STRAIGHT geometry. Same-colour balls outside that geometry
 * are also removed by the clear, but therefore could miss the bright white
 * disappearance flash even though they received the ordinary fade.
 *
 * This render-only adapter drives the disappearance flash from g.clearing.cells
 * itself. That list is the authoritative set of balls that will be removed, so
 * every disappearing ball receives the same local flash whether it is a
 * technique-forming ball, an additional same-colour ball, a normal group clear,
 * or an already-committed ghost. Logical clearing, timing, gravity and scoring
 * are untouched.
 */
(function installClearAllBallFx(){
    if(typeof window==="undefined"||window.__hexClearAllBallFx)return;
    if(typeof drawSide!=="function")return;
    window.__hexClearAllBallFx=true;

    const baseDrawSide=drawSide;

    function clearFxCells(g){
        if(!g?.clearing||!Array.isArray(g.clearing.cells))return[];
        const seen=new Set(),out=[];
        for(const cell of g.clearing.cells){
            if(!Array.isArray(cell)||cell.length<4)continue;
            const [x,y,c,id]=cell;
            if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(c))continue;
            const key=Number.isFinite(id)?"id:"+id:"xy:"+x+","+y;
            if(seen.has(key))continue;
            seen.add(key);out.push({x,y,c,id});
        }
        return out;
    }

    function flashState(g){
        const hold=Math.max(.001,Number(g?.holdT)||.4);
        const ratio=typeof CLEAR_SUPPORT_RELEASE_RATIO==="number"?CLEAR_SUPPORT_RELEASE_RATIO:.55;
        const releaseAt=hold*ratio;
        // Clip 3 F605-F609: shrinking hollow rings, then six-point sparks.
        // The former overlay grew a filled white disc for .42s instead.
        const rawAge=(Number(g?.stateT)||0)-(releaseAt-.16);
        const age=Math.abs(rawAge)<1e-9?0:rawAge;
        const ringDuration=4/30,starDuration=3/30;
        const ringStrength=age>=0&&age<ringDuration?1:0;
        const ringProgress=Math.max(0,Math.min(1,age/ringDuration));
        const starAge=age-ringDuration;
        const starStrength=starAge>=0?Math.max(0,1-starAge/starDuration):0;
        return{strength:Math.max(ringStrength,starStrength),ringStrength,starStrength,
            radius:.46-.20*ringProgress,releaseAt,age};
    }

    function drawEveryClearFlash(ctx,g,L){
        const cells=clearFxCells(g);if(!cells.length)return;
        const st=flashState(g);if(st.strength<=0)return;
        const {D,X,Y,BW,BH}=L;
        const gridDX=L.DX||D;
        const ox=X+(BW-(W2-1)*gridDX*.5)/2,oy=Y+D/2;
        const pos=(x,y)=>[ox+x*gridDX*.5,oy+y*D*HEX_ROW_H];

        ctx.save();
        ctx.beginPath();ctx.rect(X,Y-D*2.7,BW,BH+D*2.7);ctx.clip();
        ctx.globalCompositeOperation="screen";
        for(const cell of cells){
            const [px,py]=pos(cell.x,cell.y),col=COLORS[cell.c]||COLORS[0];
            const radius=D*st.radius;
            ctx.save();
            ctx.shadowColor=col?.glow||"#FFFFFF";
            ctx.shadowBlur=D*.23;
            ctx.globalAlpha=st.strength;
            ctx.strokeStyle="#FFFFFF";
            ctx.lineWidth=Math.max(1,D*.042);
            if(st.ringStrength>0){ctx.beginPath();ctx.arc(px,py,radius,0,TAU);ctx.stroke();}
            if(st.starStrength>0){
                const r=D*(.16+.08*st.starStrength);
                ctx.beginPath();
                for(let i=0;i<12;i++){
                    const a=i*TAU/12-Math.PI/2,rr=i%2?r*.42:r;
                    const sx=px+Math.cos(a)*rr,sy=py+Math.sin(a)*rr;
                    if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
                }
                ctx.closePath();ctx.fillStyle="#FFFFFF";ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();
    }

    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        const out=baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        if(g?.state==="RESOLVING"&&g?.phase==="CLEAR")drawEveryClearFlash(ctx,g,L);
        return out;
    };

    window.__hexClearAllBallFxVersion="clear-all-ball-fx-v1";
    window.__hexEveryClearedBallHasDisappearFx=true;
    window.__hexClearAllBallFxCells=clearFxCells;
    window.__hexClearAllBallFxState=flashState;
})();
