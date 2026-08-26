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
  const game=createEngine(826402);game.state="PLAYING";
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
  let solo=null;
  for(let y=boardScanMin(game.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const c=valid(x,y)?game.board[y][x]:null;if(c?.id===soloId)solo=c;
  }
  const seg=solo?.fallPath?.[0]||null;
  if(!seg)return{choice,soloId,seg:null};

  const pivot=Array.isArray(seg.pivot)?[...seg.pivot]:null;
  const physical=(p,q)=>Math.hypot((p[0]-q[0])*.5,(p[1]-q[1])*HEX_ROW_H);
  const samples=[];
  let maxRadiusError=0,minDx=Infinity,minDy=Infinity;
  let prev=null;
  const startRadius=pivot?physical(seg.from,pivot):NaN;
  for(let i=0;i<=120;i++){
    const u=i/120;
    const p=liveSegPoint(seg,u,{vy:0,speed:0},window.__sixBallReferenceFirstContactSoloDuration);
    const radius=pivot?physical(p,pivot):NaN;
    maxRadiusError=Math.max(maxRadiusError,Math.abs(radius-startRadius));
    if(prev){minDx=Math.min(minDx,p[0]-prev[0]);minDy=Math.min(minDy,p[1]-prev[1]);}
    if(i%24===0)samples.push({u,p:[...p],radius});
    prev=p;
  }
  return{
    choice,soloId,
    seg:{kind:seg.kind,from:[...seg.from],to:[...seg.to],pivot,groupSize:Number(seg.groupSize||0)},
    startRadius,maxRadiusError,minDx,minDy,samples,
    timing:{fps:window.__sixBallReferenceCaptureFps,frames:window.__sixBallReferenceFirstContactSoloFrames,duration:window.__sixBallReferenceFirstContactSoloDuration}
  };
})()
`,ctx);

console.log("NINTENDO_F126_F131_SOLO_PIVOT_ARC",JSON.stringify(result));
if(!result.soloId||!result.seg)throw new Error("reference solo segment missing");
if(result.choice.reason!=="reference-first-unilateral-contact")throw new Error("reference first-contact split not used");
if(result.seg.kind!=="REFERENCE_FIRST_CONTACT_SOLO")throw new Error(`unexpected solo segment ${result.seg.kind}`);
if(JSON.stringify(result.seg.pivot)!==JSON.stringify([7,10]))throw new Error(`solo did not roll around Nintendo blue support: ${JSON.stringify(result.seg.pivot)}`);
if(JSON.stringify(result.seg.to)!==JSON.stringify([9,10]))throw new Error(`solo first lattice target changed: ${JSON.stringify(result.seg.to)}`);
if(result.seg.groupSize!==0)throw new Error("solo retained rigid-group membership");
if(Math.abs(result.startRadius-1)>2e-5)throw new Error(`solo starts off support tangent: radius ${result.startRadius}`);
if(result.maxRadiusError>1e-9)throw new Error(`solo pivot radius changed during F126-F131 arc: ${result.maxRadiusError}`);
if(result.minDx<-1e-10)throw new Error(`solo reversed horizontally during outward arc: ${result.minDx}`);
if(result.minDy<-1e-10)throw new Error(`solo moved upward during outward arc: ${result.minDy}`);
if(result.timing.frames!==5||Math.abs(result.timing.duration-5/result.timing.fps)>1e-12)throw new Error("solo F126-F131 captured timing changed");
console.log("2026-08-26 Nintendo F126-F131 solo pivot arc PASS",JSON.stringify({startRadius:result.startRadius,maxRadiusError:result.maxRadiusError,minDx:result.minDx,minDy:result.minDy,timing:result.timing}));
