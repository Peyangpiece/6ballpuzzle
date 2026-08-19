/* 6ball brand + gameplay BGM adapter.
 * UI/audio only: no board, physics, collision, timing or AI code is touched.
 */
(function install6ballBrandAndGameplayBgm(){
    if(typeof window==="undefined"||window.__sixBallBrandInstalled)return;
    window.__sixBallBrandInstalled=true;
    window.__sixBallBrandVersion="6ball-brand-v1";
    window.__sixBallAppName="6ball";

    // Replace the old visible product name at React element creation time.
    // Internal HEXDROP-prefixed storage/runtime identifiers stay untouched so
    // existing profiles/settings remain backward compatible.
    if(typeof React!=="undefined"&&React.createElement&&!React.__sixBallNameBridge){
        const baseCreateElement=React.createElement.bind(React);
        React.__sixBallNameBridge=true;
        React.createElement=function(type,props,...children){
            const renamed=children.map(v=>v==="HEXDROP"?"6ball":v);
            return baseCreateElement(type,props,...renamed);
        };
    }

    // Use the exact same PNG ball assets as gameplay. No CSS-drawn substitute
    // is used in the menu mark; the sixth ball intentionally repeats red.
    if(typeof HexLogoMark==="function"&&typeof BALL_SRC!=="undefined"){
        HexLogoMark=function({size=112}){
            const nodes=[],order=[0,1,2,3,4,0],r=size*.31,d=size*.30,c=size/2;
            for(let i=0;i<6;i++){
                const a=-Math.PI/2+i*Math.PI/3,ci=order[i];
                nodes.push(React.createElement("img",{
                    key:i,src:BALL_SRC[ci],alt:"",draggable:false,"aria-hidden":"true",
                    style:{position:"absolute",left:c+Math.cos(a)*r-d/2,top:c+Math.sin(a)*r-d/2,width:d,height:d,objectFit:"contain",pointerEvents:"none",userSelect:"none",filter:"drop-shadow(0 0 8px rgba(255,255,255,.10))"}
                }));
            }
            return React.createElement("div",{style:{position:"relative",width:size,height:size,filter:"drop-shadow(0 0 22px rgba(47,227,245,.18))"}},nodes);
        };
        window.__sixBallUsesGameBallAssets=true;
        window.__sixBallMenuBallSources=BALL_SRC.slice();
    }

    // Keep the existing shell/world-view, but update its default brand line and
    // expose the required music credit inside Settings.
    if(typeof HexMenuShell==="function"&&!window.__sixBallShellWrapped){
        const baseShell=HexMenuShell;
        window.__sixBallShellWrapped=true;
        HexMenuShell=function(props){
            const p={...(props||{})};
            if(!p.eyebrow)p.eyebrow="6BALL // COMMAND";
            if(p.title==="設定"){
                const credit=React.createElement("div",{
                    key:"sixball-bgm-credit",
                    className:"mt-3 text-center text-[9px] font-semibold text-white/30 leading-relaxed"
                },"BGM：魔王魂 / 森田交一『サイバー44』");
                p.children=React.createElement(React.Fragment,null,p.children,credit);
            }
            return baseShell(p);
        };
    }

    const LOCAL_SRC="assets/maoudamashii_bgm_cyber44.mp3";
    const FALLBACK_SRC="https://maou.audio/sound/bgm/maou_bgm_cyber44.mp3";
    const Bgm={
        audio:null,
        wanted:false,
        unlocked:false,
        fallback:false,
        volume:Number.isFinite(window.__hexBgmVolume)?window.__hexBgmVolume:.70,
        init(){
            if(this.audio)return this.audio;
            if(typeof Audio==="undefined")return null;
            const a=new Audio();
            a.preload="auto";
            a.loop=true;
            a.volume=Math.max(0,Math.min(1,this.volume));
            a.src=LOCAL_SRC;
            a.addEventListener("error",()=>{
                if(this.fallback)return;
                this.fallback=true;
                const resume=this.wanted;
                a.src=FALLBACK_SRC;
                a.load();
                if(resume){const p=a.play();if(p&&typeof p.catch==="function")p.catch(()=>{});}
            });
            this.audio=a;
            return a;
        },
        setVolume(v){
            this.volume=Math.max(0,Math.min(1,Number(v)||0));
            if(this.audio)this.audio.volume=this.volume;
        },
        unlock(){
            const a=this.init();if(!a||this.unlocked)return;
            const wasMuted=a.muted;a.muted=true;
            try{
                const p=a.play();
                if(p&&typeof p.then==="function")p.then(()=>{
                    a.pause();a.currentTime=0;a.muted=wasMuted;this.unlocked=true;
                    if(this.wanted)this.start(false);
                }).catch(()=>{a.muted=wasMuted;});
                else{a.pause();a.currentTime=0;a.muted=wasMuted;this.unlocked=true;}
            }catch(_){a.muted=wasMuted;}
        },
        start(restart=true){
            const a=this.init();if(!a)return;
            this.wanted=true;a.muted=false;a.volume=this.volume;
            if(restart){try{a.currentTime=0;}catch(_){}}
            try{const p=a.play();if(p&&typeof p.catch==="function")p.catch(()=>{});}catch(_){}
        },
        pause(){if(this.audio)this.audio.pause();},
        stop(){
            this.wanted=false;
            if(!this.audio)return;
            this.audio.pause();
            try{this.audio.currentTime=0;}catch(_){}
        }
    };
    window.Bgm=Bgm;
    window.__sixBallGameplayBgmSource=LOCAL_SRC;
    window.__sixBallGameplayBgmFallback=FALLBACK_SRC;
    window.__sixBallGameplayBgmLoop=true;
    window.__sixBallGameplayBgmVersion="cyber44-v1";

    // The game screen uniquely owns the top-right resign button. Watching that
    // UI state keeps music game-only without touching App/gameplay state code.
    let wasGame=false,observer=null;
    function gameIsVisible(){
        const root=document.getElementById("root");if(!root)return false;
        for(const b of root.querySelectorAll("button"))if((b.textContent||"").trim()==="✕")return true;
        return false;
    }
    function syncGameplayMusic(){
        const game=gameIsVisible();
        if(game&&!wasGame)Bgm.start(true);
        else if(!game&&wasGame)Bgm.stop();
        wasGame=game;
    }
    function observeRoot(){
        const root=document.getElementById("root");if(!root||observer)return;
        observer=new MutationObserver(syncGameplayMusic);
        observer.observe(root,{childList:true,subtree:true});
        syncGameplayMusic();
    }
    document.addEventListener("pointerdown",()=>Bgm.unlock(),{capture:true,passive:true});
    document.addEventListener("keydown",()=>Bgm.unlock(),{capture:true});
    document.addEventListener("visibilitychange",()=>{
        if(document.hidden)Bgm.pause();
        else if(wasGame)Bgm.start(false);
    });
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",observeRoot,{once:true});
    else observeRoot();
})();
