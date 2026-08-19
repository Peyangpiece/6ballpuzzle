const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js",
  "app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js","app-wall-gap-invariant.js",
  "app-wall-direct-support-fill.js","app-wall-flow-vacancy-sync.js","app-up-convex-split-side.js",
  "app-release-parity-settle.js","app-08.js","app-09.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,id,c=4){
  expect(valid(x,y),"invalid support "+x+","+y);
  const b={id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  g.board[y][x]=b;noteBoardCell(g.board,y,b);g.vis.set(id,{x,y,vy:0,motionSpeed:0,sq:0});
  return b;
}
function freshBalls(g,first){
  const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null;if(b&&b.id>=first)out.push({b,x,y,v:g.vis.get(b.id)});
  }return out;
}

expect(window.__hexReleaseParitySettle===true,"parity release guard was not installed");
expect(window.__hexStaticReleaseSubcellOffsetAllowed===false,"static release offset policy is not strict");

// Exact regression for the hand-off defect: if the contact resolver authors no
// fallPath, a fractional one-finger X must be COMMITTED by lock() rather than
// being left for updateVisuals() to push sideways through a contact clamp.
for(const tc of [
  {label:"even-row triangle",x:5,y:6,rot:0,dx:.37},
  {label:"odd-row inverse triangle",x:4,y:7,rot:1,dx:-.37}
]){
  const g=createEngine(700+tc.rot);g.state="PLAYING";
  g.piece={x:tc.x,y:tc.y,rot:tc.rot,colors:[0,1,2]};g.pieceVX=tc.x+tc.dx;g.freeX=tc.x+tc.dx;
  const first=g.nextId;
  const oldSafe=safeActiveFallOffset,oldSettle=settlePass;
  safeActiveFallOffset=()=>0;settlePass=()=>false;
  lock(g,3);
  safeActiveFallOffset=oldSafe;settlePass=oldSettle;
  const fresh=freshBalls(g,first);
  expect(fresh.length===3,tc.label+": lock did not create three balls");
  for(const q of fresh){
    expect(!q.b.fallPath,tc.label+": controlled static member unexpectedly has a path");
    expect(Math.abs(q.v.x-q.x)<1e-12&&Math.abs(q.v.y-q.y)<1e-12,tc.label+": static member retained a sub-cell visual offset");
    expect(q.b.releaseParityCommitted===true,tc.label+": static hand-off was not explicitly committed");
  }
}

function runRealContact(label,sx,sy,rot,dx,foundation){
  const g=createEngine(800+rot+(dx>0?10:0));
  let id=5000;for(const [x,y] of foundation)put(g,x,y,id++);put(g,sx,sy,id++);
  const px=sx-1;
  let py=((px+(-2))&1)===1?-2:-1;
  // piece validity depends only on x+y parity and is preserved by +2 drops.
  while(!pieceFits(g.board,{x:px,y:py,rot,colors:[0,1,2]})&&py>-6)py--;
  g.state="PLAYING";g.piece={x:px,y:py,rot,colors:[0,1,2]};g.pieceVX=px+dx;g.freeX=px+dx;
  hardDrop(g);
  expect(g.state==="RESOLVING",label+": hard drop did not enter resolving");
  let resumed=false,maxResidual=0;
  for(let i=0;i<720;i++){
    stepEngine(g,PHYSICS_FRAME);
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const b=valid(x,y)?g.board[y][x]:null,v=b?g.vis.get(b.id):null;if(!v)continue;
      maxResidual=Math.max(maxResidual,Math.hypot((v.x-x)*.5,(v.y-y)*HEX_ROW_H));
    }
    if(g.state==="PLAYING"&&g.piece){resumed=true;break;}
  }
  expect(resumed,label+": resolving remained frozen after direct-over-ball landing");
  expect(pendingFallPathCount(g)===0,label+": stale fallPath remained after resume");
  return maxResidual;
}

const residuals=[];
// ▲-type contact over a ball on the even second level. The support at (9,10)
// is held by the two floor balls and sits exactly between the lower pair.
for(const dx of[-.35,.35])residuals.push(runRealContact("even-level up triangle "+dx,9,10,1,dx,[[8,11],[10,11]]));
// Mirrored parity: a point-down triangle above an odd-level centre support.
for(const dx of[-.35,.35])residuals.push(runRealContact("odd-level inverse triangle "+dx,8,9,0,dx,[[8,11]]));

console.log("parity direct-contact release + no-freeze PASS",JSON.stringify({cases:6,maxResidual:Math.max(...residuals)}));
`;

const source=`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${assertions}`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite});
