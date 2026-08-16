/* HEXDROP controls v5.4: iOS-safe game input + screen-down dual-tap hard drop */
(function installHexTouchV5(){
    if(typeof document==="undefined" || window.__hexTouchV5Installed) return;
    window.__hexTouchV5Installed=true;

    const pointers=new Map();
    const singleTimers=new Map();
    const singleRafs=new Map();
    let dual=null;
    let inputGuardRaf=0;

    const SINGLE_HOLD_MS=LONG_PRESS_MS;
    const HOLD_MOVE_SPEED_X=24.4;
    const DUAL_TAP_MAX_MS=320;
    const TAP_MOVE_TOL=24;
    const DRAG_START_TOL=6;

    const isCanvas=(e)=>e?.target && e.target.tagName==="CANVAS";
    const player=()=>typeof hexTouchPlayerEngineV4==="function" ? hexTouchPlayerEngineV4() : null;
    const point=(e,canvas)=>{
        const r=canvas.getBoundingClientRect();
        return {
            x:(e.clientX-r.left)/Math.max(1,r.width)*VW,
            y:(e.clientY-r.top)/Math.max(1,r.height)*VH
        };
    };
    const consume=(e)=>{
        if(e?.cancelable)e.preventDefault();
        e?.stopImmediatePropagation?.();
    };
    const clearSingleTimer=(id)=>{
        const t=singleTimers.get(id);
        if(t){clearTimeout(t);singleTimers.delete(id);}
    };
    const stopSingleRaf=(id)=>{
        const raf=singleRafs.get(id);
        if(raf){cancelAnimationFrame(raf);singleRafs.delete(id);}
    };
    const stopFast=(g)=>{ if(g)g.fastForward=false; };

    const stopAllSingle=()=>{
        for(const id of [...singleTimers.keys()])clearSingleTimer(id);
        for(const id of [...singleRafs.keys()])stopSingleRaf(id);
        for(const r of pointers.values()){
            r.longMove=false;
            r.drag=false;
            if(r.g)r.g.dragging=false;
        }
    };

    function releaseCaptureSoon(rec){
        if(!rec?.canvas)return;
        try{
            if(rec.canvas.hasPointerCapture?.(rec.id))rec.canvas.releasePointerCapture(rec.id);
        }catch(_){}
    }

    function resetAllInputState(reason="reset"){
        if(dual?.timer)clearTimeout(dual.timer);
        dual=null;
        stopAllSingle();
        const engines=new Set();
        for(const rec of pointers.values()){
            if(rec.g)engines.add(rec.g);
            releaseCaptureSoon(rec);
        }
        pointers.clear();
        for(const g of engines){
            stopFast(g);
            g.dragging=false;
        }
        window.__hexLastInputResetV53={reason,at:performance.now()};
    }
    window.__hexResetTouchInput=resetAllInputState;

    function currentFreeX(g){
        if(Number.isFinite(g?.freeX))return g.freeX;
        if(Number.isFinite(g?.pieceVX))return g.pieceVX;
        return Number.isFinite(g?.piece?.x)?g.piece.x:SPAWN_X;
    }

    // Dual-tap hard drop is always world/screen gravity: +Y toward the bottom floor.
    // It never uses triangle orientation as a direction and never introduces an
    // intentional horizontal step during the drop. The current visual X is first
    // committed to the nearest legal logical column, then Y alone is advanced.
    function instantDropToFloorV5(g){
        if(!g || g.state!=="PLAYING" || !g.piece)return false;
        g.fastForward=false;
        g.dragging=false;
        g.hardDropAnim=null;
        g.dropT=0;

        const visualX=currentFreeX(g);
        setColumn(g,visualX);
        const fixedX=g.piece.x;
        const target={...g.piece,x:fixedX};

        // Strict screen-down ray: x is immutable; only +Y is considered.
        while(pieceFits(g.board,{...target,x:fixedX,y:target.y+2}))target.y+=2;

        target.x=fixedX;
        g.piece={...target};
        g.pieceVX=fixedX;
        g.freeX=null;
        emit(g,{t:"drop"});
        lock(g,5);
        return true;
    }
    window.__hexInstantDropV5=instantDropToFloorV5;

    function beginDrag(rec,anchorAtCurrent=false){
        if(!rec || (rec.consumed && !rec.longMove))return false;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece || dual)return false;
        clearSingleTimer(rec.id);
        stopSingleRaf(rec.id);
        rec.longMove=false;
        rec.drag=true;
        rec.consumed=true;
        g.dragging=true;
        if(anchorAtCurrent){
            rec.dragAnchorX=rec.lastX;
            rec.dragBaseX=currentFreeX(g);
        }else{
            rec.dragAnchorX=rec.startX;
            rec.dragBaseX=rec.startFreeX;
        }
        g.freeX=currentFreeX(g);
        return true;
    }

    function updateDrag(rec){
        if(!rec?.drag || dual)return;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        const dx=rec.lastX-rec.dragAnchorX;
        setFreeX(g,rec.dragBaseX+(dx/ME.D)*2);
    }

    function startSingleMove(rec){
        if(!rec || rec.consumed || dual || pointers.size!==1)return;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        rec.longMove=true;
        rec.consumed=true;
        rec.holdOriginX=rec.lastX;
        rec.holdOriginY=rec.lastY;
        rec.holdX=currentFreeX(g);
        g.dragging=true;
        g.freeX=rec.holdX;

        let last=performance.now();
        const tick=(now)=>{
            if(!pointers.has(rec.id) || dual || !rec.longMove || g.state!=="PLAYING" || !g.piece){
                stopSingleRaf(rec.id);
                if(!rec.drag)g.dragging=false;
                return;
            }
            const dt=Math.min(0.05,Math.max(0,(now-last)/1000));
            last=now;
            rec.holdX+=rec.half*HOLD_MOVE_SPEED_X*dt;
            setFreeX(g,rec.holdX);
            rec.holdX=currentFreeX(g);
            singleRafs.set(rec.id,requestAnimationFrame(tick));
        };
        singleRafs.set(rec.id,requestAnimationFrame(tick));
    }

    function armSingle(rec){
        clearSingleTimer(rec.id);
        singleTimers.set(rec.id,setTimeout(()=>{
            singleTimers.delete(rec.id);
            startSingleMove(rec);
        },SINGLE_HOLD_MS));
    }

    function dualPointersValid(d){
        if(!d || d.ids.length!==2)return false;
        const a=pointers.get(d.ids[0]);
        const b=pointers.get(d.ids[1]);
        return !!a && !!b && a.half!==b.half;
    }

    function startDualIfPossible(){
        if(pointers.size!==2)return false;
        const arr=[...pointers.values()];
        const g=arr[0].g;
        stopAllSingle();
        stopFast(g);

        if(arr[0].half===arr[1].half){
            for(const r of arr)r.consumed=true;
            return false;
        }

        for(const r of arr){
            r.consumed=true;
            r.dual=true;
            r.drag=false;
            r.longMove=false;
        }
        if(g)g.dragging=false;

        dual={ids:arr.map(r=>r.id),g,startedAt:performance.now(),tapEligible:true,fast:false,timer:null};
        dual.timer=setTimeout(()=>{
            if(!dual || !dualPointersValid(dual))return;
            const gg=dual.g;
            if(!gg || gg.state!=="PLAYING" || !gg.piece)return;
            dual.fast=true;
            dual.tapEligible=false;
            if(!gg.fastForward)emit(gg,{t:"fast"});
            gg.fastForward=true;
        },LONG_PRESS_MS);
        return true;
    }

    function purgeDualPointers(d){
        if(!d)return;
        for(const did of d.ids){
            const rec=pointers.get(did);
            clearSingleTimer(did);
            stopSingleRaf(did);
            if(rec){
                rec.consumed=true;
                rec.drag=false;
                rec.longMove=false;
                releaseCaptureSoon(rec);
            }
            pointers.delete(did);
        }
    }

    function finishDual(id,cancelled){
        if(!dual || !dual.ids.includes(id))return false;
        const d=dual;
        if(d.timer)clearTimeout(d.timer);
        d.timer=null;
        const elapsed=performance.now()-d.startedAt;
        const g=d.g;

        if(d.fast)stopFast(g);
        else if(!cancelled && d.tapEligible && elapsed<=DUAL_TAP_MAX_MS)instantDropToFloorV5(g);

        purgeDualPointers(d);
        if(g)g.dragging=false;
        dual=null;
        return true;
    }

    const onDown=(e)=>{
        if(!isCanvas(e))return;
        const g=player();
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        consume(e);

        for(const [,r] of [...pointers]){
            if(!r?.g || r.g.state!=="PLAYING" || !r.g.piece){
                resetAllInputState("stale-before-down");
                break;
            }
        }

        const p=point(e,e.target);
        const rec={
            id:e.pointerId,canvas:e.target,g,
            half:p.x>=VW*0.5?1:-1,
            startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,
            startFreeX:currentFreeX(g),downAt:performance.now(),
            consumed:false,longMove:false,drag:false,dual:false
        };
        pointers.set(e.pointerId,rec);
        try{e.target.setPointerCapture(e.pointerId);}catch(_){}

        if(pointers.size===1)armSingle(rec);
        else if(pointers.size===2)startDualIfPossible();
        else resetAllInputState("too-many-pointers");
    };

    const onMove=(e)=>{
        const r=pointers.get(e.pointerId);
        if(!r)return;
        consume(e);
        const p=point(e,r.canvas);
        r.lastX=p.x;r.lastY=p.y;
        const dx=r.lastX-r.startX;
        const dy=r.lastY-r.startY;
        const dist=Math.hypot(dx,dy);

        if(dual && dual.ids.includes(r.id)){
            if(dist>TAP_MOVE_TOL)dual.tapEligible=false;
            return;
        }

        if(!r.drag && !r.longMove && Math.abs(dx)>=DRAG_START_TOL && Math.abs(dx)>=Math.abs(dy)*0.65){
            beginDrag(r,false);
        }else if(r.longMove){
            const hdx=r.lastX-(r.holdOriginX??r.lastX);
            const hdy=r.lastY-(r.holdOriginY??r.lastY);
            if(Math.abs(hdx)>=DRAG_START_TOL && Math.abs(hdx)>=Math.abs(hdy)*0.65)beginDrag(r,true);
        }
        updateDrag(r);
    };

    const finish=(e,cancelled)=>{
        const r=pointers.get(e.pointerId);
        if(!r)return;
        consume(e);

        if(dual && dual.ids.includes(r.id)){
            finishDual(r.id,cancelled);
            return;
        }

        clearSingleTimer(r.id);
        stopSingleRaf(r.id);
        pointers.delete(r.id);
        releaseCaptureSoon(r);

        if(r.drag || r.longMove)r.g.dragging=false;
        if(!cancelled && !r.consumed && !r.longMove && !r.drag && r.g.state==="PLAYING" && r.g.piece){
            const elapsed=performance.now()-r.downAt;
            const dist=Math.hypot(r.lastX-r.startX,r.lastY-r.startY);
            if(elapsed<360 && dist<TAP_MOVE_TOL)rotate(r.g,r.half>0?1:-1);
        }

        if(pointers.size===0){
            stopFast(r.g);
            stopAllSingle();
            r.g.dragging=false;
        }else{
            for(const rr of pointers.values())rr.consumed=true;
        }
    };

    const cancelBrowserHold=(e)=>{
        const t=e?.target;
        if(t?.tagName==="CANVAS" || t?.closest?.("#root"))consume(e);
    };

    document.addEventListener("pointerdown",onDown,true);
    document.addEventListener("pointermove",onMove,true);
    document.addEventListener("pointerup",e=>finish(e,false),true);
    document.addEventListener("pointercancel",e=>finish(e,true),true);

    document.addEventListener("contextmenu",cancelBrowserHold,true);
    document.addEventListener("selectstart",cancelBrowserHold,true);
    document.addEventListener("dragstart",cancelBrowserHold,true);
    document.addEventListener("gesturestart",cancelBrowserHold,{capture:true,passive:false});
    document.addEventListener("gesturechange",cancelBrowserHold,{capture:true,passive:false});
    document.addEventListener("gestureend",cancelBrowserHold,{capture:true,passive:false});

    document.addEventListener("lostpointercapture",e=>{
        const id=e.pointerId;
        setTimeout(()=>{ if(pointers.has(id))resetAllInputState("lost-pointer-capture"); },0);
    },true);

    window.addEventListener("blur",()=>resetAllInputState("window-blur"),true);
    window.addEventListener("pagehide",()=>resetAllInputState("pagehide"),true);
    document.addEventListener("visibilitychange",()=>{
        if(document.hidden)resetAllInputState("visibility-hidden");
    },true);

    const guard=()=>{
        if(pointers.size){
            const invalid=[...pointers.values()].some(r=>!r.g || r.g.state!=="PLAYING" || !r.g.piece);
            if(invalid)resetAllInputState("engine-state-change");
        }
        inputGuardRaf=requestAnimationFrame(guard);
    };
    inputGuardRaf=requestAnimationFrame(guard);
})();