/* UI/UX layer v1 (no physics).
 * - Gamepad menus: D-pad / stick moves focus between buttons, A presses,
 *   B goes back, + opens the pause menu during a match.
 */
(function installGamepadMenus(){
    if(typeof window==="undefined"||typeof navigator==="undefined"||typeof navigator.getGamepads!=="function"||window.__sixBallGamepadMenusV1)return;
    window.__sixBallGamepadMenusV1=true;
    const prev={};let repeatAt=0,held=false,running=false;
    const pad=()=>{const list=navigator.getGamepads?navigator.getGamepads():[];for(const g of list)if(g&&g.connected)return g;return null;};
    const pressed=(g,i)=>!!(g.buttons[i]&&g.buttons[i].pressed);
    const just=(g,i)=>{const now=pressed(g,i),was=!!prev[i];prev[i]=now;return now&&!was;};
    const visible=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=="hidden";};
    const scope=()=>{const d=[...document.querySelectorAll('[role="dialog"]')];return d.length?d[d.length-1]:document.getElementById("root")||document.body;};
    const buttons=()=>[...scope().querySelectorAll("button:not([disabled])")].filter(visible);
    const focusStep=(dir)=>{const list=buttons();if(!list.length)return;const i=list.indexOf(document.activeElement);const n=i<0?(dir>0?0:list.length-1):(i+dir+list.length)%list.length;document.documentElement.classList.add("hex-pad-nav");try{list[n].focus({preventScroll:false});}catch(_){}};
    const tick=()=>{
        const g=pad();
        if(!g){running=false;return;}
        requestAnimationFrame(tick);
        const screen=window.__sixBallScreen;
        const dialog=!!document.querySelector('[role="dialog"]');
        if(just(g,9)&&screen==="GAME")window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));
        // During play the controller drives the piece; menus only take over
        // outside a match or while a dialog (pause / result) is shown.
        if(screen==="GAME"&&!dialog){for(const i of [0,1,12,13,14,15])prev[i]=pressed(g,i);return;}
        const now=performance.now(),ax=g.axes&&g.axes.length>1?g.axes:[0,0];
        const up=pressed(g,12)||pressed(g,14)||ax[1]<-.6||ax[0]<-.6,down=pressed(g,13)||pressed(g,15)||ax[1]>.6||ax[0]>.6;
        if(up||down){if(!held){held=true;focusStep(down?1:-1);repeatAt=now+320;}else if(now>=repeatAt){focusStep(down?1:-1);repeatAt=now+140;}}else held=false;
        for(const i of [12,13,14,15])prev[i]=pressed(g,i);
        if(just(g,0)){const el=document.activeElement;if(el&&el.tagName==="BUTTON"&&scope().contains(el))el.click();else focusStep(1);}
        if(just(g,1)){const back=scope().querySelector("[data-hex-back]");if(back)back.click();}
    };
    const start=()=>{if(running)return;if(!pad())return;running=true;for(let i=0;i<17;i++)prev[i]=true;requestAnimationFrame(tick);};
    window.addEventListener("gamepadconnected",start);
    window.addEventListener("pointerdown",()=>document.documentElement.classList.remove("hex-pad-nav"),true);
    setInterval(start,1000);
})();

// Landscape phones: the on-screen keyboard covers most of the height, so a
// focused text field is scrolled back into the visible area.
(function keepFocusedInputVisible(){
    if(typeof window==="undefined"||typeof document==="undefined"||!document.addEventListener||window.__sixBallFocusVisibleV1)return;
    window.__sixBallFocusVisibleV1=true;
    const reveal=()=>{const el=document.activeElement;if(el&&(el.tagName==="INPUT"||el.tagName==="TEXTAREA")&&el.type!=="range"){try{el.scrollIntoView({block:"center",behavior:"smooth"});}catch(_){}}};
    document.addEventListener("focusin",()=>setTimeout(reveal,320),true);
    if(window.visualViewport)window.visualViewport.addEventListener("resize",reveal);
})();

if(typeof window!=="undefined")window.__sixBallUiUxVersion="ui-ux-v1";
