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
const result=vm.runInContext(`(()=>{
  const g=createEngine(850001),gid=850001;
  /* UP triangle whose two lower balls land on even row 8. */
  const specs=[{x:6,y:7,role:0},{x:5,y:8,role:1},{x:7,y:8,role:2}];
  const members=specs.map((s,i)=>{
    const b=mkBall(g,i);b.motionGroupId=gid;b.motionGroupRole=s.role;
    b.motionGroupOrientation="up";b.motionGroupSize=3;b.rigid=true;
    g.board[s.y][s.x]=b;noteBoardCell(g.board,s.y,b);
    g.vis.set(b.id,{x:s.x+.18,y:s.y-.035,vy:2,motionSpeed:2});
    b.fallPath=[{from:[s.x+.18,s.y-.035],to:[s.x,s.y],kind:"GROUP_SLOPE_TRANSLATE",motionSeq:850001,bundleId:gid,groupSize:3}];
    return b;
  });
  const support=mkBall(g,4);g.board[9][6]=support;noteBoardCell(g.board,9,support);
  g.vis.set(support.id,{x:6,y:9,vy:0,motionSpeed:0});
  g._visualMovingIds=new Set(members.map(b=>b.id));
  const before=new Map(members.map(b=>[b.id,g.vis.get(b.id).y]));
  resolveVisualContacts(g);
  const after=new Map(members.map(b=>[b.id,g.vis.get(b.id).y]));
  return{
    ys:members.map(b=>({id:b.id,before:before.get(b.id),after:after.get(b.id),vy:g.vis.get(b.id).vy})),
    horizontalOnly:window.__sixBallOrdinaryContactCorrectionIsHorizontalOnly,
    evenLanding:window.__sixBallEvenRowUpTriangleLandingNeverLifts
  };
})()`,ctx);

expect(result.horizontalOnly&&result.evenLanding,"even-row landing authority flags missing");
expect(result.ys.every(q=>Math.abs(q.after-q.before)<1e-10),"contact correction changed vertical landing position");
expect(result.ys.every(q=>q.vy>=0),"landing retained an upward velocity");
console.log("even-row UP triangle landing no-lift PASS",JSON.stringify(result));
