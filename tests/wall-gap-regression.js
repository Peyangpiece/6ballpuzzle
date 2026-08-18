const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-07.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js","app-wall-gap-invariant.js","app-wall-direct-support-fill.js","app-wall-flow-vacancy-sync.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
function makeBall(id,c=0){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};}
function put(board,x,y,id,c=0){expect(valid(x,y),"invalid test cell "+x+","+y);board[y][x]=makeBall(id,c);return board[y][x];}
function placeHexagonWithBallFoundation(board,cx,cy,startId=1){
  const ring=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  let id=startId;
  for(const[dx,dy]of ring)put(board,cx+dx,cy+dy,id++,0);
  const foundation=[[cx-2,cy+2],[cx,cy+2],[cx+2,cy+2]];
  for(const[x,y]of foundation)if(!board[y][x])put(board,x,y,id++,1);
}
function placeHexagonRing(board,cx,cy,startId=1){
  const ring=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  let id=startId;
  for(const[dx,dy]of ring)put(board,cx+dx,cy+dy,id++,0);
}
function physicalDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function latticeDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

expect(window.__hexWallGapInvariant===true,"wall no-gap invariant was not installed");
expect(window.__hexWallGapAllowed===false,"wall-gap policy is not strict");
expect(window.__hexWallAlternatingParityCompaction===true,"alternating wall parity compaction missing");
expect(window.__hexWallDynamicVacancyClosure===true,"dynamic wall vacancy closure missing");
expect(window.__hexWallDirectSupportFill===true,"direct-support wall vacancy fill missing");
expect(window.__hexWallFlowVacancySync===true,"wall pile-flow vacancy synchronization missing");
expect(window.__hexFloorGapInvariant===true,"floor no-gap invariant was not installed");
expect(window.__hexFloorAdjacentGapAllowed===false,"floor-gap policy is not strict");

// Interior ball-supported HEXAGON holes remain legal.
{
  const b=newBoard(),cx=8,cy=5;
  placeHexagonWithBallFoundation(b,cx,cy,100);
  expect(isBalancedHexagonCenterHole(b,cx,cy),"interior ball-supported HEXAGON gap was rejected");
  expect(ballInBalancedHexagonRing(b,cx-2,cy),"interior HEXAGON ring did not receive the balanced exemption");
}

// A geometrically identical ring touching the side wall is never exempt.
{
  const b=newBoard(),cx=2,cy=5;
  placeHexagonWithBallFoundation(b,cx,cy,200);
  expect(!isBalancedHexagonCenterHole(b,cx,cy),"wall-adjacent HEXAGON gap was incorrectly preserved");
  expect(!ballInBalancedHexagonRing(b,cx-2,cy),"wall-adjacent ring still received the no-gravity exemption");
}

// The floor cannot substitute for the two real-ball supports required by the
// intentional HEXAGON exception.
{
  const b=newBoard(),cx=9,cy=ROWS-2;
  placeHexagonRing(b,cx,cy,250);
  expect(!isBalancedHexagonCenterHole(b,cx,cy),"floor-supported HEXAGON gap was incorrectly preserved");
  expect(!ballInBalancedHexagonRing(b,cx-2,cy),"floor-supported ring still received the no-gravity exemption");
}

// If the wall column and both lower contacts are open, gravity must stay on the
// wall instead of peeling inward. Check both physical wall parities.
for(const [x,y,label] of [[0,7,"left odd"],[18,7,"right odd"],[1,6,"left even"],[17,6,"right even"]]){
  const b=newBoard(),ball=put(b,x,y,300+x+y);
  const p=hexPhysNaturalMotion(b,x,y);
  expect(p&&p.kind==="WALL_DROP",label+" wall ball did not prefer vertical compaction");
  expect(p.tx===x&&p.ty===y+2,label+" wall drop left the side column");
}

// Odd-row wall case: inner support moves inward. The wall ball descends the
// same column in the SAME event while remaining tangent/non-overlapping.
{
  const b=newBoard();
  const wall=put(b,0,ROWS-3,401);
  const support=put(b,1,ROWS-2,402);
  support.momentumX=1;support.rollDir=1;support.subCellBias=1;
  const proposals=hexPhysContactEntries(b,new Set());
  const wp=proposals.find(p=>p.ball===wall),sp=proposals.find(p=>p.ball===support);
  expect(sp&&sp.tx===2&&sp.ty===ROWS-1,"inner support did not floor-pack inward as expected");
  expect(wp&&wp.kind==="WALL_COMPACT_FOLLOW","wall ball retained transient inward FOLLOW_SUPPORT");
  expect(wp.tx===0&&wp.ty===ROWS-1,"wall compaction did not fill the wall-floor cell directly");
  for(let i=0;i<=120;i++){
    const t=i/120,a=proposalPointAt(wp,t),s=proposalPointAt(sp,t),d=physicalDist(a,s);
    expect(d>=HEX_MIN_DIST-1e-6,"wall compact sweep overlapped support at t="+t+": "+d);
  }
  const moved=settlePass(b,false);
  expect(moved,"wall compaction event was rejected");
  expect(b[ROWS-1][0]===wall,"wall-floor pocket remained open after compaction event");
  expect(b[ROWS-1][2]===support,"inner support did not reach its packed floor cell");

  const wseg=wall.fallPath?.[0],sseg=support.fallPath?.[0];
  expect(wseg?.kind==="WALL_COMPACT_FOLLOW","wall compaction kind was lost from fallPath");
  const wm={cell:wall,seg:wseg},sm={cell:support,seg:sseg},batch={byId:new Map([[wall.id,wm],[support.id,sm]])};
  for(let i=0;i<=120;i++){
    const t=i/120,memo=new Map(),a=liveBatchPointAt(batch,wm,t,new Map(),memo,new Set()),s=liveBatchPointAt(batch,sm,t,new Map(),memo,new Set());
    const ap=[latticeRealX(a[0]),cellCenterYNorm(a[1])],bp=[latticeRealX(s[0]),cellCenterYNorm(s[1])];
    expect(physicalDist(ap,bp)>=HEX_MIN_DIST-1e-6,"visual wall compact path overlapped support at t="+t);
  }
}

