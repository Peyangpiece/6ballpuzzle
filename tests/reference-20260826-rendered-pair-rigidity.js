const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");
for(const file of[
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js",
  "app-reference-upconvex-authority-v1.js",
  "app-reference-first-contact-sweep-v3.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

function expect(v,msg){if(!v)throw new Error(msg);}

const result=vm.runInContext(`
(()=>{
  const game=createEngine(826301);game.state="PLAYING";
  const support=mkBall(game,1);
  game.board[5][6]=support;noteBoardCell(game.board,5,support);
  game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});

  game.piece={x:5,y:4,rot:1,colors:[2,4,0]};
  game.freeX=4.18;game.pieceVX=4.18;game.dropT=0;
  lock(game,5);

  const batch=collectLiveMotionBatch(game);
  if(!batch)return{error:"no-live-batch"};
  const pair=batch.members.filter(m=>String(m.seg?.kind||"")==="REFERENCE_FIRST_CONTACT_PAIR");
  const solo=batch.members.find(m=>String(m.seg?.kind||"")==="REFERENCE_FIRST_CONTACT_SOLO")||null;
  if(pair.length!==2)return{error:"wrong-pair-count",pairCount:pair.length,kinds:batch.members.map(m=>m.seg?.kind)};

  const states=new Map(batch.members.map(m=>[
    m.cell.id,
    {startState:{...m.startState},endState:{...m.endState},naturalDuration:m.duration}
  ]));
  let maxPairDistanceError=0,minPairDistance=Infinity,maxPairDistance=0;
  let maxCommonBowMismatch=0;
  const samples=[];
  for(let i=0;i<=240;i++){
    const t=i/240;
    const p0=liveBatchPointAt(batch,pair[0],t,states,new Map(),new Set());
    const p1=liveBatchPointAt(batch,pair[1],t,states,new Map(),new Set());
    const d=Math.hypot((p0[0]-p1[0])*.5,(p0[1]-p1[1])*HEX_ROW_H);
    minPairDistance=Math.min(minPairDistance,d);maxPairDistance=Math.max(maxPairDistance,d);
    maxPairDistanceError=Math.max(maxPairDistanceError,Math.abs(d-1));

    const base0=liveSegPoint(pair[0].seg,Math.min(1,t*batch.duration/pair[0].duration),pair[0].startState,pair[0].duration);
    const base1=liveSegPoint(pair[1].seg,Math.min(1,t*batch.duration/pair[1].duration),pair[1].startState,pair[1].duration);
    maxCommonBowMismatch=Math.max(maxCommonBowMismatch,Math.abs((p0[0]-base0[0])-(p1[0]-base1[0])));
    if(i%60===0)samples.push({t,p0,p1,d});
  }

  const pStart0=liveBatchPointAt(batch,pair[0],0,states,new Map(),new Set());
  const pStart1=liveBatchPointAt(batch,pair[1],0,states,new Map(),new Set());
  const pEnd0=liveBatchPointAt(batch,pair[0],1,states,new Map(),new Set());
  const pEnd1=liveBatchPointAt(batch,pair[1],1,states,new Map(),new Set());
  const startErr=Math.max(
    Math.hypot(pStart0[0]-pair[0].seg.from[0],pStart0[1]-pair[0].seg.from[1]),
    Math.hypot(pStart1[0]-pair[1].seg.from[0],pStart1[1]-pair[1].seg.from[1])
  );
  const endErr=Math.max(
    Math.hypot(pEnd0[0]-pair[0].seg.to[0],pEnd0[1]-pair[0].seg.to[1]),
    Math.hypot(pEnd1[0]-pair[1].seg.to[0],pEnd1[1]-pair[1].seg.to[1])
  );

  return{
    pairIds:pair.map(m=>m.cell.id),soloId:solo?.cell?.id??null,
    pairDuration:Math.max(...pair.map(m=>m.duration)),soloDuration:solo?.duration??null,batchDuration:batch.duration,
    maxPairDistanceError,minPairDistance,maxPairDistance,maxCommonBowMismatch,startErr,endErr,
    samples,
    choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})},
    signed:{...(window.__sixBallLastSignedHardDropContactV2||{})},
    sweep:{...(window.__sixBallReferenceFirstContactSweepDiagnosticV3||{})}
  };
})()
`,ctx);

expect(!result.error,"rendered trajectory setup failed: "+JSON.stringify(result));
expect(result.pairIds.length===2,"rendered pair not found");
expect(result.soloId!==null,"rendered solo not found");
expect(result.choice.reason==="reference-first-unilateral-contact","rendered test did not use reference first-contact authority");
expect(result.maxPairDistanceError<1e-9,"rendered pair spacing drifted: "+result.maxPairDistanceError);
expect(result.maxCommonBowMismatch<1e-9,"pair members did not receive the same tangent bow");
expect(result.startErr<1e-9,"rendered pair jumps at first-contact handoff");
expect(result.endErr<1e-9,"rendered pair misses canonical landing targets");
expect(result.sweep.hit===false,"rendered reference sweep reports support penetration");
expect(result.sweep.minDistance>=.9994,"rendered reference sweep violates support clearance");
expect(result.soloDuration>result.pairDuration,"solo should continue after the pair reaches its first landing");

console.log("2026-08-26 rendered Nintendo pair rigidity PASS",JSON.stringify(result));
