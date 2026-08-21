/* 6ball unified live audio controller.
 * Audio/UI only. Does not replace React settings components and does not
 * touch physics, board, AI, collision or gameplay timing.
 */
(function installSixBallUnifiedAudioControl(){
  if(typeof window==="undefined"||window.__sixBallUnifiedAudioControlInstalled)return;
  window.__sixBallUnifiedAudioControlInstalled=true;

  const SFX_FULL_GAIN=.70;
  const clampPercent=v=>Math.max(0,Math.min(100,Number(v)||0));
  const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
  const readPercent=(key,fallback)=>{
    try{
      const v=localStorage.getItem(key);
      if(v===null)return fallback;
      const n=Number(v);
      return Number.isFinite(n)?clampPercent(n):fallback;
    }catch(_){return fallback;}
  };
  const store=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(_){} };

  let bgmPercent=readPercent("hexdrop_bgm_volume",70);
  let sfxPercent=readPercent("hexdrop_sfx_volume",85);
  let wasGame=false;

  function gameIsVisible(){
    const root=document.getElementById("root");
    if(!root)return false;
    for(const b of root.querySelectorAll("button")){
      if((b.textContent||"").trim()==="✕")return true;
    }
    return false;
  }

  function effectiveBgmVolume(bgm,n){
    if(bgm){
      try{
        if(typeof bgm.effectiveVolume==="function")return clamp01(bgm.effectiveVolume());
      }catch(_){}
    }
    const scale=Number(window.__sixBallGameplayBgmOutputScale);
    return clamp01(n*(Number.isFinite(scale)?scale:1));
  }

  function getBgmAudio(){
    const bgm=window.Bgm;
    if(!bgm)return null;
    try{
      if(typeof bgm.init==="function"){
        const a=bgm.init();
        if(a)return a;
      }
    }catch(_){}
    return bgm.audio||null;
  }

  function applyBgm(value,persist=true){
    bgmPercent=clampPercent(value);
    const n=bgmPercent/100;
    window.__hexBgmVolume=n;
    if(persist)store("hexdrop_bgm_volume",bgmPercent);

    const bgm=window.Bgm;
    if(bgm){
      try{
        if(typeof bgm.setVolume==="function")bgm.setVolume(n);
        else bgm.volume=n;
      }catch(_){}
      try{bgm.volume=n;}catch(_){}
      const a=bgm.audio||null;
      if(a){
        const actual=effectiveBgmVolume(bgm,n);
        try{a.volume=actual;}catch(_){}
        window.__sixBallAudioActualBgmVolume=actual;
      }
    }

    window.__sixBallAudioBgmPercent=bgmPercent;
    return bgmPercent;
  }

  function playBgmNow(restart=false){
    const bgm=window.Bgm;
    if(!bgm||bgmPercent<=0||!gameIsVisible())return Promise.resolve(false);
    const n=bgmPercent/100;
    try{bgm.wanted=true;}catch(_){}
    try{bgm.volume=n;}catch(_){}
    const a=getBgmAudio();
    if(!a)return Promise.resolve(false);
    if(restart){try{a.currentTime=0;}catch(_){}}
    try{a.muted=false;}catch(_){}
    const actual=effectiveBgmVolume(bgm,n);
    try{a.volume=actual;}catch(_){}
    window.__sixBallAudioActualBgmVolume=actual;
    try{
      const p=a.play();
      if(p&&typeof p.then==="function"){
        return p.then(()=>{
          window.__sixBallAudioBgmPlaying=!a.paused;
          window.__sixBallAudioBgmPlayError="";
          return !a.paused;
        }).catch(err=>{
          window.__sixBallAudioBgmPlaying=false;
          window.__sixBallAudioBgmPlayError=err&&err.name?String(err.name):"play-rejected";
          return false;
        });
      }
      window.__sixBallAudioBgmPlaying=!a.paused;
      return Promise.resolve(!a.paused);
    }catch(err){
      window.__sixBallAudioBgmPlaying=false;
      window.__sixBallAudioBgmPlayError=err&&err.name?String(err.name):"play-error";
      return Promise.resolve(false);
    }
  }

  function stopBgmNow(){
    const bgm=window.Bgm;
    if(!bgm)return;
    try{bgm.wanted=false;}catch(_){}
    const a=bgm.audio||null;
    if(a){
      try{a.pause();}catch(_){}
    }
  }

  function applySfxGainNow(){
    if(typeof Sfx==="undefined")return false;
    const n=sfxPercent/100;
    Sfx._menuVolume=n;
    Sfx.enabled=sfxPercent>0;

    if(Sfx.master&&Sfx.ctx){
      const target=SFX_FULL_GAIN*n;
      try{
        const g=Sfx.master.gain,t=Sfx.ctx.currentTime;
        try{g.cancelScheduledValues(t);}catch(_){}
        try{g.setValueAtTime(target,t);}catch(_){g.value=target;}
      }catch(_){}
      window.__sixBallAudioActualSfxGain=target;
    }

    if(window.MenuClick&&Array.isArray(window.MenuClick.pool)){
      for(const a of window.MenuClick.pool){
        if(!a)continue;
        try{a.volume=n;}catch(_){}
      }
    }
    window.__sixBallAudioSfxPercent=sfxPercent;
    return true;
  }

  function ensureSfxRunning(){
    if(typeof Sfx==="undefined")return Promise.resolve(false);
    if(Sfx.ctx&&Sfx.ctx.state==="closed"){
      Sfx.ctx=null;
      Sfx.master=null;
    }
    try{if(!Sfx.ctx&&typeof Sfx.init==="function")Sfx.init();}catch(_){return Promise.resolve(false);}
    applySfxGainNow();
    const ctx=Sfx.ctx;
    if(!ctx)return Promise.resolve(false);
    window.__sixBallAudioSfxContextState=ctx.state||"unknown";
    if(ctx.state==="running")return Promise.resolve(true);
    try{
      const p=ctx.resume();
      if(p&&typeof p.then==="function"){
        return p.then(()=>{
          window.__sixBallAudioSfxContextState=ctx.state||"unknown";
          applySfxGainNow();
          return ctx.state==="running";
        }).catch(err=>{
          window.__sixBallAudioSfxResumeError=err&&err.name?String(err.name):"resume-rejected";
          return false;
        });
      }
    }catch(err){
      window.__sixBallAudioSfxResumeError=err&&err.name?String(err.name):"resume-error";
    }
    applySfxGainNow();
    return Promise.resolve(ctx.state==="running");
  }

  function applySfx(value,persist=true){
    sfxPercent=clampPercent(value);
    if(persist)store("hexdrop_sfx_volume",sfxPercent);
    applySfxGainNow();
    ensureSfxRunning();
    return sfxPercent;
  }

  function sliderKind(input){
    let node=input;
    for(let depth=0;node&&depth<8;depth++,node=node.parentElement){
      let count=0;
      try{count=node.querySelectorAll('input[type="range"]').length;}catch(_){}
      if(count!==1)continue;
      const text=String(node.textContent||"");
      if(text.includes("BGM音量"))return"bgm";
      if(text.includes("効果音音量"))return"sfx";
    }
    return null;
  }

  function onSliderInput(e){
    const input=e&&e.target;
    if(!input||input.tagName!=="INPUT"||input.type!=="range")return;
    const kind=sliderKind(input);
    if(kind==="bgm"){
      applyBgm(input.value,true);
      if(gameIsVisible()&&bgmPercent>0)playBgmNow(false);
    }else if(kind==="sfx"){
      applySfx(input.value,true);
    }
  }

  document.addEventListener("input",onSliderInput,true);
  document.addEventListener("change",onSliderInput,true);

  function unlockFromGesture(){
    // HTMLAudio first, then WebAudio. Both calls occur in the trusted gesture.
    if(gameIsVisible()&&bgmPercent>0)playBgmNow(false);
    else{
      const bgm=window.Bgm;
      if(bgm&&typeof bgm.prime==="function"){
        try{bgm.prime();}catch(_){}
      }
    }
    ensureSfxRunning();
    applyBgm(bgmPercent,false);
  }

  if(typeof PointerEvent!=="undefined")document.addEventListener("pointerdown",unlockFromGesture,{capture:true,passive:true});
  else document.addEventListener("touchstart",unlockFromGesture,{capture:true,passive:true});
  document.addEventListener("keydown",unlockFromGesture,true);

  function syncGameAudio(){
    const game=gameIsVisible();
    if(game&&!wasGame){
      // The click that opened the match already primed audio. Promote it here.
      if(bgmPercent>0)playBgmNow(true);
      ensureSfxRunning();
    }else if(!game&&wasGame){
      stopBgmNow();
    }
    wasGame=game;
  }

  const root=document.getElementById("root");
  if(root){
    const observer=new MutationObserver(syncGameAudio);
    observer.observe(root,{childList:true,subtree:true});
  }

  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)return;
    applyBgm(bgmPercent,false);
    ensureSfxRunning();
    if(gameIsVisible()&&bgmPercent>0)playBgmNow(false);
  });

  applyBgm(bgmPercent,false);
  if(typeof Sfx!=="undefined"){
    Sfx._menuVolume=sfxPercent/100;
    Sfx.enabled=sfxPercent>0;
  }
  window.__sixBallAudioSfxPercent=sfxPercent;
  window.__sixBallAudioControlVersion="unified-audio-control-v3";
  window.__sixBallApplyBgmSlider=applyBgm;
  window.__sixBallApplySfxSlider=applySfx;
  window.__sixBallPlayBgmNow=playBgmNow;
  window.__sixBallEnsureSfxRunning=ensureSfxRunning;
  syncGameAudio();
})();
