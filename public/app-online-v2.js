(function(){
    if(
        typeof window==="undefined" ||
        typeof Net==="undefined"
    )return;

    if(
        window.__sixBallOnlineVersion
    )return;

    const baseJoin=
        Net.join.bind(Net);

    /*
     * Do not enter the actual game until BOTH clients
     * have joined the same Firebase match.
     */
    Net.join=async function(matchId){
        const handle=
            await baseJoin(matchId);

        const F=this.fb;

        if(
            !F ||
            !this.db ||
            !handle
        ){
            throw new Error(
                "オンライン対戦を開始できませんでした"
            );
        }

        const foeIndex=
            handle.myIndex===0?1:0;

        const foeConnRef=
            F.ref(
                this.db,
                "matches/"+
                matchId+
                "/players/"+
                foeIndex+
                "/connected"
            );

        let connected=false;

        try{
            const first=
                await F.get(
                    foeConnRef
                );

            connected=
                first.val()===true;
        }catch(_){}

        if(!connected){
            await new Promise(
                (resolve,reject)=>{
                    let finished=false;

                    const finish=(ok)=>{
                        if(finished)return;

                        finished=true;

                        clearTimeout(to);

                        try{
                            F.off(
                                foeConnRef
                            );
                        }catch(_){}

                        if(ok){
                            resolve();
                        }else{
                            reject(
                                new Error(
                                    "対戦相手との接続がタイムアウトしました"
                                )
                            );
                        }
                    };

                    const to=
                        setTimeout(
                            ()=>finish(false),
                            20000
                        );

                    F.onValue(
                        foeConnRef,
                        snap=>{
                            if(
                                snap.val()===true
                            ){
                                finish(true);
                            }
                        }
                    );
                }
            ).catch(err=>{
                try{
                    handle.leave();
                }catch(_){}

                throw err;
            });
        }

        window.__sixBallLastOnlineMatch={
            matchId:
                handle.matchId,
            myIndex:
                handle.myIndex,
            opponent:
                handle.opponent,
            ranked:
                handle.ranked,
            connectedAt:
                Date.now()
        };

        return handle;
    };

    /*
     * Clear stale matchmaking data when the browser is
     * backgrounded/closed during search.
     */
    const cleanup=()=>{
        try{
            Net.cancelMatchmaking();
        }catch(_){}
    };

    window.addEventListener(
        "pagehide",
        cleanup
    );

    window.addEventListener(
        "beforeunload",
        cleanup
    );

    /*
     * Small diagnostic helper.
     * It does not start matchmaking.
     */
    Net.onlineHealthCheck=
        async function(){
            try{
                await this.connect();

                if(
                    !this.fb ||
                    !this.db ||
                    !this.uid
                ){
                    throw new Error(
                        "Firebase接続なし"
                    );
                }

                return{
                    ok:true,
                    uid:this.uid,
                    signedIn:
                        !!this.auth?.currentUser,
                    anonymous:
                        !!this.auth?.currentUser
                            ?.isAnonymous,
                    rating:
                        Number(
                            this.profile?.rating
                        )||1000
                };
            }catch(err){
                return{
                    ok:false,
                    error:
                        String(
                            err?.message||
                            err
                        )
                };
            }
        };

    window.__sixBallOnlineVersion=
        "online-v2-ready-handshake";
})();
(function(){
  if(
    typeof window==="undefined" ||
    typeof Net==="undefined"
  )return;

  if(window.__sixBallOnlineV3)return;

  const FRESH_MS=15000;
  const POLL_MS=250;

  function sleep(ms){
    return new Promise(r=>setTimeout(r,ms));
  }

  function sessionId(){
    try{
      let id=sessionStorage.getItem(
        "sixball_online_client_id"
      );

      if(id)return id;

      id=
        "c_"+(
          crypto?.randomUUID
            ?crypto.randomUUID()
            :Date.now().toString(36)+
             Math.random().toString(36).slice(2)
        );

      sessionStorage.setItem(
        "sixball_online_client_id",
        id
      );

      return id;
    }catch(_){
      return(
        "c_"+
        Date.now().toString(36)+
        Math.random().toString(36).slice(2)
      );
    }
  }

  Net.onlineClientId=
    Net.onlineClientId||
    sessionId();

  const baseJoin=
    Net.join.bind(Net);

  /*
   * Match identity is per browser session.
   * Account identity is still the Firebase UID,
   * so rating/profile data remains on the account.
   */
  Net.join=async function(matchId){
    await this.connect();

    const accountUid=this.uid;
    const clientId=this.onlineClientId;

    this._accountUid=accountUid;
    this.uid=clientId;

    try{
      const handle=
        await baseJoin(matchId);

      handle.accountUid=
        accountUid;

      handle.clientId=
        clientId;

      return handle;
    }finally{
      this.uid=accountUid;
    }
  };

  function validEntry(v,id){
    return !!(
      v &&
      id &&
      v.clientId===id &&
      Number.isFinite(Number(v.ts)) &&
      Date.now()-Number(v.ts)<FRESH_MS
    );
  }

  function candidatesFor(
    entries,
    mine,
    maxDiff
  ){
    return Object.values(entries)
      .filter(v=>
        v &&
        v.clientId!==mine.clientId &&
        validEntry(v,v.clientId) &&
        Math.abs(
          Number(v.rating||1000)-
          Number(mine.rating||1000)
        )<=maxDiff
      )
      .sort((a,b)=>
        Math.abs(
          Number(a.rating||1000)-
          Number(mine.rating||1000)
        )-
        Math.abs(
          Number(b.rating||1000)-
          Number(mine.rating||1000)
        ) ||
        Number(a.ts||0)-Number(b.ts||0) ||
        String(a.clientId)
          .localeCompare(String(b.clientId))
      );
  }

  function bestFor(
    entries,
    mine,
    maxDiff
  ){
    return candidatesFor(
      entries,
      mine,
      maxDiff
    )[0]||null;
  }

  Net.cancelMatchmaking=
    async function(){
      try{
        if(
          !this.fb ||
          !this.db ||
          !this.onlineClientId
        )return;

        const F=this.fb;
        const id=this.onlineClientId;

        await Promise.all([
          F.remove(
            F.ref(
              this.db,
              "onlineQueue/"+id
            )
          ).catch(()=>{}),

          F.remove(
            F.ref(
              this.db,
              "onlinePairings/"+id
            )
          ).catch(()=>{})
        ]);

        window.__sixBallOnlineState=
          "cancelled";
      }catch(_){}
    };

  Net.findMatch=
    async function(
      onProgress,
      signal
    ){
      await this.connect();

      const F=this.fb;
      const id=this.onlineClientId;

      if(
        !F ||
        !this.db ||
        !this.uid
      ){
        throw new Error(
          "Firebaseへ接続できません"
        );
      }

      const started=Date.now();

      const queueRef=
        F.ref(
          this.db,
          "onlineQueue/"+id
        );

      const pairingRef=
        F.ref(
          this.db,
          "onlinePairings/"+id
        );

      try{
        F.onDisconnect(
          queueRef
        ).remove();

        F.onDisconnect(
          pairingRef
        ).remove();
      }catch(_){}

      await F.remove(
        pairingRef
      ).catch(()=>{});

      const updateMine=async()=>{
        await F.set(
          queueRef,
          {
            clientId:id,

            accountUid:
              this.uid,

            name:
              this.profile?.name||
              "Player",

            rating:
              Number(
                this.profile?.rating
              )||1000,

            ts:Date.now()
          }
        );
      };

      try{
        await updateMine();
      }catch(err){
        throw new Error(
          "マッチング待機情報を書き込めません: "+
          (
            err?.code||
            err?.message||
            err
          )
        );
      }

      window.__sixBallOnlineState=
        "waiting";

      while(true){
        if(
          signal?.cancelled
        ){
          await this.cancelMatchmaking();
          throw new Error("cancelled");
        }

        const elapsed=
          Date.now()-started;

        /*
         * Search range widens over time.
         * 0-5 sec: ±100
         * 5-10:    ±200
         * ...
         * max:     ±1000
         */
        const maxDiff=
          Math.min(
            1000,
            100+
            Math.floor(
              elapsed/5000
            )*100
          );

        if(onProgress){
          onProgress(
            elapsed,
            Math.floor(
              maxDiff/100
            )
          );
        }

        /*
         * Was I paired by the other client?
         */
        const pairedSnap=
          await F.get(
            pairingRef
          );

        const paired=
          pairedSnap.val();

        if(
          typeof paired==="string" &&
          paired
        ){
          await F.remove(
            pairingRef
          ).catch(()=>{});

          await F.remove(
            queueRef
          ).catch(()=>{});

          window.__sixBallOnlineState=
            "joining";

          return this.join(
            paired
          );
        }

        /*
         * Refresh own presence.
         */
        await updateMine();

        let queueSnap;

        try{
          queueSnap=
            await F.get(
              F.ref(
                this.db,
                "onlineQueue"
              )
            );
        }catch(err){
          throw new Error(
            "対戦相手一覧を取得できません: "+
            (
              err?.code||
              err?.message||
              err
            )
          );
        }

        const entries=
          queueSnap.val()||{};

        const mine=
          entries[id];

        if(
          !validEntry(
            mine,
            id
          )
        ){
          await updateMine();
          await sleep(POLL_MS);
          continue;
        }

        const foe=
          bestFor(
            entries,
            mine,
            maxDiff
          );

        if(!foe){
          await sleep(POLL_MS);
          continue;
        }

        /*
         * Pair only when BOTH sides regard each other
         * as their best candidate.
         */
        const foesBest=
          bestFor(
            entries,
            foe,
            maxDiff
          );

        if(
          !foesBest ||
          foesBest.clientId!==id
        ){
          await sleep(POLL_MS);
          continue;
        }

        /*
         * Only one side creates the match.
         */
        const leader=
          String(id)<
          String(foe.clientId);

        if(!leader){
          await sleep(POLL_MS);
          continue;
        }

        const pairKey=
          [id,foe.clientId]
            .sort()
            .join("__");

        const claimRef=
          F.ref(
            this.db,
            "onlineClaims/"+pairKey
          );

        let claimed=false;

        const claimResult=
          await F.runTransaction(
            claimRef,
            cur=>{
              if(
                !cur ||
                Date.now()-
                Number(cur.ts||0)>
                FRESH_MS
              ){
                return{
                  by:id,
                  ts:Date.now()
                };
              }

              return;
            }
          );

        claimed=
          claimResult.committed;

        if(!claimed){
          await sleep(POLL_MS);
          continue;
        }

        try{
          const matchId=
            F.push(
              F.ref(
                this.db,
                "matches"
              )
            ).key;

          if(!matchId){
            throw new Error(
              "matchIdを生成できません"
            );
          }

          const seed=
            Math.floor(
              Math.random()*
              0x7fffffff
            );

          await F.set(
            F.ref(
              this.db,
              "matches/"+matchId
            ),
            {
              meta:{
                seed,
                ranked:true,
                createdAt:
                  F.serverTimestamp()
              },

              players:{
                0:{
                  uid:id,
                  accountUid:
                    this.uid,
                  name:
                    mine.name||
                    "Player",
                  rating:
                    Number(
                      mine.rating
                    )||1000,
                  connected:false
                },

                1:{
                  uid:
                    foe.clientId,
                  accountUid:
                    foe.accountUid||
                    null,
                  name:
                    foe.name||
                    "Player",
                  rating:
                    Number(
                      foe.rating
                    )||1000,
                  connected:false
                }
              }
            }
          );

          /*
           * Tell the other browser which match to join.
           */
          await F.set(
            F.ref(
              this.db,
              "onlinePairings/"+
              foe.clientId
            ),
            matchId
          );

          await Promise.all([
            F.remove(
              queueRef
            ).catch(()=>{}),

            F.remove(
              F.ref(
                this.db,
                "onlineQueue/"+
                foe.clientId
              )
            ).catch(()=>{})
          ]);

          window.__sixBallOnlineState=
            "joining";

          return this.join(
            matchId
          );

        }finally{
          await F.remove(
            claimRef
          ).catch(()=>{});
        }
      }
    };

  window.__sixBallOnlineV3=
    "online-v3-session-matchmaking";

})();

