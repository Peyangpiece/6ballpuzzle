const fs = require("fs");
const vm = require("vm");
const path = require("path");
const {ctx} = require("./v1303-plan-group-smoke.js");

for(const file of [
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js"
]){
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../public", file), "utf8"),
    ctx,
    {filename:file}
  );
}

function expect(value, message){
  if(!value) throw new Error(message);
}

function ball(id, c, extra={}){
  return {
    id,
    c,
    isGarbage:false,
    motionGroupId:0,
    motionGroupRole:-1,
    motionGroupOrientation:"",
    motionGroupSize:0,
    rigid:false,
    momentumX:0,
    rollDir:0,
    subCellBias:0,
    ...extra
  };
}

function makeFixture(preview){
  const board = ctx.__v1303OracleNewBoard();
  const group = 114711;
  const common = {
    motionGroupId:group,
    motionGroupOrientation:"up",
    motionGroupSize:3,
    rigid:true,
    impactOffsetX:0
  };
  const members = [
    {ball:ball(1147101, 1, {...common, motionGroupRole:0}), x:4, y:3, role:0, orientation:"up"},
    {ball:ball(1147102, 3, {...common, motionGroupRole:1}), x:3, y:4, role:1, orientation:"up"},
    {ball:ball(1147103, 0, {...common, motionGroupRole:2}), x:5, y:4, role:2, orientation:"up"}
  ];
  for(const member of members) board[member.y][member.x] = member.ball;

  // The pile geometry visible in ScreenRecording_08-25-2026 11-47-11_1.mov.
  // The first red support is diagonally down/right from the triplet's lower
  // red member; every cell on the left slope is open.
  const pile = [
    [6,5,0], [8,5,0],
    [5,6,0], [7,6,1], [9,6,4],
    [4,7,1], [6,7,4], [8,7,2], [10,7,1], [12,7,4], [14,7,3], [16,7,4]
  ];
  let pileId = 1147200;
  for(const [x,y,c] of pile) board[y][x] = ball(pileId++, c);
  for(let y=8; y<12; y++){
    for(let x=0; x<19; x++){
      if(ctx.__v1303OracleValid(x,y) && !board[y][x]){
        board[y][x] = ball(pileId++, (x+y)%5);
      }
    }
  }

  const motions = members.map(member =>
    ctx.hexPhysIndependentMemberMotion(board, members, member)
  );
  const canonicalSlope = ctx.hexPhysRigidSlopePlan(board, members, motions);
  ctx.__sixBallLastFinalRigidityCorrectionV1 = null;
  const plan = ctx.hexPhysPlanGroup(board, members, preview) || [];
  return {board, members, motions, canonicalSlope, plan};
}

function canonical(plan){
  return plan.map(step => ({
    id:step.ball.id,
    from:[step.x, step.y],
    to:[step.tx, step.ty],
    vector:[step.tx-step.x, step.ty-step.y],
    kind:step.kind,
    pivot:step.pivot || step.topPivot || null,
    groupSize:Number(step.groupSize) || 0,
    bundleId:Number(step.bundleId) || 0
  })).sort((a,b) => a.id-b.id);
}

const preview = makeFixture(true);
const commit = makeFixture(false);

expect(
  JSON.stringify(canonical(preview.plan)) === JSON.stringify(canonical(commit.plan)),
  "recording fixture preview and commit disagree"
);
expect(
  commit.plan.length === 3,
  "recording fixture split or stopped: " + JSON.stringify({
    motions:canonical(commit.motions.filter(Boolean)),
    canonicalSlope:canonical(commit.canonicalSlope || []),
    plan:canonical(commit.plan)
  })
);
expect(
  commit.plan.every(step =>
    step.tx-step.x === -1 &&
    step.ty-step.y === 1 &&
    step.groupSize === 3 &&
    step.bundleId === 114711
  ),
  "recording fixture did not descend left as one rigid triplet: " +
    JSON.stringify(canonical(commit.plan))
);
expect(
  commit.members.every(member =>
    member.ball.rigid &&
    member.ball.motionGroupId === 114711 &&
    member.ball.motionGroupSize === 3
  ),
  "recording fixture lost rigid metadata"
);

