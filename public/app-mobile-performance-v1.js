/* Mobile performance layer v1 (no physics changes).
 *
 * 1. Background as a separate layer. The static background (gradients, baked
 *    stars, horizon) used to be copied onto the game canvas every frame; on
 *    phones that full-screen copy cost about as much as the rest of the frame.
 *    The App now shows it once as the CSS background of the canvas wrapper and
 *    marks the canvas with __sixBallBgLayer; this wrapper then clears the
 *    canvas instead and draws only what changes (twinkling stars, attack wash).
 *    Without the marker (tests, other canvases) the original drawing is used.
 *
 * 2. Level-5 AI thinking is thinned to a search slice on every other physics
 *    step (it ran on every 120 Hz step). Skipped steps still advance the
 *    planner's clock, so decisions are made within the same game time; the
 *    search gets half the slices on every device. The planner helpers were made
 *    allocation-free at the same time (app-01 cloneHexGrid, app-garbage-normal-
 *    physics referenceHexagonRingBalls), which wins part of it back. Outside the
 *    app (headless tests, no frame counter) the AI is unchanged.
 */
(function installBackgroundLayer(){
    if(typeof window==="undefined"||typeof drawBackground!=="function"||window.__sixBallBgLayerV1)return;
    window.__sixBallBgLayerV1=true;
    const baseDrawBackground=drawBackground;
    drawBackground=function(ctx,t,me=null,foe=null){
        if(!ctx||!ctx.canvas||!ctx.canvas.__sixBallBgLayer||typeof ctx.clearRect!=="function")return baseDrawBackground(ctx,t,me,foe);
        ctx.clearRect(0,0,VW,VH);
        // Same twinkle and attack wash as app-10.js drawBackground, minus the static image.
        for(const s of STARS){ctx.globalAlpha=s.a*(0.55+0.45*Math.sin(t*1.6+s.p));ctx.fillStyle="#EAF3FF";ctx.fillRect(s.x,s.y,s.s,s.s);}
        ctx.globalAlpha=1;
        const active=[...(me?.fx?.formations||[]),...(foe?.fx?.formations||[])].sort((a,b)=>(b.life/b.max)-(a.life/a.max))[0];
        const warning=Math.max(me?.fx?.warn||0,foe?.fx?.warn||0);
        if(active||warning>0){
            const tint=active?.tint||"#FF3158",strength=active?Math.min(.19,.07+.13*(active.life/Math.max(.001,active.max))):warning*.09;
            ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=strength;
            const wash=ctx.createRadialGradient(VW/2,VH*.47,40,VW/2,VH*.47,VW*.64);
            wash.addColorStop(0,tint+"DD");wash.addColorStop(.48,tint+"55");wash.addColorStop(1,tint+"00");
            ctx.fillStyle=wash;ctx.fillRect(0,0,VW,VH);ctx.restore();
        }
    };
    // Data URL of the static background for the wrapper's CSS background.
    let url=null;
    window.__sixBallStaticBackgroundUrl=function(){
        if(url)return url;
        try{const cv=getStaticBackgroundCanvas();if(cv)url=cv.toDataURL("image/png");}catch(_){url=null;}
        return url;
    };
})();

(function thinSuperStrongThinking(){
    if(typeof window==="undefined"||typeof stepAI!=="function"||window.__sixBallAiThinningV1)return;
    window.__sixBallAiThinningV1=true;
    const baseStepAI=stepAI;
    stepAI=function(g,dt){
        const ai=g&&g.ai;
        if(!ai||!Number.isFinite(window.__sixBallRenderFrame)||Math.max(1,Math.min(5,Number(ai.level)||1))!==5)return baseStepAI(g,dt);
        const planning=!ai.target&&!(ai.thinkT>0)&&!!g.piece&&g.state==="PLAYING"&&!!ai._focusedPlannerV2;
        if(planning){
            ai._aiStepParity=!ai._aiStepParity;
            if(!ai._aiStepParity){
                // Every other physics step: no search slice, but the planner's
                // step clock still advances so decisions keep the same timing.
                ai._focusedPlannerV2.frames++;
                ai._aiSkippedSlices=(ai._aiSkippedSlices||0)+1;
                return;
            }
        }
        return baseStepAI(g,dt);
    };
})();

if(typeof window!=="undefined")window.__sixBallMobilePerformanceVersion="mobile-performance-v1";
