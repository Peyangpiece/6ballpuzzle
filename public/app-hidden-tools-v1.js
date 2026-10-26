/* Hidden tools, opened only from the keyboard (no menu entry):
 *   ⌘+D (Ctrl+D)  calculator: a small floating calculator, draggable by its
 *                 title bar; typed digits / operators / Enter / Backspace /
 *                 Esc work while it has focus.
 *   ⌘+K (Ctrl+K)  pen: draw freely over the whole screen. ⌘+K again hides the
 *                 drawing (it is kept and shown again next time); 消去 clears it.
 * The shortcuts are taken before the game sees them, and keys typed into the
 * calculator do not reach the game. Plain DOM; no game state is touched.
 */
(function installHiddenTools(){
    if(typeof window==="undefined"||typeof document==="undefined"||window.__sixBallHiddenToolsInstalled)return;
    window.__sixBallHiddenToolsInstalled=true;

    const FONT='ui-sans-serif,system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
    const el=(tag,style,attrs)=>{const n=document.createElement(tag);if(style)Object.assign(n.style,style);if(attrs)for(const k in attrs)n.setAttribute(k,attrs[k]);return n;};

    /* ---------------- Calculator ---------------- */
    // Immediate execution, like a pocket calculator: 2 + 3 × 4 = 20.
    function createCalc(){
        const s={display:"0",acc:null,op:null,fresh:true};
        const fmt=v=>{if(!Number.isFinite(v))return"エラー";const r=Number(v.toPrecision(12));return Math.abs(r)>=1e12||(r!==0&&Math.abs(r)<1e-9)?r.toExponential(6).replace(/\.?0+e/,"e"):String(r);};
        const apply=(a,op,b)=>op==="+"?a+b:op==="−"?a-b:op==="×"?a*b:op==="÷"?(b===0?NaN:a/b):b;
        return{
            get display(){return s.display;},
            digit(d){if(s.display==="エラー")this.clear();if(s.fresh){s.display=d==="."?"0.":d;s.fresh=false;return;}if(d==="."&&s.display.includes("."))return;if(s.display.replace(/[-.]/g,"").length>=12)return;s.display=s.display==="0"&&d!=="."?d:s.display+d;},
            op(o){if(s.display==="エラー")return;const v=Number(s.display);if(s.op&&!s.fresh){const r=apply(s.acc,s.op,v);s.display=fmt(r);s.acc=Number.isFinite(r)?r:null;}else s.acc=v;s.op=o;s.fresh=true;if(s.display==="エラー"){s.op=null;s.acc=null;}},
            equals(){if(!s.op||s.display==="エラー")return;const r=apply(s.acc,s.op,Number(s.display));s.display=fmt(r);s.acc=null;s.op=null;s.fresh=true;},
            clear(){s.display="0";s.acc=null;s.op=null;s.fresh=true;},
            back(){if(s.fresh||s.display==="エラー")return;s.display=s.display.length>1&&!(s.display.length===2&&s.display[0]==="-")?s.display.slice(0,-1):"0";},
            negate(){if(s.display==="0"||s.display==="エラー")return;s.display=s.display[0]==="-"?s.display.slice(1):"-"+s.display;},
            percent(){if(s.display==="エラー")return;s.display=fmt(Number(s.display)/100);s.fresh=true;},
            get pendingOp(){return s.op;}
        };
    }
    window.__sixBallCreateCalculator=createCalc;

    let calcBox=null,calc=null,calcScreen=null,calcOpLabel=null;
    function renderCalc(){calcScreen.textContent=calc.display;calcOpLabel.textContent=calc.pendingOp||"";}
    function press(k){
        if(/^[0-9.]$/.test(k))calc.digit(k);
        else if(["+","−","×","÷"].includes(k))calc.op(k);
        else if(k==="=")calc.equals();
        else if(k==="C")calc.clear();
        else if(k==="⌫")calc.back();
        else if(k==="±")calc.negate();
        else if(k==="%")calc.percent();
        renderCalc();
    }
    function buildCalc(){
        calc=createCalc();
        calcBox=el("div",{position:"fixed",right:"24px",top:"72px",zIndex:"2147483000",width:"232px",borderRadius:"18px",background:"rgba(16,16,30,.96)",border:"1px solid rgba(255,255,255,.14)",boxShadow:"0 18px 50px rgba(0,0,0,.5)",color:"#fff",fontFamily:FONT,userSelect:"none",touchAction:"none",outline:"none"},{role:"dialog","aria-label":"電卓",tabindex:"-1","data-hex-calculator":"1"});
        const bar=el("div",{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px 0 14px",cursor:"move",fontSize:"12px",fontWeight:"700",color:"rgba(255,255,255,.55)"});
        bar.textContent="電卓";
        const close=el("button",{width:"28px",height:"28px",borderRadius:"8px",border:"none",background:"transparent",color:"rgba(255,255,255,.7)",fontSize:"18px",cursor:"pointer"},{"aria-label":"電卓を閉じる"});
        close.textContent="×";close.addEventListener("click",()=>toggleCalc(false));bar.appendChild(close);
        const screenWrap=el("div",{padding:"4px 14px 8px",textAlign:"right"});
        calcOpLabel=el("div",{height:"14px",fontSize:"12px",color:"rgba(255,255,255,.45)"});
        calcScreen=el("div",{fontSize:"32px",fontWeight:"600",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},{"aria-live":"polite","data-hex-calculator-display":"1"});
        screenWrap.append(calcOpLabel,calcScreen);
        const grid=el("div",{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",padding:"0 10px 12px"});
        const keys=["C","±","%","÷","7","8","9","×","4","5","6","−","1","2","3","+","0",".","⌫","="];
        for(const k of keys){
            const op=["÷","×","−","+","="].includes(k),fn=["C","±","%","⌫"].includes(k);
            const b=el("button",{height:"44px",borderRadius:"12px",border:"none",fontSize:"18px",fontWeight:"600",cursor:"pointer",color:op?"#061016":"#fff",background:op?"#2FE3F5":fn?"rgba(255,255,255,.16)":"rgba(255,255,255,.08)"},{"data-key":k,"aria-label":k});
            b.textContent=k;b.addEventListener("click",()=>{press(k);calcBox.focus({preventScroll:true});});
            grid.appendChild(b);
        }
        calcBox.append(bar,screenWrap,grid);
        // Keys typed while the calculator has focus belong to it, not to the game.
        calcBox.addEventListener("keydown",e=>{
            if(e.metaKey||e.ctrlKey||e.altKey)return;
            const map={"*":"×","x":"×","/":"÷","-":"−","+":"+","Enter":"=","=":"=","Backspace":"⌫","Delete":"C","c":"C","%":"%"};
            const k=/^[0-9.]$/.test(e.key)?e.key:map[e.key];
            e.stopPropagation();
            if(e.key==="Escape"){e.preventDefault();toggleCalc(false);return;}
            if(k){e.preventDefault();press(k);}
        });
        calcBox.addEventListener("keyup",e=>e.stopPropagation());
        // Drag by the title bar.
        let drag=null;
        bar.addEventListener("pointerdown",e=>{if(e.target===close)return;const r=calcBox.getBoundingClientRect();drag={dx:e.clientX-r.left,dy:e.clientY-r.top};try{bar.setPointerCapture(e.pointerId);}catch(_){}});
        bar.addEventListener("pointermove",e=>{if(!drag)return;const x=Math.max(0,Math.min(window.innerWidth-calcBox.offsetWidth,e.clientX-drag.dx)),y=Math.max(0,Math.min(window.innerHeight-calcBox.offsetHeight,e.clientY-drag.dy));Object.assign(calcBox.style,{left:x+"px",top:y+"px",right:"auto"});});
        bar.addEventListener("pointerup",()=>{drag=null;});
        // Taps on the calculator never reach the game canvas underneath.
        for(const t of ["pointerdown","pointerup","touchstart","touchend","click"])calcBox.addEventListener(t,e=>e.stopPropagation());
        document.body.appendChild(calcBox);
        renderCalc();
    }
    function toggleCalc(force){
        const show=typeof force==="boolean"?force:!(calcBox&&calcBox.style.display!=="none");
        if(show&&!calcBox)buildCalc();
        if(!calcBox)return;
        calcBox.style.display=show?"block":"none";
        if(show)calcBox.focus({preventScroll:true});
        window.__sixBallCalculatorOpen=show;
    }

    /* ---------------- Pen ---------------- */
    let penLayer=null,penCanvas=null,penCtx=null,penColor="#FF3EA5",strokes=[];
    const PEN_COLORS=["#FF3EA5","#FFD36A","#2FE3F5","#FFFFFF"];
    function redraw(){
        const dpr=Math.min(2,window.devicePixelRatio||1),w=window.innerWidth,h=window.innerHeight;
        if(penCanvas.width!==Math.round(w*dpr)||penCanvas.height!==Math.round(h*dpr)){penCanvas.width=Math.round(w*dpr);penCanvas.height=Math.round(h*dpr);}
        penCtx.setTransform(dpr,0,0,dpr,0,0);penCtx.clearRect(0,0,w,h);
        penCtx.lineCap="round";penCtx.lineJoin="round";
        for(const s of strokes){penCtx.strokeStyle=s.color;penCtx.lineWidth=4;penCtx.beginPath();s.points.forEach(([x,y],i)=>i?penCtx.lineTo(x,y):penCtx.moveTo(x,y));if(s.points.length===1)penCtx.lineTo(s.points[0][0]+.01,s.points[0][1]);penCtx.stroke();}
    }
    function buildPen(){
        penLayer=el("div",{position:"fixed",inset:"0",zIndex:"2147482000",touchAction:"none",cursor:"crosshair"},{"data-hex-pen":"1"});
        penCanvas=el("canvas",{position:"absolute",inset:"0",width:"100%",height:"100%"});
        penCtx=penCanvas.getContext("2d");
        const bar=el("div",{position:"absolute",left:"50%",bottom:"16px",transform:"translateX(-50%)",display:"flex",gap:"8px",alignItems:"center",padding:"8px 10px",borderRadius:"999px",background:"rgba(16,16,30,.9)",border:"1px solid rgba(255,255,255,.14)",fontFamily:FONT,cursor:"default"});
        const swatches=PEN_COLORS.map(c=>{const b=el("button",{width:"26px",height:"26px",borderRadius:"50%",border:"2px solid transparent",background:c,cursor:"pointer"},{"aria-label":"ペンの色 "+c});b.addEventListener("click",()=>{penColor=c;mark();});return b;});
        const mark=()=>swatches.forEach((b,i)=>{b.style.borderColor=PEN_COLORS[i]===penColor?"#fff":"transparent";});
        const btn=(label,fn)=>{const b=el("button",{height:"28px",padding:"0 12px",borderRadius:"999px",border:"none",background:"rgba(255,255,255,.12)",color:"#fff",fontSize:"12px",fontWeight:"700",cursor:"pointer"});b.textContent=label;b.addEventListener("click",fn);return b;};
        bar.append(...swatches,btn("消去",()=>{strokes=[];redraw();}),btn("閉じる（⌘K）",()=>togglePen(false)));
        mark();
        // The game's touch layer (controls-v7) takes pointer events on every
        // <canvas> in its document capture listener, so the pen handles its
        // own canvas earlier, on window, and stops them there: drawing never
        // moves or rotates a piece.
        let cur=null;
        const onPen=e=>{
            if(e.target!==penCanvas)return;
            e.stopPropagation();e.preventDefault();
            if(e.type==="pointerdown"){cur={color:penColor,points:[[e.clientX,e.clientY]]};strokes.push(cur);try{penCanvas.setPointerCapture(e.pointerId);}catch(_){}redraw();}
            else if(e.type==="pointermove"){if(cur){cur.points.push([e.clientX,e.clientY]);redraw();}}
            else cur=null;
        };
        for(const t of ["pointerdown","pointermove","pointerup","pointercancel"])window.addEventListener(t,onPen,{capture:true,passive:false});
        for(const t of ["touchstart","touchmove","touchend","click"])window.addEventListener(t,e=>{if(e.target===penCanvas)e.stopPropagation();},{capture:true,passive:true});
        for(const t of ["pointerdown","pointerup","touchstart","touchend","click"])penLayer.addEventListener(t,e=>e.stopPropagation());
        window.addEventListener("resize",()=>{if(penLayer&&penLayer.style.display!=="none")redraw();});
        penLayer.append(penCanvas,bar);
        document.body.appendChild(penLayer);
    }
    function togglePen(force){
        const show=typeof force==="boolean"?force:!(penLayer&&penLayer.style.display!=="none");
        if(show&&!penLayer)buildPen();
        if(!penLayer)return;
        penLayer.style.display=show?"block":"none";
        if(show)redraw();
        window.__sixBallPenOpen=show;
    }
    window.__sixBallPenStrokeCount=()=>strokes.length;

    /* ---------------- Shortcuts ---------------- */
    window.addEventListener("keydown",e=>{
        if(!(e.metaKey||e.ctrlKey)||e.altKey||e.shiftKey||e.repeat)return;
        const k=String(e.key||"").toLowerCase();
        if(k!=="d"&&k!=="k")return;
        e.preventDefault();e.stopImmediatePropagation();
        if(k==="d")toggleCalc();else togglePen();
    },true);
    window.__sixBallToggleCalculator=toggleCalc;
    window.__sixBallTogglePen=togglePen;
    window.__sixBallHiddenToolsVersion="hidden-tools-v1";
})();
