(function(){
  if(
    typeof window==="undefined" ||
    typeof Sfx==="undefined"
  )return;

  const SRC=
    "/assets/ball-position-lock-v6-buin.wav?v=a52206c0c7a6e251";

  let decoded=null;
  let loading=null;
  let playScheduled=false;
  let lastPlayedAt=-Infinity;

  function now(){
    return typeof performance!=="undefined"
      ? performance.now()
      : Date.now();
  }

  function volume(){
    try{
      const raw=
        localStorage.getItem("hexdrop_sfx_volume");

      if(raw!==null){
        const n=Number(raw);

        if(Number.isFinite(n)){
          return Math.max(
            0,
            Math.min(1,n/100)
          );
        }
      }
    }catch(_){}

    return .85;
  }

  function prepare(){
    try{Sfx.init();}catch(_){}

    const ctx=Sfx.ctx;

    if(!ctx)
      return Promise.resolve(null);

    if(decoded)
      return Promise.resolve(decoded);

    if(loading)
      return loading;

    loading=fetch(
      SRC,
      {cache:"force-cache"}
    )
    .then(r=>{
      if(!r.ok)
        throw new Error(
          "position-lock audio "+r.status
        );

      return r.arrayBuffer();
    })
    .then(ab=>
      ctx.decodeAudioData(ab.slice(0))
    )
    .then(buf=>{
      decoded=buf;
      window.__sixBallPositionLockReady=true;
      return buf;
    })
    .catch(err=>{
      window.__sixBallPositionLockError=
        String(err);

      loading=null;
      return null;
    });

    return loading;
  }

  function playNow(){
    /*
     * Instant drop also receives the final-position SE.
     * The instant-drop warp/landing sound and this confirmation
     * sound are separate effects and may coexist.
     */
    const ctx=Sfx.ctx;

    if(!ctx||!decoded)
      return false;

    const vol=volume();

    if(vol<=0)
      return true;

    try{
      if(ctx.state==="suspended"){
        ctx.resume().catch(()=>{});
      }

      const src=
        ctx.createBufferSource();

      const gain=
        ctx.createGain();

      src.buffer=decoded;

      gain.gain.setValueAtTime(
        vol,
        ctx.currentTime
      );

      src.connect(gain);
      gain.connect(ctx.destination);

      src.start(ctx.currentTime);

      lastPlayedAt=now();

      window.__sixBallPositionLockPlayCount=
        (
          window.__sixBallPositionLockPlayCount ||
          0
        )+1;

      window.__sixBallPositionLockLastPlayedAt=
        lastPlayedAt;

      return true;
    }catch(err){
      window.__sixBallPositionLockError=
        String(err);

      return false;
    }
  }

  function schedulePlay(){
    /*
     * Multiple balls can settle in the same physics frame.
     * Coalesce them into one clean collision sound.
     */
    if(playScheduled)
      return;

    playScheduled=true;

    setTimeout(()=>{
      playScheduled=false;

      if(now()-lastPlayedAt<24)
        return;

      if(decoded){
        playNow();
      }else{
        prepare().then(()=>{
          if(decoded)
            playNow();
        });
      }
    },0);
  }

  /*
   * Detect the exact moment when a moving pile ball
   * finishes its FINAL fallPath.
   *
   * Intermediate lattice segments do NOT make a sound.
   */
  if(typeof updateVisuals==="function"){
    const baseUpdateVisuals=
      updateVisuals;

    updateVisuals=function(g,dt){
      const movingBefore=new Set();

      if(g?.board){
        for(
          let y=boardScanMin(g.board);
          y<ROWS;
          y++
        ){
          for(let x=0;x<W2;x++){
            const ball=
              valid(x,y)
                ? g.board[y][x]
                : null;

            if(
              ball &&
              Array.isArray(ball.fallPath) &&
              ball.fallPath.length
            ){
              movingBefore.add(ball.id);
            }
          }
        }
      }

      const out=
        baseUpdateVisuals(g,dt);

      if(movingBefore.size && g?.board){
        let finalised=false;

        for(
          let y=boardScanMin(g.board);
          y<ROWS;
          y++
        ){
          for(let x=0;x<W2;x++){
            const ball=
              valid(x,y)
                ? g.board[y][x]
                : null;

            if(
              !ball ||
              !movingBefore.has(ball.id)
            )continue;

            const stillMoving=
              Array.isArray(ball.fallPath) &&
              ball.fallPath.length;

            if(stillMoving)
              continue;

            const v=g.vis?.get(ball.id);

            const visuallySettled=
              !v ||
              (
                Math.abs(v.x-x)<=.006 &&
                Math.abs(v.y-y)<=.006
              );

            if(visuallySettled){
              finalised=true;
              break;
            }
          }

          if(finalised)
            break;
        }

        if(finalised)
          schedulePlay();
      }

      return out;
    };
  }

  /*
   * A triplet can sometimes lock directly into its final
   * position without creating any fallPath.
   * That case also needs the position-confirmed SE.
   */
  if(typeof lock==="function"){
    const baseLock=lock;

    lock=function(g,vy){
      const firstId=
        Number(g?.nextId)||0;

      const out=
        baseLock(g,vy);

      if(!g?.board)
        return out;

      let made=0;
      let moving=0;

      for(
        let y=boardScanMin(g.board);
        y<ROWS;
        y++
      ){
        for(let x=0;x<W2;x++){
          const ball=
            valid(x,y)
              ? g.board[y][x]
              : null;

          if(
            !ball ||
            ball.id<firstId
          )continue;

          made++;

          if(
            Array.isArray(ball.fallPath) &&
            ball.fallPath.length
          ){
            moving++;
          }
        }
      }

      /*
       * No motion after lock = position confirmed now.
       * setTimeout(0) also lets instant-drop's dedicated
       * sound arm first, preventing double playback.
       */
      if(made>0 && moving===0){
        schedulePlay();
      }

      return out;
    };
  }

  /*
   * Replace the old generic normal landing synth.
   * For instant drop, delegate to its existing wrapper so
   * its suppression state can finish normally.
   */
  if(typeof Sfx.play==="function"){
    const basePlay=
      Sfx.play.bind(Sfx);

    Sfx.play=function(ev,vol){
      if(ev&&ev.t==="land"){
        const instantAt=
          Number(
            window.__sixBallInstantDropLastPlayedAt
          );

        if(
          Number.isFinite(instantAt) &&
          now()-instantAt<300
        ){
          return basePlay(ev,vol);
        }

        return;
      }

      return basePlay(ev,vol);
    };
  }

  fetch(
    SRC,
    {cache:"force-cache"}
  ).catch(()=>{});

  document.addEventListener(
    "pointerdown",
    prepare,
    {
      capture:true,
      passive:true
    }
  );

  document.addEventListener(
    "keydown",
    prepare,
    true
  );

  window.__sixBallPlayPositionLock=
    schedulePlay;

  window.__sixBallPositionLockSource=
    SRC;

  window.__sixBallPositionLockSha256=
    "a52206c0c7a6e251a37d4a1df4cd0caafb6f42fee88acf132fb5a77fc14f5273";

  window.__sixBallPositionLockVersion=
    "v6-buin-final-position-instant-drop-enabled";
})();