// Alternating-parity wall chain. On an even wall row the outer lower support is
// a REAL wall cell. When that support rolls inward, the upper wall ball must take
// the support's just-vacated outer cell, not FOLLOW_SUPPORT into the interior.
// The full gravity cascade must then close the secondary wall cell vacated by
// that movement before the pile is considered settled.
{
  const b=newBoard();
  const top=put(b,0,7,501);
  const edge=put(b,1,8,502);
  const outerSupport=put(b,0,9,503);
  const blocker=put(b,0,11,504);

  const proposals=hexPhysContactEntries(b,new Set());
  const ep=proposals.find(p=>p.ball===edge),sp=proposals.find(p=>p.ball===outerSupport);
  expect(sp&&sp.tx===1&&sp.ty===10,"outer wall support did not move inward");
  expect(ep&&ep.kind==="WALL_EDGE_CHAIN_FOLLOW","even-row wall ball still peeled into the interior");
  expect(ep.tx===0&&ep.ty===9,"even-row wall ball did not take the vacated wall-support cell");
  for(let i=0;i<=120;i++){
    const t=i/120,a=proposalPointAt(ep,t),s=proposalPointAt(sp,t);
    expect(physicalDist(a,s)>=HEX_MIN_DIST-1e-6,"alternating wall follow overlapped support at t="+t);
  }

  expect(settlePass(b,false),"alternating wall compaction event was rejected");
  expect(b[9][0]===edge,"outer support vacancy was not immediately filled");
  expect(b[10][1]===outerSupport,"outer support did not reach its inward destination");
  settleAll(b);
  expect(b[8][1]===top,"full wall cascade left the even-row movement vacancy open");
  expect(top.fallPath?.some(s=>s?.to&&s.to[0]===1&&s.to[1]===8),"secondary wall vacancy never received a fill path");
  expect(b[11][0]===blocker,"wall blocker unexpectedly moved");
}

// The same multi-stage wall chain must be continuous in scheduled post-clear
// rendering: later wall vacancy fillers are synchronized with the ball that
// vacates their target, rather than exposing a staged wall hole between events.
{
  const g={board:newBoard(),vis:new Map(),ver:0,pileFlowClock:0,clearing:{cells:[[2,9,0,999]]}};
  const top=put(g.board,0,7,601),edge=put(g.board,1,8,602),outerSupport=put(g.board,0,9,603),blocker=put(g.board,0,11,604);
  for(const [ball,x,y] of [[top,0,7],[edge,1,8],[outerSupport,0,9],[blocker,0,11]])g.vis.set(ball.id,{x,y,vy:0,motionSpeed:0});

  const flow=prepareContinuousPileFlow(g,"clear_support_loss");
  expect(flow.moved,"wall chain produced no continuous pile flow");
  expect(g.board[8][1]===top,"post-clear wall flow left the secondary wall vacancy open");

  const edgeSeg=edge.fallPath?.find(s=>s?.to&&s.to[0]===0&&s.to[1]===9);
  const topSeg=top.fallPath?.find(s=>s?.to&&s.to[0]===1&&s.to[1]===8);
  const supportSeg=outerSupport.fallPath?.find(s=>s?.from&&s.from[0]===0&&s.from[1]===9);
  expect(edgeSeg?.kind==="WALL_EDGE_CHAIN_FOLLOW","edge pileFlow lost alternating wall-follow kind");
  expect(topSeg,"secondary wall filler path missing from pileFlow");
  expect(topSeg?.kind==="WALL_VACANCY_FOLLOW","secondary wall filler was not bound to the ball vacating its target");
  expect(edgeSeg.wallFlowSynchronized===true,"edge wall flow was not synchronized to its support");
  expect(topSeg.wallFlowSynchronized===true,"secondary wall fill was not synchronized to the moving edge ball");
  expect(Math.abs(edgeSeg.pileFlowStart-supportSeg.pileFlowStart)<1e-9,"edge wall flow still starts after its support");
  expect(Math.abs(topSeg.pileFlowStart-edgeSeg.pileFlowStart)<1e-9,"secondary wall fill still starts as a later staged wave");

  const start=Math.min(edgeSeg.pileFlowStart,topSeg.pileFlowStart),end=Math.max(edgeSeg.pileFlowEnd,topSeg.pileFlowEnd,supportSeg.pileFlowEnd);
  for(let i=0;i<=180;i++){
    const t=start+(end-start)*(i/180),a=pileFlowPositionAt(g,top,t),b=pileFlowPositionAt(g,edge,t),c=pileFlowPositionAt(g,outerSupport,t);
    expect(latticeDist(a,b)>=PILE_FLOW_MIN_DIST-1e-6,"top/edge wall pileFlow overlapped at sample "+i);
    expect(latticeDist(b,c)>=PILE_FLOW_MIN_DIST-1e-6,"edge/support wall pileFlow overlapped at sample "+i);
  }
}

console.log("wall + floor + dynamic wall-vacancy regression PASS");
`;

const source=`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${assertions}`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite});
