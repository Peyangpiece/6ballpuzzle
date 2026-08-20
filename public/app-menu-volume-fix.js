/* 6ball menu click volume hotfix.
 * Menu audio only. The menu confirmation MP3 follows the SFX slider directly.
 * No gameplay BGM, gameplay SFX, physics, AI or board logic is modified.
 */
(function installSixBallMenuVolumeFix(){
  if(typeof window==="undefined"||window.__sixBallMenuVolumeFixInstalled)return;
  window.__sixBallMenuVolumeFixInstalled=true;

  const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));
  const readStored=()=>{
    try{
      const raw=localStorage.getItem("hexdrop_sfx_volume");
      if(raw!==null&&Number.isFinite(Number(raw)))return clamp(raw);
    }catch(_){}
    return 85;
  };

  let percent=readStored();

  function setPercent(v,persist=true){
    percent=clamp(v);
    if(persist){try{localStorage.setItem("hexdrop_sfx_volume",String(percent));}catch(_){}}
    // Keep the shared UI value in sync, but do not touch WebAudio gain here.
    if(typeof Sfx!=="undefined")Sfx._menuVolume=percent/100;
    window.__sixBallMenuSfxPercent=percent;
    window.__sixBallMenuClickEffectiveVolume=percent/100;

    // Update already-created HTMLAudio objects immediately as the slider moves.
    if(window.MenuClick&&Array.isArray(window.MenuClick.pool)){
      for(const a of window.MenuClick.pool){
        if(!a)continue;
        try{a.volume=percent/100;}catch(_){}
      }
    }
    return percent;
  }

  function isSfxSlider(input){
    let node=input;
    for(let i=0;node&&i<8;i++,node=node.parentElement){
      const text=String(node.textContent||"");
      if(text.includes("効果音音量"))return true;
      if(text.includes("BGM音量"))return false;
    }
    return false;
  }

  function onSlider(e){
    const input=e&&e.target;
    if(!input||input.tagName!=="INPUT"||input.type!=="range"||!isSfxSlider(input))return;
    setPercent(input.value,true);
  }

  // Capture both events so Safari updates continuously while dragging and also
  // commits the final value on release.
  document.addEventListener("input",onSlider,true);
  document.addEventListener("change",onSlider,true);

  function installMenuClickBridge(){
    if(!window.MenuClick)return false;
    // The stored/current slider value is now the single source of truth.
    window.MenuClick.volume=function(){return Math.max(0,Math.min(1,percent/100));};
    window.__sixBallMenuClickUsesDirectSlider=true;
    return true;
  }

  setPercent(percent,false);
  installMenuClickBridge();

  // app-brand-bgm.js normally loads first, but retry once on DOM ready for
  // defensive ordering without timers or gameplay hooks.
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>{installMenuClickBridge();setPercent(percent,false);},{once:true});
  }

  window.__sixBallMenuVolumeFixVersion="menu-volume-direct-v1";
})();
