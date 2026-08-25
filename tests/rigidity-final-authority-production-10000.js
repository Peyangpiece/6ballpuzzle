const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

/* The legacy smoke/oracle deliberately stops at the v3 resolver so its locked
   golden remains a core-regression test. Add the production tail here, in the
   exact index.html order, to audit the new final authority independently. */
for(const file of[
  "app-upconvex-contact-priority-v1.js",
  "app-upconvex-pocket-capture-v1.js",
  "app-upconvex-rigid-until-contact-v1.js",
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js"
]){
  vm.runInContext(
    fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),
    ctx,
    {filename:file}
  );
}

const cases=fs.readFileSync(
  path.join(__dirname,"oracles/v1303-plan-group-10000.jsonl"),
  "utf8"
).trim().split("\n").map(line=>JSON.parse(line).input);

function expect(value,message){if(!value)throw new Error(message);}
function ball(id,c=0){
  return{
    id,c,isGarbage:false,
    motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",
    motionGroupSize:0,rigid:false,momentumX:0
  };
}
function build(input){
  const board=ctx.__v1303OracleNewBoard();
  const gid=500000+input.index;
  const members=input.members.map(member=>{
    const b={
      ...ball(member.id,member.role%5),
      motionGroupId:gid,
      motionGroupRole:member.role,
      motionGroupOrientation:member.orientation,
      motionGroupSize:3,
      rigid:true
    };
    board[member.y][member.x]=b;
    return{...member,ball:b};
  });
  for(const obstacle of input.obstacles){
    board[obstacle.y][obstacle.x]=ball(obstacle.id,obstacle.c);
  }
  return{board,members};
}
function canonical(plan){
  return(plan||[]).map(step=>({
    id:step.ball.id,
    dx:Number(step.tx)-Number(step.x),
    dy:Number(step.ty)-Number(step.y),
    kind:step.kind||"",
    bundleId:Number(step.bundleId)||0,
    groupSize:Number(step.groupSize)||0
  })).sort((a,b)=>a.id-b.id);
}
function metadata(members){
  return members.map(member=>({
    id:member.ball.id,
    group:Number(member.ball.motionGroupId)||0,
    size:Number(member.ball.motionGroupSize)||0,
    rigid:!!member.ball.rigid,
    orientation:member.ball.motionGroupOrientation||""
  }));
}
function vector(step){return`${step.dx},${step.dy}`;}
function upwardLayout(members){
  if(!Array.isArray(members)||members.length!==3)return null;
  const ordered=[...members].sort((a,b)=>a.y-b.y||a.x-b.x);
  const top=ordered[0];
  const lower=ordered.slice(1).sort((a,b)=>a.x-b.x);
  if(
    lower.length!==2||lower[0].y!==lower[1].y||
    !(top.y<lower[0].y)||
    !(lower[0].x<top.x&&top.x<lower[1].x)
  )return null;
  return{top,left:lower[0],right:lower[1]};
}
function upwardOppositeSplit(plan,members){
  const layout=upwardLayout(members);
  if(!layout)return null;
  const pair=plan.filter(step=>step.groupSize===2);
  const pairIds=new Set(pair.map(step=>step.id));
  if(pairIds.size!==2||new Set(pair.map(vector)).size!==1||!pairIds.has(layout.top.id))return null;
  if(pairIds.has(layout.right.id)&&!pairIds.has(layout.left.id)){
    return{splitSide:"left",pairSide:"right",soloId:layout.left.id};
  }
  if(pairIds.has(layout.left.id)&&!pairIds.has(layout.right.id)){
    return{splitSide:"right",pairSide:"left",soloId:layout.right.id};
  }
  return null;
}

let sameDirection=0;
let releasedFixed=0;
let oppositeSplits=0;
let rejectedOutsideBand=0;
let activeCentralSplits=0;
let positionFinalSplits=0;

