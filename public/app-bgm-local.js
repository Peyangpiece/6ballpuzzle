/* 6ball same-origin gameplay BGM override.
 * Audio-only adapter. No physics/AI/board code is modified.
 */
(function installSameOriginCyber44(){
  if(typeof window==="undefined"||window.__sixBallLocalBgmInstalled)return;
  window.__sixBallLocalBgmInstalled=true;

  const HASH="4dedd2b97b80aca8ab47e9b797ad0e8a400c1e941a43b1c2b53aca40ea9cc532";
  const SRC="/assets/maou_bgm_cyber44.mp3?v="+HASH.slice(0,16);

  // Disable the previous cross-origin BGM object while keeping its menu/SFX code intact.
  const legacy=window.Bgm;
  if(legacy){
    try{if(typeof legacy.stop==="function")legacy.stop();}catch(_){}
    legacy.prime=function(){return Promise.resolve(false);};
    legacy.start=function(){};
    legacy.activate=function(){};
    legacy.pause=function(){};
    legacy.stop=function(){};
  }

  const Bgm={
    audio:null,
    wanted:false,
    primed:false,
    lastError:"",
    volume:Number.isFinite(window.__hexBgmVolume)?window.__hexBgmVolume:.70,
    init(){
      if(this.audio)return this.audio;
      if(typeof Audio==="undefined")return null;
      const a=new Audio();
      a.preload="auto";
      a.loop=true;
      a.playsInline=true;
      a.setAttribute("playsinline","");
      a.src=SRC;
      a.muted=true;
      a.volume=0;
      a.addEventListener("canplaythrough",()=>{window.__sixBallGameplayBgmReady=true;});
      a.addEventListener("playing",()=>{window.__sixBallGameplayBgmPlaying=true;});
      a.addEventListener("pause",()=>{window.__sixBallGameplayBgmPlaying=false;});
      a.addEventListener("error",()=>{
        const e=a.error;
        this.lastError=e?`media-${e.code}`:"media-error";
        window.__sixBallGameplayBgmLastError=this.lastError;
      });
      try{a.load();}catch(_){}
      this.audio=a;
      return a;
    },
    setVolume(v){
      this.volume=Math.max(0,Math.min(1,Number(v)||0));
      if(this.audio&&this.wanted&&!this.audio.muted)this.audio.volume=this.volume;
    },
    prime(){
      const a=this.init();
      if(!a)return Promise.resolve(false);
      a.muted=true;
      a.volume=0;
      try{
        const p=a.play();
        if(p&&typeof p.then==="function"){
          return p.then(()=>{
            this.primed=true;
            this.lastError="";
            window.__sixBallGameplayBgmLastError="";
            return true;
          }).catch(err=>{
            this.lastError=err&&err.name?String(err.name):"play-rejected";
            window.__sixBallGameplayBgmLastError=this.lastError;
            return false;
          });
        }
        this.primed=!a.paused;
        return Promise.resolve(this.primed);
      }catch(err){
        this.lastError=err&&err.name?String(err.name):"play-error";
        window.__sixBallGameplayBgmLastError=this.lastError;
        return Promise.resolve(false);
      }
    },
    activate(restart=false){
      const a=this.init();
      if(!a)return;
      this.wanted=true;
      if(restart){try{a.currentTime=0;}catch(_){}}
      a.muted=false;
      a.volume=this.volume;
      if(!a.paused){window.__sixBallGameplayBgmPlaying=true;return;}
      try{
        const p=a.play();
        if(p&&typeof p.catch==="function")p.catch(err=>{
          this.lastError=err&&err.name?String(err.name):"play-rejected";
          window.__sixBallGameplayBgmLastError=this.lastError;
        });
      }catch(err){
        this.lastError=err&&err.name?String(err.name):"play-error";
        window.__sixBallGameplayBgmLastError=this.lastError;
      }
    },
    start(restart=true){
      const a=this.init();
      if(!a)return;
      this.wanted=true;
      if(!a.paused){this.activate(restart);return;}
      this.prime().then(()=>{if(this.wanted)this.activate(restart);});
    },
    pause(){if(this.audio)this.audio.pause();},
    stop(){
      this.wanted=false;
      this.primed=false;
      if(!this.audio)return;
      this.audio.pause();
      this.audio.muted=true;
      this.audio.volume=0;
      try{this.audio.currentTime=0;}catch(_){}
    }
  };

  window.Bgm=Bgm;
  window.__sixBallGameplayBgmSource=SRC;
  window.__sixBallGameplayBgmUploadedSha256=HASH;
  window.__sixBallGameplayBgmSameOrigin=true;
  window.__sixBallGameplayBgmVersion="cyber44-v4-same-origin";
  window.__sixBallGameplayBgmReady=false;
  window.__sixBallGameplayBgmPlaying=false;

  let wasGame=false;
  function gameIsVisible(){
    const root=document.getElementById("root");
    if(!root)return false;
    for(const b of root.querySelectorAll("button")){
      if((b.textContent||"").trim()==="✕")return true;
    }
    return false;
  }
  function sync(){
    const game=gameIsVisible();
    if(game&&!wasGame)Bgm.start(true);
    else if(!game&&wasGame)Bgm.stop();
    wasGame=game;
  }

  function primeFromGesture(){
    if(gameIsVisible())return;
    Bgm.prime();
  }
  if(typeof PointerEvent!=="undefined")document.addEventListener("pointerdown",primeFromGesture,{capture:true,passive:true});
  else document.addEventListener("touchstart",primeFromGesture,{capture:true,passive:true});

  document.addEventListener("click",()=>setTimeout(sync,0),{capture:false});
  document.addEventListener("pointerdown",()=>{
    if(!gameIsVisible())return;
    wasGame=true;
    if(!Bgm.audio||Bgm.audio.paused||Bgm.audio.muted)Bgm.start(false);
  },{capture:true});

  const root=document.getElementById("root");
  if(root){
    const observer=new MutationObserver(sync);
    observer.observe(root,{childList:true,subtree:true});
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)Bgm.pause();
    else if(wasGame)Bgm.start(false);
  });

  Bgm.init();
  sync();
})();
