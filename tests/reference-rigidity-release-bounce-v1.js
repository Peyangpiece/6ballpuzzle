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
  "app-rigidity-release-bounce-authority-v1.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

function expect(v,msg){if(!v)throw new Error(msg);}
function close(a,b,eps=1e-7){return Math.abs(a-b)<=eps;}
const indexHtml=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
expect(indexHtml.includes("app-rigidity-release-bounce-authority-v1.js"),"production index does not load release/bounce authority");

const result=vm.runInContext(`
(()=>{
 function install(g,specs,gid,orientation="up"){
  return specs.map((s,i)=>{
   const ball=mkBall(g,s.c??i);ball.motionGroupId=gid;ball.motionGroupRole=i;ball.motionGroupOrientation=orientation;ball.motionGroupSize=specs.length;ball.rigid=true;
   g.board[s.y][s.x]=ball;noteBoardCell(g.board,s.y,ball);setVis(g,ball,s.vx??s.x,s.vy??s.y,s.vspeed||0);
   return{ball,x:s.x,y:s.y,role:i,orientation};
  });
 }
 function obstacle(g,x,y,c=4){const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
 function groupMembers(g,gid){return hexPhysGroups(g.board).get(gid)||[];}
 function noBounce(){
  // Valid canonical DOWN triplet, rendered 0.34 row below its logical cells.
  // The old fixture used x+y-even cells, which are outside this board lattice
  // and therefore could never produce a first physics motion.
  const g=createEngine(930001),gid=930001,members=install(g,[{x:7,y:2,vy:2.34},{x:9,y:2,vy:2.34},{x:8,y:3,vy:3.34}],gid,"down");
  const before=new Map(members.map(m=>[m.ball.id,{x:g.vis.get(m.ball.id).x,y:g.vis.get(m.ball.id).y}]));
  const first=settlePass(g.board,false),paths=members.map(m=>({id:m.ball.id,len:m.ball.fallPath?.length||0,from:m.ball.fallPath?.[0]?.from||null,to:m.ball.fallPath?.[0]?.to||null,rebased:!!m.ball.fallPath?.[0]?.noBounceRebased}));
  const sig1=physicsSignature(g.board),lens1=members.map(m=>m.ball.fallPath?.length||0),second=settlePass(g.board,false),sig2=physicsSignature(g.board),lens2=members.map(m=>m.ball.fallPath?.length||0);
  return{first,second,sigSame:sig1===sig2,lensSame:JSON.stringify(lens1)===JSON.stringify(lens2),paths,originMatch:paths.every(p=>p.from&&close(p.from[0],before.get(p.id).x)&&close(p.from[1],before.get(p.id).y)),allRebased:paths.every(p=>p.rebased),rigid:groupMembers(g,gid).map(m=>({id:m.ball.id,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid}))};
 }
 function stableRelease(){
  const g=createEngine(930101),gid=930101,members=install(g,[{x:6,y:4},{x:5,y:5},{x:7,y:5}],gid,"up");
  obstacle(g,4,6);obstacle(g,6,6);obstacle(g,8,6);
  const actual=members.map(m=>hexPhysNaturalMotion(g.board,m.x,m.y,null));
  const preview=hexPhysPlanGroup(g.board,members,true)||[],previewMeta=members.map(m=>[m.ball.motionGroupSize,!!m.ball.rigid]);
  const commit=hexPhysPlanGroup(g.board,members,false)||[],after=members.map(m=>({id:m.ball.id,size:m.ball.motionGroupSize,gid:m.ball.motionGroupId,rigid:!!m.ball.rigid}));
  return{actual:actual.map(Boolean),preview:preview.map(p=>({id:p.ball.id,size:p.groupSize||0,kind:p.kind||""})),previewMeta,commit:commit.map(p=>({id:p.ball.id,size:p.groupSize||0,kind:p.kind||""})),after};
 }
 function pinnedDifferential(){
  const g=createEngine(930201),gid=930201,members=install(g,[{x:6,y:4},{x:5,y:5},{x:7,y:5}],gid,"up");
  obstacle(g,4,6);obstacle(g,6,6);
  const own=new Set(members.map(m=>m.ball.id));
  const actual=members.map(m=>hexPhysNaturalMotion(g.board,m.x,m.y,null));
  const external=members.map(m=>{const s=hexPhysSupportInfo(g.board,m.x,m.y,own);return{floor:!!s.floor,real:s.realCount};});
  const preview=hexPhysPlanGroup(g.board,members,true)||[];
  const commit=hexPhysPlanGroup(g.board,members,false)||[];
  return{actual:actual.map(p=>p?{id:p.ball.id,to:[p.tx,p.ty],kind:p.kind}:null),external,preview:preview.map(p=>({id:p.ball.id,size:p.groupSize||0,to:[p.tx,p.ty],kind:p.kind||""})),commit:commit.map(p=>({id:p.ball.id,size:p.groupSize||0,to:[p.tx,p.ty],kind:p.kind||""})),after:members.map(m=>({id:m.ball.id,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid}))};
 }
 function pairPivot(){
  const g=createEngine(930301),gid=930301,f=mkBall(g,1),m=mkBall(g,2);
  for(const [ball,role,x,y] of [[f,0,10,11],[m,1,9,10]]){ball.motionGroupId=gid;ball.motionGroupRole=role;ball.motionGroupOrientation="pair";ball.motionGroupSize=2;ball.rigid=true;g.board[y][x]=ball;noteBoardCell(g.board,y,ball);setVis(g,ball,x,y,0);}
  const members=[{ball:f,x:10,y:11,role:0,orientation:"pair"},{ball:m,x:9,y:10,role:1,orientation:"pair"}],plan=hexPhysPlanGroup(g.board,members,false)||[];
  return{plan:plan.map(p=>({id:p.ball.id,size:p.groupSize||0,to:[p.tx,p.ty],pivot:p.pivot||null,kind:p.kind||""})),after:members.map(q=>({id:q.ball.id,size:q.ball.motionGroupSize,rigid:!!q.ball.rigid}))};
 }
 return{flags:{version:window.__sixBallRigidityReleaseBounceVersion,busy:window.__sixBallRigidityBlocksReplanWhileVisualBusy,rebase:window.__sixBallFreshSegmentsStartAtRenderedCentre,pinned:window.__sixBallExternallyPinnedMemberBreaksTriplet,pair:window.__sixBallValidPairPivotMayRetainRigidity},bounce:noBounce(),stable:stableRelease(),differential:pinnedDifferential(),pair:pairPivot()};
})()
`,ctx);

