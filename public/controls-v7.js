/* HEXDROP controls v7: single source of truth for touch input.
 *
 * Reference interaction:
 * - one-finger horizontal slide: continuous 1:1 horizontal movement
 * - short tap in the play area: rotate toward the tapped half
 * - short tap in the bottom drop zone: instant drop
 * - one-finger long press in the lower half: fast fall only while held
 *
 * The previous revision accidentally changed drop / fast-fall to two-finger
 * gestures and, because this file disables App's legacy pointer listeners, that
 * made the shipped mobile controls disagree with the intended game controls.
 */
(function installHexControlsV7(){
    if(typeof document==="undefined"||window.__hexControlsV7Installed)return;
    window.__hexControlsV7Installed=true;

    if(!window.__hexEnginesV7)window.__hexEnginesV7=[];
    if(typeof createEngine==="function"&&!window.__hexCreateEngineWrappedV7){
        window.__hexCreateEngineWrappedV7=true;
        const originalCreateEngine=createEngine;
        createEngine=function(...args){
            const g=originalCreateEngine(...args);
            window.__hexEnginesV7.push(g);
            if(window.__hexEnginesV7.length>16)window.__hexEnginesV7.splice(0,window.__hexEnginesV7.length-16);
            return g;
        };
    }

    const pointers=new Map();
    const HOLD_MS=LONG_PRESS_MS;
    const TAP_MAX_MS=350;
    const TAP_MOVE_TOL=20;
    const DRAG_START_TOL=4;
    const DRAG_AXIS_RATIO=.60;

    const isCanvas=e=>e?.target?.tagName==="CANVAS";
    const player=()=>{
        const list=window.__hexEnginesV7||[];
        for(let i=list.length-1;i>=0;i--){
            const g=list[i];
            // CPU boards and NET mirror boards never own local touch. The
            // newest remaining local-human engine owns this canvas even while
            // READY; if it is not PLAYING yet, input is disabled instead of
            // leaking into an older match that is still left in PLAYING.
            if(!g||g.ai||g.state==="NET")continue;
            return g.state==="PLAYING"&&g.piece?g:null;
        }
        return null;
    };
    const validGame=g=>!!g&&g.state==="PLAYING"&&!!g.piece;
    const consume=e=>{if(e?.cancelable)e.preventDefault();e?.stopImmediatePropagation?.();};
    const point=(e,canvas)=>{
        const r=canvas.getBoundingClientRect();
        return{x:(e.clientX-r.left)/Math.max(1,r.width)*VW,y:(e.clientY-r.top)/Math.max(1,r.height)*VH};
    };
    const currentX=g=>Number.isFinite(g?.freeX)?g.freeX:Number.isFinite(g?.pieceVX)?g.pieceVX:Number.isFinite(g?.piece?.x)?g.piece.x:SPAWN_X;
    const stopFast=g=>{if(g)g.fastForward=false;};
    const releaseCapture=rec=>{try{if(rec?.canvas?.hasPointerCapture?.(rec.id))rec.canvas.releasePointerCapture(rec.id);}catch(_){};};
    const clearHold=rec=>{if(rec?.holdTimer){clearTimeout(rec.holdTimer);rec.holdTimer=null;}};

    function instantVerticalDrop(g){
        if(!validGame(g))return false;
        stopFast(g);hardDrop(g);return true;
    }
    window.__hexInstantDropV7=instantVerticalDrop;

    function beginDrag(rec){
        if(!rec||rec.bottomPress||rec.dragActive||pointers.size!==1||!validGame(rec.g))return false;
        rec.dragActive=true;rec.dragMoved=true;rec.tapEligible=false;clearHold(rec);
        rec.dragBaseX=currentX(rec.g);rec.g.dragging=true;rec.g.freeX=rec.dragBaseX;
        return true;
    }
    function updateDrag(rec){
        if(!rec?.dragActive||!validGame(rec.g))return;
        const targetX=rec.dragBaseX+((rec.lastX-rec.startX)/ME.D)*2;
        setFreeX(rec.g,targetX);
    }
    window.__hexSingleSlideV7=true;

    const onDown=e=>{
        if(!isCanvas(e))return;
        const g=player();if(!validGame(g))return;
        consume(e);try{Sfx.init();}catch(_){}

        // Multi-touch has no gameplay command.  Cancel the current gesture so
        // an accidental second contact can never trigger drop/fast-fall.
        if(pointers.size){resetAll("multi-touch-cancel");return;}

        const p=point(e,e.target);
        const rec={
            id:e.pointerId,canvas:e.target,g,
            startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,
            downAt:performance.now(),half:p.x>=VW*.5?1:-1,
            bottomPress:p.y>=DROP_ZONE_Y,
            fastEligible:p.y>=VH*.5,
            tapEligible:true,dragActive:false,dragMoved:false,longActive:false,
            dragBaseX:currentX(g),holdTimer:null
        };
        pointers.set(rec.id,rec);
        try{rec.canvas.setPointerCapture(rec.id);}catch(_){}

        if(rec.fastEligible){
            rec.holdTimer=setTimeout(()=>{
                const live=pointers.get(rec.id);
                if(live!==rec||!rec.fastEligible||rec.dragActive||!validGame(rec.g))return;
                rec.longActive=true;rec.tapEligible=false;
                if(!rec.g.fastForward)emit(rec.g,{t:"fast"});
                rec.g.fastForward=true;
            },HOLD_MS);
        }
    };

    const onMove=e=>{
        const rec=pointers.get(e.pointerId);if(!rec)return;
        consume(e);
        const p=point(e,rec.canvas);rec.lastX=p.x;rec.lastY=p.y;
        const dx=rec.lastX-rec.startX,dy=rec.lastY-rec.startY,dist=Math.hypot(dx,dy);

        if(rec.longActive)return;
        if(rec.bottomPress){
            if(dist>TAP_MOVE_TOL){rec.tapEligible=false;clearHold(rec);}
            return;
        }
        if(!rec.dragActive){
            const horizontalEnough=Math.abs(dx)>=DRAG_START_TOL&&Math.abs(dx)>=Math.abs(dy)*DRAG_AXIS_RATIO;
            if(horizontalEnough)beginDrag(rec);
            else if(dist>TAP_MOVE_TOL){rec.tapEligible=false;clearHold(rec);return;}
        }
        updateDrag(rec);
    };

    const finish=(e,cancelled)=>{
        const rec=pointers.get(e.pointerId);if(!rec)return;
        consume(e);pointers.delete(rec.id);clearHold(rec);releaseCapture(rec);
        const g=rec.g,wasLong=rec.longActive;
        if(wasLong)stopFast(g);

        if(g&&rec.dragActive){
            if(Number.isFinite(g.freeX))g.pieceVX=g.freeX;
            g.dragging=false;
        }

        const elapsed=performance.now()-rec.downAt;
        const dist=Math.hypot(rec.lastX-rec.startX,rec.lastY-rec.startY);
        if(!cancelled&&!wasLong&&!rec.dragActive&&rec.tapEligible&&elapsed<=TAP_MAX_MS&&dist<=TAP_MOVE_TOL&&validGame(g)){
            if(rec.bottomPress)instantVerticalDrop(g);
            else rotate(g,rec.half>0?1:-1);
        }
        if(!pointers.size)stopFast(g);
    };

    function resetAll(reason="reset"){
        const engines=new Set();
        for(const rec of pointers.values()){
            clearHold(rec);releaseCapture(rec);if(rec.g)engines.add(rec.g);
        }
        for(const g of engines){
            stopFast(g);
            if(g.piece&&Number.isFinite(g.freeX))g.pieceVX=g.freeX;
            g.dragging=false;
        }
        pointers.clear();
        window.__hexControlsV7LastReset={reason,at:performance.now()};
    }
    window.__hexResetTouchInput=resetAll;

    const cancelBrowserGesture=e=>{const t=e?.target;if(t?.tagName==="CANVAS"||t?.closest?.("#root"))consume(e);};
    document.addEventListener("pointerdown",onDown,true);
    document.addEventListener("pointermove",onMove,true);
    document.addEventListener("pointerup",e=>finish(e,false),true);
    document.addEventListener("pointercancel",e=>finish(e,true),true);
    document.addEventListener("contextmenu",cancelBrowserGesture,true);
    document.addEventListener("selectstart",cancelBrowserGesture,true);
    document.addEventListener("dragstart",cancelBrowserGesture,true);
    document.addEventListener("gesturestart",cancelBrowserGesture,{capture:true,passive:false});
    document.addEventListener("gesturechange",cancelBrowserGesture,{capture:true,passive:false});
    document.addEventListener("gestureend",cancelBrowserGesture,{capture:true,passive:false});
    window.addEventListener("blur",()=>resetAll("window-blur"),true);
    window.addEventListener("pagehide",()=>resetAll("pagehide"),true);
    document.addEventListener("visibilitychange",()=>{if(document.hidden)resetAll("hidden");},true);
})();