/* ============================================================
 * 6ball ONLINE RUNTIME v9
 *
 * Consolidated lightweight online presentation.
 *
 * - one remoteFxSnapshotOf wrapper
 * - one applyRemoteVisualState wrapper
 * - one drawSide wrapper
 * - no remote physics simulation
 * - moving balls use a lightweight overlay
 * - garbage uses the same moving-ball overlay
 * - clear is a small visual event
 * - hard drop is a sticky visual event
 * - Firebase state uses partial updates
 * ============================================================ */
(function(){

    if(typeof window==="undefined")return;

    if(
        window.__sixBallOnlineRuntimeVersion===
        "online-runtime-v9"
    )return;


    const PACKET_MS=66;
    const TRACK_TTL=170;

    const clock=()=>(
        typeof performance!=="undefined"
            ?performance.now()
            :Date.now()
    );


    /* ========================================================
     * TRANSPORT
     *
     * Keep the existing v3 matchmaking/handshake, but replace
     * only its state sender with lightweight partial updates.
     * ======================================================== */

    if(
        typeof Net!=="undefined" &&
        typeof Net.join==="function"
    ){

        const previousJoin=
            Net.join.bind(Net);

        Net.join=async function(matchId){

            const handle=
                await previousJoin(matchId);

            if(
                !handle ||
                !this.fb ||
                !this.db
            ){
                return handle;
            }

            const F=this.fb;

            const stateRef=
                F.ref(
                    this.db,
                    "matches/"+
                    handle.matchId+
                    "/state/"+
                    handle.myIndex
                );

            let pending=null;
            let timer=null;
            let lastFlush=0;

            let lastBoard=null;
            let lastIncoming=null;
            let lastAlive=null;

            const flush=()=>{

                if(!pending)return;

                const p=pending;
                pending=null;

                const update={
                    piece:
                        p.piece??null,

                    fx:
                        p.fx??null,

                    ts:
                        Date.now()
                };

                /*
                 * The settled board normally changes far less
                 * often than active-piece coordinates.
                 */
                if(p.board!==lastBoard){
                    update.board=p.board;
                    lastBoard=p.board;
                }

                if(p.incoming!==lastIncoming){
                    update.incoming=p.incoming;
                    lastIncoming=p.incoming;
                }

                if(p.alive!==lastAlive){
                    update.alive=p.alive;
                    lastAlive=p.alive;
                }

                lastFlush=Date.now();

                F.update(
                    stateRef,
                    update
                ).catch(()=>{});

                try{
                    window.__sixBallLastNetPayload=
                        JSON.stringify(update).length;
                }catch(_){}
            };


            handle.sendBoard=function(
                board,
                incoming,
                alive,
                piece=null,
                fx=null
            ){

                pending={
                    board,
                    incoming,
                    alive,
                    piece,
                    fx
                };

                const wait=
                    PACKET_MS-
                    (
                        Date.now()-
                        lastFlush
                    );

                if(wait<=0){

                    if(timer){
                        clearTimeout(timer);
                        timer=null;
                    }

                    flush();

                }else if(!timer){

                    timer=
                        setTimeout(
                            ()=>{
                                timer=null;
                                flush();
                            },
                            wait
                        );
                }
            };


            const previousLeave=
                handle.leave.bind(handle);

            handle.leave=function(){

                if(timer){
                    clearTimeout(timer);
                    timer=null;
                }

                pending=null;

                return previousLeave();
            };


            return handle;
        };
    }


    /* ========================================================
     * SNAPSHOT
     *
     * Network board is authoritative.
     * Settled balls always use canonical lattice coordinates.
     * ======================================================== */

    if(typeof applySnapshot==="function"){

        applySnapshot=function(g,str){

            if(
                !g ||
                typeof str!=="string" ||
                str.length!==VALID_CELLS.length
            ){
                return false;
            }

            const previous=
                new Map();

            for(const [x,y] of VALID_CELLS){

                const ball=
                    g.board?.[y]?.[x];

                if(ball){
                    previous.set(
                        x+","+y,
                        ball
                    );
                }
            }


            for(const [x,y] of VALID_CELLS){

                if(g.board?.[y]){
                    g.board[y][x]=null;
                }
            }


            const live=
                new Set();


            for(
                let i=0;
                i<VALID_CELLS.length;
                i++
            ){

                const [x,y]=
                    VALID_CELLS[i];

                const c=
                    str.charCodeAt(i)-49;

                if(
                    !Number.isInteger(c) ||
                    c<0 ||
                    c>=COLORS.length
                ){
                    continue;
                }


                const old=
                    previous.get(
                        x+","+y
                    );

                const ball=
                    old&&old.c===c
                        ?old
                        :mkBall(g,c);


                try{
                    hexPhysClearGroupBall(ball);
                }catch(_){}


                delete ball.fallPath;
                delete ball.motionGroupId;
                delete ball.motionBundleId;
                delete ball.equilibriumLocked;
                delete ball.pileFlow;


                g.board[y][x]=ball;

                try{
                    noteBoardCell(
                        g.board,
                        y,
                        ball
                    );
                }catch(_){}


                setVis(
                    g,
                    ball,
                    x,
                    y,
                    0
                );

                const v=
                    g.vis.get(ball.id);

                if(v){
                    v.x=x;
                    v.y=y;
                    v.vy=0;
                    v.sq=0;
                }

                live.add(ball.id);
            }


            for(
                const id of
                Array.from(g.vis.keys())
            ){
                if(!live.has(id)){
                    g.vis.delete(id);
                }
            }


            try{
                refreshBoardScanMin(
                    g.board
                );
            }catch(_){}


            /*
             * Clear animation is now a separate network event.
             */
            g.clearing=null;

            return true;
        };
    }


    /* ========================================================
     * FX PACKET
     * ======================================================== */

    const baseRemoteFx=
        typeof remoteFxSnapshotOf==="function"
            ?remoteFxSnapshotOf
            :()=>({});


    remoteFxSnapshotOf=function(g){

        const fx=
            baseRemoteFx(g)||
            {};


        /*
         * The old activeGarbagePacks protocol is no longer the
         * authoritative garbage renderer.
         */
        fx.g=[];


        /* -----------------------------------------------
         * MOVING BOARD BALLS
         *
         * Includes:
         * - garbage falling
         * - garbage sliding
         * - normal pile collapse
         * - post-clear movement
         * ----------------------------------------------- */

        const mv=[];

        if(g?.board&&g?.vis){

            for(
                let y=boardScanMin(g.board);
                y<ROWS;
                y++
            ){
                for(let x=0;x<W2;x++){

                    if(!valid(x,y))
                        continue;

                    const ball=
                        g.board[y][x];

                    if(!ball)
                        continue;

                    const v=
                        g.vis.get(ball.id);

                    if(
                        !v ||
                        !Number.isFinite(v.x) ||
                        !Number.isFinite(v.y)
                    ){
                        continue;
                    }


                    const moving=
                        Math.abs(v.x-x)>.002 ||
                        Math.abs(v.y-y)>.002 ||
                        Math.abs(Number(v.sq)||0)>.002 ||
                        (
                            Array.isArray(ball.fallPath) &&
                            ball.fallPath.length>0
                        ) ||
                        (
                            ball.isGarbage &&
                            !ball.garbagePileSettled
                        );


                    if(!moving)
                        continue;


                    mv.push({
                        id:String(ball.id),

                        lx:x,
                        ly:y,

                        c:ball.c,

                        x:+v.x.toFixed(3),
                        y:+v.y.toFixed(3),

                        sq:
                            +(Number(v.sq)||0)
                            .toFixed(3),

                        gb:
                            ball.isGarbage
                                ?1
                                :0,

                        bubble:
                            Number.isFinite(
                                v.garbageBubbleT
                            )
                                ?+v.garbageBubbleT
                                    .toFixed(3)
                                :null
                    });
                }
            }
        }


        fx.mv9=mv;


        /* -----------------------------------------------
         * CLEAR EVENT
         * ----------------------------------------------- */

        const clearing=
            g?.clearing;

        if(
            clearing &&
            Array.isArray(clearing.cells) &&
            clearing.cells.length
        ){

            if(
                g.__netClearObject!==
                clearing
            ){
                g.__netClearObject=
                    clearing;

                g.__netClearSeq=
                    (g.__netClearSeq||0)+1;
            }


            const hold=
                Math.max(
                    .001,
                    Number(g.holdT)||.4
                );


            fx.cl9={
                seq:
                    g.__netClearSeq,

                cells:
                    clearing.cells.map(
                        ([x,y,c])=>[
                            x,
                            y,
                            c
                        ]
                    ),

                p:
                    Math.max(
                        0,
                        Math.min(
                            1,
                            (
                                Number(g.stateT)||0
                            )/hold
                        )
                    ),

                hold
            };

        }else{

            fx.cl9=null;
            g.__netClearObject=null;
        }


        /* -----------------------------------------------
         * HARD DROP EVENT
         * ----------------------------------------------- */

        if(
            !(g.__netHardDropHistory instanceof Map)
        ){
            g.__netHardDropHistory=
                new Map();
        }


        const history=
            g.__netHardDropHistory;

        const now=
            clock();


        for(
            const d of
            g?.fx?.hardDrops||[]
        ){

            if(
                !d ||
                !Array.isArray(d.cells)
            ){
                continue;
            }


            const key=
                String(
                    d.seq??
                    d.cells
                    .map(c=>c.join(","))
                    .join("|")
                );


            if(!history.has(key)){

                const max=
                    Number.isFinite(d.max)
                        ?d.max
                        :(
                            typeof HARD_DROP_IMPACT_DURATION===
                                "number"
                                ?HARD_DROP_IMPACT_DURATION
                                :.34
                        );


                const life=
                    Number.isFinite(d.life)
                        ?d.life
                        :max;


                history.set(
                    key,
                    {
                        seq:key,

                        cells:
                            d.cells.map(
                                c=>c.slice(0,3)
                            ),

                        max,

                        firstAge:
                            Math.max(
                                0,
                                max-life
                            ),

                        firstSeen:
                            now,

                        expires:
                            now+550
                    }
                );
            }
        }


        for(const [key,e] of history){

            if(now>e.expires){
                history.delete(key);
            }
        }


        fx.hd9=
            Array.from(
                history.values()
            ).map(e=>({
                seq:e.seq,
                cells:e.cells,
                max:e.max,

                age:
                    e.firstAge+
                    Math.max(
                        0,
                        (
                            now-
                            e.firstSeen
                        )/1000
                    )
            }));


        window.__sixBallMovingBallsSent=
            mv.length;

        return fx;
    };


    /* ========================================================
     * RECEIVE
     * ======================================================== */

    const baseApplyRemote=
        typeof applyRemoteVisualState==="function"
            ?applyRemoteVisualState
            :()=>{};


    applyRemoteVisualState=function(
        g,
        st
    ){

        baseApplyRemote(
            g,
            st
        );


        if(!g)return;


        const now=
            clock();


        /* -----------------------------------------------
         * Moving balls
         * ----------------------------------------------- */

        if(
            !(g.__remoteMoveTracks instanceof Map)
        ){
            g.__remoteMoveTracks=
                new Map();
        }


        const tracks=
            g.__remoteMoveTracks;

        const received=
            Array.isArray(st?.fx?.mv9)
                ?st.fx.mv9
                :[];

        const alive=
            new Set();


        for(const q of received){

            if(
                !q ||
                typeof q.id!=="string" ||
                !Number.isFinite(Number(q.x)) ||
                !Number.isFinite(Number(q.y)) ||
                !Number.isInteger(Number(q.c))
            ){
                continue;
            }


            const key=q.id;

            alive.add(key);


            const tx=
                Number(q.x);

            const ty=
                Number(q.y);

            const tsq=
                Number(q.sq)||0;


            let tr=
                tracks.get(key);


            if(tr){

                const p=
                    Math.min(
                        1,
                        (
                            now-
                            tr.start
                        )/
                        Math.max(
                            1,
                            tr.duration
                        )
                    );

                const k=
                    p*p*(3-2*p);

                tr.x=
                    tr.fromX+
                    (
                        tr.toX-
                        tr.fromX
                    )*k;

                tr.y=
                    tr.fromY+
                    (
                        tr.toY-
                        tr.fromY
                    )*k;

                tr.sq=
                    tr.fromSq+
                    (
                        tr.toSq-
                        tr.fromSq
                    )*k;

            }else{

                tr={
                    x:tx,
                    y:ty,
                    sq:tsq
                };

                tracks.set(
                    key,
                    tr
                );
            }


            tr.fromX=tr.x;
            tr.fromY=tr.y;
            tr.fromSq=tr.sq;

            tr.toX=tx;
            tr.toY=ty;
            tr.toSq=tsq;

            tr.start=now;
            tr.duration=82;
            tr.lastSeen=now;

            tr.lx=
                Number(q.lx);

            tr.ly=
                Number(q.ly);

            tr.c=
                Number(q.c);

            tr.gb=
                q.gb===1;

            tr.bubble=
                Number.isFinite(
                    Number(q.bubble)
                )
                    ?Number(q.bubble)
                    :null;
        }


        for(const [key,tr] of tracks){

            if(
                !alive.has(key) &&
                now-tr.lastSeen>TRACK_TTL
            ){
                tracks.delete(key);
            }
        }


        /* -----------------------------------------------
         * Clear
         * ----------------------------------------------- */

        const cl=
            st?.fx?.cl9;


        if(
            cl &&
            Array.isArray(cl.cells)
        ){

            const seq=
                Number(cl.seq)||0;

            if(
                !g.__remoteClear ||
                g.__remoteClear.seq!==seq
            ){
                g.__remoteClear={
                    seq,
                    cells:[],
                    base:0,
                    hold:.4,
                    receivedAt:now,
                    lastSeen:now
                };
            }


            const r=
                g.__remoteClear;

            r.cells=
                cl.cells.map(
                    c=>c.slice(0,3)
                );

            r.base=
                Math.max(
                    0,
                    Math.min(
                        1,
                        Number(cl.p)||0
                    )
                );

            r.hold=
                Math.max(
                    .001,
                    Number(cl.hold)||.4
                );

            r.receivedAt=now;
            r.lastSeen=now;

        }else if(g.__remoteClear){

            const r=
                g.__remoteClear;

            const p=
                r.base+
                (
                    now-
                    r.receivedAt
                )/
                1000/
                r.hold;

            if(
                p>=1 ||
                now-r.lastSeen>200
            ){
                g.__remoteClear=null;
            }
        }


        /* -----------------------------------------------
         * Hard drop
         * ----------------------------------------------- */

        if(
            !(g.__remoteHardDrops instanceof Map)
        ){
            g.__remoteHardDrops=
                new Map();
        }


        for(const q of st?.fx?.hd9||[]){

            if(
                !q ||
                !Array.isArray(q.cells)
            ){
                continue;
            }


            const key=
                String(q.seq);


            if(g.__remoteHardDrops.has(key))
                continue;


            g.__remoteHardDrops.set(
                key,
                {
                    cells:
                        q.cells.map(
                            c=>c.slice(0,3)
                        ),

                    max:
                        Number(q.max)||.34,

                    age:
                        Math.max(
                            0,
                            Number(q.age)||0
                        ),

                    receivedAt:
                        now
                }
            );
        }
    };


    /* ========================================================
     * REMOTE STEP
     *
     * No updateVisuals()
     * No resolveVisualContacts()
     * No remote physics.
     * ======================================================== */

    stepNetView=function(g,dt){

        if(!g)return;


        g.stateT+=dt;


        if(
            typeof stepNetPieceMotion===
            "function"
        ){
            stepNetPieceMotion(
                g,
                dt
            );
        }


        if(g.fx){

            g.fx.shake=0;

            g.fx.warn=
                pendingIncomingCount(g)>0
                    ?Math.min(
                        1,
                        (g.fx.warn||0)+dt*4
                    )
                    :Math.max(
                        0,
                        (g.fx.warn||0)-dt*4
                    );


            g.fx.fastPulse=
                Math.max(
                    0,
                    (g.fx.fastPulse||0)-dt*7
                );


            for(
                const name of [
                    "toasts",
                    "rings",
                    "formations",
                    "incomingPreviews",
                    "hardDrops"
                ]
            ){
                if(
                    Array.isArray(
                        g.fx[name]
                    )
                ){
                    g.fx[name]=
                        g.fx[name]
                        .filter(
                            q=>
                                !Number.isFinite(q.life) ||
                                (
                                    q.life-=dt
                                )>0
                        );
                }
            }


            if(
                Array.isArray(
                    g.fx.sparks
                )
            ){
                g.fx.sparks=
                    g.fx.sparks
                    .filter(s=>{

                        s.life-=dt;

                        s.x+=
                            (s.vx||0)*dt;

                        s.y+=
                            (s.vy||0)*dt;

                        s.vy=
                            (s.vy||0)+
                            12*dt;

                        return s.life>0;
                    });
            }
        }
    };


    /* ========================================================
     * DRAW
     * ======================================================== */

    const baseDrawSide=
        drawSide;


    drawSide=function(
        ctx,
        g,
        L,
        side,
        t,
        label,
        sub,
        big,
        renderLead=0
    ){

        const now=
            clock();

        const tracks=
            g?.__remoteMoveTracks;

        const clear=
            g?.__remoteClear;


        /*
         * Hide canonical copies while an independent network
         * visual is being rendered.
         */
        const hidden=[];
        const hiddenKeys=
            new Set();


        const hideCell=(
            x,
            y,
            c
        )=>{

            if(
                !Number.isInteger(x) ||
                !Number.isInteger(y) ||
                !valid(x,y)
            ){
                return;
            }


            const key=
                x+","+y;

            if(hiddenKeys.has(key))
                return;


            const ball=
                g.board?.[y]?.[x];


            if(
                ball &&
                (
                    c==null ||
                    ball.c===c
                )
            ){

                hiddenKeys.add(key);

                hidden.push([
                    x,
                    y,
                    ball
                ]);

                g.board[y][x]=null;
            }
        };


        if(tracks instanceof Map){

            for(const tr of tracks.values()){

                if(
                    now-tr.lastSeen<=
                    TRACK_TTL
                ){
                    hideCell(
                        tr.lx,
                        tr.ly,
                        tr.c
                    );
                }
            }
        }


        if(
            clear &&
            Array.isArray(clear.cells)
        ){

            for(
                const [x,y,c]
                of clear.cells
            ){
                hideCell(
                    x,
                    y,
                    c
                );
            }
        }


        /*
         * Inject remote hard-drop effects into the normal
         * renderer so the light pillar stays BEHIND balls.
         */
        const originalHardDrops=
            g?.fx?.hardDrops;


        if(
            g?.fx &&
            g.__remoteHardDrops instanceof Map
        ){

            const list=[];


            for(
                const [key,e]
                of g.__remoteHardDrops
            ){

                const age=
                    e.age+
                    (
                        now-
                        e.receivedAt
                    )/1000;

                const life=
                    e.max-age;


                if(life<=0){

                    g.__remoteHardDrops.delete(
                        key
                    );

                    continue;
                }


                list.push({
                    seq:key,
                    cells:e.cells,
                    max:e.max,
                    life
                });
            }


            g.fx.hardDrops=list;
        }


        try{

            baseDrawSide(
                ctx,
                g,
                L,
                side,
                t,
                label,
                sub,
                big,
                renderLead
            );

        }finally{

            for(
                const [x,y,ball]
                of hidden
            ){
                g.board[y][x]=ball;
            }


            if(g?.fx){
                g.fx.hardDrops=
                    originalHardDrops||
                    [];
            }
        }


        const {
            D,
            X,
            Y,
            BW,
            BH
        }=L;


        const ox=
            X+
            (
                BW-
                (W2-1)*D*.5
            )/2;

        const oy=
            Y+D/2;


        const pos=(x,y)=>[
            ox+x*D*.5,
            oy+y*D*HEX_ROW_H
        ];


        /* -----------------------------------------------
         * MOVING-BALL OVERLAY
         * ----------------------------------------------- */

        if(tracks instanceof Map){

            ctx.save();

            ctx.beginPath();

            /*
             * Includes space above the board so incoming
             * garbage is visible before entering the frame.
             */
            ctx.rect(
                X-D,
                0,
                BW+D*2,
                Y+BH+D
            );

            ctx.clip();


            const drawList=[];


            for(const [key,tr] of tracks){

                if(
                    now-tr.lastSeen>
                    TRACK_TTL
                ){
                    tracks.delete(key);
                    continue;
                }


                const p=
                    Math.min(
                        1,
                        (
                            now-
                            tr.start
                        )/
                        Math.max(
                            1,
                            tr.duration
                        )
                    );


                const k=
                    p*p*(3-2*p);


                const x=
                    tr.fromX+
                    (
                        tr.toX-
                        tr.fromX
                    )*k;

                const y=
                    tr.fromY+
                    (
                        tr.toY-
                        tr.fromY
                    )*k;

                const sq=
                    tr.fromSq+
                    (
                        tr.toSq-
                        tr.fromSq
                    )*k;


                drawList.push({
                    x,
                    y,
                    sq,
                    c:tr.c,
                    gb:tr.gb,
                    bubble:tr.bubble
                });
            }


            /*
             * Roughly preserve normal back-to-front board order.
             */
            drawList.sort(
                (a,b)=>a.y-b.y
            );


            for(const q of drawList){

                const [px,py]=
                    pos(q.x,q.y);


                if(
                    q.gb &&
                    Number.isFinite(q.bubble)
                ){

                    drawGarbageBubbleBall(
                        ctx,
                        px,
                        py,
                        D,
                        q.c,
                        q.bubble
                    );

                }else{

                    drawBall(
                        ctx,
                        px,
                        py,
                        D,
                        q.c,
                        {
                            sq:q.sq,
                            aura:0
                        }
                    );
                }
            }


            ctx.restore();
        }


        /* -----------------------------------------------
         * CLEAR OVERLAY
         * ----------------------------------------------- */

        if(
            clear &&
            Array.isArray(clear.cells)
        ){

            const progress=
                Math.max(
                    0,
                    Math.min(
                        1,
                        clear.base+
                        (
                            now-
                            clear.receivedAt
                        )/
                        1000/
                        clear.hold
                    )
                );


            if(progress>=1){

                g.__remoteClear=null;

            }else{

                const cv=
                    clearVisualState(
                        progress
                    );


                ctx.save();

                ctx.beginPath();

                ctx.rect(
                    X-D,
                    Y-D*2.7,
                    BW+D*2,
                    BH+D*3.7
                );

                ctx.clip();


                for(
                    const [x,y,c]
                    of clear.cells
                ){

                    const [px,py]=
                        pos(x,y);


                    drawBall(
                        ctx,
                        px,
                        py,
                        D,
                        c,
                        {
                            alpha:
                                cv.alpha,

                            scale:
                                cv.scale,

                            sq:0,

                            ring:1
                        }
                    );
                }


                ctx.restore();
            }
        }
    };


    window.__sixBallOnlineRuntimeVersion=
        "online-runtime-v9";

})();
