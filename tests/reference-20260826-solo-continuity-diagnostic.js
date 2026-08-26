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

const result=vm.runInContext(`
(()=>{
  const game=createEngine(826401);game.state="PLAYING";

  // Nintendo F130 reconstruction.  The red lower member lands at [5,10]
  // between floor balls [4,11]/[6,11].  The blue support at [7,10] is itself
  // held by [6,11]/[8,11], so the green top at [6,9] has two real supports.
  // This is the support geometry visible in the reference and intentionally
  // differs from the earlier one-support diagnostic where the pair had to
  // keep sliding left for physical reasons.
  const support=mkBall(game,1);
  const floorL=mkBall(game,3),floorM=mkBall(game,3),floorR=mkBall(game,3);
  game.board[10][7]=support;noteBoardCell(game.board,10,support);
  for(const [x,b] of [[4,floorL],[6,floorM],[8,floorR]]){
    game.board[11][x]=b;noteBoardCell(game.board,11,b);
    game.vis.set(b.id,{x,y:11,vy:0,motionSpeed:0});
  }
  game.vis.set(support.id,{x:7,y:10,vy:0,motionSpeed:0});

  game.piece={x:6,y:9,rot:1,colors:[2,4,0]};
  game.freeX=5.18;game.pieceVX=5.18;game.dropT=0;
  lock(game,5);

  const choice={...(window.__sixBallLastReferenceUpConvexChoiceV1||{})};
  const soloId=Number(choice.contactSoloId)||0;
  const pairIds=[...(choice.pairIds||[])];
  function ballById(id){
    for(let y=boardScanMin(game.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const c=valid(x,y)?game.board[y][x]:null;if(c?.id===id)return c;
    }
    return null;
  }
  function logical(id){
    for(let y=boardScanMin(game.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const c=valid(x,y)?game.board[y][x]:null;if(c?.id===id)return[x,y];
    }
    return null;
  }
  function pos(id){
    const v=game.vis.get(id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))return[v.x,v.y];
    return logical(id);
  }
  function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
  function firstPath(id){
    const c=ballById(id),s=c?.fallPath?.[0];
    return s?{kind:s.kind,seq:s.motionSeq,from:s.from,to:s.to,referenceContinuation:!!s.referenceFirstContactSoloContinuationV3}:null;
  }
  function near(a,b,eps=2e-6){return !!a&&!!b&&physDist(a,b)<=eps;}

  const fps=window.__sixBallReferenceCaptureFps;
  const pairTarget=[[6,9],[5,10]],soloFirstTarget=[9,10],soloFinalTarget=[10,11];
  const dt=1/240,frames=[],events=[];
  let prevSolo=pos(soloId),lastMoveT=0,firstMoveT=null,totalDistance=0;
  let priorPath=JSON.stringify(firstPath(soloId));
  let pairArrivalT=null,soloFirstArrivalT=null,soloFinalArrivalT=null,maxPairDriftAfterArrival=0;

  for(let i=0;i<=120;i++){
    const t=i*dt,p=pos(soloId),pair=pairIds.map(pos);
    if(i>0&&p&&prevSolo){
      const d=physDist(p,prevSolo);totalDistance+=d;
      if(d>1e-7){if(firstMoveT===null)firstMoveT=t;lastMoveT=t;}
    }
    if(pairArrivalT===null&&near(pair[0],pairTarget[0])&&near(pair[1],pairTarget[1]))pairArrivalT=t;
    if(pairArrivalT!==null&&t>=pairArrivalT-1e-12){
      maxPairDriftAfterArrival=Math.max(maxPairDriftAfterArrival,physDist(pair[0],pairTarget[0]),physDist(pair[1],pairTarget[1]));
    }
    if(soloFirstArrivalT===null&&near(p,soloFirstTarget))soloFirstArrivalT=t;
    if(soloFinalArrivalT===null&&near(p,soloFinalTarget))soloFinalArrivalT=t;

    const pathNow=JSON.stringify(firstPath(soloId));
    if(pathNow!==priorPath){events.push({t,path:firstPath(soloId),state:game.state,phase:game.phase,p:[...p],pair:pair.map(q=>[...q])});priorPath=pathNow;}
    if(i%4===0)frames.push({t,p:[...p],pair:pair.map(q=>q?[...q]:null),state:game.state,phase:game.phase,path:firstPath(soloId)});
    prevSolo=p?[...p]:prevSolo;
    stepEngine(game,dt);
  }

  const continuation=events.find(e=>e.path?.referenceContinuation)||null;
  return{
    soloId,pairIds,choice,dt,firstMoveT,lastMoveT,totalDistance,
    pairArrivalT,soloFirstArrivalT,soloFinalArrivalT,maxPairDriftAfterArrival,
    pairTarget,soloFirstTarget,soloFinalTarget,
    finalPair:pairIds.map(pos),finalPairLogical:pairIds.map(logical),
    finalPos:pos(soloId),logicalFinal:logical(soloId),frames,events,continuation,
    supportGeometry:{support:[7,10],floor:[[4,11],[6,11],[8,11]]},
    timing:{
      fps,
      pairFrames:window.__sixBallReferenceFirstContactPairFrames,
      soloFrames:window.__sixBallReferenceFirstContactSoloFrames,
      continuationFrames:window.__sixBallReferenceSoloContinuationFrames,
      pairDuration:window.__sixBallReferenceFirstContactPairDuration,
      soloDuration:window.__sixBallReferenceFirstContactSoloDuration,
      continuationDuration:window.__sixBallReferenceSoloContinuationDuration,
      captured:window.__sixBallReferenceSoloContinuationUsesCapturedFrames
    },
    splitVersion:window.__sixBallReferenceUpConvexAuthorityVersion2,
    sweepVersion:window.__sixBallReferenceFirstContactSweepVersion
  };
})()
`,ctx);
console.log("NINTENDO_F126_F134_EXACT_BOARD",JSON.stringify(result));
function close(a,b,eps=1e-9){return Math.abs(Number(a)-Number(b))<=eps;}
if(!result.soloId)throw new Error("reference solo id missing");
if(result.choice.reason!=="reference-first-unilateral-contact")throw new Error("reference first-contact split not used");
if(result.timing.captured!==true)throw new Error("captured continuation timing marker missing");
if(result.timing.pairFrames!==4||result.timing.soloFrames!==5||result.timing.continuationFrames!==3)throw new Error("Nintendo F126/F130/F131/F134 frame budgets changed");
if(!close(result.timing.pairDuration,4/result.timing.fps)||!close(result.timing.soloDuration,5/result.timing.fps)||!close(result.timing.continuationDuration,3/result.timing.fps))throw new Error("captured frame durations are not exact");
if(!result.continuation||result.continuation.path?.kind!=="ROLL_RIGHT")throw new Error("immediate solo continuation was not tagged");

