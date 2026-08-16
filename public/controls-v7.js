/* HEXDROP controls v7: single source of truth for touch input.
 * Gestures:
 * - right-half tap: clockwise 60deg
 * - left-half tap: counter-clockwise 60deg
 * - two-finger tap: reference-speed vertical hard drop
 * - two-finger long press: fast fall while held
 * - one-finger horizontal slide: immediate continuous horizontal movement
 */
(function installHexControlsV7(){
    if(typeof document==="undefined" || window.__hexControlsV7Installed)return;
    window.__hexControlsV7Installed=true;

    /* Track the human engine created when a match begins. */
    if(!window.__hexEnginesV7)window.__hexEnginesV7=[];
    if(typeof createEngine==="function" && !window.__hexCreateEngineWrappedV7){
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
    let dual=null;

    const HOLD_MS=LONG_PRESS_MS;
    const TAP_MAX_MS=350;
    const DUAL_TAP_MAX_MS=320;
    const TAP_MOVE_TOL=20;
    const SINGLE_DRAG_START_TOL=4;
    const SINGLE_DRAG_AXIS_RATIO=.60;
    const DUAL_HOLD_DRIFT_TOL=30;

    const isCanvas=e=>e?.target?.tagName==="CANVAS";
    const player=()=>{
        const list=window.__hexEnginesV7||[];
        for(let i=list.length-1;i>=0;i--){
            const g=list[i];
            if(g&&g.state==="PLAYING"&&g.piece&&!g.ai)return g;
        }
        return null;
    };
    const consume=e=>{
        if(e?.cancelable)e.preventDefault();
        e?.stopImmediatePropagation?.();
    };
    const point=(e,canvas)=>{
        const r=canvas.getBoundingClientRect();
        return {
            x:(e.clientX-r.left)/Math.max(1,r.width)*VW,
            y:(e.clientY-r.top)/Math.max(1,r.height)*VH
        };
    };
    const currentX=g=>{
        if(Number.isFinite(g?.freeX))return g.freeX;
        if(Number.isFinite(g?.pieceVX))return g.pieceVX;
        return Number.isFinite(g?.piece?.x)?g.piece.x:SPAWN_X;
    };
    const validGame=g=>!!g&&g.state==="PLAYING"&&!!g.piece;
    const stopFast=g=>{if(g)g.fastForward=false;};
    const releaseCapture=rec=>{
        try{
            if(rec?.canvas?.hasPointerCapture?.(rec.id))rec.canvas.releasePointerCapture(rec.id);
        }catch(_){}
    };

    function instantVerticalDrop(g){
        if(!validGame(g))return false;
        stopFast(g);
        // setFreeX() has already selected the nearest legal logical column.
        // Keep the exact sub-cell visual X through the instant transfer and
        // let lock() perform the single final lattice hand-off.
        hardDrop(g);
        return g.state!=="PLAYING";
    }
    window.__hexInstantDropV7=instantVerticalDrop;

    function beginSingleDrag(rec){
        if(!rec||dual||pointers.size!==1||rec.dragActive)return false;
        const g=rec.g;
        if(!validGame(g))return false;
        rec.dragActive=true;
        rec.dragMoved=true;
        rec.tapEligible=false;
        rec.dragBaseX=currentX(g);
        g.dragging=true;
        g.freeX=rec.dragBaseX;
        return true;
    }

    function updateSingleDrag(rec){
        if(!rec?.dragActive||dual)return;
        const g=rec.g;
        if(!validGame(g))return;
        const dx=rec.lastX-rec.startX;
        /* freeX is a real-valued doubled-x coordinate. updateVisuals copies it
           to pieceVX every frame, so the piece follows the finger continuously
           instead of jumping one lattice column at a time. */
        const targetX=rec.dragBaseX+(dx/ME.D)*2;
        setFreeX(g,targetX);
    }
    window.__hexSingleSlideV7=true;

    function startDual(){
        if(pointers.size!==2)return false;
        const arr=[...pointers.values()];
        const g=arr[0].g;
        if(!g||arr.some(r=>r.g!==g))return false;

        /* If the first finger was sliding, freeze that exact horizontal place
           before interpreting the gesture as a two-finger action. */
        if(g){
            const exactX=currentX(g);
            if(Number.isFinite(g.freeX))setColumn(g,g.freeX);
            if(g.piece){g.pieceVX=exactX;g.freeX=exactX;}
            g.dragging=false;
        }
        for(const r of arr){
            r.dragActive=false;
            r.tapEligible=false;
            r.dual=true;
        }
        stopFast(g);

        dual={
            ids:arr.map(r=>r.id),g,
            startedAt:performance.now(),
            tapEligible:true,longEligible:true,fast:false,timer:null
        };
        dual.timer=setTimeout(()=>{
            const d=dual;
            if(!d||d.ids.some(id=>!pointers.has(id))||!d.longEligible)return;
            if(!validGame(d.g))return;
            d.fast=true;
            d.tapEligible=false;
            if(!d.g.fastForward)emit(d.g,{t:"fast"});
            d.g.fastForward=true;
        },HOLD_MS);
        return true;
    }

    function finishDual(id,cancelled){
        if(!dual||!dual.ids.includes(id))return false;
        const d=dual;
        if(d.timer){clearTimeout(d.timer);d.timer=null;}
        const elapsed=performance.now()-d.startedAt;
        if(d.fast)stopFast(d.g);
        else if(!cancelled&&d.tapEligible&&elapsed<=DUAL_TAP_MAX_MS)instantVerticalDrop(d.g);

        for(const pid of d.ids){
            const rec=pointers.get(pid);
            if(rec)releaseCapture(rec);
            pointers.delete(pid);
        }
        if(d.g)d.g.dragging=false;
        dual=null;
        return true;
    }

    function resetAll(reason="reset"){
        if(dual?.timer)clearTimeout(dual.timer);
        const engines=new Set();
        for(const rec of pointers.values()){
            releaseCapture(rec);
            if(rec.g)engines.add(rec.g);
        }
        if(dual?.g)engines.add(dual.g);
        for(const g of engines){
            stopFast(g);
            // Cancellation/visibility changes end the gesture, not its
            // continuous horizontal placement. Preserve the exact real X in
            // the same way as an ordinary pointer release.
            if(g.piece&&Number.isFinite(g.freeX))g.pieceVX=g.freeX;
            g.dragging=false;
        }
        pointers.clear();
        dual=null;
        window.__hexControlsV7LastReset={reason,at:performance.now()};
    }
    window.__hexResetTouchInput=resetAll;

    const onDown=e=>{
        if(!isCanvas(e))return;
        const g=player();
        if(!validGame(g))return;
        consume(e);
        try{Sfx.init();}catch(_){}

        if(pointers.size>=2){resetAll("third-pointer");return;}
        const p=point(e,e.target);
        const rec={
            id:e.pointerId,canvas:e.target,g,
            startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,
            downAt:performance.now(),half:p.x>=VW*.5?1:-1,
            tapEligible:true,dragActive:false,dragMoved:false,dual:false,
            dragBaseX:currentX(g)
        };
        pointers.set(rec.id,rec);
        try{rec.canvas.setPointerCapture(rec.id);}catch(_){}
        if(pointers.size===2)startDual();
    };

    const onMove=e=>{
        const rec=pointers.get(e.pointerId);
        if(!rec)return;
        consume(e);
        const p=point(e,rec.canvas);
        rec.lastX=p.x;rec.lastY=p.y;
        const totalDx=rec.lastX-rec.startX;
        const totalDy=rec.lastY-rec.startY;
        const totalDist=Math.hypot(totalDx,totalDy);

        if(dual&&dual.ids.includes(rec.id)){
            if(totalDist>TAP_MOVE_TOL)dual.tapEligible=false;
            if(totalDist>DUAL_HOLD_DRIFT_TOL)dual.longEligible=false;
            return;
        }

        if(!rec.dragActive){
            const horizontalEnough=Math.abs(totalDx)>=SINGLE_DRAG_START_TOL&&
                Math.abs(totalDx)>=Math.abs(totalDy)*SINGLE_DRAG_AXIS_RATIO;
            if(horizontalEnough)beginSingleDrag(rec);
            else if(totalDist>TAP_MOVE_TOL){rec.tapEligible=false;return;}
        }
        updateSingleDrag(rec);
    };

    const finish=(e,cancelled)=>{
        const rec=pointers.get(e.pointerId);
        if(!rec)return;
        consume(e);
        if(dual&&dual.ids.includes(rec.id)){
            finishDual(rec.id,cancelled);
            return;
        }

        pointers.delete(rec.id);
        releaseCapture(rec);
        const g=rec.g;
        if(g&&rec.dragActive){
            // Pointer release must not snap the piece back to the lattice.
            // Keep the exact sub-cell X through the remaining fall; lock() is
            // the single place that commits it to the nearest legal column.
            if(Number.isFinite(g.freeX))g.pieceVX=g.freeX;
            g.dragging=false;
        }

        const elapsed=performance.now()-rec.downAt;
        const dist=Math.hypot(rec.lastX-rec.startX,rec.lastY-rec.startY);
        if(!cancelled&&!rec.dragActive&&rec.tapEligible&&elapsed<=TAP_MAX_MS&&dist<=TAP_MOVE_TOL&&validGame(g)){
            rotate(g,rec.half>0?1:-1);
        }
        if(pointers.size===0)stopFast(g);
    };

    const cancelBrowserGesture=e=>{
        const t=e?.target;
        if(t?.tagName==="CANVAS"||t?.closest?.("#root"))consume(e);
    };

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
