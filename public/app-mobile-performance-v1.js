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
 * 2. CPU thinking runs in a Web Worker (app-ai-core.js, ai-worker.js), so the
 *    search no longer costs main-thread frame time.
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

// 3. Defeat animation: the lost board is drawn through a grayscale canvas
//    filter, applied to every ball draw (about 100 per frame). Filtered draws
//    are expensive (3-4 fps in software canvases). Apply the filter once per
//    colour to a cached copy of the ball sprite and draw that copy instead.
(function cacheFilteredBallSprites(){
    if(typeof window==="undefined"||typeof drawBall!=="function"||typeof document==="undefined"||window.__sixBallFilteredSpritesV1)return;
    window.__sixBallFilteredSpritesV1=true;
    const baseDrawBall=drawBall,cache=new Map();
    function filtered(ci,filter){
        const key=ci+"|"+filter;let cv=cache.get(key);
        if(cv===undefined){
            cv=null;
            try{const img=BALL_IMG[ci],w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
                if(w&&h){cv=document.createElement("canvas");cv.width=w;cv.height=h;const c=cv.getContext("2d");if(c&&"filter" in c){c.filter=filter;c.drawImage(img,0,0);}else cv=null;}
            }catch(_){cv=null;}
            cache.set(key,cv);
        }
        return cv;
    }
    drawBall=function(ctx,cx,cy,d,ci,o={}){
        const filter=ctx&&typeof ctx.filter==="string"?ctx.filter:"none";
        if(filter==="none"||!(d>1.2)||(o.sq||0)!==0||(o.aura||0)!==0||(o.ring||0)!==0||typeof imgReady!=="function"||!imgReady(ci))return baseDrawBall(ctx,cx,cy,d,ci,o);
        const sprite=filtered(ci,filter);if(!sprite)return baseDrawBall(ctx,cx,cy,d,ci,o);
        const alpha=o.alpha===undefined?1:o.alpha,scale=o.scale===undefined?1:o.scale,s=d*scale;
        if(alpha<=0||s<=0)return;
        const a0=ctx.globalAlpha;ctx.filter="none";ctx.globalAlpha=a0*alpha;
        ctx.drawImage(sprite,cx-s/2,cy-s/2,s,s);
        ctx.globalAlpha=a0;ctx.filter=filter;
    };
})();

if(typeof window!=="undefined")window.__sixBallMobilePerformanceVersion="mobile-performance-v1";