const pairExpected=4/result.timing.fps,soloFirstExpected=5/result.timing.fps,soloFinalExpected=8/result.timing.fps;
const tol=result.dt*1.1;
if(result.pairArrivalT===null||Math.abs(result.pairArrivalT-pairExpected)>tol)throw new Error(`pair F130 timing mismatch: got ${result.pairArrivalT}, expected ${pairExpected}`);
if(result.soloFirstArrivalT===null||Math.abs(result.soloFirstArrivalT-soloFirstExpected)>tol)throw new Error(`solo F131 timing mismatch: got ${result.soloFirstArrivalT}, expected ${soloFirstExpected}`);
if(result.soloFinalArrivalT===null||Math.abs(result.soloFinalArrivalT-soloFinalExpected)>tol)throw new Error(`solo F134 timing mismatch: got ${result.soloFinalArrivalT}, expected ${soloFinalExpected}`);
if(result.maxPairDriftAfterArrival>2e-6)throw new Error(`pair moved after Nintendo F130 rest: drift ${result.maxPairDriftAfterArrival}`);
if(JSON.stringify(result.finalPair)!==JSON.stringify(result.pairTarget))throw new Error("pair did not remain at Nintendo F130 cells");
if(JSON.stringify(result.finalPairLogical)!==JSON.stringify(result.pairTarget))throw new Error("pair logical cells diverged from Nintendo F130 cells");
if(JSON.stringify(result.finalPos)!==JSON.stringify(result.soloFinalTarget)||JSON.stringify(result.logicalFinal)!==JSON.stringify(result.soloFinalTarget))throw new Error("solo did not remain at Nintendo F134 final cell");
console.log("2026-08-26 Nintendo exact-board F126-F134 PASS",JSON.stringify({pairArrivalT:result.pairArrivalT,soloFirstArrivalT:result.soloFirstArrivalT,soloFinalArrivalT:result.soloFinalArrivalT,maxPairDriftAfterArrival:result.maxPairDriftAfterArrival,timing:result.timing,supportGeometry:result.supportGeometry}));
