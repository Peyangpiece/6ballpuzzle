/* ============================================================
 * 6ball NINTENDO-REFERENCE UP-CONVEX AUTHORITY v1
 *
 * Loaded after final-rigidity-authority-v21.
 * v21 remains the contact/airborne safety authority. This layer changes only
 * the final side choice of an already-authorized CURRENT 2+1 contact split.
 *
 * Nintendo-reference rule:
 * - "the contacted lower ball must always be solo" is NOT an invariant.
 * - Build both collision-safe 2+1 continuations when they exist.
 * - Prefer the continuation that preserves the current motion of the top ball
 *   and the triplet's established horizontal momentum.
 * - If kinematic evidence is tied, retain v21's contact-side choice.
 * - Never create a split while v21 says the body is airborne or the contact is
 *   outside its validated current-contact band.
 * ============================================================ */
(function(){
  if(
    typeof window==="undefined" ||
    window.__sixBallReferenceUpConvexAuthorityV1 ||
    typeof hexPhysPlanGroup!=="function" ||
    typeof hexPhysIndependentMemberMotion!=="function" ||
    typeof hexPhysUpConvexSeparator!=="function" ||
    typeof hexPhysUpConvexSplitPlan!=="function"
  )return;

  window.__sixBallReferenceUpConvexAuthorityV1=true;
  const basePlanGroup=hexPhysPlanGroup;

  function memberId(value){return value?.ball?.id;}
  function vectorOf(step){
    if(!step)return null;
    const dx=Number(step.tx)-Number(step.x);
    const dy=Number(step.ty)-Number(step.y);
    return Number.isFinite(dx)&&Number.isFinite(dy)&&(dx||dy)?{dx,dy}:null;
  }
  function ordinaryTriplet(members){
    return Array.isArray(members)&&members.length===3&&members.every(m=>
      m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage
    );
  }
  function upwardLayout(members){
    if(!ordinaryTriplet(members))return null;
    const ordered=[...members].sort((a,b)=>a.y-b.y||a.x-b.x);
    const top=ordered[0];
    const lower=ordered.slice(1).sort((a,b)=>a.x-b.x);
    if(
      !top||lower.length!==2||lower[0].y!==lower[1].y||
      !(top.y<lower[0].y)||!(lower[0].x<top.x&&top.x<lower[1].x)
    )return null;
    return{top,left:lower[0],right:lower[1]};
  }
  function classifyActiveSplit(plan,members){
    const layout=upwardLayout(members);
    if(!layout||!Array.isArray(plan))return null;
    const moving=plan.filter(step=>vectorOf(step));
    const pairSteps=moving.filter(step=>Number(step.groupSize)===2);
    const soloSteps=moving.filter(step=>Number(step.groupSize)===0);
    const pairIds=new Set(pairSteps.map(memberId));
    if(pairIds.size!==2||soloSteps.length!==1||!pairIds.has(memberId(layout.top)))return null;
    const soloId=memberId(soloSteps[0]);
    if(pairIds.has(soloId))return null;
    const pairLower=pairIds.has(memberId(layout.left))?layout.left:
      pairIds.has(memberId(layout.right))?layout.right:null;
    const solo=soloId===memberId(layout.left)?layout.left:
      soloId===memberId(layout.right)?layout.right:null;
    if(!pairLower||!solo||pairLower===solo)return null;
    const dir=pairLower===layout.left?-1:1;
    const pairVector=vectorOf(pairSteps[0]);
    if(!pairVector||Math.sign(pairVector.dx)!==dir||pairVector.dy<=0)return null;
    return{plan:moving,layout,pairLower,solo,dir,pairIds,soloId};
  }
  function independentMotions(board,members){
    return members.map(member=>{
      try{return hexPhysIndependentMemberMotion(board,members,member)||null;}
      catch(_){return null;}
    });
  }
  function buildCandidate(board,members,layout,separator,motions,dir){
    const pairLower=dir<0?layout.left:layout.right;
    const solo=dir<0?layout.right:layout.left;
    const soloIndex=members.indexOf(solo);
    const soloMotion=soloIndex>=0?motions[soloIndex]:null;
    const soloVector=vectorOf(soloMotion);
    if(!soloVector||Math.sign(soloVector.dx)!==-dir||soloVector.dy<=0)return null;
    const info={
      ...separator,
      dir,
      top:layout.top,
      pairLower,
      solo,
      soloMotion,
      pairSide:dir<0?"left":"right",
      soloSide:dir<0?"right":"left",
      splitSide:dir<0?"right":"left"
    };
    let plan=null;
    try{plan=hexPhysUpConvexSplitPlan(board,members,info,true)||null;}catch(_){plan=null;}
    const classified=classifyActiveSplit(plan,members);
    if(!classified||classified.dir!==dir)return null;
    return{...classified,info};
  }
  function ballBias(ball){
    for(const key of["momentumX","rollDir","subCellBias"]){
      const sign=Math.sign(Number(ball?.[key])||0);
      if(sign)return sign;
    }
    return 0;
  }
  function evidenceScore(candidate,members,motions,isBase){
    const expected=new Map([
      [memberId(candidate.layout.top),candidate.dir],
      [memberId(candidate.pairLower),candidate.dir],
      [memberId(candidate.solo),-candidate.dir]
    ]);
    let score=isBase?.75:0;
    for(const member of members){
      const target=expected.get(memberId(member));
      if(!target)continue;
      const motion=motions[members.indexOf(member)];
      const moveDir=Math.sign(vectorOf(motion)?.dx||0);
      const isTop=member===candidate.layout.top;
      const motionWeight=isTop?10:2;
      const biasWeight=isTop?6:1.5;
      if(moveDir)score+=moveDir===target?motionWeight:-motionWeight;
      const bias=ballBias(member.ball);
      if(bias)score+=bias===target?biasWeight:-biasWeight;
    }
    const groupBias=Math.sign(members.reduce((sum,m)=>sum+ballBias(m.ball),0));
    if(groupBias)score+=groupBias===candidate.dir?3:-3;
    return score;
  }
  function commitChosen(candidate,members,baseChoice,baseScore,chosenScore){
    const pairIds=candidate.pairIds;
    const solo=candidate.solo;
    const gid=Number(candidate.plan.find(step=>pairIds.has(memberId(step)))?.bundleId)||
      Number(members.find(m=>pairIds.has(memberId(m)))?.ball?.motionGroupId)||0;

    if(typeof hexPhysClearGroupBall==="function")hexPhysClearGroupBall(solo.ball);
    else{
      solo.ball.motionGroupId=0;solo.ball.motionGroupRole=-1;
      solo.ball.motionGroupOrientation="";solo.ball.motionGroupSize=0;solo.ball.rigid=false;
    }
    for(const member of members){
      if(!pairIds.has(memberId(member)))continue;
      if(gid)member.ball.motionGroupId=gid;
      member.ball.motionGroupSize=2;
      member.ball.rigid=true;
      member.ball.motionGroupOrientation="up";
      member.ball.momentumX=candidate.dir;
      member.ball.rollDir=candidate.dir;
      member.ball.subCellBias=candidate.dir;
    }
    solo.ball.momentumX=-candidate.dir;
    solo.ball.rollDir=-candidate.dir;
    solo.ball.subCellBias=-candidate.dir;

    window.__sixBallLastReferenceUpConvexChoiceV1={
      reason:"reference-kinematic-side-overrode-contact-side",
      chosenDir:candidate.dir,
      baseDir:baseChoice.dir,
      chosenPairIds:[...pairIds],
      chosenSoloId:memberId(solo),
      basePairIds:[...baseChoice.pairIds],
      baseSoloId:baseChoice.soloId,
      baseScore,
      chosenScore,
      at:Date.now()
    };
  }

  hexPhysPlanGroup=function(board,members,preview=false){
    const layout=upwardLayout(members);
    if(!layout)return basePlanGroup(board,members,preview)||[];

    let authorized=[];
    try{authorized=basePlanGroup(board,members,true)||[];}catch(_){authorized=[];}
    const baseChoice=classifyActiveSplit(authorized,members);
    if(!baseChoice){
      return basePlanGroup(board,members,preview)||[];
    }

    const motions=independentMotions(board,members);
    let separator=null;
    try{separator=hexPhysUpConvexSeparator(board,members,motions);}catch(_){separator=null;}
    if(!separator||!Number.isFinite(Number(separator.px))||!Number.isFinite(Number(separator.py))){
      return basePlanGroup(board,members,preview)||[];
    }

    const baseCandidate=buildCandidate(
      board,members,layout,separator,motions,baseChoice.dir
    )||baseChoice;
    const alternateCandidate=buildCandidate(
      board,members,layout,separator,motions,-baseChoice.dir
    );
    if(!alternateCandidate){
      return basePlanGroup(board,members,preview)||[];
    }

    const baseScore=evidenceScore(baseCandidate,members,motions,true);
    const alternateScore=evidenceScore(alternateCandidate,members,motions,false);

    /* Require a meaningful kinematic advantage. Tiny/tied differences retain
       v21's contact-side result so this layer changes only evidence-backed cases. */
    if(!(alternateScore>baseScore+1.5)){
      return basePlanGroup(board,members,preview)||[];
    }

    if(preview)return alternateCandidate.plan;
    commitChosen(alternateCandidate,members,baseChoice,baseScore,alternateScore);
    return alternateCandidate.plan;
  };

  window.__sixBallCurrentContactBallAlwaysBecomesSolo=false;
  window.__sixBallReferenceMayKeepContactSideInPair=true;
  window.__sixBallReferenceSplitUsesKinematicContinuity=true;
  window.__sixBallReferenceSplitStillRequiresV21CurrentContact=true;
  window.__sixBallReferenceUpConvexAuthorityVersion="reference-upconvex-authority-v1";
})();
