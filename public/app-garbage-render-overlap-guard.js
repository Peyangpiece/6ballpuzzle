/* Render-only garbage overlap guard.
 *
 * Logical garbage physics and its authored fallPath remain untouched.  The main
 * renderer normally looks ahead by up to one fixed physics step so 120 Hz
 * motion remains visually smooth.  During overlapping unit-local garbage
 * timelines, that tiny look-ahead can occasionally show the NEXT uncorrected
 * contact position before resolveVisualContacts has run for that future frame.
 * The logical/current visual centres are already collision-safe; only the
 * predictive render sample can therefore appear to interpenetrate for a frame.
 *
 * Keep the exact same trajectories and timing.  For GARBAGE rendering only,
 * choose the largest fraction of the existing renderLead whose complete board
 * sample is still diameter-safe.  No board cell, fallPath, velocity, duration,
 * spawn cadence or physics state is changed.
 */
(function installGarbageRenderOverlapGuard(){
    if(typeof window==="undefined"||window.__hexGarbageRenderOverlapGuard)return;
    if(typeof drawSide!=="function"||typeof pileFlowPositionAt!=="function")return;
    window.__hexGarbageRenderOverlapGuard=true;

    const baseDrawSide=drawSide;
    const basePileFlowPositionAt=pileFlowPositionAt;
    const RENDER_MIN_DIST=0.999999;
    const LEAD_SLICES=32;

    function entries(g){
        const out=[];
        if(!g?.board)return out;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const v=ball&&g.vis?.get?.(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v});
        }
        return out;
    }

    function dist(a,b){
        return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);
    }

    function sampleAtLead(g,list,lead){
        const out=new Map();
        const clock=Math.max(0,g.pileFlowClock||0);
        for(const q of list){
            let p=[q.v.x,q.v.y];
            if(lead>1e-12&&q.v.pileFlow&&Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length){
                const rp=basePileFlowPositionAt(g,q.ball,clock+lead,0,null,new Map());
                if(Number.isFinite(rp?.[0])&&Number.isFinite(rp?.[1]))p=[rp[0],Math.max(q.v.y,rp[1])];
            }
            out.set(q.ball.id,p);
        }
        return out;
    }

    function safe(list,map){
        for(let i=0;i<list.length;i++){
            const a=map.get(list[i].ball.id);if(!a)continue;
            for(let j=i+1;j<list.length;j++){
                const b=map.get(list[j].ball.id);if(!b)continue;
                if(dist(a,b)<RENDER_MIN_DIST)return false;
            }
        }
        return true;
    }

    function safeRenderPositions(g,renderLead){
        const list=entries(g);
        const lead=Math.max(0,Number(renderLead)||0);
        if(!list.length||lead<=1e-12)return{positions:sampleAtLead(g,list,0),lead:0,scale:0};

        // Search from the normal full look-ahead backwards.  The maximum delay
        // introduced by the guard is one fixed physics frame; in the common
        // case the very first sample is safe and this returns unchanged output.
        for(let i=LEAD_SLICES;i>=1;i--){
            const q=i/LEAD_SLICES,trialLead=lead*q;
            const positions=sampleAtLead(g,list,trialLead);
            if(safe(list,positions))return{positions,lead:trialLead,scale:q};
        }

        // The current resolved visual state is authoritative and normally safe.
        // Falling back to it changes no trajectory; it only suppresses a single
        // predictive frame when the future sample would penetrate another ball.
        return{positions:sampleAtLead(g,list,0),lead:0,scale:0};
    }

    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE")||!(renderLead>1e-12))
            return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);

        const guarded=safeRenderPositions(g,renderLead);
        if(guarded.scale>=1-1e-12)
            return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);

        const prev=pileFlowPositionAt;
        pileFlowPositionAt=function(pg,ball,time,depth=0,seen=null,memo=null){
            if(pg===g&&ball&&guarded.positions.has(ball.id))return guarded.positions.get(ball.id).slice();
            return prev(pg,ball,time,depth,seen,memo);
        };
        try{return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);}
        finally{pileFlowPositionAt=prev;}
    };

    window.__hexGarbageRenderSafePositions=safeRenderPositions;
    window.__hexGarbageRenderOverlapGuardVersion="garbage-render-overlap-v1";
    window.__hexGarbageRenderLeadPhysicsUnchanged=true;
})();
