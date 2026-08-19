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
        const age=(Number(g?.stateT)||0)-releaseAt;
        const pre=.12,post=.30;
        const strength=age<0?Math.max(0,1+age/pre):Math.max(0,1-age/post);
        const expand=age<=0?0:Math.min(1,age/post);
        return{strength,expand,releaseAt,age};
    }

    function drawEveryClearFlash(ctx,g,L){
        const cells=clearFxCells(g);if(!cells.length)return;
        const st=flashState(g);if(st.strength<=0)return;
        const {D,X,Y,BW,BH}=L;
        const ox=X+(BW-(W2-1)*D*.5)/2,oy=Y+D/2;
        const pos=(x,y)=>[ox+x*D*.5,oy+y*D*HEX_ROW_H];

        ctx.save();
        ctx.beginPath();ctx.rect(X,Y-D*2.7,BW,BH+D*2.7);ctx.clip();
        ctx.globalCompositeOperation="screen";
        for(const cell of cells){
            const [px,py]=pos(cell.x,cell.y),col=COLORS[cell.c]||COLORS[0];
            const radius=D*(.50+.15*st.expand);
            ctx.save();
            ctx.shadowColor=col?.glow||"#FFFFFF";
            ctx.shadowBlur=D*(.55+.42*st.strength);
            ctx.globalAlpha=Math.min(1,st.strength*1.45);
            ctx.strokeStyle="#FFFFFF";
            ctx.lineWidth=Math.max(1,D*(.055+.075*st.strength));
            ctx.beginPath();ctx.arc(px,py,radius,0,TAU);ctx.stroke();

            // A small white core makes the actual disappearance frame read the
            // same even when the underlying ball has already become a ghost.
            ctx.globalAlpha=.18*st.strength;
            ctx.fillStyle="#FFFFFF";
            ctx.beginPath();ctx.arc(px,py,D*(.34+.08*st.expand),0,TAU);ctx.fill();
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
