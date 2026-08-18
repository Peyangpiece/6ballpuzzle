/* HEXDROP controls v7: single source of truth for touch input.
 *
 * Reference interaction:
 * - one-finger horizontal slide: continuous 1:1 horizontal movement
 * - one-finger short tap: rotate toward the tapped half
 * - two-finger short tap: instant drop
 * - two-finger long press: fast fall only while BOTH fingers remain held
 *
 * The active piece keeps its exact sub-cell X after finger release. Only lock()
 * commits it to a logical lattice anchor. Normal/fast vertical legality is
 * continuous (app-78), so releasing between columns must never snap or freeze.
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
    let pairGesture=null;
    const HOLD_MS=LONG_PRESS_MS;
    const TAP_MAX_MS=350;
    const TAP_MOVE_TOL=20;
    const DRAG_START_TOL=4;
    const DRAG_AXIS_RATIO=.60;
    const TWO_FINGER_JITTER_TOL=30;

    const isCanvas=e=>e?.target?.tagName==="CANVAS";
    const player=()=>{
        const list=window.__hexEnginesV7||[];
        for(let i=list.length-1;i>=0;i--){
            const g=list[i];
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
    const clearPairHold=()=>{if(pairGesture?.holdTimer){clearTimeout(pairGesture.holdTimer);pairGesture.holdTimer=null;}};

    function preserveReleasedDrag(g){
        if(!g)return false;
        g.dragging=false;
        if(!validGame(g))return false;
        if(Number.isFinite(g.freeX)){
            setFreeX(g,g.freeX);
            g.pieceVX=g.freeX;
        }
        return true;
    }
    window.__hexSettleReleasedDragV7=preserveReleasedDrag;

    function instantVerticalDrop(g){
        if(!validGame(g))return false;
        stopFast(g);
        const beforeState=g.state,beforePiece=g.piece,beforeId=g.nextId;
        const ok=hardDrop(g);
        return ok===true||g.state!==beforeState||g.piece!==beforePiece||g.nextId!==beforeId;
    }
    window.__hexInstantDropV7=instantVerticalDrop;

    function startPairFast(pair){
        if(!pair||pair!==pairGesture||pair.longActive||!pair.tapEligible||!validGame(pair.g))return false;
        if(pair.ids.some(id=>!pointers.has(id)))return false;
        pair.longActive=true;
        pair.tapEligible=false;
        clearPairHold();
        if(!pair.g.fastForward)emit(pair.g,{t:"fast"});
        pair.g.fastForward=true;
        return true;
    }

    function beginDrag(rec){
        if(!rec||rec.paired||rec.dragActive||pointers.size!==1||!validGame(rec.g))return false;
        rec.dragActive=true;rec.dragMoved=true;rec.tapEligible=false;
        rec.dragBaseX=currentX(rec.g);rec.g.dragging=true;rec.g.freeX=rec.dragBaseX;
        return true;
    }
    function updateDrag(rec){
        if(!rec?.dragActive||rec.paired||!validGame(rec.g))return;
        const targetX=rec.dragBaseX+((rec.lastX-rec.startX)/ME.D)*2;
        setFreeX(rec.g,targetX);
        if(Number.isFinite(rec.g.freeX))rec.g.pieceVX=rec.g.freeX;
    }
    window.__hexSingleSlideV7=true;

    function armPair(first,second){
        if(!first||!second||first.g!==second.g||!validGame(first.g))return false;
        if(first.dragActive)preserveReleasedDrag(first.g);
        first.dragActive=false;first.tapEligible=false;first.paired=true;
        second.dragActive=false;second.tapEligible=false;second.paired=true;
        first.pairStartX=first.lastX;first.pairStartY=first.lastY;
        second.pairStartX=second.lastX;second.pairStartY=second.lastY;
        const pair={
            g:first.g,ids:[first.id,second.id],startedAt:performance.now(),
            tapEligible:true,longActive:false,cancelled:false,holdTimer:null
        };
        pairGesture=pair;
        pair.holdTimer=setTimeout(()=>startPairFast(pair),HOLD_MS);
        return true;
    }

    function updatePairMotion(rec){
        const pair=pairGesture;
        if(!pair||!rec?.paired||!pair.ids.includes(rec.id))return;
        const dx=rec.lastX-rec.pairStartX,dy=rec.lastY-rec.pairStartY;
        if(Math.hypot(dx,dy)>TWO_FINGER_JITTER_TOL){
            pair.tapEligible=false;
            clearPairHold();
        }
    }

    const onDown=e=>{
        if(!isCanvas(e))return;
        const g=player();if(!validGame(g))return;
        consume(e);try{Sfx.init();}catch(_){}

        // A third contact is never a gameplay command. Cancel the active pair
        // safely, but do not drop or leave fast-fall latched.
        if(pointers.size>=2){resetAll("three-touch-cancel");return;}

        const p=point(e,e.target);
        const rec={
            id:e.pointerId,canvas:e.target,g,
            startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,
            downAt:performance.now(),half:p.x>=VW*.5?1:-1,
            tapEligible:true,dragActive:false,dragMoved:false,paired:false,
            dragBaseX:currentX(g),pairStartX:p.x,pairStartY:p.y
        };
        pointers.set(rec.id,rec);
        try{rec.canvas.setPointerCapture(rec.id);}catch(_){}

        if(pointers.size===2){
            const first=[...pointers.values()].find(q=>q.id!==rec.id);
            if(!armPair(first,rec))resetAll("invalid-two-touch");
        }
    };

    const onMove=e=>{
        const rec=pointers.get(e.pointerId);if(!rec)return;
        consume(e);
        const p=point(e,rec.canvas);rec.lastX=p.x;rec.lastY=p.y;

        if(rec.paired){updatePairMotion(rec);return;}

        const dx=rec.lastX-rec.startX,dy=rec.lastY-rec.startY,dist=Math.hypot(dx,dy);
        if(!rec.dragActive){
            const horizontalEnough=Math.abs(dx)>=DRAG_START_TOL&&Math.abs(dx)>=Math.abs(dy)*DRAG_AXIS_RATIO;
            if(horizontalEnough)beginDrag(rec);
            else if(dist>TAP_MOVE_TOL){rec.tapEligible=false;return;}
        }
        updateDrag(rec);
    };

    function finishPairPointer(rec,cancelled){
        const pair=pairGesture;
        if(!pair||!rec?.paired||!pair.ids.includes(rec.id))return false;
        updatePairMotion(rec);
        if(cancelled){pair.cancelled=true;pair.tapEligible=false;}

        // Fast fall exists only while both fingers are physically held.
        if(pair.longActive)stopFast(pair.g);
        clearPairHold();

        const bothReleased=pair.ids.every(id=>!pointers.has(id));
        if(bothReleased){
            const elapsed=performance.now()-pair.startedAt;
            const shouldDrop=!pair.cancelled&&!pair.longActive&&pair.tapEligible&&elapsed<=TAP_MAX_MS&&validGame(pair.g);
            const g=pair.g;
            pairGesture=null;
            if(shouldDrop)instantVerticalDrop(g);
        }
        return true;
    }

    const finish=(e,cancelled)=>{
        const rec=pointers.get(e.pointerId);if(!rec)return;
        consume(e);
        try{const p=point(e,rec.canvas);rec.lastX=p.x;rec.lastY=p.y;}catch(_){}
        pointers.delete(rec.id);releaseCapture(rec);

        if(rec.paired){
            finishPairPointer(rec,cancelled);
            return;
        }

        if(rec.dragActive)preserveReleasedDrag(rec.g);
        const elapsed=performance.now()-rec.downAt;
        const dist=Math.hypot(rec.lastX-rec.startX,rec.lastY-rec.startY);
        if(!cancelled&&!rec.dragActive&&rec.tapEligible&&elapsed<=TAP_MAX_MS&&dist<=TAP_MOVE_TOL&&validGame(rec.g)){
            rotate(rec.g,rec.half>0?1:-1);
        }
    };

    function resetAll(reason="reset"){
        const engines=new Set();
        if(pairGesture?.g)engines.add(pairGesture.g);
        for(const rec of pointers.values()){
            releaseCapture(rec);if(rec.g)engines.add(rec.g);
        }
        clearPairHold();
        for(const g of engines){stopFast(g);preserveReleasedDrag(g);}
        pointers.clear();
        pairGesture=null;
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
