(function(){
  if(typeof window==="undefined")return;

  window.__sixBallPhysicsSafetyInstalled=true;
  window.__sixBallPhysicsSafetyVersion=
    "v2-push-clear-ghost-garbage-recovery";

  const EPS=1e-9;

  function explicitHorizontalPush(p){
    if(!p)return false;

    const kind=String(p.kind||"").toUpperCase();

    return !!(
      p.isPush ||
      p.pushedById ||
      p.pushSourceId ||
      p.contactPush ||
      kind.includes("PUSH") ||
      kind.includes("EJECT") ||
      kind.includes("DISPLACE")
    );
  }

  function legalPhysicalProposal(p){
    if(!p)return false;

    const dx=(Number(p.tx)||0)-(Number(p.x)||0);
    const dy=(Number(p.ty)||0)-(Number(p.y)||0);

    if(dy>EPS)return true;
    if(dy<-EPS)return false;

    if(Math.abs(dx)<=EPS)return false;

    return explicitHorizontalPush(p);
  }

  if(typeof hexPhysGroupTranslationPlan==="function"){
    const baseGroupPlan=hexPhysGroupTranslationPlan;

    hexPhysGroupTranslationPlan=function(
      b,members,dx,dy,kind="GROUP_TRANSLATE"
    ){
      if(dy<0)return null;

      if(
        Math.abs(dy)<=EPS &&
        Math.abs(dx)>EPS &&
        !/PUSH|EJECT|DISPLACE/i.test(String(kind||""))
      ){
        window.__sixBallRejectedHorizontalGroup=
          (window.__sixBallRejectedHorizontalGroup||0)+1;
        return null;
      }

      return baseGroupPlan(b,members,dx,dy,kind);
    };
  }

  if(typeof hexPhysApplyEvent==="function"){
    const baseApply=hexPhysApplyEvent;

    hexPhysApplyEvent=function(b,accepted){
      if(!Array.isArray(accepted)||!accepted.length)return false;

      const invalidBundles=new Set();

      for(const p of accepted){
        if(!legalPhysicalProposal(p) && p?.bundleId){
          invalidBundles.add(p.bundleId);
        }
      }

      const safe=accepted.filter(p=>{
        if(p?.bundleId && invalidBundles.has(p.bundleId))return false;

        const ok=legalPhysicalProposal(p);

        if(!ok){
          window.__sixBallRejectedNonPhysicalMotion=
            (window.__sixBallRejectedNonPhysicalMotion||0)+1;

          window.__sixBallLastRejectedMotion={
            x:p?.x,
            y:p?.y,
            tx:p?.tx,
            ty:p?.ty,
            kind:p?.kind||"",
            id:p?.ball?.id||0,
            at:performance.now()
          };
        }

        return ok;
      });

      if(!safe.length)return false;

      return baseApply(b,safe);
    };
  }

  if(typeof unstableFrozenBalls==="function"){
    unstableFrozenBalls=function(b){
      const out=[];

      for(let y=boardScanMin(b);y<ROWS;y++){
        for(let x=0;x<W2;x++){
          if(!valid(x,y))continue;

          const ball=b[y]?.[x];

          if(
            !ball ||
            touchesFloorRow(y) ||
            ballInBalancedHexagonRing(b,x,y) ||
            ball.garbageBubbleHold
          )continue;

          const support=hexPhysSupportInfo(b,x,y);
          const motion=hexPhysNaturalMotion(b,x,y);

          if(ball.equilibriumLocked){
            if(motion || support.count===0){
              delete ball.equilibriumLocked;
            }else{
              continue;
            }
          }

          if(!motion && support.count<2){
            out.push({
              x,y,
              id:ball.id,
              contacts:support.count
            });
          }
        }
      }

      return out;
    };
  }

  if(typeof markCollisionBalancedGaps==="function"){
    markCollisionBalancedGaps=function(b){
      const stuck=unstableFrozenBalls(b);
      let locked=0;

      for(const q of stuck){
        const ball=b[q.y]?.[q.x];
        if(!ball)continue;

        if(q.contacts>=1){
          ball.equilibriumLocked=true;
          locked++;
        }else{
          delete ball.equilibriumLocked;

          if(ball.motionGroupId){
            try{hexPhysClearGroupBall(ball);}catch(_){}
            ball.rigid=false;
          }
        }
      }

      return locked;
    };
  }

  function boardIdSet(g){
    const ids=new Set();

    if(!g?.board)return ids;

    for(let y=boardScanMin(g.board);y<ROWS;y++){
      for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball)ids.add(ball.id);
      }
    }

    return ids;
  }

  function purgeDetachedVisualBalls(g){
    if(!g?.vis)return 0;

    const ids=boardIdSet(g);
    let removed=0;

    for(const id of [...g.vis.keys()]){
      if(ids.has(id))continue;

      g.vis.delete(id);
      removed++;
    }

    if(removed){
      window.__sixBallPurgedGhostVisuals=
        (window.__sixBallPurgedGhostVisuals||0)+removed;
    }

    return removed;
  }

  function cleanupClearVacancies(g){
    if(!g?.clearing)return 0;

    const cells=Array.isArray(g.clearing.cells)
      ? g.clearing.cells
      : [];

    let removed=0;

    for(const cell of cells){
      if(!Array.isArray(cell)||cell.length<4)continue;

      const [x,y,c,id]=cell;

      if(
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        valid(x,y)
      ){
        const current=g.board[y]?.[x];

        if(current && current.id===id){
          g.board[y][x]=null;
        }
      }

      if(Number.isFinite(id) && g.vis?.has(id)){
        g.vis.delete(id);
        removed++;
      }
    }

    for(let y=boardScanMin(g.board);y<ROWS;y++){
      for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;

        delete ball.equilibriumLocked;

        if(g.phase!=="GARBAGE"){
          delete ball.garbagePhaseFrozen;
          delete ball.garbageSpawnHold;

          if(
            ball.garbageBubbleHold &&
            (!Number.isFinite(ball.garbageBubbleUntil) ||
             (g.garbageClock||0)>=ball.garbageBubbleUntil)
          ){
            delete ball.garbageBubbleHold;
          }
        }
      }
    }

    if(g.board){
      delete g.board.__hexGarbageFrozenIds;
    }

    if(g.phase!=="GARBAGE"){
      g.garbageFrozenPileIds=null;
    }

    g.balanceWait=0;
    g._pileFlowBallById=null;
    g._visualMovingIds=null;
    g._visualMotionSeqById=null;
    g._visualArcPivotById=null;
    g._garbagePhaseBallCache=null;

    try{clearBoardEquilibriumLocks(g.board);}catch(_){}
    try{refreshBoardScanMin(g.board);}catch(_){}
    try{window.__hexInvalidateGarbagePhaseBallCache?.(g);}catch(_){}

    window.__sixBallLastClearGhostCleanup={
      removed,
      at:performance.now()
    };

    return removed;
  }

  if(typeof prepareContinuousPileFlow==="function"){
    const basePreparePileFlow=prepareContinuousPileFlow;

    prepareContinuousPileFlow=function(g,reason="pile_flow"){
      if(reason==="clear_support_loss"){
        cleanupClearVacancies(g);
      }

      return basePreparePileFlow(g,reason);
    };
  }

  function garbageInterval(){
    const n=Number(window.__hexdropGarbageInterval);
    return Number.isFinite(n)&&n>0?n:.5;
  }

  function garbageProgressKey(g){
    const plans=Array.isArray(g?.garbagePlans)
      ? g.garbagePlans
      : [];

    let started=0;
    let landed=0;

    for(const p of plans){
      if(p?._started)started++;
      if(p?.landed)landed++;
    }

    let pending=0;

    try{pending=pendingFallPathCount(g);}catch(_){}

    return [
      Number(g?.ver)||0,
      started,
      landed,
      Number(g?.garbLeft)||0,
      pending,
      plans.length
    ].join("|");
  }

  function clearExpiredGarbageHolds(g){
    if(!g?.board)return;

    for(let y=boardScanMin(g.board);y<ROWS;y++){
      for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;

        delete ball.equilibriumLocked;

        if(
          ball.garbageBubbleHold &&
          (!Number.isFinite(ball.garbageBubbleUntil) ||
           (g.garbageClock||0)>=ball.garbageBubbleUntil)
        ){
          delete ball.garbageBubbleHold;
        }

        if(
          ball.garbageSpawnHold &&
          !Array.isArray(ball.fallPath)
        ){
          delete ball.garbageSpawnHold;
        }
      }
    }
  }

  function findLogicalGarbageAnchor(g,plan,requireVisual){
    if(!g?.board||!plan?.pat?.length)return null;

    const minX=Math.min(...plan.pat.map(([x])=>x));
    const maxX=Math.max(...plan.pat.map(([x])=>x));
    const preferred=Number.isFinite(plan.ax)?plan.ax:0;

    const candidates=[];

    for(let ax=-minX;ax<=W2-1-maxX;ax++){
      candidates.push(ax);
    }

    candidates.sort(
      (a,b)=>
        Math.abs(a-preferred)-Math.abs(b-preferred) ||
        a-b
    );

    for(const ax of candidates){
      let safe=true;

      for(const [dx,dy] of plan.pat){
        const x=ax+dx;
        const y=GARBAGE_START_Y+dy;

        if(!valid(x,y)||g.board[y][x]!==null){
          safe=false;
          break;
        }

        if(
          requireVisual &&
          typeof visualPointSafe==="function" &&
          !visualPointSafe(g,-1,x,y,HEX_MIN_DIST)
        ){
          safe=false;
          break;
        }
      }

      if(safe)return ax;
    }

    return null;
  }

  function fallbackSpawnGarbagePlan(g,plan){
    if(!plan?.pat?.length)return false;

    purgeDetachedVisualBalls(g);

    try{
      if(typeof snapQuiescentPileVisuals==="function"){
        snapQuiescentPileVisuals(g);
      }
    }catch(_){}

    const ax=findLogicalGarbageAnchor(g,plan,true);

    if(ax===null)return false;

    plan.ax=ax;
    plan.ballIds=[];

    for(let i=0;i<plan.pat.length;i++){
      const [dx,dy]=plan.pat[i];
      const x=ax+dx;
      const y=GARBAGE_START_Y+dy;
      const color=plan.colors?.[i]??0;

      if(!valid(x,y)||g.board[y][x]!==null)return false;

      const ball=mkBall(g,color);

      ball.isGarbage=true;
      ball.garbageType=plan.type||"SINGLE";
      ball.garbageSourceSeq=plan.seq||0;
      ball.garbageSourceRole=i;
      ball.rigid=false;

      delete ball.garbageBubbleHold;
      delete ball.garbageSpawnHold;
      delete ball.fixedGarbage;
      delete ball.equilibriumLocked;

      try{hexPhysClearGroupBall(ball);}catch(_){}

      g.board[y][x]=ball;
      noteBoardCell(g.board,y,ball);
      setVis(g,ball,x,y,RELEASE_INITIAL_VY);

      const v=g.vis.get(ball.id);

      if(v){
        v.motionSpeed=RELEASE_INITIAL_VY;
        v.justReleased=true;
      }

      plan.ballIds.push(ball.id);
    }

    plan._started=true;
    plan.actualStartTime=g.garbageClock||0;
    plan.landed=false;

    g.garbageNextBallAt=
      (g.garbageClock||0)+garbageInterval();

    g.ver++;

    try{
      if(settlePass(g.board))g.ver++;
    }catch(_){}

    try{window.__hexInvalidateGarbagePhaseBallCache?.(g);}catch(_){}

    window.__sixBallGarbageFallbackSpawns=
      (window.__sixBallGarbageFallbackSpawns||0)+1;

    return true;
  }

  if(typeof prepareGarbageBatch==="function"){
    const basePrepareGarbageBatch=prepareGarbageBatch;

    prepareGarbageBatch=function(g){
      const out=basePrepareGarbageBatch(g);

      const count=
        (Array.isArray(g.garbagePlans)
          ? g.garbagePlans.length
          : 0)
        +(Number(g.garbLeft)||0);

      g.garbageWatchdogLimit=
        Math.max(
          6,
          count*garbageInterval()+6.5
        );

      g._garbageNoProgressT=0;
      g._garbageProgressKey=garbageProgressKey(g);

      return out;
    };
  }

  if(typeof updateGarbagePacks==="function"){
    const baseUpdateGarbage=updateGarbagePacks;

    updateGarbagePacks=function(g,dt){
      const before=garbageProgressKey(g);

      const out=baseUpdateGarbage(g,dt);

      if(
        !g ||
        g.state!=="RESOLVING" ||
        g.phase!=="GARBAGE"
      ){
        if(g)g._garbageNoProgressT=0;
        return out;
      }

      const after=garbageProgressKey(g);

      if(after!==before){
        g._garbageNoProgressT=0;
        g._garbageProgressKey=after;
        return out;
      }

      g._garbageNoProgressT=
        (g._garbageNoProgressT||0)+Math.max(0,dt||0);

      const stall=g._garbageNoProgressT;

      if(stall>=.35){
        purgeDetachedVisualBalls(g);
      }

      if(stall>=.65){
        clearExpiredGarbageHolds(g);

        try{clearBoardEquilibriumLocks(g.board);}catch(_){}
        try{window.__hexInvalidateGarbagePhaseBallCache?.(g);}catch(_){}
      }

      let pending=0;
      let settled=false;

      try{pending=pendingFallPathCount(g);}catch(_){}
      try{settled=nearlySettled(g,.06);}catch(_){}

      const next=Array.isArray(g.garbagePlans)
        ? g.garbagePlans.find(p=>!p?._started)
        : null;

      if(
        stall>=1.0 &&
        next &&
        pending===0 &&
        settled &&
        (g.garbageClock||0)+1e-9 >=
          (g.garbageNextBallAt||0)
      ){
        if(fallbackSpawnGarbagePlan(g,next)){
          g._garbageNoProgressT=0;
          return out;
        }
      }

      if(
        stall>=2.5 &&
        next &&
        pending===0 &&
        settled
      ){
        const logicalAnchor=
          findLogicalGarbageAnchor(g,next,false);

        if(logicalAnchor===null){
          let overflow=[];

          try{overflow=boardOverflowCells(g.board);}catch(_){}

          window.__sixBallGarbageEntryBlocked={
            at:performance.now(),
            plan:next.type||"",
            overflow:overflow.length
          };

          die(
            g,
            overflow,
            "GARBAGE_ENTRY_BLOCKED"
          );

          return out;
        }

        try{
          if(typeof snapQuiescentPileVisuals==="function"){
            snapQuiescentPileVisuals(g);
          }
        }catch(_){}

        purgeDetachedVisualBalls(g);

        g.garbageNextBallAt=
          Math.min(
            Number(g.garbageNextBallAt)||0,
            Number(g.garbageClock)||0
          );
      }

      if(
        stall>=3.5 &&
        pending===0 &&
        settled &&
        Array.isArray(g.garbagePlans) &&
        g.garbagePlans.every(p=>p?._started)
      ){
        for(const p of g.garbagePlans){
          if(p.landed)continue;

          const ids=Array.isArray(p.ballIds)
            ? p.ballIds
            : [];

          if(!ids.length)continue;

          let allRest=true;

          for(const id of ids){
            let ball=null;

            for(let y=boardScanMin(g.board);y<ROWS&&!ball;y++){
              for(let x=0;x<W2;x++){
                const q=valid(x,y)?g.board[y][x]:null;
                if(q?.id===id){
                  ball=q;
                  break;
                }
              }
            }

            if(
              !ball ||
              (Array.isArray(ball.fallPath)&&ball.fallPath.length)
            ){
              allRest=false;
              break;
            }
          }

          if(allRest)p.landed=true;
        }
      }

      return out;
    };
  }

  if(typeof finishGarbageVisuals==="function"){
    const baseFinishGarbage=finishGarbageVisuals;

    finishGarbageVisuals=function(g){
      const out=baseFinishGarbage(g);

      if(g?.board){
        delete g.board.__hexGarbageFrozenIds;

        for(let y=boardScanMin(g.board);y<ROWS;y++){
          for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball)continue;

            delete ball.garbagePhaseFrozen;
            delete ball.garbageBubbleHold;
            delete ball.garbageSpawnHold;
            delete ball.equilibriumLocked;
            delete ball.fixedGarbage;

            if(ball.isGarbage){
              try{hexPhysClearGroupBall(ball);}catch(_){}
              ball.rigid=false;
            }
          }
        }
      }

      g.garbageFrozenPileIds=null;
      g._garbagePhaseBallCache=null;
      g._garbageNoProgressT=0;
      g.balanceWait=0;

      try{clearBoardEquilibriumLocks(g.board);}catch(_){}
      try{window.__hexInvalidateGarbagePhaseBallCache?.(g);}catch(_){}

      if(g.ai){
        g.ai.target=null;
        g.ai.actT=0;

        for(const key of Object.keys(g.ai)){
          if(/planner/i.test(key)){
            g.ai[key]=null;
          }
        }
      }

      window.__sixBallLastGarbageFinishedAt=
        performance.now();

      return out;
    };
  }

  window.__sixBallCleanupClearVacancies=
    cleanupClearVacancies;

  window.__sixBallPurgeDetachedVisualBalls=
    purgeDetachedVisualBalls;
})();
