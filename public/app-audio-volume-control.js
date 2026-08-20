/* 6ball live audio slider bridge.
 * UI/audio only. Applies BGM/SFX slider changes immediately instead of
 * relying only on React effects. No physics/AI/board code is modified.
 */
(function installSixBallLiveAudioSliders(){
  if(typeof window==="undefined"||window.__sixBallLiveAudioSlidersInstalled)return;
  window.__sixBallLiveAudioSlidersInstalled=true;

  const clampPercent=v=>Math.max(0,Math.min(100,Number(v)||0));
  const store=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(_){}};

  function applyBgmPercent(value){
    const p=clampPercent(value),n=p/100;
    window.__hexBgmVolume=n;
    store("hexdrop_bgm_volume",p);

    const bgm=window.Bgm;
    if(bgm){
      try{
        if(typeof bgm.setVolume==="function")bgm.setVolume(n);
        else bgm.volume=n;
      }catch(_){}

      if(bgm.audio){
        let effective=n;
        try{
          if(typeof bgm.effectiveVolume==="function")effective=bgm.effectiveVolume();
        }catch(_){}
        effective=Math.max(0,Math.min(1,Number(effective)||0));
        try{bgm.audio.volume=effective;}catch(_){}
        window.__sixBallSliderBgmAudioVolume=effective;
      }
    }

    window.__sixBallSliderBgmPercent=p;
    window.__sixBallSliderBgmNormalized=n;
    return p;
  }

  function applySfxPercent(value){
    const p=clampPercent(value),n=p/100;
    store("hexdrop_sfx_volume",p);

    if(typeof Sfx!=="undefined"){
      try{
        if(typeof hexApplySfxVolume==="function")hexApplySfxVolume(p);
        else{
          Sfx._menuVolume=n;
          Sfx.enabled=p>0;
        }
      }catch(_){}
      if(Sfx.master&&Sfx.ctx){
        try{window.__sixBallSliderSfxMasterGain=Number(Sfx.master.gain.value)||0;}catch(_){}
      }
    }

    // Menu confirmation uses HTMLAudio rather than WebAudio, so keep it tied
    // to the same SFX slider as gameplay effects.
    if(window.MenuClick&&Array.isArray(window.MenuClick.pool)){
      for(const a of window.MenuClick.pool){
        if(!a)continue;
        try{a.volume=n;}catch(_){}
      }
    }

    window.__sixBallSliderSfxPercent=p;
    window.__sixBallSliderSfxNormalized=n;
    return p;
  }

  window.__sixBallApplyBgmSlider=applyBgmPercent;
  window.__sixBallApplySfxSlider=applySfxPercent;

  if(typeof HexSettingSlider==="function"&&typeof React!=="undefined"&&typeof HexPanel==="function"){
    HexSettingSlider=function({label,caption,value,onChange,accent="cyan"}){
      const c=(typeof HEX_MENU_ACCENTS!=="undefined"&&HEX_MENU_ACCENTS[accent])||
        (typeof HEX_MENU_ACCENTS!=="undefined"&&HEX_MENU_ACCENTS.cyan)||"#2FE3F5";
      const kind=label==="BGM音量"?"bgm":label==="効果音音量"?"sfx":null;
      const apply=e=>{
        const raw=e&&e.target?e.target.value:e;
        const p=clampPercent(raw);
        if(kind==="bgm")applyBgmPercent(p);
        else if(kind==="sfx")applySfxPercent(p);
        if(typeof onChange==="function")onChange(p);
      };
      return React.createElement(HexPanel,{accent,className:"px-4 py-3"},
        React.createElement("div",{className:"flex items-center justify-between gap-4 mb-2"},
          React.createElement("div",null,
            React.createElement("div",{className:"text-sm font-black text-white/90"},label),
            caption&&React.createElement("div",{className:"text-[9px] text-white/35 mt-0.5"},caption)),
          React.createElement("div",{className:"text-xs font-black tabular-nums",style:{color:c}},`${Math.round(value)}%`)),
        React.createElement("input",{
          type:"range",min:0,max:100,step:1,value,
          onInput:apply,onChange:apply,
          className:"w-full",style:{accentColor:c}
        }));
    };
  }

  window.__sixBallAudioSliderVersion="live-audio-sliders-v2";
})();
