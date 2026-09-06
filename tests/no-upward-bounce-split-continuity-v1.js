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
  "app-motion-smoothness-authority-v1.js",
  "app-no-upward-bounce-split-authority-v1.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

function expect(v,msg){if(!v)throw new Error(msg);}

const result=vm.runInContext(`
(()=>{
  function dist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
  function pos(g,id){const v=g.vis.get(id);return v?[Number(v.x),Number(v.y)]:null;}
  function logical(g,id){
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const c=valid(x,y)?g.board[y][x]:null;if(c?.id===id)return[x,y];
    }
    return null;
  }
  function ballById(g,id){
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const c=valid(x,y)?g.board[y][x]:null;if(c?.id===id)return c;
    }
    return null;
  }

  /* Direct reproduction of the render-only upward shove:
   * one ordinary moving ball slightly overlaps a settled lower neighbour.
   * The final authority must keep Y monotonic and resolve any real remaining
   * penetration horizontally. */
  const contact=createEngine(831001);contact.state="RESOLVING";contact.phase="SETTLE";
  const moving=mkBall(contact,2),support=mkBall(contact,1);
  contact.board[8][7]=moving;noteBoardCell(contact.board,8,moving);
  contact.board[9][8]=support;noteBoardCell(contact.board,9,support);
  contact.vis.set(moving.id,{x:7,y:8.22,vy:1,motionSpeed:1});
  contact.vis.set(support.id,{x:8,y:9,vy:0,motionSpeed:0});
  moving.fallPath=[{from:[7,8.22],to:[6,9],kind:"ROLL_LEFT",pivot:[8,9],topPivot:null,motionSeq:7001,groupSize:0,bundleId:0}];
  contact._visualMovingIds=new Set([moving.id]);
  const contactBefore=pos(contact,moving.id);
  resolveVisualContacts(contact);
  const contactAfter=pos(contact,moving.id);
  const contactSupport=pos(contact,support.id);
  const contactDistance=dist(contactAfter,contactSupport);
  const contactDiag={...(window.__sixBallLastNoUpwardBounceVisualV1||{})};

  /* Exact Nintendo F126-style first unilateral contact, exercised through the
   * complete stepEngine render/contact pipeline rather than liveSegPoint alone. */
  const game=createEngine(831002);game.state="PLAYING";
  const blue=mkBall(game,1),floorL=mkBall(game,3),floorM=mkBall(game,3),floorR=mkBall(game,3);
  game.board[10][7]=blue;noteBoardCell(game.board,10,blue);
  for(const [x,b] of [[4,floorL],[6,floorM],[8,floorR]]){
    game.board[11][x]=b;noteBoardCell(game.board,11,b);
    game.vis.set(b.id,{x,y:11,vy:0,motionSpeed:0});
  }
  game.vis.set(blue.id,{x:7,y:10,vy:0,motionSpeed:0});
  game.piece={x:6,y:9,rot:1,colors:[2,4,0]};
  game.freeX=5.18;game.pieceVX=5.18;game.dropT=0;
  lock(game,5);

  const refChoice={...(window.__sixBallLastReferenceUpConvexChoiceV1||{})};
  const rigidityChoice={...(window.__sixBallLastNintendoRigidityDecision||{})};
  const choice=refChoice.reason?refChoice:{
    reason:rigidityChoice.reason||"",
    contactSoloId:Number(rigidityChoice.soloId)||0,
    pairIds:[...(rigidityChoice.pairIds||[])],
    source:"nintendo-final-rigidity"
  };
  const soloId=Number(choice.contactSoloId)||0,pairIds=[...(choice.pairIds||[])];
  const activeIds=[...pairIds,soloId];
  const initial=new Map(activeIds.map(id=>[id,pos(game,id)]));
  const pairInitial=pairIds.map(id=>pos(game,id));
  let upward=0,maxPairError=0;
  let firstTickSolo=0,firstTickPair=0;
  let soloIdleTicks=0,maxSoloIdleRun=0,currentIdle=0;
  let soloReachedFinal=false;
  let previous=new Map(activeIds.map(id=>[id,pos(game,id)]));
  const samples=[];
  const dt=1/240;

  for(let i=1;i<=90;i++){
    stepEngine(game,dt);
    const now=new Map(activeIds.map(id=>[id,pos(game,id)]));
    for(const id of activeIds){
      const a=previous.get(id),b=now.get(id);
      if(a&&b&&b[1]<a[1]-1e-9)upward++;
    }
    const pp=pairIds.map(id=>now.get(id));
    if(pp[0]&&pp[1])maxPairError=Math.max(maxPairError,Math.abs(dist(pp[0],pp[1])-dist(pairInitial[0],pairInitial[1])));

    const soloPrev=previous.get(soloId),soloNow=now.get(soloId);
    const soloDelta=soloPrev&&soloNow?dist(soloPrev,soloNow):0;
    const pairDelta=pairIds.reduce((sum,id)=>{
      const a=previous.get(id),b=now.get(id);return sum+(a&&b?dist(a,b):0);
    },0);

    if(i===1){firstTickSolo=soloDelta;firstTickPair=pairDelta;}

    const finalLogical=logical(game,soloId);
    soloReachedFinal=!!finalLogical&&finalLogical[0]===10&&finalLogical[1]===11&&
      soloNow&&dist(soloNow,[10,11])<2e-6;

    if(!soloReachedFinal){
      if(soloDelta<1e-8){currentIdle++;soloIdleTicks++;}
      else currentIdle=0;
      maxSoloIdleRun=Math.max(maxSoloIdleRun,currentIdle);
    }

    if(i%8===0)samples.push({t:i*dt,solo:soloNow,pair:pp});
    previous=now;
    if(soloReachedFinal&&i>66)break;
  }

  const finalPair=pairIds.map(id=>pos(game,id));
  const finalSolo=pos(game,soloId);
  const activeSegs=activeIds.map(id=>{
    const b=ballById(game,id),s=b?.fallPath?.[0];
    return{id,kind:s?.kind||null};
  });

  return{
    flags:{
      loaded:window.__sixBallNoUpwardBounceSplitAuthorityV1,
      upward:window.__sixBallOrdinaryVisualCorrectionsNeverMoveUp,
      integrator:window.__sixBallOrdinaryIntegratorNeverMovesUp,
      horizontalOnly:window.__sixBallOrdinaryContactCorrectionIsHorizontalOnly,
      evenUpLanding:window.__sixBallEvenRowUpTriangleLandingNeverLifts,
      split:window.__sixBallReferenceSplitPathBeatsGenericContactCorrection,
      noPause:window.__sixBallSplitHasNoResolverPause,
      horizontal:window.__sixBallTrueOverlapRepairIsHorizontal,
      legacy:window.__sixBallPileAndGarbageBouncePolicyUnchanged
    },
    contact:{before:contactBefore,after:contactAfter,support:contactSupport,distance:contactDistance,diag:contactDiag},
    split:{choice,soloId,pairIds,initial:Object.fromEntries(initial),upward,maxPairError,firstTickSolo,firstTickPair,soloIdleTicks,maxSoloIdleRun,soloReachedFinal,finalPair,finalSolo,activeSegs,samples}
  };
})()
`,ctx);

