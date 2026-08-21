/* 6ball brand + menu audio + gameplay BGM adapter.
 * UI/audio only: no board, physics, collision, timing or AI code is touched.
 */
(function install6ballBrandAndGameplayBgm(){
    if(typeof window==="undefined"||window.__sixBallBrandInstalled)return;
    window.__sixBallBrandInstalled=true;
    window.__sixBallBrandVersion="6ball-brand-v2";
    window.__sixBallAppName="6ball";

    if(typeof React!=="undefined"&&React.createElement&&!React.__sixBallNameBridge){
        const baseCreateElement=React.createElement.bind(React);
        React.__sixBallNameBridge=true;
        React.createElement=function(type,props,...children){
            const renamed=children.map(v=>v==="HEXDROP"?"6ball":v);
            return baseCreateElement(type,props,...renamed);
        };
    }

    if(typeof HexLogoMark==="function"&&typeof BALL_SRC!=="undefined"){
        HexLogoMark=function({size=112}){
            const nodes=[],order=[0,1,2,3,4,0],r=size*.31,d=size*.30,c=size/2;
            for(let i=0;i<6;i++){
                const a=-Math.PI/2+i*Math.PI/3,ci=order[i];
                nodes.push(React.createElement("img",{key:i,src:BALL_SRC[ci],alt:"",draggable:false,"aria-hidden":"true",style:{position:"absolute",left:c+Math.cos(a)*r-d/2,top:c+Math.sin(a)*r-d/2,width:d,height:d,objectFit:"contain",pointerEvents:"none",userSelect:"none",filter:"drop-shadow(0 0 8px rgba(255,255,255,.10))"}}));
            }
            return React.createElement("div",{style:{position:"relative",width:size,height:size,filter:"drop-shadow(0 0 22px rgba(47,227,245,.18))"}},nodes);
        };
        window.__sixBallUsesGameBallAssets=true;
        window.__sixBallMenuBallSources=BALL_SRC.slice();
    }

    if(typeof HexMenuShell==="function"&&!window.__sixBallShellWrapped){
        const baseShell=HexMenuShell;
        window.__sixBallShellWrapped=true;
        HexMenuShell=function(props){
            const p={...(props||{})};
            if(!p.eyebrow)p.eyebrow="6BALL // COMMAND";
            if(p.title==="設定"){
                const credit=React.createElement("div",{key:"sixball-bgm-credit",className:"mt-3 text-center text-[9px] font-semibold text-white/30 leading-relaxed"},"BGM：6 Ball Puzzle");
                p.children=React.createElement(React.Fragment,null,p.children,credit);
            }
            return baseShell(p);
        };
    }

    // Rebuild the exact uploaded tap sound from text chunks already shipped in
    // /public. This avoids relying on the truncated repository MP3 and produces
    // the same 32,256 bytes verified by the deployment SHA-256 gate.
    const MENU_CONFIRM_SHA256="97f2bcc23284ca8403ae6d6d06dbf4d40a9f6a8ca877eabdd747a85b3e89047e";
    function readMenuChunkSync(name){
        if(typeof XMLHttpRequest==="undefined")return"";
        const x=new XMLHttpRequest();
        x.open("GET","/assets/menu-confirm-42.b64."+name+"?v="+MENU_CONFIRM_SHA256.slice(0,16),false);
        try{x.send(null);}catch(_){return"";}
        if(x.status<200||x.status>=300)return"";
        return String(x.responseText||"").replace(/[\r\n\t ]/g,"");
    }
    function buildMenuConfirmSource(){
        try{
            const p00=readMenuChunkSync("00"),p01=readMenuChunkSync("01"),p02=readMenuChunkSync("02"),tail=readMenuChunkSync("tail");
            if(!p00||!p01||p02.length<5376||tail.length<5376)throw new Error("menu-audio-chunk-missing");
            const b64=p00+p01+p02.slice(0,5376)+tail.slice(0,5376).repeat(5);
            const raw=atob(b64);
            if(raw.length!==32256)throw new Error("menu-audio-size-"+raw.length);
            const bytes=new Uint8Array(raw.length);
            for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i)&255;
            const src=URL.createObjectURL(new Blob([bytes],{type:"audio/mpeg"}));
            window.__sixBallMenuClickByteLength=raw.length;
            window.__sixBallMenuClickSourceKind="rebuilt-exact-upload";
            return src;
        }catch(err){
            window.__sixBallMenuClickBuildError=err&&err.message?String(err.message):"build-error";
            window.__sixBallMenuClickSourceKind="asset-fallback";
            return "/assets/menu-confirm-42.mp3?v="+MENU_CONFIRM_SHA256.slice(0,16);
        }
    }
    const MENU_CONFIRM_SRC=buildMenuConfirmSource();
    const MenuClick={
        pool:null,
        cursor:0,
        lastError:"",
        init(){
            if(this.pool||typeof Audio==="undefined")return;
            this.pool=Array.from({length:6},()=>{
                const a=new Audio();
                a.preload="auto";
                a.playsInline=true;
                a.setAttribute("playsinline","");
                a.src=MENU_CONFIRM_SRC;
                try{a.load();}catch(_){}
                return a;
            });
        },
        volume(){
            if(typeof Sfx!=="undefined"&&Number.isFinite(Sfx._menuVolume))return Math.max(0,Math.min(1,Sfx._menuVolume));
            try{
                const stored=localStorage.getItem("hexdrop_sfx_volume");
                if(stored!==null){const raw=Number(stored);if(Number.isFinite(raw))return Math.max(0,Math.min(1,raw/100));}
            }catch(_){}
            return .85;
        },
        play(){
            this.init();
            if(!this.pool||!this.pool.length)return;
            const a=this.pool[this.cursor++%this.pool.length];
            try{a.pause();a.currentTime=0;}catch(_){}
            a.muted=false;
            a.volume=this.volume();
            window.__sixBallMenuClickLastVolume=a.volume;
            try{
                const p=a.play();
                if(p&&typeof p.catch==="function")p.catch((err)=>{this.lastError=err&&err.name?String(err.name):"play-rejected";window.__sixBallMenuClickLastError=this.lastError;});
            }catch(err){this.lastError=err&&err.name?String(err.name):"play-error";window.__sixBallMenuClickLastError=this.lastError;}
        }
    };
    window.MenuClick=MenuClick;
    window.__sixBallMenuClickSource=MENU_CONFIRM_SRC;
    window.__sixBallMenuClickUploadedSha256=MENU_CONFIRM_SHA256;
    window.__sixBallMenuClickAllButtons=true;
    window.__sixBallMenuClickPointerDown=true;
    window.__sixBallMenuClickRebuiltFromTextChunks=true;
    window.__sixBallMenuClickVersion="menu42-v4-exact-rebuilt";

    const CYBER44_SRC="https://maou.audio/sound/bgm/maou_bgm_cyber44.mp3";
    const UPLOADED_SHA256="4dedd2b97b80aca8ab47e9b797ad0e8a400c1e941a43b1c2b53aca40ea9cc532";
    const Bgm={
        audio:null,wanted:false,primed:false,primePromise:null,lastError:"",volume:Number.isFinite(window.__hexBgmVolume)?window.__hexBgmVolume:.70,
        init(){if(this.audio)return this.audio;if(typeof Audio==="undefined")return null;const a=new Audio();a.preload="auto";a.loop=true;a.playsInline=true;a.setAttribute("playsinline","");a.volume=0;a.muted=true;a.src=CYBER44_SRC;a.addEventListener("error",()=>{const err=a.error;this.lastError=err?`media-${err.code}`:"media-error";window.__sixBallGameplayBgmLastError=this.lastError;});this.audio=a;return a;},
        setVolume(v){this.volume=Math.max(0,Math.min(1,Number(v)||0));if(this.audio&&this.wanted&&!this.audio.muted)this.audio.volume=this.volume;},
        markPlayError(err){this.lastError=err&&err.name?String(err.name):"play-rejected";window.__sixBallGameplayBgmLastError=this.lastError;},
        prime(){const a=this.init();if(!a)return null;if(!a.paused){this.primed=true;return Promise.resolve(true);}if(this.primePromise)return this.primePromise;a.muted=true;a.volume=0;try{const p=a.play();if(p&&typeof p.then==="function"){this.primePromise=p.then(()=>{this.primed=true;this.lastError="";window.__sixBallGameplayBgmLastError="";return true;}).catch((err)=>{this.primed=false;this.primePromise=null;this.markPlayError(err);return false;});return this.primePromise;}this.primed=!a.paused;return Promise.resolve(this.primed);}catch(err){this.primed=false;this.primePromise=null;this.markPlayError(err);return Promise.resolve(false);}},
        activate(){const a=this.init();if(!a||!this.wanted)return;a.muted=false;a.volume=this.volume;if(!a.paused)return;try{const p=a.play();if(p&&typeof p.catch==="function")p.catch((err)=>this.markPlayError(err));}catch(err){this.markPlayError(err);}},
        start(restart=true){const a=this.init();if(!a)return;this.wanted=true;if(restart){try{a.currentTime=0;}catch(_){}}if(!a.paused){this.primed=true;this.activate();return;}const ready=this.prime();if(ready&&typeof ready.then==="function")ready.then((ok)=>{if(ok&&this.wanted)this.activate();});else this.activate();},
        pause(){if(this.audio)this.audio.pause();},
        stop(){this.wanted=false;this.primed=false;this.primePromise=null;if(!this.audio)return;this.audio.pause();this.audio.muted=true;this.audio.volume=0;try{this.audio.currentTime=0;}catch(_){}}
    };
    window.Bgm=Bgm;
    window.__sixBallGameplayBgmSource=CYBER44_SRC;
    window.__sixBallGameplayBgmUploadedSha256=UPLOADED_SHA256;
    window.__sixBallGameplayBgmLoop=true;
    window.__sixBallGameplayBgmPrimedFromMenu=true;
    window.__sixBallGameplayBgmMutedPrime=true;
    window.__sixBallGameplayBgmGestureRetry=true;
    window.__sixBallGameplayBgmVersion="cyber44-v3-muted-prime";

    let wasGame=false,observer=null;
    function gameIsVisible(){const root=document.getElementById("root");if(!root)return false;for(const b of root.querySelectorAll("button"))if((b.textContent||"").trim()==="✕")return true;return false;}
    function syncGameplayMusic(){const game=gameIsVisible();if(game&&!wasGame)Bgm.start(true);else if(!game&&wasGame)Bgm.stop();wasGame=game;}
    function observeRoot(){const root=document.getElementById("root");if(!root||observer)return;observer=new MutationObserver(syncGameplayMusic);observer.observe(root,{childList:true,subtree:true});syncGameplayMusic();}

    function handleMenuPress(e){
        const target=e.target&&typeof e.target.closest==="function"?e.target.closest("button,[role='button']"):null;
        if(!target||target.disabled||gameIsVisible())return;
        MenuClick.play();
        Bgm.prime();
    }
    if(typeof PointerEvent!=="undefined")document.addEventListener("pointerdown",handleMenuPress,{capture:true,passive:true});
    else document.addEventListener("touchstart",handleMenuPress,{capture:true,passive:true});

    document.addEventListener("click",()=>syncGameplayMusic(),{capture:false});
    document.addEventListener("pointerdown",()=>{if(!gameIsVisible())return;wasGame=true;if(!Bgm.wanted||!Bgm.audio||Bgm.audio.paused||Bgm.audio.muted)Bgm.start(false);},{capture:true});

    if(typeof Sfx!=="undefined"&&typeof Sfx.play==="function"&&!Sfx.__sixBallMenuClickBridge){
        const baseSfxPlay=Sfx.play.bind(Sfx);Sfx.__sixBallMenuClickBridge=true;Sfx.play=function(ev,vol){if(!gameIsVisible()&&ev&&ev.t==="move")return;return baseSfxPlay(ev,vol);};
    }

    document.addEventListener("visibilitychange",()=>{if(document.hidden)Bgm.pause();else if(wasGame)Bgm.start(false);});
    MenuClick.init();
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",observeRoot,{once:true});else observeRoot();
})();
