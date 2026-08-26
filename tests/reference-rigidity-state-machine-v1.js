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
  "app-rigidity-nintendo-authority-v1.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

function expect(v,msg){if(!v)throw new Error(msg);}
const result=vm.runInContext(`
(()=>{
 function installTriplet(game,specs,gid,orientation="up"){
  return specs.map((s,i)=>{const ball=mkBall(game,s.c??i);ball.motionGroupId=gid;ball.motionGroupRole=s.role??i;ball.motionGroupOrientation=orientation;ball.motionGroupSize=3;ball.rigid=true;ball.momentumX=s.bias||0;ball.rollDir=s.bias||0;ball.subCellBias=s.bias||0;ball.impactOffsetX=s.offset||0;game.board[s.y][s.x]=ball;noteBoardCell(game.board,s.y,ball);game.vis.set(ball.id,{x:s.vx??s.x,y:s.vy??s.y,vy:s.speed||0,motionSpeed:s.speed||0,justReleased:!!s.justReleased});return{ball,x:s.x,y:s.y,role:s.role??i,orientation};});
 }
 function maxDistanceError(members,plan){const byId=new Map(plan.map(p=>[p.ball.id,p]));let err=0;for(let a=0;a<members.length;a++)for(let b=a+1;b<members.length;b++){const ma=members[a],mb=members[b],d0=hexPhysDist(ma.x,ma.y,mb.x,mb.y);for(let i=0;i<=60;i++){const t=i/60,pa=byId.has(ma.ball.id)?proposalPointAt(byId.get(ma.ball.id),t):normPoint(ma.x,ma.y),pb=byId.has(mb.ball.id)?proposalPointAt(byId.get(mb.ball.id),t):normPoint(mb.x,mb.y);err=Math.max(err,Math.abs(Math.hypot(pa[0]-pb[0],pa[1]-pb[1])-d0));}}return err;}
 function freeFlight(){const g=createEngine(910001),members=installTriplet(g,[{x:6,y:3},{x:5,y:4},{x:7,y:4}],910001,"up"),plan=hexPhysPlanGroup(g.board,members,false)||[];return{count:plan.length,sizes:plan.map(p=>p.groupSize),sameBundle:new Set(plan.map(p=>p.bundleId)).size===1,rigid3:members.every(m=>m.ball.rigid&&m.ball.motionGroupSize===3),error:maxDistanceError(members,plan)};}
 function outerContact(seed,offset,raise=0){
  const g=createEngine(seed),specs=[{x:6,y:3,c:2,role:0},{x:5,y:4,c:0,role:2},{x:7,y:4,c:4,role:1}],members=installTriplet(g,specs.map(s=>({...s,offset,bias:Math.sign(offset)||-1})),seed,"up"),support=mkBall(g,1);g.board[5][6]=support;noteBoardCell(g.board,5,support);g.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
  const contactMember=offset<0?members[2]:members[1],cx=contactMember.x+offset,realDx=Math.abs((cx-6)*.5),vertical=Math.sqrt(Math.max(0,1-realDx*realDx)),contactRow=5-vertical/HEX_ROW_H-raise,rowOffset=contactRow-contactMember.y;
  for(const m of members)g.vis.set(m.ball.id,{x:m.x+offset,y:m.y+rowOffset,vy:5,motionSpeed:5,justReleased:true});g._visualMovingIds=new Set();g._liveBatchClock={elapsed:0,duration:0,states:new Map()};window.__sixBallLastNintendoRigidityDecision={};
  const plan=hexPhysPlanGroup(g.board,members,false)||[],pairSteps=plan.filter(p=>Number(p.groupSize)===2),solo=plan.find(p=>Number(p.groupSize)===0),pairIds=pairSteps.map(p=>p.ball.id).sort((a,b)=>a-b),pairMembers=members.filter(m=>pairIds.includes(m.ball.id));
  return{count:plan.length,pairIds,soloId:solo?.ball?.id??null,topId:members[0].ball.id,leftId:members[1].ball.id,rightId:members[2].ball.id,rigid:members.map(m=>({id:m.ball.id,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid})),pairError:pairSteps.length===2?maxDistanceError(pairMembers,pairSteps):null,decision:{...(window.__sixBallLastNintendoRigidityDecision||{})}};
 }
 function pairPivot(){const g=createEngine(910101),fixed=mkBall(g,1),moving=mkBall(g,2),gid=910101;for(const [ball,role,x,y] of [[fixed,0,10,11],[moving,1,9,10]]){ball.motionGroupId=gid;ball.motionGroupRole=role;ball.motionGroupOrientation="pair";ball.motionGroupSize=2;ball.rigid=true;g.board[y][x]=ball;noteBoardCell(g.board,y,ball);g.vis.set(ball.id,{x,y,vy:0,motionSpeed:0});}const members=[{ball:fixed,x:10,y:11,role:0,orientation:"pair"},{ball:moving,x:9,y:10,role:1,orientation:"pair"}],actual=members.map(m=>hexPhysNaturalMotion(g.board,m.x,m.y,null)),independent=members.map(m=>hexPhysIndependentMemberMotion(g.board,members,m)),plan=hexPhysPlanGroup(g.board,members,false)||[],p=plan[0]||null;return{actual:actual.map(q=>q?{kind:q.kind,to:[q.tx,q.ty],pivot:q.pivot}:null),independent:independent.map(q=>q?{kind:q.kind,to:[q.tx,q.ty],pivot:q.pivot}:null),count:plan.length,kind:p?.kind||null,target:p?[p.tx,p.ty]:null,pivot:p?.pivot||null,groupSize:p?.groupSize||0,fixedRigid:fixed.rigid,fixedSize:fixed.motionGroupSize,movingRigid:moving.rigid,movingSize:moving.motionGroupSize,error:plan.length?maxDistanceError(members,plan):99};}
 function settledTriplet(){const g=createEngine(910201),members=installTriplet(g,[{x:9,y:10},{x:8,y:11},{x:10,y:11}],910201,"up"),actual=members.map(m=>hexPhysNaturalMotion(g.board,m.x,m.y,null)),independent=members.map(m=>hexPhysIndependentMemberMotion(g.board,members,m)),plan=hexPhysPlanGroup(g.board,members,false)||[];return{actual:actual.map(Boolean),independent:independent.map(Boolean),count:plan.length,released:members.every(m=>!m.ball.rigid&&m.ball.motionGroupSize===0&&m.ball.motionGroupId===0)};}
 return{flags:{version:window.__sixBallNintendoRigidityVersion,physical:window.__sixBallRigidityUsesPhysicalContact,kinematic:window.__sixBallRigidityUsesKinematicPartition,noMiddle50:window.__sixBallRigidityMiddleFiftyGateRemoved,noBilateral:window.__sixBallRigidityBilateralPivotGateRemoved,distance:window.__sixBallRigidBodyDistanceInvariant,actualSettle:window.__sixBallAccumulatedReleaseUsesActualBoard,stableFirst:window.__sixBallStableBeforeFragmentation,noStaticOverlap:window.__sixBallStaticPairTargetOverlapForbidden,actualPivot:window.__sixBallPairPivotUsesActualPartnerContact,actualFragment:window.__sixBallFragmentationUsesActualBoardMotion},free:freeFlight(),outerRight:outerContact(910301,-.82,0),outerLeft:outerContact(910302,.82,0),preRight:outerContact(910303,-.82,.08),pivot:pairPivot(),settled:settledTriplet()};
})()
`,ctx);
console.log("NINTENDO_RIGIDITY_STATE_MACHINE",JSON.stringify(result));
expect(result.flags.version==="nintendo-rigidity-authority-v1","Nintendo rigidity authority not loaded");
expect(Object.entries(result.flags).filter(([k])=>k!=="version").every(([,v])=>v===true),"Nintendo rigidity contract flags incomplete");
expect(result.free.count===3,"free triplet did not move as one body");
expect(result.free.sizes.every(v=>v===3)&&result.free.sameBundle&&result.free.rigid3,"free triplet lost 3-ball rigidity");
expect(result.free.error<1e-8,"free triplet changed internal distances");
expect(result.outerRight.count===3,"measured right outer contact did not split immediately");
expect(JSON.stringify(result.outerRight.pairIds)===JSON.stringify([result.outerRight.topId,result.outerRight.leftId].sort((a,b)=>a-b)),"right contact did not keep top+left pair");
expect(result.outerRight.soloId===result.outerRight.rightId,"right contact did not release right lower solo");
expect(result.outerRight.pairError<1e-8,"right-contact surviving pair stretched");
expect(result.outerRight.rigid.find(q=>q.id===result.outerRight.rightId).size===0,"right-contact solo retained rigidity");
expect(result.outerRight.rigid.filter(q=>q.id!==result.outerRight.rightId).every(q=>q.rigid&&q.size===2),"right-contact pair did not retain 2-ball rigidity");
expect(result.outerLeft.count===3,"mirrored left outer contact did not split immediately");
expect(JSON.stringify(result.outerLeft.pairIds)===JSON.stringify([result.outerLeft.topId,result.outerLeft.rightId].sort((a,b)=>a-b)),"left contact did not keep top+right pair");
expect(result.outerLeft.soloId===result.outerLeft.leftId,"left contact did not release left lower solo");
expect(result.outerLeft.pairError<1e-8,"left-contact surviving pair stretched");
expect(!result.preRight.rigid.some(q=>q.size===2),"triplet split before physical contact");
expect(result.preRight.rigid.every(q=>q.rigid&&q.size===3),"pre-contact triplet did not keep 3-ball rigidity");
expect(result.pivot.count===1,"2-ball rigid pivot did not produce one moving member "+JSON.stringify(result.pivot));
expect(result.pivot.kind==="NINTENDO_PAIR_PIVOT","actual partner contact did not author the pair pivot");
expect(result.pivot.groupSize===2&&result.pivot.fixedRigid&&result.pivot.movingRigid&&result.pivot.fixedSize===2&&result.pivot.movingSize===2,"pair pivot released rigidity prematurely");
expect(result.pivot.target&&result.pivot.target[0]===8&&result.pivot.target[1]===11,"pair pivot target is wrong");
expect(result.pivot.pivot&&result.pivot.pivot[0]===10&&result.pivot.pivot[1]===11,"pair pivot support is wrong");
expect(result.pivot.error<1e-8,"pair pivot changed pair distance");
expect(result.settled.actual.every(v=>v===false),"settled triplet still has actual board motion");
expect(result.settled.independent.some(Boolean),"regression fixture no longer distinguishes independent probe from actual stability");
expect(result.settled.count===0&&result.settled.released,"settled triplet did not transition to accumulated zero-rigidity pile");
console.log("Nintendo rigidity state-machine v1 PASS");
