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

  // Reference contact requires a support that is already part of a settled
  // pile. Put the pivot one row above the floor and support it with two floor
  // balls so settlePass cannot move the pivot itself.
  const support=mkBall(game,1),baseL=mkBall(game,3),baseR=mkBall(game,3);
  game.board[10][5]=support;noteBoardCell(game.board,10,support);
  game.board[11][4]=baseL;noteBoardCell(game.board,11,baseL);
  game.board[11][6]=baseR;noteBoardCell(game.board,11,baseR);
  game.vis.set(support.id,{x:5,y:10,vy:0,motionSpeed:0});
  game.vis.set(baseL.id,{x:4,y:11,vy:0,motionSpeed:0});
  game.vis.set(baseR.id,{x:6,y:11,vy:0,motionSpeed:0});

  // Same geometry as the measured F126 outer-right contact, translated down
  // and one doubled-x column left so the supporting pile can sit on the floor.
  game.piece={x:4,y:9,rot:1,colors:[2,4,0]};
  game.freeX=3.18;game.pieceVX=3.18;game.dropT=0;
  lock(game,5);

  const snapshot=[];
  for(let y=boardScanMin(game.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const cell=valid(x,y)?game.board[y][x]:null;
    if(!cell)continue;
    snapshot.push({id:cell.id,x,y,rigid:!!cell.rigid,size:Number(cell.motionGroupSize)||0,role:Number(cell.motionGroupRole),
      path:(cell.fallPath||[]).map(s=>({kind:s.kind,from:s.from,to:s.to,seq:s.motionSeq,size:s.groupSize,bundle:s.bundleId}))});
  }

  const batch=collectLiveMotionBatch(game);
  if(!batch)return{error:"no-live-batch",snapshot};
  const pair=batch.members.filter(m=>String(m.seg?.kind||"")==="REFERENCE_FIRST_CONTACT_PAIR");
  const solo=batch.members.find(m=>String(m.seg?.kind||"")==="REFERENCE_FIRST_CONTACT_SOLO")||null;
  if(pair.length!==2)return{error:"wrong-pair-count",pairCount:pair.length,kinds:batch.members.map(m=>m.seg?.kind),snapshot,
    choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})},signed:{...(window.__sixBallLastSignedHardDropContactV2||{})}};

  const states=new Map(batch.members.map(m=>[
    m.cell.id,
    {startState:{...m.startState},endState:{...m.endState},naturalDuration:m.duration}
  ]));
  let maxPairDistanceError=0,minPairDistance=Infinity,maxPairDistance=0,maxCommonBowMismatch=0;
  const samples=[];
  for(let i=0;i<=240;i++){
    const t=i/240;
    const p0=liveBatchPointAt(batch,pair[0],t,states,new Map(),new Set());
    const p1=liveBatchPointAt(batch,pair[1],t,states,new Map(),new Set());
    const d=Math.hypot((p0[0]-p1[0])*.5,(p0[1]-p1[1])*HEX_ROW_H);
    minPairDistance=Math.min(minPairDistance,d);maxPairDistance=Math.max(maxPairDistance,d);
    maxPairDistanceError=Math.max(maxPairDistanceError,Math.abs(d-1));

    // Strip only the v3 common bow by evaluating the v2/base segment. If the
    // two rendered members receive different bow amounts, rigidity is broken.
    const local0=Math.min(1,t*batch.duration/pair[0].duration);
    const local1=Math.min(1,t*batch.duration/pair[1].duration);
    const base0=liveSegPoint(pair[0].seg,local0,pair[0].startState,pair[0].duration);
    const base1=liveSegPoint(pair[1].seg,local1,pair[1].startState,pair[1].duration);
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
    maxPairDistanceError,minPairDistance,maxPairDistance,maxCommonBowMismatch,startErr,endErr,samples,snapshot,
    choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})},
    signed:{...(window.__sixBallLastSignedHardDropContactV2||{})},
    sweep:{...(window.__sixBallReferenceFirstContactSweepDiagnosticV3||{})}
  };
})()
`,ctx);

console.log("RENDERED_PAIR_DIAGNOSTIC",JSON.stringify(result));
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
