/* 6ball same-origin gameplay BGM override + Safari SFX recovery.
 * Audio-only adapter. No physics/AI/board code is modified.
 */
(function installSameOriginCyber44(){
  if(typeof window==="undefined"||window.__sixBallLocalBgmInstalled)return;
  window.__sixBallLocalBgmInstalled=true;

  const HASH="2625608e666158082464c1d4052c228d5fd964d592ccc275947708fcf6ee2b5f";
  const SRC="/assets/6ball-battle-bgm.mp3?v="+HASH.slice(0,16);
  const BGM_OUTPUT_SCALE=0.10;

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
    effectiveVolume(){
      return Math.max(0,Math.min(1,this.volume*BGM_OUTPUT_SCALE));
    },
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
      window.__sixBallGameplayBgmUserVolume=this.volume;
      window.__sixBallGameplayBgmEffectiveVolume=this.effectiveVolume();
      if(this.audio&&this.wanted&&!this.audio.muted)this.audio.volume=this.effectiveVolume();
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
      a.volume=this.effectiveVolume();
      window.__sixBallGameplayBgmUserVolume=this.volume;
      window.__sixBallGameplayBgmEffectiveVolume=a.volume;
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
  window.__sixBallGameplayBgmOutputScale=BGM_OUTPUT_SCALE;
  window.__sixBallGameplayBgmVersion="6ball-audio-coexist-v2";
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

  function unlockSilentFrame(ctx){
    if(!ctx||ctx.state!=="running")return false;
    try{
      const buf=ctx.createBuffer(1,1,ctx.sampleRate||44100);
      const src=ctx.createBufferSource();
      const gain=ctx.createGain();
      gain.gain.value=0;
      src.buffer=buf;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
      window.__sixBallSfxUnlockCount=(window.__sixBallSfxUnlockCount||0)+1;
      return true;
    }catch(_){return false;}
  }

  function ensureGameSfxContext(){
    if(typeof Sfx==="undefined")return Promise.resolve(false);

    if(Sfx.ctx&&Sfx.ctx.state==="closed"){
      Sfx.ctx=null;
      Sfx.master=null;
    }

    try{
      if(!Sfx.ctx&&typeof Sfx.init==="function")Sfx.init();
    }catch(err){
      window.__sixBallSfxResumeError=err&&err.name?String(err.name):"init-error";
      return Promise.resolve(false);
    }

    const ctx=Sfx.ctx;
    if(!ctx){
      window.__sixBallSfxContextState="missing";
      return Promise.resolve(false);
    }

    window.__sixBallSfxContextState=ctx.state||"unknown";

    if(ctx.state==="running"){
      unlockSilentFrame(ctx);
      window.__sixBallSfxResumeSucceeded=true;
      return Promise.resolve(true);
    }

    try{
      const p=ctx.resume();
      if(p&&typeof p.then==="function"){
        return p.then(()=>{
          window.__sixBallSfxContextState=ctx.state||"unknown";
          window.__sixBallSfxResumeSucceeded=ctx.state==="running";
          if(ctx.state==="running")unlockSilentFrame(ctx);
          return ctx.state==="running";
        }).catch(err=>{
          window.__sixBallSfxResumeSucceeded=false;
          window.__sixBallSfxResumeError=err&&err.name?String(err.name):"resume-rejected";
          return false;
        });
      }
    }catch(err){
      window.__sixBallSfxResumeSucceeded=false;
      window.__sixBallSfxResumeError=err&&err.name?String(err.name):"resume-error";
    }

    return Promise.resolve(ctx.state==="running");
  }

  function recoverGameplayBgm(){
    if(!Bgm.wanted)return;
    const a=Bgm.init();
    if(!a)return;

    a.muted=false;
    a.volume=Bgm.effectiveVolume();

    try{
      const p=a.play();
      if(p&&typeof p.catch==="function"){
        p.catch(err=>{
          Bgm.lastError=err&&err.name?String(err.name):"play-rejected";
          window.__sixBallGameplayBgmLastError=Bgm.lastError;
        });
      }
    }catch(err){
      Bgm.lastError=err&&err.name?String(err.name):"play-error";
      window.__sixBallGameplayBgmLastError=Bgm.lastError;
    }
  }

  if(typeof Sfx!=="undefined"&&typeof Sfx.play==="function"&&!Sfx.__sixBallSafariResumeBridge){
    const baseSfxPlay=Sfx.play.bind(Sfx);
    Sfx.__sixBallSafariResumeBridge=true;

    Sfx.play=function(ev,vol){
      if(this.ctx&&this.ctx.state==="running"){
        window.__sixBallSfxContextState="running";
        return baseSfxPlay(ev,vol);
      }

      ensureGameSfxContext().then(ok=>{
        if(ok)baseSfxPlay(ev,vol);
      });
    };

    window.__sixBallSfxSafariResumeBridge=true;
  }

  function sync(){
    const game=gameIsVisible();

    if(game&&!wasGame){
      Bgm.start(true);

      ensureGameSfxContext().then(()=>{
        recoverGameplayBgm();
      });

    }else if(!game&&wasGame){
      Bgm.stop();
    }

    wasGame=game;
  }

  function primeFromGesture(){
    // SafariではHTML Audioを先にユーザー操作へ結びつける。
    if(!gameIsVisible())Bgm.prime();

    ensureGameSfxContext().then(()=>{
      if(Bgm.wanted)recoverGameplayBgm();
    });
  }
  if(typeof PointerEvent!=="undefined")document.addEventListener("pointerdown",primeFromGesture,{capture:true,passive:true});
  else document.addEventListener("touchstart",primeFromGesture,{capture:true,passive:true});

  document.addEventListener("click",()=>sync(),{capture:false});
  document.addEventListener("pointerdown",()=>{
    if(!gameIsVisible())return;

    wasGame=true;

    if(!Bgm.audio||Bgm.audio.paused||Bgm.audio.muted){
      Bgm.start(false);
    }

    ensureGameSfxContext().then(()=>{
      recoverGameplayBgm();
    });

  },{capture:true});

  const root=document.getElementById("root");
  if(root){
    const observer=new MutationObserver(sync);
    observer.observe(root,{childList:true,subtree:true});
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){
      Bgm.pause();
    }else if(wasGame){
      Bgm.start(false);

      ensureGameSfxContext().then(()=>{
        recoverGameplayBgm();
      });
    }
  });

  Bgm.init();
  window.__sixBallGameplayBgmUserVolume=Bgm.volume;
  window.__sixBallGameplayBgmEffectiveVolume=Bgm.effectiveVolume();
  window.__sixBallSfxLazyInit=true;
  sync();
})();
