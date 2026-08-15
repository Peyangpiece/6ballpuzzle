/* HEXDROP controls v5: single-hold horizontal, dual-tap instant vertical drop, dual-hold fast fall */
(function installHexTouchV5(){
    if(typeof document==="undefined" || window.__hexTouchV5Installed) return;
    window.__hexTouchV5Installed=true;

    const pointers=new Map();
    const singleTimers=new Map();
    const singleRepeats=new Map();
    let dual=null;

    const SINGLE_HOLD_MS=LONG_PRESS_MS;
    const MOVE_REPEAT_MS=82;
    const DUAL_TAP_MAX_MS=320;
    const TAP_MOVE_TOL=24;

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
        if(e.cancelable)e.preventDefault();
        e.stopImmediatePropagation();
    };
    const clearSingleTimer=(id)=>{
        const t=singleTimers.get(id);
        if(t){clearTimeout(t);singleTimers.delete(id);}
    };
    const stopSingleRepeat=(id)=>{
        const t=singleRepeats.get(id);
        if(t){clearInterval(t);singleRepeats.delete(id);}
    };
    const stopAllSingle=()=>{
        for(const id of [...singleTimers.keys()])clearSingleTimer(id);
        for(const id of [...singleRepeats.keys()])stopSingleRepeat(id);
        for(const r of pointers.values())r.longMove=false;
    };
    const stopFast=(g)=>{
        if(g)g.fastForward=false;
    };

    function instantDropToFloorV5(g){
        if(!g || g.state!=="PLAYING" || !g.piece)return false;

        // The instant-drop gesture is strictly vertical. Never reuse freeX,
        // dragging state, wall kicks, or any horizontal search/correction.
        g.fastForward=false;
        g.dragging=false;
        g.freeX=null;
        g.hardDropAnim=null;
        g.dropT=0;

        const fixedX=g.piece.x;
        const target={...g.piece,x:fixedX};
        while(pieceFits(g.board,{...target,x:fixedX,y:target.y+2})){
            target.y+=2;
        }
        target.x=fixedX;

        // Lock the rendered x to the same logical column as well. A stale
        // interpolation value can therefore never shoot the piece to a wall.
        g.pieceVX=fixedX;
        g.freeX=null;
        g.piece={...target};
        emit(g,{t:"drop"});
        lock(g,5);
        return true;
    }
    window.__hexInstantDropV5=instantDropToFloorV5;

    function startSingleMove(rec){
        if(!rec || rec.consumed || dual || pointers.size!==1)return;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        rec.longMove=true;
        rec.consumed=true;
        const step=()=>{
            if(!pointers.has(rec.id) || dual || g.state!=="PLAYING" || !g.piece){
                stopSingleRepeat(rec.id);
                return;
            }
            move(g,rec.half);
        };
        step();
        singleRepeats.set(rec.id,setInterval(step,MOVE_REPEAT_MS));
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
        if(arr[0].half===arr[1].half){
            stopAllSingle();
            for(const r of arr)r.consumed=true;
            return false;
        }
        stopAllSingle();
        const g=arr[0].g;
        stopFast(g);
        for(const r of arr){
            r.consumed=true;
            r.dual=true;
        }
        dual={
            ids:arr.map(r=>r.id),
            g,
            startedAt:performance.now(),
            tapEligible:true,
            fast:false,
            timer:null
        };
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

    function finishDual(id,cancelled){
        if(!dual || !dual.ids.includes(id))return false;
        const d=dual;
        if(d.timer)clearTimeout(d.timer);
        d.timer=null;
        const elapsed=performance.now()-d.startedAt;
        const g=d.g;

        if(d.fast){
            stopFast(g);
        }else if(!cancelled && d.tapEligible && elapsed<=DUAL_TAP_MAX_MS){
            instantDropToFloorV5(g);
        }

        for(const did of d.ids){
            const r=pointers.get(did);
            if(r)r.consumed=true;
            clearSingleTimer(did);
            stopSingleRepeat(did);
        }
        dual=null;
        return true;
    }

    const onDown=(e)=>{
        if(!isCanvas(e))return;
        const g=player();
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        consume(e);

        const p=point(e,e.target);
        const rec={
            id:e.pointerId,
            canvas:e.target,
            g,
            half:p.x>=VW*0.5?1:-1,
            startX:p.x,startY:p.y,
            lastX:p.x,lastY:p.y,
            downAt:performance.now(),
            consumed:false,longMove:false,dual:false
        };
        pointers.set(e.pointerId,rec);
        try{e.target.setPointerCapture(e.pointerId);}catch(_){}

        if(pointers.size===1){
            armSingle(rec);
        }else if(pointers.size===2){
            startDualIfPossible();
        }else{
            stopAllSingle();
            if(dual?.timer)clearTimeout(dual.timer);
            stopFast(g);
            dual=null;
            for(const r of pointers.values())r.consumed=true;
        }
    };

    const onMove=(e)=>{
        const r=pointers.get(e.pointerId);
        if(!r)return;
        consume(e);
        const p=point(e,r.canvas);
        r.lastX=p.x;r.lastY=p.y;
        const dist=Math.hypot(r.lastX-r.startX,r.lastY-r.startY);
        if(dual && dual.ids.includes(r.id) && dist>TAP_MOVE_TOL){
            dual.tapEligible=false;
        }
        // v5 intentionally has no drag-to-move path. Horizontal motion exists
        // only as left/right single-finger hold-repeat.
    };

    const finish=(e,cancelled)=>{
        const r=pointers.get(e.pointerId);
        if(!r)return;
        consume(e);
        try{r.canvas.releasePointerCapture(r.id);}catch(_){}
        clearSingleTimer(r.id);
        stopSingleRepeat(r.id);

        const wasDual=finishDual(r.id,cancelled);
        pointers.delete(r.id);

        if(!wasDual && !cancelled && !r.consumed && !r.longMove && r.g.state==="PLAYING" && r.g.piece){
            const elapsed=performance.now()-r.downAt;
            const dist=Math.hypot(r.lastX-r.startX,r.lastY-r.startY);
            if(elapsed<360 && dist<TAP_MOVE_TOL){
                rotate(r.g,r.half>0?1:-1);
            }
        }

        if(pointers.size===0){
            stopFast(r.g);
            stopAllSingle();
            dual=null;
        }else{
            // The finger left from a completed two-finger gesture is ignored
            // until release; it cannot turn into an old one-finger gesture.
            for(const rr of pointers.values())rr.consumed=true;
        }
    };

    document.addEventListener("pointerdown",onDown,true);
    document.addEventListener("pointermove",onMove,true);
    document.addEventListener("pointerup",e=>finish(e,false),true);
    document.addEventListener("pointercancel",e=>finish(e,true),true);
})();
