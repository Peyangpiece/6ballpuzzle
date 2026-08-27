const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

for(const file of[
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js",
  "app-reference-upconvex-authority-v1.js",
  "app-reference-first-contact-sweep-v3.js",
  "app-reference-inverted-flat-split-v1.js",
  "app-rigidity-nintendo-authority-v1.js",
  "app-rigidity-release-bounce-authority-v1.js",
  "app-motion-smoothness-authority-v1.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

const result=vm.runInContext(`
(()=>{
  const early=[0,.25,.5,.75,1].map(q=>pileGravityLateralProgress({pileGravityLateralMode:"early"},q));
  const late=[0,.25,.5,.75,1].map(q=>pileGravityLateralProgress({pileGravityLateralMode:"late"},q));

  function member(id,duration,groupSize=0,bundleId=0){
    return {cell:{id},seg:{from:[0,0],to:[1,1],kind:"TEST_SLOPE",groupSize,bundleId},duration};
  }
  const a=member(1,.10),b=member(2,.20);
  const batch={duration:.20,members:[a,b],byId:new Map([[1,a],[2,b]])};
  const states=new Map([
    [1,{startState:{vy:0,speed:0},naturalDuration:.10}],
    [2,{startState:{vy:0,speed:0},naturalDuration:.20}]
  ]);
  const aHalf=liveBatchPointAt(batch,a,.5,states);
  const bHalf=liveBatchPointAt(batch,b,.5,states);

  const r1=member(11,.10,3,77),r2=member(12,.20,3,77),r3=member(13,.15,3,77);
  const rigidBatch={duration:.20,members:[r1,r2,r3],byId:new Map([[11,r1],[12,r2],[13,r3]])};
  const rigidStates=new Map([
    [11,{startState:{vy:0,speed:0},naturalDuration:.10}],
    [12,{startState:{vy:0,speed:0},naturalDuration:.20}],
    [13,{startState:{vy:0,speed:0},naturalDuration:.15}]
  ]);
  const rigidAtHalf=[r1,r2,r3].map(m=>liveBatchPointAt(rigidBatch,m,.5,rigidStates));

  return{early,late,aHalf,bHalf,rigidAtHalf,flags:{
    smooth:window.__sixBallMotionSmoothnessAuthorityV1,
    natural:window.__sixBallIndependentLiveBatchUsesNaturalTime,
    rigid:window.__sixBallRigidCohortClockPreserved
  }};
})()
`,ctx);

function near(a,b,e=1e-9){return Math.abs(a-b)<=e;}
if(!result.flags.smooth||!result.flags.natural||!result.flags.rigid)throw new Error("smoothness authority flags missing");
const expectedEarly=[0,.4375,.75,.9375,1],expectedLate=[0,.0625,.25,.5625,1];
for(let i=0;i<5;i++){
  if(!near(result.early[i],expectedEarly[i]))throw new Error("early profile mismatch");
  if(!near(result.late[i],expectedLate[i]))throw new Error("late profile mismatch");
}
if(!near(result.aHalf[0],1)||!near(result.aHalf[1],1))throw new Error("short independent slope was stretched to slowest batch member");
if(!(result.bHalf[0]>0&&result.bHalf[0]<1&&result.bHalf[1]>0&&result.bHalf[1]<1))throw new Error("long independent slope did not remain in flight");
const dx12=Math.abs(result.rigidAtHalf[0][0]-result.rigidAtHalf[1][0]);
const dx13=Math.abs(result.rigidAtHalf[0][0]-result.rigidAtHalf[2][0]);
if(dx12>1e-9||dx13>1e-9)throw new Error("rigid cohort clocks diverged");

const app17=fs.readFileSync(path.join(__dirname,"../public/app-17.js"),"utf8");
if(!app17.includes("if(seg?.pileFlow)continue;"))throw new Error("garbage pileFlow still passes through legacy motionSeq gate");
if(!app17.includes("__hexdropGarbagePileFlowBypassesLegacySeqGate=true"))throw new Error("garbage smoothness marker missing");

console.log("motion smoothness regression PASS",JSON.stringify(result));