for(const input of cases){
  const previewFixture=build(input);
  const before=JSON.stringify(metadata(previewFixture.members));
  const independent=previewFixture.members.map(member=>
    ctx.hexPhysIndependentMemberMotion(previewFixture.board,previewFixture.members,member)
  );
  const preview=canonical(ctx.hexPhysPlanGroup(
    previewFixture.board,previewFixture.members,true
  ));
  expect(JSON.stringify(metadata(previewFixture.members))===before,`case ${input.index}: preview mutated state`);

  const commitFixture=build(input);
  ctx.__sixBallLastFinalRigidityCorrectionV1=null;
  const commit=canonical(ctx.hexPhysPlanGroup(
    commitFixture.board,commitFixture.members,false
  ));
  const finalCorrection=ctx.__sixBallLastFinalRigidityCorrectionV1;
  const waitingRigid=
    commit.length===0&&
    [
      "reject-upward-split-outside-middle-fifty-percent",
      "wait-instead-of-opposite-upward-split",
      "wait-instead-of-unconfirmed-directional-pair"
    ].includes(finalCorrection?.reason);
  if(waitingRigid)rejectedOutsideBand++;
  expect(
    JSON.stringify(preview)===JSON.stringify(commit),
    `case ${input.index}: preview/commit mismatch ${JSON.stringify({preview,commit,input})}`
  );

  const planById=new Map(commit.map(step=>[step.id,step]));
  const stateById=new Map(metadata(commitFixture.members).map(state=>[state.id,state]));
  const cohorts=new Map();
  for(const step of commit){
    if(step.groupSize<2)continue;
    const key=`${step.bundleId}:${step.groupSize}`;
    if(!cohorts.has(key))cohorts.set(key,[]);
    cohorts.get(key).push(step);
  }
  for(const [key,steps] of cohorts){
    expect(steps.length===steps[0].groupSize,`case ${input.index}: incomplete cohort ${key}`);
    expect(new Set(steps.map(vector)).size===1,`case ${input.index}: divergent rigid cohort ${key}`);
  }
  for(const member of commitFixture.members){
    const step=planById.get(member.ball.id);
    const state=stateById.get(member.ball.id);
    if(waitingRigid){
      expect(state.rigid&&state.size===3,`case ${input.index}: rejected split did not restore triplet`);
    }else if(step?.groupSize>=2){
      expect(state.rigid&&state.size===step.groupSize,`case ${input.index}: moving cohort lost rigidity`);
    }else{
      expect(!state.rigid&&state.group===0&&state.size===0,`case ${input.index}: fixed/solo member retained rigidity`);
      if(!step)releasedFixed++;
    }
  }

  const vectors=independent.map(step=>step&&`${step.tx-step.x},${step.ty-step.y}`);
  const explicitUpSplit=upwardOppositeSplit(preview,input.members);
  if(explicitUpSplit){
    oppositeSplits++;
    const soloState=stateById.get(explicitUpSplit.soloId);
    expect(
      !soloState.rigid&&soloState.group===0&&soloState.size===0,
      `case ${input.index}: ${explicitUpSplit.splitSide} split solo retained rigidity`
    );
    const soloMoves=preview.some(step=>step.id===explicitUpSplit.soloId);
    if(soloMoves){
      activeCentralSplits++;
      expect(
        finalCorrection?.reason===
          "split-direction-confirmed-before-pair-rigidity",
        `case ${input.index}: active split lacks central-contact authority`
      );
      expect(
        finalCorrection.hitFraction>.25+1e-9&&
        finalCorrection.hitFraction<.75-1e-9,
        `case ${input.index}: active split escaped middle 50%`
      );
    }else{
      positionFinalSplits++;
    }
  }else if(independent.every(Boolean)&&new Set(vectors).size===1){
    let common=null;
    const [dx,dy]=vectors[0].split(",").map(Number);
    try{
      common=ctx.hexPhysGroupTranslationPlan(
        previewFixture.board,previewFixture.members,dx,dy
      );
    }catch(_){common=null;}
    if(common){
      sameDirection++;
      expect(preview.length===3&&preview.every(step=>step.groupSize===3),`case ${input.index}: same-direction group split`);
    }
  }
}

expect(ctx.__sixBallFinalRigidityAuthorityV1===true,"final authority marker missing");
expect(ctx.__sixBallSameDirectionAlwaysKeepsRigidity===true,"same-direction invariant marker missing");
expect(ctx.__sixBallSameDirectionBeatsProspectiveTwoPlusOne===true,"same-direction prospective 2+1 guard missing");
expect(ctx.__sixBallPositionFinalAlwaysReleasesRigidity===true,"position-final invariant marker missing");
expect(ctx.__sixBallSlopeTriangleAlwaysKeepsRigidity===true,"slope triangle invariant marker missing");
expect(ctx.__sixBallUpConvexSplitKeepsOppositePair===true,"up-convex side invariant marker missing");
expect(ctx.__sixBallPositionFinalMeansMissingSelectedProposal===true,"selected-event finalization marker missing");
expect(ctx.__sixBallUpConvexActiveSplitRequiresMiddleFiftyPercent===true,"middle-50% invariant marker missing");
expect(ctx.__sixBallUpConvexSplitRequiresCurrentBilateralPivotContact===true,"current bilateral contact invariant marker missing");
expect(ctx.__sixBallAirborneUpConvexTwoPlusOneIsForbidden===true,"airborne 2+1 invariant marker missing");
expect(ctx.__sixBallSplitDirectionPrecedesPairRigidity===true,"direction-before-pair invariant marker missing");
expect(ctx.__sixBallUpConvexPositionFinalReleaseExemptsContactBand===true,"position-final band exemption marker missing");
expect(ctx.__sixBallFallingRigidTriangleNeverRotates===true,"falling no-rotation invariant marker missing");
expect(ctx.__sixBallUpConvexOuterQuarterUsesRigidSlide===true,"outer-quarter rigid-slide invariant marker missing");
expect(ctx.__sixBallOuterQuarterRigidSlideBypassesPerMemberDownFilter===true,"rigid-slide atomic-settle marker missing");
expect(ctx.__sixBallUpPocketCaptureOverridesGeometricSide===false,"pocket geometric override remains enabled");
expect(ctx.__sixBallUpPocketCaptureRequiresMiddleFiftyPercent===true,"pocket middle-50% gate missing");
expect(ctx.__sixBallUpPocketCaptureRequiresCentralSeparator===true,"rigid pocket central separator gate missing");
expect(ctx.__sixBallUpConvexRigidApproachIsLastResort===false,"motion direction remains a split-side fallback");
expect(ctx.__sixBallFinalRigidityAuthorityVersion==="final-rigidity-authority-v8","final authority version mismatch");
console.log(`final rigidity production audit PASS ${cases.length}/${cases.length} sameDirection=${sameDirection} oppositeSplits=${oppositeSplits} activeCentralSplits=${activeCentralSplits} positionFinalSplits=${positionFinalSplits} rejectedOutsideBand=${rejectedOutsideBand} releasedFixed=${releasedFixed}`);
