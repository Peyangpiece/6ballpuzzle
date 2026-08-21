/* 6ball instant-drop landing v10
 * Direct low-latency playback for human two-finger instant drop.
 */
(function(){
  if(typeof window==="undefined" || typeof Sfx==="undefined")return;

  const SRC="/assets/instant-drop-land-v10.wav?v=7968578a6823af57-direct2";

  let decoded=null;
  let loading=null;
  let suppressUntil=0;

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

  function prepare(){
    try{Sfx.init();}catch(_){}

    const ctx=Sfx.ctx;
    if(!ctx)return Promise.resolve(null);
    if(decoded)return Promise.resolve(decoded);
    if(loading)return loading;

    loading=fetch(SRC,{cache:"force-cache"})
      .then(r=>{
        if(!r.ok)throw new Error("instant-drop fetch "+r.status);
        return r.arrayBuffer();
      })
      .then(ab=>ctx.decodeAudioData(ab.slice(0)))
      .then(buf=>{
        decoded=buf;
        window.__sixBallInstantDropReady=true;
        return buf;
      })
      .catch(err=>{
        window.__sixBallInstantDropError=String(err);
        loading=null;
        return null;
      });

    return loading;
  }

  function start(vol=1){
    const ctx=Sfx.ctx;
    if(!ctx || !decoded)return false;

    const v=Math.max(
      0,
      Math.min(1,liveVolume()*Math.max(0,Number(vol)||0))
    );

    if(v<=0)return true;

    try{
      if(ctx.state==="suspended")ctx.resume().catch(()=>{});

      const src=ctx.createBufferSource();
      const gain=ctx.createGain();

      src.buffer=decoded;
      gain.gain.setValueAtTime(v,ctx.currentTime);

      src.connect(gain);
      gain.connect(ctx.destination);

      src.start(ctx.currentTime);

      window.__sixBallInstantDropPlayCount=
        (window.__sixBallInstantDropPlayCount||0)+1;

      window.__sixBallInstantDropLastPlayedAt=performance.now();

      return true;
    }catch(err){
      window.__sixBallInstantDropError=String(err);
      return false;
    }
  }

  window.__sixBallArmInstantDrop=function(){
    suppressUntil=performance.now()+500;
    prepare();
  };

  window.__sixBallPlayInstantDropLand=function(vol=1){
    if(decoded)return start(vol);

    prepare().then(()=>{
      if(decoded)start(vol);
    });

    return true;
  };

  /* Suppress only the old drop/land sounds belonging to
     the armed human instant drop. */
  const basePlay=Sfx.play.bind(Sfx);

  Sfx.play=function(ev,vol){
    const now=performance.now();

    if(now<suppressUntil && ev&&ev.t==="drop"){
      return;
    }

    if(now<suppressUntil && ev&&ev.t==="land"){
      suppressUntil=0;
      return;
    }

    if(now>=suppressUntil)suppressUntil=0;

    return basePlay(ev,vol);
  };

  fetch(SRC,{cache:"force-cache"}).catch(()=>{});

  document.addEventListener("pointerdown",prepare,{
    capture:true,
    passive:true
  });

  document.addEventListener("keydown",prepare,true);

  window.__sixBallInstantDropSource=SRC;
  window.__sixBallInstantDropSha256=
    "7968578a6823af571af32b1d67ef97899c418d7e09a475bd770eb0ea827d30ed";
  window.__sixBallInstantDropVersion="v10-direct-landing-v2";
})();
