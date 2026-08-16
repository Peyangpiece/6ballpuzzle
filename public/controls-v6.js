/* HEXDROP controls v6: clean touch-control reset.
 * Only these touch gestures exist:
 * - right-half tap: clockwise 60deg
 * - left-half tap: counter-clockwise 60deg
 * - two-finger tap: instant vertical hard drop
 * - two-finger long press: fast fall while held
 * - one-finger long press, then slide: horizontal movement
 */
(function installHexControlsV6(){
    if(typeof document==="undefined" || window.__hexControlsV6Installed)return;
    window.__hexControlsV6Installed=true;

    /* Track engines created after this controller is installed. app-16 creates
       the player/foe engines only when a match starts, so wrapping createEngine
       here gives v6 an explicit source of truth without any legacy v4 accessor. */
    if(!window.__hexEnginesV6)window.__hexEnginesV6=[];
    if(typeof createEngine==="function" && !window.__hexCreateEngineWrappedV6){
        window.__hexCreateEngineWrappedV6=true;
        const originalCreateEngine=createEngine;
        createEngine=function(...args){
            const g=originalCreateEngine(...args);
            window.__hexEnginesV6.push(g);
            if(window.__hexEnginesV6.length>16)window.__hexEnginesV6.splice(0,window.__hexEnginesV6.length-16);
            return g;
        };
    }

    /* app-16 historically registers an older canvas-local pointer controller.
       The v6 reset owns ALL gameplay pointer input at document capture phase.
       Prevent canvas-local gameplay pointer handlers from being registered so
       no previous gesture can run in parallel with this controller. */
    if(typeof HTMLCanvasElement!=="undefined" && !window.__hexLegacyCanvasPointerBlockV6){
        window.__hexLegacyCanvasPointerBlockV6=true;
        const proto=HTMLCanvasElement.prototype;
        const nativeAdd=proto.addEventListener;
        const blocked=new Set(["pointerdown","pointermove","pointerup","pointercancel"]);
        proto.addEventListener=function(type,listener,options){
            if(blocked.has(type))return;
            return nativeAdd.call(this,type,listener,options);
        };
    }

    const pointers=new Map();
    let dual=null;

    const HOLD_MS=LONG_PRESS_MS;
    const TAP_MAX_MS=350;
    const DUAL_TAP_MAX_MS=320;
    const TAP_MOVE_TOL=20;
    const PRE_HOLD_MOVE_TOL=18;
    const DRAG_MOVE_TOL=3;
    const DUAL_HOLD_DRIFT_TOL=30;

    const isCanvas=e=>e?.target?.tagName==="CANVAS";
    const player=()=>{
        const list=window.__hexEnginesV6||[];
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
    const stopFast=g=>{if(g)g.fastForward=false;};
    const clearTimer=rec=>{
        if(rec?.holdTimer){clearTimeout(rec.holdTimer);rec.holdTimer=null;}
    };
    const releaseCapture=rec=>{
        try{
            if(rec?.canvas?.hasPointerCapture?.(rec.id))rec.canvas.releasePointerCapture(rec.id);
        }catch(_){}
    };
    const validGame=g=>!!g&&g.state==="PLAYING"&&!!g.piece;

    function commitCurrentColumn(g){
        if(!validGame(g))return;
        const x=currentX(g);
        if(Number.isFinite(x))setColumn(g,x);
        g.pieceVX=g.piece.x;
        g.freeX=null;
        g.dragging=false;
    }

    function instantVerticalDrop(g){
        if(!validGame(g))return false;
        stopFast(g);
        g.hardDropAnim=null;
        g.dropT=0;

        /* Commit only the player's current horizontal column. From this point
           onward the input operation is strictly +Y: target.x never changes. */
        commitCurrentColumn(g);
        const fixedX=g.piece.x;
        const target=dropPiece(g.board,{...g.piece,x:fixedX});
        target.x=fixedX;

        g.piece={...target};
        g.pieceVX=fixedX;
        g.freeX=null;
        g.dragging=false;
        emit(g,{t:"drop"});
        lock(g,5);
        return true;
    }
    window.__hexInstantDropV6=instantVerticalDrop;

    function armSingleHold(rec){
        clearTimer(rec);
        rec.holdTimer=setTimeout(()=>{
            rec.holdTimer=null;
            if(!pointers.has(rec.id)||pointers.size!==1||dual||!rec.tapEligible)return;
            const g=rec.g;
            if(!validGame(g))return;
            rec.longActive=true;
            rec.tapEligible=false;
            rec.dragAnchorX=rec.lastX;
            rec.dragBaseX=currentX(g);
            rec.dragMoved=false;
            g.dragging=true;
            g.freeX=rec.dragBaseX;
        },HOLD_MS);
    }

    function startDual(){
        if(pointers.size!==2)return false;
        const arr=[...pointers.values()];
        const g=arr[0].g;
        if(!g||arr.some(r=>r.g!==g))return false;

        for(const r of arr){
            clearTimer(r);
            r.longActive=false;
            r.tapEligible=false;
            r.dual=true;
        }
        if(g){
            g.dragging=false;
            if(Number.isFinite(g.freeX))setColumn(g,g.freeX);
            if(g.piece)g.pieceVX=g.piece.x;
            g.freeX=null;
        }
        stopFast(g);

        const startedAt=performance.now();
        dual={
            ids:arr.map(r=>r.id),g,startedAt,
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

        if(d.fast){
            stopFast(d.g);
        }else if(!cancelled&&d.tapEligible&&elapsed<=DUAL_TAP_MAX_MS){
            instantVerticalDrop(d.g);
        }

        for(const pid of d.ids){
            const rec=pointers.get(pid);
            if(rec){clearTimer(rec);releaseCapture(rec);}
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
            clearTimer(rec);
            releaseCapture(rec);
            if(rec.g)engines.add(rec.g);
        }
        if(dual?.g)engines.add(dual.g);
        for(const g of engines){
            stopFast(g);
            g.dragging=false;
            if(g.piece){
                if(Number.isFinite(g.freeX))setColumn(g,g.freeX);
                g.pieceVX=g.piece.x;
            }
            g.freeX=null;
        }
        pointers.clear();
        dual=null;
        window.__hexControlsV6LastReset={reason,at:performance.now()};
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
            downAt:performance.now(),
            half:p.x>=VW*.5?1:-1,
            tapEligible:true,longActive:false,dragMoved:false,
            dragAnchorX:p.x,dragBaseX:currentX(g),holdTimer:null,dual:false
        };
        pointers.set(rec.id,rec);
        try{rec.canvas.setPointerCapture(rec.id);}catch(_){}

        if(pointers.size===1)armSingleHold(rec);
        else startDual();
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

        if(!rec.longActive){
            if(totalDist>PRE_HOLD_MOVE_TOL){
                rec.tapEligible=false;
                clearTimer(rec);
            }
            return;
        }

        const g=rec.g;
        if(!validGame(g))return;
        const dx=rec.lastX-rec.dragAnchorX;
        if(Math.abs(dx)>=DRAG_MOVE_TOL)rec.dragMoved=true;
        setFreeX(g,rec.dragBaseX+(dx/ME.D)*2);
    };

    const finish=(e,cancelled)=>{
        const rec=pointers.get(e.pointerId);
        if(!rec)return;
        consume(e);

        if(dual&&dual.ids.includes(rec.id)){
            finishDual(rec.id,cancelled);
            return;
        }

        clearTimer(rec);
        pointers.delete(rec.id);
        releaseCapture(rec);
        const g=rec.g;

        if(g){
            g.dragging=false;
            if(rec.longActive){
                if(Number.isFinite(g.freeX))setColumn(g,g.freeX);
                if(g.piece)g.pieceVX=g.piece.x;
                g.freeX=null;
            }
        }

        const elapsed=performance.now()-rec.downAt;
        const dist=Math.hypot(rec.lastX-rec.startX,rec.lastY-rec.startY);
        if(!cancelled&&!rec.longActive&&rec.tapEligible&&elapsed<=TAP_MAX_MS&&dist<=TAP_MOVE_TOL&&validGame(g)){
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
