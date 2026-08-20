/* 6ball normal-ball rotation sample override. Audio-only. */
(function installSixBallRotateSample(){
  if(typeof window==="undefined"||window.__sixBallRotateSampleInstalled)return;
  window.__sixBallRotateSampleInstalled=true;
  if(typeof Sfx==="undefined"||typeof Sfx.play!=="function")return;

  const SRC="/assets/normal-ball-rotate.mp3?v=3aad062888f14b9b";
  const pool=Array.from({length:6},()=>{
    const a=new Audio();
    a.preload="auto";
    a.playsInline=true;
    a.setAttribute("playsinline","");
    a.src=SRC;
    try{a.load();}catch(_){}
    return a;
  });
  let cursor=0,primed=false,priming=false,lastDirectAt=-1e9;

  function gameIsVisible(){
    const root=document.getElementById("root");
    if(!root)return false;
    for(const b of root.querySelectorAll("button")){
      if((b.textContent||"").trim()==="✕")return true;
    }
    return false;
  }

  function liveSfxVolume(){
    try{
      const raw=localStorage.getItem("hexdrop_sfx_volume");
      if(raw!==null){
        const n=Number(raw);
        if(Number.isFinite(n))return Math.max(0,Math.min(1,n/100));
      }
    }catch(_){}
    if(Number.isFinite(window.__sixBallAudioSfxPercent))return Math.max(0,Math.min(1,window.__sixBallAudioSfxPercent/100));
    if(Number.isFinite(Sfx._menuVolume))return Math.max(0,Math.min(1,Sfx._menuVolume));
    return .85;
  }

  function prime(){
    if(primed||priming)return;
    priming=true;
    let pending=pool.length;
    const done=()=>{if(--pending<=0){primed=true;priming=false;window.__sixBallRotateSamplePrimed=true;}};
    for(const a of pool){
      try{
        a.muted=true;
        a.volume=0;
        const p=a.play();
        if(p&&typeof p.then==="function"){
          p.then(()=>{try{a.pause();a.currentTime=0;}catch(_){}a.muted=false;done();})
           .catch(err=>{window.__sixBallRotateSamplePrimeError=err&&err.name?String(err.name):"prime-rejected";done();});
        }else{
          try{a.pause();a.currentTime=0;}catch(_){}
          a.muted=false;
          done();
        }
      }catch(err){window.__sixBallRotateSamplePrimeError=err&&err.name?String(err.name):"prime-error";done();}
    }
  }

  function playRotate(vol=1,direct=false){
    const actual=Math.max(0,Math.min(1,liveSfxVolume()*Math.max(0,Number(vol)||0)));
    window.__sixBallRotateSampleLastVolume=actual;
    window.__sixBallRotateSamplePlayCount=(window.__sixBallRotateSamplePlayCount||0)+1;
    if(direct)lastDirectAt=performance.now();
    if(actual<=0)return false;
    const a=pool[cursor++%pool.length];
    try{a.pause();a.currentTime=0;}catch(_){}
    a.muted=false;
    a.volume=actual;
    try{
      const p=a.play();
      if(p&&typeof p.catch==="function")p.catch(err=>{window.__sixBallRotateSampleLastError=err&&err.name?String(err.name):"play-rejected";});
      return true;
    }catch(err){
      window.__sixBallRotateSampleLastError=err&&err.name?String(err.name):"play-error";
      return false;
    }
  }

  window.__sixBallPlayRotateDirect=function(vol=1){
    return playRotate(vol,true);
  };

  const basePlay=Sfx.play.bind(Sfx);
  Sfx.play=function(ev,vol){
    if(ev&&ev.t==="rotate"){
      // A human touch rotation is played synchronously inside pointerup.
      // Suppress the queued duplicate arriving on the next animation frame.
      if(performance.now()-lastDirectAt<180)return;
      playRotate(vol,false);
      if((Number(vol)||0)>.9&&typeof this.vib==="function")this.vib(5);
      return;
    }
    return basePlay(ev,vol);
  };

  const unlock=()=>{if(gameIsVisible())prime();};
  if(typeof PointerEvent!=="undefined")document.addEventListener("pointerdown",unlock,{capture:true,passive:true});
  else document.addEventListener("touchstart",unlock,{capture:true,passive:true});
  document.addEventListener("keydown",unlock,true);

  window.__sixBallPrimeRotateSample=prime;
  window.__sixBallRotateSampleSource=SRC;
  window.__sixBallRotateSampleSha256="3aad062888f14b9bb00b8c255fca5e3597b6f8e7be0cf51a1b3fff3a4681d1be";
  window.__sixBallRotateSampleVersion="normal-rotate-direct-gesture-v4";
})();
