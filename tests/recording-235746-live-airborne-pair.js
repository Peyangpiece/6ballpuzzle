const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

for(const file of[
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

function expect(value,message){if(!value)throw new Error(message);}

const result=vm.runInContext(`
(()=>{
  const game=createEngine(235746);
  const gid=235746;
  const specs=[
    {x:6,y:3,c:0,role:0,name:"red-top"},
    {x:5,y:4,c:2,role:1,name:"green-left"},
    {x:7,y:4,c:3,role:2,name:"yellow-right"}
  ];
  const members=specs.map(spec=>{
    const ball=mkBall(game,spec.c);
    ball.motionGroupId=gid;
    ball.motionGroupRole=spec.role;
    ball.motionGroupOrientation="up";
    ball.motionGroupSize=3;
    ball.rigid=true;
    ball.impactOffsetX=.35;
    game.board[spec.y][spec.x]=ball;
    noteBoardCell(game.board,spec.y,ball);
    game.vis.set(ball.id,{
      x:spec.x+.35,y:spec.y-3,vy:2,motionSpeed:2
    });
    return{ball,x:spec.x,y:spec.y,role:spec.role,orientation:"up",name:spec.name};
  });
  const support=mkBall(game,4);
  game.board[5][6]=support;
  noteBoardCell(game.board,5,support);
  game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
  game._visualMovingIds=new Set(members.map(member=>member.ball.id));
  game._liveBatchClock={
    elapsed:0,duration:1,
    states:new Map(members.map(member=>[member.ball.id,{}]))
  };

  const airborne=hexPhysPlanGroup(game.board,members,false)||[];
  const rigidInAir=members.every(member=>
    member.ball.rigid&&member.ball.motionGroupSize===3
  );

  game._visualMovingIds.clear();
  game._liveBatchClock.elapsed=1;
  for(const member of members){
    const visual=game.vis.get(member.ball.id);
    visual.x=member.x+.35;
    visual.y=member.y;
    visual.vy=0;
    visual.motionSpeed=0;
  }
  const contact=hexPhysPlanGroup(game.board,members,false)||[];
  const pair=contact
    .filter(step=>Number(step.groupSize)===2)
    .map(step=>step.ball.id)
    .sort((a,b)=>a-b);
  const solo=contact.find(step=>Number(step.groupSize)===0);

  return{
    airborneCount:airborne.length,
    rigidInAir,
    pair,
    expectedPair:[members[0].ball.id,members[2].ball.id].sort((a,b)=>a-b),
    soloId:solo?.ball?.id??null,
    expectedSoloId:members[1].ball.id,
    version:window.__sixBallFinalRigidityAuthorityVersion,
    soleAuthority:window.__sixBallFinalUpConvexIsSoleMutationAuthority,
    reason:window.__sixBallLastFinalRigidityCorrectionV1?.reason||null
  };
})()
`,ctx);

expect(result.airborneCount===0,"recording 23:57:46 split while visually airborne");
expect(result.rigidInAir,"recording 23:57:46 lost three-ball rigidity in air");
expect(JSON.stringify(result.pair)===JSON.stringify(result.expectedPair),"recording 23:57:46 kept the reversed pair");
expect(result.soloId===result.expectedSoloId,"recording 23:57:46 did not make the contacted green-left ball solo");
expect(result.version==="final-rigidity-authority-v20","v20 final authority is not active");
expect(result.soleAuthority===true,"obsolete UP-convex layer can still mutate the pair");

const gridResult=vm.runInContext(`
(()=>{
  function scenario(seed,gid,logicalOffset,visualOffset,rowOffset){
    const game=createEngine(seed);
    const specs=[
      {x:6,y:3,c:0,role:0},
      {x:5,y:4,c:2,role:1},
      {x:7,y:4,c:3,role:2}
    ];
    const members=specs.map(spec=>{
      const ball=mkBall(game,spec.c);
      ball.motionGroupId=gid;
      ball.motionGroupRole=spec.role;
      ball.motionGroupOrientation="up";
      ball.motionGroupSize=3;
      ball.rigid=true;
      ball.impactOffsetX=logicalOffset;
      game.board[spec.y][spec.x]=ball;
      noteBoardCell(game.board,spec.y,ball);
      game.vis.set(ball.id,{
        x:spec.x+visualOffset,y:spec.y+rowOffset,vy:0,motionSpeed:0
      });
      return{ball,x:spec.x,y:spec.y,role:spec.role,orientation:"up"};
    });
    const support=mkBall(game,4);
    game.board[5][6]=support;
    noteBoardCell(game.board,5,support);
    game.vis.set(support.id,{x:6,y:5+rowOffset,vy:0,motionSpeed:0});
    game._visualMovingIds=new Set();
    game._liveBatchClock={elapsed:0,duration:0,states:new Map()};
    const plan=hexPhysPlanGroup(game.board,members,false)||[];
    const pair=plan.filter(step=>Number(step.groupSize)===2)
      .map(step=>step.ball.id).sort((a,b)=>a-b);
    const solo=plan.find(step=>Number(step.groupSize)===0);
    return{
      count:plan.length,
      rigid:members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),
      pair,soloId:solo?.ball?.id??null,
      topId:members[0].ball.id,leftId:members[1].ball.id,rightId:members[2].ball.id,
      correction:{...(window.__sixBallLastFinalRigidityCorrectionV1||{})}
    };
  }
  return{
    oneRowAhead:scenario(235747,235747,.35,.35,-1),
    reversedLogicalSide:scenario(235748,235748,.35,-.35,0)
  };
})()
`,ctx);

expect(gridResult.oneRowAhead.count===0,"one-row logical lead split in air in the production runtime");
expect(gridResult.oneRowAhead.rigid,"one-row logical lead broke production triplet rigidity");
expect(gridResult.oneRowAhead.correction.airborneReason==="displayed-contact-grid-not-current","production runtime missed the grid-ahead cause");
expect(gridResult.reversedLogicalSide.soloId===gridResult.reversedLogicalSide.rightId,"live right contact did not override the reversed logical side");
expect(JSON.stringify(gridResult.reversedLogicalSide.pair)===JSON.stringify([
  gridResult.reversedLogicalSide.topId,gridResult.reversedLogicalSide.leftId
].sort((a,b)=>a-b)),"live right contact kept the reversed production pair");
expect(gridResult.reversedLogicalSide.correction.contactSideSource==="live-visual-right-hit-fraction","production side was not derived from live visuals");

console.log("recording 23:57:46 live/grid/opposite-pair regression PASS",JSON.stringify({result,gridResult}));
