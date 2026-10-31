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

    // The clear effect equipped from the trophy road (HexTrophies in
    // app-trophies-v1.js sets __hexClearFxStyle) is drawn on the player's own
    // board (side 0); the opponent's board keeps "spark". Only the shapes and
    // colours differ: every style uses the same timing (flashState).
    function ringPath(ctx,px,py,radius,style){
        ctx.beginPath();
        if(style==="hexring"){for(let i=0;i<6;i++){const a=i*TAU/6-Math.PI/2,x=px+Math.cos(a)*radius,y=py+Math.sin(a)*radius;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();}
        else ctx.arc(px,py,radius,0,TAU);
    }
    function starPath(ctx,px,py,r,style){
        const points=style==="starburst"?8:6,inner=style==="starburst"?.34:.42,rr0=style==="starburst"?r*1.45:r;
        ctx.beginPath();
        for(let i=0;i<points*2;i++){
            const a=i*TAU/(points*2)-Math.PI/2,rr=i%2?rr0*inner:rr0;
            const sx=px+Math.cos(a)*rr,sy=py+Math.sin(a)*rr;
            if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
        }
        ctx.closePath();
    }
    function drawEveryClearFlash(ctx,g,L,style="spark"){
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
            const ink=style==="spark"||style==="hexring"?"#FFFFFF":(col?.glow||"#FFFFFF");
            ctx.strokeStyle=ink;
            ctx.lineWidth=Math.max(1,D*(style==="nova"?.06:.042));
            if(st.ringStrength>0){
                ringPath(ctx,px,py,radius*(style==="nova"?1.25:1),style);ctx.stroke();
                if(style==="ripple"){ringPath(ctx,px,py,radius*.6,style);ctx.stroke();}
            }
            if(st.starStrength>0){
                const r=D*(.16+.08*st.starStrength);
                if(style==="ripple"){
                    ringPath(ctx,px,py,r*1.5,style);ctx.stroke();
                    ctx.beginPath();ctx.arc(px,py,r*.35,0,TAU);ctx.fillStyle="#FFFFFF";ctx.fill();
                }else if(style==="petal"){
                    ctx.fillStyle="#FFD1E3";
                    for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;ctx.beginPath();ctx.ellipse(px+Math.cos(a)*r*.7,py+Math.sin(a)*r*.7,r*.62,r*.34,a,0,TAU);ctx.fill();}
                    ctx.beginPath();ctx.arc(px,py,r*.28,0,TAU);ctx.fillStyle="#FFE38A";ctx.fill();
                }else if(style==="nova"){
                    ctx.beginPath();
                    for(let i=0;i<8;i++){const a=i*TAU/8,c=Math.cos(a),s=Math.sin(a);ctx.moveTo(px+c*r*.5,py+s*r*.5);ctx.lineTo(px+c*r*1.9,py+s*r*1.9);}
                    ctx.stroke();
                    ctx.beginPath();ctx.arc(px,py,r*.45,0,TAU);ctx.fillStyle="#FFFFFF";ctx.fill();
                }else{starPath(ctx,px,py,r,style);ctx.fillStyle=style==="color"||style==="starburst"?ink:"#FFFFFF";ctx.fill();}
            }
            ctx.restore();
        }
        ctx.restore();
    }

    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        const out=baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);
        if(g?.state==="RESOLVING"&&g?.phase==="CLEAR")drawEveryClearFlash(ctx,g,L,side===0?String(window.__hexClearFxStyle||"spark"):"spark");
        return out;
    };

    window.__hexClearAllBallFxVersion="clear-all-ball-fx-v1";
    window.__hexEveryClearedBallHasDisappearFx=true;
    window.__hexClearAllBallFxCells=clearFxCells;
    window.__hexClearAllBallFxState=flashState;
})();
