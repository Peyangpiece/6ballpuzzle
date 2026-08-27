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

  function member(id,duration,groupSize=0,bundleId=0,extraSeg={},extraCell={}){
    return {cell:{id,...extraCell},seg:{from:[0,0],to:[1,1],kind:"TEST_SLOPE",groupSize,bundleId,...extraSeg},duration};
  }

  const a=member(1,.10),b=member(2,.20);
  const batch={duration:.20,members:[a,b],byId:new Map([[1,a],[2,b]])};
  const states=new Map([
    [1,{startState:{vy:0,speed:0},naturalDuration:.10}],
    [2,{startState:{vy:0,speed:0},naturalDuration:.20}]
  ]);
  const ordinaryHalf=[liveBatchPointAt(batch,a,.5,states),liveBatchPointAt(batch,b,.5,states)];

  const p1=member(21,.10,0,0,{pileFlow:true}),p2=member(22,.20,0,0,{pileFlow:true});
  const pileBatch={duration:.20,members:[p1,p2],byId:new Map([[21,p1],[22,p2]])};
  const pileStates=new Map([
    [21,{startState:{vy:0,speed:0},naturalDuration:.10}],
    [22,{startState:{vy:0,speed:0},naturalDuration:.20}]
  ]);
  const pileHalf=[liveBatchPointAt(pileBatch,p1,.5,pileStates),liveBatchPointAt(pileBatch,p2,.5,pileStates)];

  const g1=member(31,.10,0,0,{}, {isGarbage:true}),g2=member(32,.20,0,0,{}, {isGarbage:true});
  const garbageBatch={duration:.20,members:[g1,g2],byId:new Map([[31,g1],[32,g2]])};
  const garbageStates=new Map([
    [31,{startState:{vy:0,speed:0},naturalDuration:.10}],
    [32,{startState:{vy:0,speed:0},naturalDuration:.20}]
  ]);
  const garbageHalf=[liveBatchPointAt(garbageBatch,g1,.5,garbageStates),liveBatchPointAt(garbageBatch,g2,.5,garbageStates)];

  return{early,late,ordinaryHalf,pileHalf,garbageHalf,flags:{
    smooth:window.__sixBallMotionSmoothnessAuthorityV1,
    natural:window.__sixBallIndependentLiveBatchUsesNaturalTime,
    rigid:window.__sixBallRigidCohortClockPreserved,
    pileLegacy:window.__sixBallPileMotionPreservesPreSmoothnessPath,
    garbageLegacy:window.__sixBallGarbageMotionPreservesPreSmoothnessPath,
    noBouncePileExclusion:window.__sixBallPileFlowExcludedFromNoBounceGuard,
    scope:window.__sixBallMotionSmoothnessScope
  }};
})()
`,ctx);

function near(a,b,e=1e-9){return Math.abs(a-b)<=e;}
if(!result.flags.smooth||!result.flags.natural||!result.flags.rigid)throw new Error("ordinary smoothness flags missing");
if(!result.flags.pileLegacy||!result.flags.garbageLegacy||!result.flags.noBouncePileExclusion)throw new Error("legacy pile/garbage preservation flags missing");
if(result.flags.scope!=="ordinary-non-pile-only")throw new Error("smoothness scope is not ordinary-only");

const expectedEarly=[0,.68359375,.9375,.99609375,1];
const expectedLate=[0,.00390625,.0625,.31640625,1];
for(let i=0;i<5;i++){
  if(!near(result.early[i],expectedEarly[i]))throw new Error("legacy early pile profile changed");
  if(!near(result.late[i],expectedLate[i]))throw new Error("legacy late pile profile changed");
}

if(!near(result.ordinaryHalf[0][0],1)||!near(result.ordinaryHalf[0][1],1))throw new Error("ordinary short motion no longer uses natural time");
if(!near(result.ordinaryHalf[1][0],.5)||!near(result.ordinaryHalf[1][1],.5))throw new Error("ordinary long motion timing changed");

for(const pair of [...result.pileHalf,...result.garbageHalf]){
  if(!near(pair[0],.5)||!near(pair[1],.5))throw new Error("pile/garbage batch timing was modified");
}

const app17=fs.readFileSync(path.join(__dirname,"../public/app-17.js"),"utf8");
if(app17.includes("if(seg?.pileFlow)continue;"))throw new Error("garbage pileFlow queue bypass was not reverted");
if(app17.includes("__hexdropGarbagePileFlowBypassesLegacySeqGate"))throw new Error("garbage bypass marker still exists");
if(!app17.includes("const seq=Number(seg?.motionSeq)||0;"))throw new Error("legacy garbage motionSeq queue missing");

console.log("ordinary smoothness + legacy pile/garbage regression PASS",JSON.stringify(result));