console.log("NO_UPWARD_BOUNCE_SPLIT_CONTINUITY",JSON.stringify(result));
expect(Object.values(result.flags).every(Boolean),"no-upward/split-continuity flags incomplete");
expect(result.contact.after[1]>=result.contact.before[1]-1e-10,"render contact solver still moved an ordinary ball upward");
expect(result.contact.distance>=0.9995-2e-7,"no-upward correction left a true overlap");
expect(result.contact.diag&&result.contact.diag.upwardPrevented>=1,"upward correction was not intercepted");

expect(["reference-first-unilateral-contact","reference-first-contact"].includes(result.split.choice.reason),"reference first-contact split was not selected");
expect(result.split.upward===0,"split pipeline still contains an upward visual step");
expect(result.split.maxPairError<2e-5,"split pair stretched during full render/contact pipeline");
expect(result.split.firstTickSolo>1e-6,"solo split motion did not start on the first render tick");
expect(result.split.firstTickPair>1e-6,"pair split motion did not start on the first render tick");
expect(result.split.maxSoloIdleRun===0,"solo split inserted an idle frame before final landing");
expect(result.split.soloReachedFinal,"solo did not complete the reference continuation");
expect(Math.hypot((result.split.finalSolo[0]-10)*.5,(result.split.finalSolo[1]-11)*Math.sqrt(3)/2)<2e-6,"solo final position changed");

console.log("no upward bounce + zero-gap split continuity PASS");
