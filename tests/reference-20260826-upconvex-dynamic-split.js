const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

for(const file of[
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js",
  "app-reference-upconvex-authority-v1.js"
]){
  vm.runInContext(
    fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),
    ctx,
    {filename:file}
  );
}

function expect(value,message){if(!value)throw new Error(message);}

const result=vm.runInContext(`
(()=>{
  function scenario(seed,bias,visualOffset,airborne=false){
    const game=createEngine(seed),gid=seed;
    const specs=[
      {x:6,y:3,c:0,role:0,name:"top"},
      {x:5,y:4,c:2,role:1,name:"left"},
      {x:7,y:4,c:3,role:2,name:"right"}
    ];
    const members=specs.map(spec=>{
      const ball=mkBall(game,spec.c);
      ball.motionGroupId=gid;
      ball.motionGroupRole=spec.role;
      ball.motionGroupOrientation="up";
      ball.motionGroupSize=3;
      ball.rigid=true;
      ball.impactOffsetX=.35;
      ball.momentumX=bias;
      ball.rollDir=bias;
      ball.subCellBias=bias;
      game.board[spec.y][spec.x]=ball;
      noteBoardCell(game.board,spec.y,ball);
      game.vis.set(ball.id,{
        x:spec.x+visualOffset,
        y:spec.y+(airborne?-3:0),
        vy:airborne?2:0,
        motionSpeed:airborne?2:0
      });
      return{ball,x:spec.x,y:spec.y,role:spec.role,orientation:"up",name:spec.name};
    });
    const support=mkBall(game,4);
    game.board[5][6]=support;
    noteBoardCell(game.board,5,support);
    game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
    game._visualMovingIds=airborne?new Set(members.map(m=>m.ball.id)):new Set();
    game._liveBatchClock=airborne
      ?{elapsed:0,duration:1,states:new Map(members.map(m=>[m.ball.id,{}]))}
      :{elapsed:0,duration:0,states:new Map()};

    const plan=hexPhysPlanGroup(game.board,members,false)||[];
    const pairSteps=plan.filter(step=>Number(step.groupSize)===2);
    const pair=pairSteps.map(step=>step.ball.id).sort((a,b)=>a-b);
    const solo=plan.find(step=>Number(step.groupSize)===0);
    let maxPairDistanceError=0;
    if(pairSteps.length===2){
      for(let i=0;i<=60;i++){
        const t=i/60,p0=proposalPointAt(pairSteps[0],t),p1=proposalPointAt(pairSteps[1],t);
        maxPairDistanceError=Math.max(maxPairDistanceError,Math.abs(Math.hypot(p0[0]-p1[0],p0[1]-p1[1])-1));
      }
    }
    return{
      count:plan.length,
      pair,
      soloId:solo?.ball?.id??null,
      topId:members[0].ball.id,
      leftId:members[1].ball.id,
      rightId:members[2].ball.id,
      maxPairDistanceError,
      rigid3:members.every(m=>m.ball.rigid&&m.ball.motionGroupSize===3),
      state:members.map(m=>({id:m.ball.id,rigid:!!m.ball.rigid,size:Number(m.ball.motionGroupSize)||0,gid:Number(m.ball.motionGroupId)||0})),
      choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})}
    };
  }
  return{
    momentumLeft:scenario(826001,-1,.35,false),
    momentumRight:scenario(826002,1,.35,false),
    airborne:scenario(826003,-1,.35,true),
    version:window.__sixBallReferenceUpConvexAuthorityVersion,
    contactAlwaysSolo:window.__sixBallCurrentContactBallAlwaysBecomesSolo,
    kinematic:window.__sixBallReferenceSplitUsesKinematicContinuity,
    v21:window.__sixBallFinalRigidityAuthorityVersion
  };
})()
`,ctx);

expect(result.version==="reference-upconvex-authority-v1","reference up-convex authority not loaded");
expect(result.v21==="final-rigidity-authority-v21","v21 safety authority must remain underneath reference choice");
expect(result.contactAlwaysSolo===false,"contact-side solo is still exposed as an absolute invariant");
expect(result.kinematic===true,"kinematic reference selector flag missing");

expect(result.momentumLeft.count===3,"left-momentum current contact did not split");
expect(JSON.stringify(result.momentumLeft.pair)===JSON.stringify([
  result.momentumLeft.topId,result.momentumLeft.leftId
].sort((a,b)=>a-b)),"left-moving top did not keep the left lower ball as the rigid pair");
expect(result.momentumLeft.soloId===result.momentumLeft.rightId,"left-moving reference case did not release the right lower ball");
expect(result.momentumLeft.choice.reason==="reference-kinematic-side-overrode-contact-side","reference selector did not record an evidence-backed override");
expect(result.momentumLeft.maxPairDistanceError<1e-9,"selected rigid pair stretched during its authored path");

expect(result.momentumRight.count===3,"right-momentum current contact did not split");
expect(JSON.stringify(result.momentumRight.pair)===JSON.stringify([
  result.momentumRight.topId,result.momentumRight.rightId
].sort((a,b)=>a-b)),"right-moving top should retain the safe contact-side v21 pair");
expect(result.momentumRight.soloId===result.momentumRight.leftId,"right-moving reference case released the wrong lower ball");
expect(result.momentumRight.maxPairDistanceError<1e-9,"baseline rigid pair stretched during its authored path");

expect(result.airborne.count===0,"reference selector reintroduced an airborne split");
expect(result.airborne.rigid3,"reference selector broke three-ball rigidity while visually airborne");

console.log("2026-08-26 Nintendo-reference dynamic UP-convex split PASS",JSON.stringify(result));
