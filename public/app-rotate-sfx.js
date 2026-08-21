/* 6ball rotation sound v15 - clear PCM / single low-latency path */
(function(){
  if(typeof window==="undefined" || typeof Sfx==="undefined") return;

  const SRC="/assets/normal-ball-rotate-v15-clear.wav?v=ac12e3a35fb2445a";
  let rawPromise=null;
  let decoded=null;
  let decodePromise=null;
  let lastDirectAt=-1e9;

  function liveVolume(){
    try{
      const raw=localStorage.getItem("hexdrop_sfx_volume");
      if(raw!==null){
        const n=Number(raw);
        if(Number.isFinite(n))
          return Math.max(0,Math.min(1,n/100));
      }
    }catch(_){}
    return .85;
  }

  function fetchAudio(){
    if(!rawPromise){
      rawPromise=fetch(SRC,{cache:"force-cache"})
        .then(r=>{
          if(!r.ok)throw new Error("rotate audio fetch "+r.status);
          return r.arrayBuffer();
        });
    }
    return rawPromise;
  }

  function prepare(){
    try{Sfx.init();}catch(_){}
    const ctx=Sfx.ctx;
    if(!ctx)return Promise.resolve(null);
    if(decoded)return Promise.resolve(decoded);
    if(decodePromise)return decodePromise;

    decodePromise=fetchAudio()
      .then(ab=>ctx.decodeAudioData(ab.slice(0)))
      .then(buf=>{
        decoded=buf;
        window.__sixBallRotateV15Ready=true;
        return buf;
      })
      .catch(err=>{
        window.__sixBallRotateV15Error=String(err);
        decodePromise=null;
        return null;
      });

    return decodePromise;
  }

  function startDecoded(vol){
    const ctx=Sfx.ctx;
    if(!ctx||!decoded)return false;

    const gainValue=Math.max(
      0,
      Math.min(1,liveVolume()*Math.max(0,Number(vol)||0))
    );

    if(gainValue<=0)return true;

    try{
      if(ctx.state==="suspended")ctx.resume().catch(()=>{});

      const src=ctx.createBufferSource();
      const gain=ctx.createGain();

      src.buffer=decoded;
      gain.gain.setValueAtTime(gainValue,ctx.currentTime);

      src.connect(gain);
      gain.connect(ctx.destination);

      src.start(ctx.currentTime);
      return true;
    }catch(err){
      window.__sixBallRotateV15Error=String(err);
      return false;
    }
  }

  function playRotate(vol=1,direct=false){
    if(direct)lastDirectAt=performance.now();

    if(decoded)return startDecoded(vol);

    prepare().then(()=>{
      if(decoded)startDecoded(vol);
    });

    return true;
  }

  window.__sixBallPlayRotateDirect=function(vol=1){
    const r=playRotate(vol,true);
    try{
      if(Number(vol)>.9 && typeof Sfx.vib==="function")Sfx.vib(5);
    }catch(_){}
    return r;
  };

  const basePlay=Sfx.play.bind(Sfx);

  Sfx.play=function(ev,vol){
    if(ev&&ev.t==="rotate"){
      if(performance.now()-lastDirectAt<180)return;
      playRotate(vol,false);
      try{
        if(Number(vol)>.9 && typeof this.vib==="function")this.vib(5);
      }catch(_){}
      return;
    }
    return basePlay(ev,vol);
  };

  fetchAudio().catch(()=>{});

  document.addEventListener("pointerdown",()=>{
    prepare();
  },{capture:true,passive:true});

  document.addEventListener("keydown",()=>{
    prepare();
  },true);

  window.__sixBallRotateSampleSource=SRC;
  window.__sixBallRotateSampleSha256=
    "ac12e3a35fb2445a78d2f1ab0ae736eace379d60ca216c622c9cd902e1a366c9";
  window.__sixBallRotateSampleVersion="v15-clear-100ms-webaudio";
})();