console.log("RIGIDITY_RELEASE_BOUNCE",JSON.stringify(result));
expect(result.flags.version==="rigidity-release-bounce-authority-v1"&&result.flags.busy&&result.flags.rebase&&result.flags.pinned&&result.flags.pair,"release/bounce authority flags missing");
expect(result.bounce.first===true,"fixture did not create first rigid motion");
expect(result.bounce.originMatch&&result.bounce.allRebased,"fresh fall path did not start at current rendered centre");
expect(result.bounce.second===false&&result.bounce.sigSame&&result.bounce.lensSame,"planner queued another move while visual path was active");
expect(result.bounce.rigid.every(q=>q.rigid&&q.size===3),"visual busy guard released rigidity prematurely");
expect(result.stable.actual.every(v=>v===false),"stable release fixture is not stable");
expect(result.stable.previewMeta.every(([size,rigid])=>size===3&&rigid),"preview mutated stable rigidity metadata");
expect(result.stable.after.every(q=>!q.rigid&&q.size===0&&q.gid===0),"externally supported stable triplet retained rigidity");
expect(!result.differential.preview.some(p=>p.size===3),"externally pinned differential contact retained 3-ball rigidity in preview");
expect(!result.differential.commit.some(p=>p.size===3),"externally pinned differential contact retained 3-ball rigidity in commit");
expect(!result.differential.after.every(q=>q.rigid&&q.size===3),"externally pinned differential contact retained full triplet metadata");
expect(result.pair.plan.length===1&&result.pair.plan[0].size===2&&result.pair.plan[0].pivot,"valid 2-ball pivot was incorrectly broken");
expect(result.pair.after.every(q=>q.rigid&&q.size===2),"valid pair pivot lost rigidity");
console.log("Nintendo rigidity release + no-bounce v1 PASS");
