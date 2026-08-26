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
  const support=mkBall(game,1),baseL=mkBall(game,3),baseR=mkBall(game,3);
  game.board[10][5]=support;noteBoardCell(game.board,10,support);
  game.board[11][4]=baseL;noteBoardCell(game.board,11,baseL);
  game.board[11][6]=baseR;noteBoardCell(game.board,11,baseR);
  game.vis.set(support.id,{x:5,y:10,vy:0,motionSpeed:0});
  game.vis.set(baseL.id,{x:4,y:11,vy:0,motionSpeed:0});
  game.vis.set(baseR.id,{x:6,y:11,vy:0,motionSpeed:0});

  game.piece={x:4,y:9,rot:1,colors:[2,4,0]};
  game.freeX=3.18;game.pieceVX=3.18;game.dropT=0;
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

  const dt=1/240,frames=[],events=[];
  let prev=pos(soloId),lastMoveT=0,firstMoveT=null,zeroRun=0,maxZeroRun=0,totalDistance=0;
  let priorPath=JSON.stringify(firstPath(soloId));
  for(let i=0;i<=180;i++){
    const t=i*dt;
    const p=pos(soloId),pair=pairIds.map(pos);
    if(i>0&&p&&prev){
      const d=physDist(p,prev);totalDistance+=d;
      if(d>1e-7){if(firstMoveT===null)firstMoveT=t;lastMoveT=t;maxZeroRun=Math.max(maxZeroRun,zeroRun);zeroRun=0;}
      else zeroRun++;
    }
    const pathNow=JSON.stringify(firstPath(soloId));
    if(pathNow!==priorPath){events.push({t,path:firstPath(soloId),state:game.state,phase:game.phase,p:[...p]});priorPath=pathNow;}
    if(i%8===0)frames.push({t,p:[...p],pair:pair.map(q=>q?[...q]:null),state:game.state,phase:game.phase,path:firstPath(soloId)});
    prev=p?[...p]:prev;
    stepEngine(game,dt);
  }
  maxZeroRun=Math.max(maxZeroRun,zeroRun);
  const continuation=events.find(e=>e.path?.referenceContinuation)||null;
  return{
    soloId,pairIds,choice,
    dt,firstMoveT,lastMoveT,totalDistance,
    maxStationaryGapBeforeLastMove:maxZeroRun*dt,
    finalPos:pos(soloId),logicalFinal:logical(soloId),
    frames,events,continuation,
    timing:{
      fps:window.__sixBallReferenceCaptureFps,
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
console.log("SOLO_CONTINUITY_DIAGNOSTIC",JSON.stringify(result));
function close(a,b,eps=1e-9){return Math.abs(Number(a)-Number(b))<=eps;}
if(!result.soloId)throw new Error("reference solo id missing");
if(result.choice.reason!=="reference-first-unilateral-contact")throw new Error("reference first-contact split not used");
if(!(result.lastMoveT>0))throw new Error("solo never moved");
if(result.timing.captured!==true)throw new Error("captured continuation timing marker missing");
if(result.timing.pairFrames!==4||result.timing.soloFrames!==5||result.timing.continuationFrames!==3)throw new Error("Nintendo F126/F130/F131/F134 frame budgets changed");
if(!close(result.timing.pairDuration,4/result.timing.fps)||!close(result.timing.soloDuration,5/result.timing.fps)||!close(result.timing.continuationDuration,3/result.timing.fps))throw new Error("captured frame durations are not exact");
if(!result.continuation||result.continuation.path?.kind!=="ROLL_RIGHT")throw new Error("immediate solo continuation was not tagged");
const expectedFinal=8/result.timing.fps;
if(Math.abs(result.lastMoveT-expectedFinal)>result.dt*1.1)throw new Error(`solo F134 timing mismatch: got ${result.lastMoveT}, expected ${expectedFinal}`);
if(JSON.stringify(result.finalPos)!==JSON.stringify(result.logicalFinal))throw new Error("solo visual/logical final position mismatch");
console.log("2026-08-26 Nintendo solo F126-F134 continuity PASS",JSON.stringify({lastMoveT:result.lastMoveT,expectedFinal,timing:result.timing,continuation:result.continuation}));
