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
  const store=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(_){}};

  let bgmPercent=readPercent("hexdrop_bgm_volume",70);
  let sfxPercent=readPercent("hexdrop_sfx_volume",85);

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
      // Some older adapters do not expose setVolume consistently. Keep the
      // controller's normalized value as the source of truth as well.
      try{bgm.volume=n;}catch(_){}
      if(bgm.audio){
        const actual=effectiveBgmVolume(bgm,n);
        try{bgm.audio.volume=actual;}catch(_){}
        window.__sixBallAudioActualBgmVolume=actual;
      }
    }

    window.__sixBallAudioBgmPercent=bgmPercent;
    return bgmPercent;
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

    // Menu confirmation sound is HTMLAudio. MenuClick.play() also reads
    // Sfx._menuVolume, so this stays correct for every future button press.
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
        }).catch(()=>false);
      }
    }catch(_){}
    applySfxGainNow();
    return Promise.resolve(ctx.state==="running");
  }

  function applySfx(value,persist=true){
    sfxPercent=clampPercent(value);
    if(persist)store("hexdrop_sfx_volume",sfxPercent);
    applySfxGainNow();
    // Slider input is a trusted user gesture on Safari, so this is also the
    // safest moment to create/resume WebAudio.
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
    if(kind==="bgm")applyBgm(input.value,true);
    else if(kind==="sfx")applySfx(input.value,true);
  }

  // Do not replace HexSettingSlider. React keeps ownership of the UI state;
  // this capture listener only mirrors the physical slider into live audio.
  document.addEventListener("input",onSliderInput,true);
  document.addEventListener("change",onSliderInput,true);

  function unlockFromGesture(){
    // If a match is visible, secure HTMLAudio playback first, then WebAudio.
    const bgm=window.Bgm;
    if(gameIsVisible()&&bgmPercent>0&&bgm){
      try{
        if(typeof bgm.setVolume==="function")bgm.setVolume(bgmPercent/100);
        if(typeof bgm.start==="function")bgm.start(false);
      }catch(_){}
    }else if(!gameIsVisible()&&bgm&&typeof bgm.prime==="function"){
      try{bgm.prime();}catch(_){}
    }
    ensureSfxRunning();
    applyBgm(bgmPercent,false);
  }

  if(typeof PointerEvent!=="undefined")document.addEventListener("pointerdown",unlockFromGesture,{capture:true,passive:true});
  else document.addEventListener("touchstart",unlockFromGesture,{capture:true,passive:true});
  document.addEventListener("keydown",unlockFromGesture,true);

  // If Safari interrupted audio while backgrounded, restore both paths on the
  // next visible state without changing the user's slider values.
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)return;
    applyBgm(bgmPercent,false);
    ensureSfxRunning();
    if(gameIsVisible()&&bgmPercent>0&&window.Bgm&&typeof window.Bgm.start==="function"){
      try{window.Bgm.start(false);}catch(_){}
    }
  });

  // Initial values only; no playback is forced at module load.
  applyBgm(bgmPercent,false);
  if(typeof Sfx!=="undefined"){
    Sfx._menuVolume=sfxPercent/100;
    Sfx.enabled=sfxPercent>0;
  }
  window.__sixBallAudioSfxPercent=sfxPercent;
  window.__sixBallAudioControlVersion="unified-audio-control-v2";
  window.__sixBallApplyBgmSlider=applyBgm;
  window.__sixBallApplySfxSlider=applySfx;
})();