// lock() hands the first motion to the renderer from a fractional contact
// point. Even there, all three paths must be the same translation: no member
// may orbit around another and rotate the visible triangle.
const releaseOffset = [.18, .14];
const visualSegments = commit.plan.map(step => ({
  from:[step.x+releaseOffset[0], step.y+releaseOffset[1]],
  to:[step.tx, step.ty],
  pivot:step.pivot ? [...step.pivot] : null,
  topPivot:step.topPivot ? [...step.topPivot] : null,
  kind:step.kind
}));
const visualDurations = visualSegments.map(segment =>
  ctx.hexMotionDuration(segment, {vy:2,speed:2})
);
const initialVisualPose = visualSegments.map(segment => [...segment.from]);
for(let frame=0; frame<=120; frame++){
  const t = frame/120;
  const points = visualSegments.map((segment,index) =>
    ctx.liveSegPoint(segment,t,{vy:2,speed:2},visualDurations[index])
  );
  for(let i=0; i<points.length; i++) for(let j=i+1; j<points.length; j++){
    expect(
      Math.abs((points[i][0]-points[j][0])-
        (initialVisualPose[i][0]-initialVisualPose[j][0])) < 1e-9 &&
      Math.abs((points[i][1]-points[j][1])-
        (initialVisualPose[i][1]-initialVisualPose[j][1])) < 1e-9,
      "recording first descent visually rotated the rigid triplet: " +
        JSON.stringify({frame,points,initialVisualPose})
    );
  }
}

const cascading = makeFixture(false);
const groupIds = new Set(cascading.members.map(member => member.ball.id));
const steps = [];
for(let guard=0; guard<3; guard++){
  const current = [];
  for(let y=0; y<12; y++) for(let x=0; x<19; x++){
    const boardBall = cascading.board[y]?.[x];
    if(boardBall && groupIds.has(boardBall.id)){
      current.push({
        ball:boardBall,
        x,y,
        role:boardBall.motionGroupRole,
        orientation:boardBall.motionGroupOrientation
      });
    }
  }
  if(current.length !== 3) break;
  const next = ctx.hexPhysPlanGroup(cascading.board, current, true) || [];
  steps.push(canonical(next));
  expect(next.length === 3 && next.every(step =>
    step.tx-step.x === -1 &&
    step.ty-step.y === 1 &&
    step.groupSize === 3
  ), "recording cascade split before the left wall: " + JSON.stringify(steps));
  expect(ctx.settlePass(cascading.board, false),
    "recording cascade resolver rejected the left rigid step");
  expect(cascading.members.every(member =>
    member.ball.rigid &&
    member.ball.motionGroupSize === 3 &&
    member.ball.motionGroupOrientation === "up"
  ), "recording cascade rotated or released the UP triplet during descent");
}
expect(
  steps.length === 3 && steps.every(plan => plan.length === 3),
  "recording triplet did not complete three rigid left-slope steps: " +
    JSON.stringify(steps)
);
const finalPositionsBefore = new Map();
for(let y=0; y<12; y++) for(let x=0; x<19; x++){
  const boardBall = cascading.board[y]?.[x];
  if(boardBall && groupIds.has(boardBall.id)){
    finalPositionsBefore.set(boardBall.id, `${x},${y}`);
  }
}
ctx.settlePass(cascading.board, false);
const finalPositionsAfter = new Map();
for(let y=0; y<12; y++) for(let x=0; x<19; x++){
  const boardBall = cascading.board[y]?.[x];
  if(boardBall && groupIds.has(boardBall.id)){
    finalPositionsAfter.set(boardBall.id, `${x},${y}`);
  }
}
expect(
  JSON.stringify([...finalPositionsAfter]) === JSON.stringify([...finalPositionsBefore]),
  "recording triplet separated after reaching its final left-wall position: " +
    JSON.stringify({before:[...finalPositionsBefore], after:[...finalPositionsAfter]})
);
expect(
  cascading.members.every(member =>
    !member.ball.rigid &&
    member.ball.motionGroupId === 0 &&
    member.ball.motionGroupSize === 0
  ),
  "recording triplet retained rigidity after its final wall position"
);

console.log(
  "recording 11:47:11 left-rigid regression PASS " +
  JSON.stringify({first:canonical(commit.plan), cascadeSteps:steps.length})
);
