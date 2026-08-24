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

let sameDirection=0;
let releasedFixed=0;

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
  const commit=canonical(ctx.hexPhysPlanGroup(
    commitFixture.board,commitFixture.members,false
  ));
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
    if(step?.groupSize>=2){
      expect(state.rigid&&state.size===step.groupSize,`case ${input.index}: moving cohort lost rigidity`);
    }else{
      expect(!state.rigid&&state.group===0&&state.size===0,`case ${input.index}: fixed/solo member retained rigidity`);
      if(!step)releasedFixed++;
    }
  }

  const vectors=independent.map(step=>step&&`${step.tx-step.x},${step.ty-step.y}`);
  if(independent.every(Boolean)&&new Set(vectors).size===1){
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
expect(ctx.__sixBallPositionFinalAlwaysReleasesRigidity===true,"position-final invariant marker missing");
console.log(`final rigidity production audit PASS ${cases.length}/${cases.length} sameDirection=${sameDirection} releasedFixed=${releasedFixed}`);
