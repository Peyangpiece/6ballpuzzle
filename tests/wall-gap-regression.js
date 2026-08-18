const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-07.js","app-clear-gap-collapse.js","app-wall-gap-invariant.js"]
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
function physicalDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}

expect(window.__hexWallGapInvariant===true,"wall no-gap invariant was not installed");
expect(window.__hexWallGapAllowed===false,"wall-gap policy is not strict");

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

// If the wall column and inward lower cell are both open, gravity must stay on
// the wall instead of rolling inward around a virtual outside-wall pivot.
for(const [x,y,label] of [[0,7,"left"],[18,7,"right"]]){
  const b=newBoard(),ball=put(b,x,y,300+(x||1));
  const p=hexPhysNaturalMotion(b,x,y);
  expect(p&&p.kind==="WALL_DROP",label+" wall ball did not prefer vertical compaction");
  expect(p.tx===x&&p.ty===y+2,label+" wall drop left the side column");
}

// Critical transient case: on the row above the floor, the inner support moves
// inward to floor-pack. Previously the wall ball FOLLOW_SUPPORTed into the old
// support cell first, exposing the wall-floor pocket for an entire motion stage.
// It must now descend the wall in the SAME event while remaining tangent/non-
// overlapping with the moving support for every point of the sweep.
{
  const b=newBoard();
  const wall=put(b,0,ROWS-3,401);
  const support=put(b,1,ROWS-2,402);
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

  // The renderer receives the same contact-safe trajectory through the stored
  // fallPath, not a second visual-only approximation that can reopen the gap.
  const wseg=wall.fallPath?.[0],sseg=support.fallPath?.[0];
  expect(wseg?.kind==="WALL_COMPACT_FOLLOW","wall compaction kind was lost from fallPath");
  const wm={cell:wall,seg:wseg},sm={cell:support,seg:sseg},batch={byId:new Map([[wall.id,wm],[support.id,sm]])};
  for(let i=0;i<=120;i++){
    const t=i/120,memo=new Map(),a=liveBatchPointAt(batch,wm,t,new Map(),memo,new Set()),s=liveBatchPointAt(batch,sm,t,new Map(),memo,new Set());
    const ap=[latticeRealX(a[0]),cellCenterYNorm(a[1])],bp=[latticeRealX(s[0]),cellCenterYNorm(s[1])];
    expect(physicalDist(ap,bp)>=HEX_MIN_DIST-1e-6,"visual wall compact path overlapped support at t="+t);
  }
}

console.log("wall gap regression PASS");
`;

const source=`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${assertions}`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite});
