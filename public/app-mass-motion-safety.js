(function(){
  if(typeof window==="undefined")return;

  if(
    typeof hexPhysResolveEvent!=="function" ||
    typeof hexPhysApplyEvent!=="function"
  )return;

  const EPS=1e-9;

  function posKey(x,y){
    return x+","+y;
  }

  function bundleKey(p){
    if(p?.bundleId)
      return "g:"+p.bundleId;

    const id=
      p?.ball &&
      typeof p.ball==="object"
        ? p.ball.id
        : null;

    return id!=null
      ? "b:"+id
      : "p:"+p.x+","+p.y;
  }

  function horizontalPushAllowed(p){
    if(!p)return false;

    const kind=
      String(p.kind||"").toUpperCase();

    return !!(
      p.isPush ||
      p.contactPush ||
      p.pushedById ||
      p.pushSourceId ||
      (
        Array.isArray(p.followSupportIds) &&
        p.followSupportIds.length
      ) ||
      kind==="FOLLOW_SUPPORT" ||
      kind.includes("PUSH") ||
      kind.includes("EJECT") ||
      kind.includes("DISPLACE")
    );
  }

  function legalMotion(p){
    if(!p)return false;

    const dx=
      Number(p.tx)-Number(p.x);

    const dy=
      Number(p.ty)-Number(p.y);

    if(
      !Number.isFinite(dx) ||
      !Number.isFinite(dy)
    )return false;

    if(dy>EPS)
      return true;

    if(dy<-EPS)
      return false;

    if(Math.abs(dx)<=EPS)
      return false;

    return horizontalPushAllowed(p);
  }

  /*
   * Every rigid/push bundle is atomic.
   * Either ALL members move or NONE move.
   */
  function atomicAcceptedSet(b,accepted){
    if(
      !Array.isArray(accepted) ||
      !accepted.length
    )return[];

    const groups=[];
    const byKey=new Map();

    for(const p of accepted){
      const k=bundleKey(p);

      if(!byKey.has(k)){
        const g={
          key:k,
          proposals:[],
          order:groups.length
        };

        byKey.set(k,g);
        groups.push(g);
      }

      byKey.get(k).proposals.push(p);
    }

    let active=[];

    /*
     * Basic validation.
     */
    for(const group of groups){
      let ok=true;
      const targets=new Set();
      const origins=new Set();

      for(const p of group.proposals){
        if(
          !legalMotion(p) ||
          !valid(p.x,p.y) ||
          !valid(p.tx,p.ty) ||
          b[p.y][p.x]!==p.ball
        ){
          ok=false;
          break;
        }

        const origin=
          posKey(p.x,p.y);

        const target=
          posKey(p.tx,p.ty);

        if(
          origins.has(origin) ||
          targets.has(target)
        ){
          ok=false;
          break;
        }

        origins.add(origin);
        targets.add(target);
      }

      if(ok){
        group.targets=targets;
        group.origins=origins;
        active.push(group);
      }else{
        window.__sixBallRejectedAtomicBundles=
          (
            window.__sixBallRejectedAtomicBundles||
            0
          )+1;
      }
    }

    /*
     * Different bundles may NEVER reserve the same final cell.
     *
     * Keep the resolver's original priority:
     * lower/earlier accepted bundle wins.
     */
    const reservedTargets=new Set();
    const unique=[];

    for(const group of active){
      let conflict=false;

      for(const k of group.targets){
        if(reservedTargets.has(k)){
          conflict=true;
          break;
        }
      }

      if(conflict){
        window.__sixBallRejectedTargetConflicts=
          (
            window.__sixBallRejectedTargetConflicts||
            0
          )+1;

        continue;
      }

      unique.push(group);

      for(const k of group.targets)
        reservedTargets.add(k);
    }

    active=unique;

    /*
     * Resolve dependency chain.
     *
     * A target may currently contain a ball ONLY when
     * that exact cell is also vacated by an active move.
     *
     * Re-run until no rejected dependency remains.
     */
    for(let guard=0;guard<32;guard++){
      const movingOrigins=new Set();

      for(const group of active)
        for(const k of group.origins)
          movingOrigins.add(k);

      const next=[];
      let removed=false;

      for(const group of active){
        let ok=true;

        for(const p of group.proposals){
          const target=
            posKey(p.tx,p.ty);

          const occupant=
            b[p.ty][p.tx];

          if(
            occupant!==null &&
            occupant!==undefined &&
            !movingOrigins.has(target)
          ){
            ok=false;
            break;
          }
        }

        if(ok){
          next.push(group);
        }else{
          removed=true;

          window.__sixBallRejectedBlockedBundles=
            (
              window.__sixBallRejectedBlockedBundles||
              0
            )+1;
        }
      }

      active=next;

      if(!removed)
        break;
    }

    const allowed=
      new Set(active.map(g=>g.key));

    return accepted.filter(
      p=>allowed.has(bundleKey(p))
    );
  }

  /*
   * Strengthen resolver target reservation.
   *
   * Previous implementation only reserved targets
   * inside the current bundle.
   */
  hexPhysBundleTargetsFree=function(
    bundle,
    b,
    accepted
  ){
    if(
      !Array.isArray(bundle) ||
      !bundle.length
    )return false;

    const existingTargets=
      new Set(
        (accepted||[]).map(
          p=>posKey(p.tx,p.ty)
        )
      );

    const movingOrigins=
      new Set(
        [
          ...bundle,
          ...(accepted||[])
        ].map(
          p=>posKey(p.x,p.y)
        )
      );

    const ownTargets=new Set();

    for(const p of bundle){
      if(!valid(p.tx,p.ty))
        return false;

      const target=
        posKey(p.tx,p.ty);

      if(
        ownTargets.has(target) ||
        existingTargets.has(target)
      ){
        return false;
      }

      ownTargets.add(target);

      const q=
        b[p.ty][p.tx];

      if(
        q!==null &&
        q!==undefined &&
        !movingOrigins.has(target)
      ){
        return false;
      }
    }

    return true;
  };

  /*
   * Replace non-atomic apply.
   *
   * Old:
   *   clear every origin
   *   -> try to place every target
   *   -> silently skip occupied target
   *
   * New:
   *   validate complete move
   *   -> clear all origins
   *   -> verify all targets
   *   -> place ALL
   */
  hexPhysApplyEvent=function(
    b,
    accepted
  ){
    const safe=
      atomicAcceptedSet(
        b,
        accepted
      );

    if(!safe.length)
      return false;

    const touched=new Map();

    for(const p of safe){
      const a=
        posKey(p.x,p.y);

      const z=
        posKey(p.tx,p.ty);

      if(!touched.has(a))
        touched.set(
          a,
          {
            x:p.x,
            y:p.y,
            value:b[p.y][p.x]
          }
        );

      if(!touched.has(z))
        touched.set(
          z,
          {
            x:p.tx,
            y:p.ty,
            value:b[p.ty][p.tx]
          }
        );
    }

    try{
      clearBoardEquilibriumLocks(b);
    }catch(_){}

    /*
     * Phase 1: remove every moving origin.
     */
    for(const p of safe){
      if(b[p.y][p.x]!==p.ball){
        window.__sixBallAtomicApplyAbort=
          (
            window.__sixBallAtomicApplyAbort||
            0
          )+1;

        return false;
      }
    }

    for(const p of safe)
      b[p.y][p.x]=null;

    /*
     * Phase 2: all final targets must now be empty.
     */
    let targetFailure=false;
    const finalTargets=new Set();

    for(const p of safe){
      const k=
        posKey(p.tx,p.ty);

      if(
        finalTargets.has(k) ||
        !valid(p.tx,p.ty) ||
        b[p.ty][p.tx]!==null
      ){
        targetFailure=true;
        break;
      }

      finalTargets.add(k);
    }

    if(targetFailure){
      /*
       * No fallPath has been appended yet,
       * so board rollback is exact.
       */
      for(const q of touched.values())
        b[q.y][q.x]=q.value;

      try{
        refreshBoardScanMin(b);
      }catch(_){}

      window.__sixBallAtomicApplyRollback=
        (
          window.__sixBallAtomicApplyRollback||
          0
        )+1;

      return false;
    }

    /*
     * Phase 3: place every member.
     */
    for(const p of safe){
      b[p.ty][p.tx]=p.ball;

      try{
        noteBoardCell(
          b,
          p.ty,
          p.ball
        );
      }catch(_){}
    }

    let seq;

    try{
      seq=HEX_PHYS_EVENT_SEQ++;
    }catch(_){
      window.__sixBallAtomicMotionSeq=
        (
          window.__sixBallAtomicMotionSeq||
          1000000
        )+1;

      seq=
        window.__sixBallAtomicMotionSeq;
    }

    /*
     * Only after ALL positions are valid do visuals receive
     * their motion segments.
     */
    for(const p of safe){
      try{
        hexPhysAppendSegment(
          p.ball,
          p,
          seq
        );
      }catch(err){
        window.__sixBallAtomicAppendError=
          String(err);
      }
    }

    window.__sixBallAtomicLastMove={
      count:safe.length,
      seq,
      at:
        typeof performance!=="undefined"
          ?performance.now()
          :Date.now()
    };

    if(safe.length>=4){
      window.__sixBallMassMoveCount=
        (
          window.__sixBallMassMoveCount||
          0
        )+1;
    }

    return true;
  };

  /*
   * -------------------------------
   * PILE FLOW SAFETY
   * -------------------------------
   *
   * Never force an animation path after
   * pileFlowWaveSafe() has rejected it.
   */

  function returnSegmentToLegacy(seg){
    if(!seg)return;

    seg.pileFlow=false;

    if(
      Number.isFinite(
        seg.pileFlowOriginalSeq
      )
    ){
      seg.motionSeq=
        seg.pileFlowOriginalSeq;
    }

    delete seg.pileFlowStart;
    delete seg.pileFlowDuration;
    delete seg.pileFlowEnd;

    if(seg.pileFlowInferredSupport){
      delete seg.followSupportIds;
      delete seg.movingSupportId;
      delete seg.pileFlowInferredSupport;
    }

    window.__sixBallPileFlowLegacyFallbacks=
      (
        window.__sixBallPileFlowLegacyFallbacks||
        0
      )+1;
  }

  if(
    typeof preparePileFlowDurations==="function" &&
    typeof pileFlowWaveSafe==="function" &&
    typeof pileFlowPreviousEnd==="function" &&
    typeof pileFlowPriorEnds==="function"
  ){
    scheduleFreshPileFlowPerBall=function(
      g,
      fresh
    ){
      if(!fresh.length)
        return;

      preparePileFlowDurations(
        g,
        fresh
      );

      const seqs=[
        ...new Set(
          fresh.map(q=>q.seq)
        )
      ].sort((a,b)=>a-b);

      const bySeq=
        new Map(
          seqs.map(
            seq=>[seq,[]]
          )
        );

      for(const q of fresh)
        bySeq.get(q.seq).push(q);

      const STEP=
        typeof PILE_FLOW_SCHEDULE_STEP!=="undefined"
          ?PILE_FLOW_SCHEDULE_STEP
          :1/240;

      for(const seq of seqs){
        const pending=[
          ...bySeq.get(seq)
        ];

        pending.sort(
          (a,b)=>
            (b.seg.from?.[1]||0)-
            (a.seg.from?.[1]||0) ||
            (a.seg.from?.[0]||0)-
            (b.seg.from?.[0]||0)
        );

        while(pending.length){
          const {
            ball,
            seg
          }=pending.shift();

          const duration=
            Math.max(
              1/120,
              seg._pileNominalDuration||
              1/120
            );

          let earliest=
            pileFlowPreviousEnd(
              ball,
              seg,
              g.pileFlowClock||0
            );

          if(
            typeof pileFlowAttachCausalSupports==="function"
          ){
            pileFlowAttachCausalSupports(
              g,
              ball,
              seg,
              earliest,
              duration
            );
          }

          const priorEnds=
            pileFlowPriorEnds(
              g,
              seg
            );

          const fallback=
            Math.max(
              earliest,
              ...priorEnds,
              earliest
            );

          let start=earliest;
          let safe=false;

          /*
           * First preference:
           * maintain simultaneous natural collapse.
           */
          while(
            start<=fallback+STEP+1e-9
          ){
            if(
              pileFlowWaveSafe(
                g,
                [seg],
                start,
                duration
              )
            ){
              safe=true;
              break;
            }

            start+=STEP;
          }

          /*
           * Second preference:
           * short collision-free delay only.
           */
          if(!safe){
            start=fallback;

            const limit=
              fallback+
              Math.max(
                duration,
                .35
              );

            while(
              start<=limit+1e-9
            ){
              if(
                pileFlowWaveSafe(
                  g,
                  [seg],
                  start,
                  duration
                )
              ){
                safe=true;
                break;
              }

              start+=STEP;
            }
          }

          /*
           * Critical change:
           *
           * NEVER assign an unsafe pileFlow.
           * The legacy/live-batch path still has
           * collision clamping.
           */
          if(!safe){
            returnSegmentToLegacy(
              seg
            );
          }
        }
      }
    };

    scheduleFreshPileFlowWave=function(
      g,
      fresh
    ){
      if(!fresh.length)
        return;

      preparePileFlowDurations(
        g,
        fresh
      );

      const seqs=[
        ...new Set(
          fresh.map(q=>q.seq)
        )
      ].sort((a,b)=>a-b);

      const bySeq=
        new Map(
          seqs.map(
            seq=>[seq,[]]
          )
        );

      for(const q of fresh)
        bySeq.get(q.seq).push(q);

      const STEP=
        typeof PILE_FLOW_SCHEDULE_STEP!=="undefined"
          ?PILE_FLOW_SCHEDULE_STEP
          :1/240;

      let previousStart=
        Math.max(
          0,
          g.pileFlowClock||0
        );

      for(
        let wi=0;
        wi<seqs.length;
        wi++
      ){
        const entries=
          bySeq.get(seqs[wi]);

        const segs=
          entries.map(
            q=>q.seg
          );

        const duration=
          Math.max(
            1/120,
            ...segs.map(
              seg=>
                seg._pileNominalDuration||
                1/120
            )
          );

        let earliest=
          wi===0
            ?Math.max(
                0,
                g.pileFlowClock||0
              )
            :previousStart+
              (
                typeof PILE_FLOW_MIN_WAVE_GAP!=="undefined"
                  ?PILE_FLOW_MIN_WAVE_GAP
                  :1/120
              );

        for(const {ball,seg} of entries){
          const path=
            ball.fallPath||[];

          const idx=
            path.indexOf(seg);

          if(idx>0){
            for(
              let j=idx-1;
              j>=0;
              j--
            ){
              const prev=
                path[j];

              if(
                Number.isFinite(
                  prev?.pileFlowEnd
                )
              ){
                earliest=
                  Math.max(
                    earliest,
                    prev.pileFlowEnd
                  );

                break;
              }
            }
          }
        }

        const priorEnds=[];

        for(
          let y=boardScanMin(g.board);
          y<ROWS;
          y++
        ){
          for(let x=0;x<W2;x++){
            const ball=
              valid(x,y)
                ?g.board[y][x]
                :null;

            if(!ball?.fallPath)
              continue;

            for(const s of ball.fallPath){
              if(
                s?.pileFlow &&
                Number.isFinite(
                  s.pileFlowEnd
                ) &&
                !segs.includes(s)
              ){
                priorEnds.push(
                  s.pileFlowEnd
                );
              }
            }
          }
        }

        const fallback=
          Math.max(
            earliest,
            ...priorEnds,
            earliest
          );

        let start=earliest;
        let safe=false;

        const limit=
          fallback+
          Math.max(
            duration,
            .35
          );

        while(
          start<=limit+1e-9
        ){
          if(
            pileFlowWaveSafe(
              g,
              segs,
              start,
              duration
            )
          ){
            safe=true;
            break;
          }

          start+=STEP;
        }

        if(!safe){
          /*
           * Entire motionSeq falls back together,
           * preserving simultaneous motion.
           */
          for(const seg of segs)
            returnSegmentToLegacy(
              seg
            );

          previousStart=earliest;
        }else{
          previousStart=start;
        }
      }
    };
  }

  window.__sixBallMassMotionSafetyVersion=
    "mass-motion-atomic-v1";
})();
