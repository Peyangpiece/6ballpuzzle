/* 6ball normal-ball rotation sample override.
 * Audio-only. No physics/AI/board code is modified.
 */
(function installSixBallRotateSample(){
  if(typeof window==="undefined"||window.__sixBallRotateSampleInstalled)return;
  window.__sixBallRotateSampleInstalled=true;
  if(typeof Sfx==="undefined"||typeof Sfx.play!=="function")return;

  const SRC="/assets/normal-ball-rotate.mp3?v=53c6e87b54f52528";
  const pool=Array.from({length:6},()=>{
    const a=new Audio();
    a.preload="auto";
    a.playsInline=true;
    a.setAttribute("playsinline","");
    a.src=SRC;
    try{a.load();}catch(_){}
    return a;
  });
  let cursor=0;

  function liveSfxVolume(){
    try{
      const stored=localStorage.getItem("hexdrop_sfx_volume");
      if(stored!==null){
        const n=Number(stored);
        if(Number.isFinite(n))return Math.max(0,Math.min(1,n/100));
      }
    }catch(_){}
    if(Number.isFinite(window.__sixBallAudioSfxPercent))return Math.max(0,Math.min(1,window.__sixBallAudioSfxPercent/100));
    if(Number.isFinite(Sfx._menuVolume))return Math.max(0,Math.min(1,Sfx._menuVolume));
    return .85;
  }

  function playRotate(vol=1){
    const actual=Math.max(0,Math.min(1,liveSfxVolume()*Math.max(0,Number(vol)||0)));
    window.__sixBallRotateSampleLastVolume=actual;
    if(actual<=0)return;
    const a=pool[cursor++%pool.length];
    try{a.pause();a.currentTime=0;}catch(_){}
    a.muted=false;
    a.volume=actual;
    try{
      const p=a.play();
      if(p&&typeof p.catch==="function")p.catch(err=>{window.__sixBallRotateSampleLastError=err&&err.name?String(err.name):"play-rejected";});
    }catch(err){window.__sixBallRotateSampleLastError=err&&err.name?String(err.name):"play-error";}
  }

  const basePlay=Sfx.play.bind(Sfx);
  Sfx.play=function(ev,vol){
    if(ev&&ev.t==="rotate"){
      playRotate(vol);
      if((Number(vol)||0)>.9&&typeof this.vib==="function")this.vib(5);
      return;
    }
    return basePlay(ev,vol);
  };

  window.__sixBallRotateSampleSource=SRC;
  window.__sixBallRotateSampleSha256="53c6e87b54f525282cee368ca899596deb50087bbede77d8ca87350cfc8b78e4";
  window.__sixBallRotateSampleVersion="normal-rotate-sample-v1";
})();
