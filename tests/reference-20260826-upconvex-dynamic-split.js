const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");
for(const file of[
"app-collapse-timing-authoritative-v2.js",
"app-runtime-performance-v3.js",
"app-rigidity-final-authority-v1.js",
"app-reference-upconvex-authority-v1.js"
]){
vm.runInContext(
fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),
ctx,
{filename:file}
);
}
function expect(value,message){if(!value)throw new Error(message);}
function close(a,b,eps=1e-9){return Math.abs(a-b)<=eps;}
const dynamic=vm.runInContext(`
(()=>{
function scenario(seed,bias,visualOffset,airborne=false){
const game=createEngine(seed),gid=seed;
const specs=[
{x:6,y:3,c:0,role:0,name:"top"},
{x:5,y:4,c:2,role:1,name:"left"},
{x:7,y:4,c:3,role:2,name:"right"}
];
const members=specs.map(spec=>{
const ball=mkBall(game,spec.c);
ball.motionGroupId=gid;ball.motionGroupRole=spec.role;ball.motionGroupOrientation="up";ball.motionGroupSize=3;ball.rigid=true;
ball.impactOffsetX=.35;ball.momentumX=bias;ball.rollDir=bias;ball.subCellBias=bias;
game.board[spec.y][spec.x]=ball;noteBoardCell(game.board,spec.y,ball);
game.vis.set(ball.id,{x:spec.x+visualOffset,y:spec.y+(airborne?-3:0),vy:airborne?2:0,motionSpeed:airborne?2:0});
return{ball,x:spec.x,y:spec.y,role:spec.role,orientation:"up",name:spec.name};
});
const support=mkBall(game,4);game.board[5][6]=support;noteBoardCell(game.board,5,support);game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
game._visualMovingIds=airborne?new Set(members.map(m=>m.ball.id)):new Set();
game._liveBatchClock=airborne?{elapsed:0,duration:1,states:new Map(members.map(m=>[m.ball.id,{}]))}:{elapsed:0,duration:0,states:new Map()};
const plan=hexPhysPlanGroup(game.board,members,false)||[];
const pairSteps=plan.filter(step=>Number(step.groupSize)===2),pair=pairSteps.map(step=>step.ball.id).sort((a,b)=>a-b),solo=plan.find(step=>Number(step.groupSize)===0);
let maxPairDistanceError=0;
if(pairSteps.length===2)for(let i=0;i<=60;i++){
const t=i/60,p0=proposalPointAt(pairSteps[0],t),p1=proposalPointAt(pairSteps[1],t);
maxPairDistanceError=Math.max(maxPairDistanceError,Math.abs(Math.hypot(p0[0]-p1[0],p0[1]-p1[1])-1));
}
return{count:plan.length,pair,soloId:solo?.ball?.id??null,topId:members[0].ball.id,leftId:members[1].ball.id,rightId:members[2].ball.id,maxPairDistanceError,
rigid3:members.every(m=>m.ball.rigid&&m.ball.motionGroupSize===3),choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})}};
}
return{
momentumLeft:scenario(826001,-1,.35,false),
momentumRight:scenario(826002,1,.35,false),
airborne:scenario(826003,-1,.35,true),
version:window.__sixBallReferenceUpConvexAuthorityVersion,
version2:window.__sixBallReferenceUpConvexAuthorityVersion2,
contactAlwaysSolo:window.__sixBallCurrentContactBallAlwaysBecomesSolo,
kinematic:window.__sixBallReferenceSplitUsesKinematicContinuity,
v21:window.__sixBallFinalRigidityAuthorityVersion
};
})()
`,ctx);
expect(dynamic.version==="reference-upconvex-authority-v1","compatibility authority marker missing");
expect(dynamic.version2==="reference-upconvex-authority-v2","reference authority v2 not loaded");
expect(dynamic.v21==="final-rigidity-authority-v21","v21 safety authority missing underneath reference layer");
expect(dynamic.contactAlwaysSolo===false,"contact-side solo is still exposed as an absolute invariant");
expect(dynamic.kinematic===true,"kinematic selector flag missing");
expect(dynamic.momentumLeft.count===3,"left-momentum central contact did not split");
expect(JSON.stringify(dynamic.momentumLeft.pair)===JSON.stringify([dynamic.momentumLeft.topId,dynamic.momentumLeft.leftId].sort((a,b)=>a-b)),"left-moving top did not keep left lower in the pair");
expect(dynamic.momentumLeft.soloId===dynamic.momentumLeft.rightId,"left-moving central case released wrong lower ball");
expect(dynamic.momentumLeft.maxPairDistanceError<1e-9,"left pair stretched");
expect(dynamic.momentumRight.count===3,"right-momentum central contact did not split");
expect(JSON.stringify(dynamic.momentumRight.pair)===JSON.stringify([dynamic.momentumRight.topId,dynamic.momentumRight.rightId].sort((a,b)=>a-b)),"right-moving top did not keep right lower in the pair");
expect(dynamic.momentumRight.soloId===dynamic.momentumRight.leftId,"right-moving central case released wrong lower ball");
expect(dynamic.momentumRight.maxPairDistanceError<1e-9,"right pair stretched");
expect(dynamic.airborne.count===0,"reference selector split while visually airborne");
expect(dynamic.airborne.rigid3,"reference selector broke triplet in air");
const firstContact=vm.runInContext(`
(()=>{
function makeScenario(seed,raiseRows=0){
const game=createEngine(seed),gid=seed,offset=-.82;
const specs=[{x:6,y:3,c:2,role:0},{x:5,y:4,c:0,role:2},{x:7,y:4,c:4,role:1}];
const members=specs.map(spec=>{
const ball=mkBall(game,spec.c);ball.motionGroupId=gid;ball.motionGroupRole=spec.role;ball.motionGroupOrientation="up";ball.motionGroupSize=3;ball.rigid=true;
ball.impactOffsetX=offset;ball.momentumX=-1;ball.rollDir=-1;ball.subCellBias=-1;
game.board[spec.y][spec.x]=ball;noteBoardCell(game.board,spec.y,ball);
return{ball,x:spec.x,y:spec.y,role:spec.role,orientation:"up"};
});
const support=mkBall(game,1);game.board[5][6]=support;noteBoardCell(game.board,5,support);game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
const rightRealDx=Math.abs(((7+offset)-6)*.5);
const vertical=Math.sqrt(1-rightRealDx*rightRealDx);
const rightContactRow=5-vertical/HEX_ROW_H-raiseRows;
const rowOffset=rightContactRow-4;
for(const member of members){
const v={x:member.x+offset,y:member.y+rowOffset,vy:5,motionSpeed:5,justReleased:true};game.vis.set(member.ball.id,v);
}
game._visualMovingIds=new Set();game._liveBatchClock={elapsed:0,duration:0,states:new Map()};
window.__sixBallLastReferenceUpConvexChoiceV1={};
const plan=hexPhysPlanGroup(game.board,members,false)||[];
const pair=plan.filter(p=>Number(p.groupSize)===2).map(p=>p.ball.id).sort((a,b)=>a-b),solo=plan.find(p=>Number(p.groupSize)===0);
const rv=game.vis.get(members[2].ball.id),lv=game.vis.get(members[1].ball.id),sv=game.vis.get(support.id);
const rd=Math.hypot((rv.x-sv.x)*.5,(rv.y-sv.y)*HEX_ROW_H),ld=Math.hypot((lv.x-sv.x)*.5,(lv.y-sv.y)*HEX_ROW_H);
return{count:plan.length,pair,soloId:solo?.ball?.id??null,topId:members[0].ball.id,leftId:members[1].ball.id,rightId:members[2].ball.id,
rightDistance:rd,leftDistance:ld,choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})},rigid3:members.every(m=>m.ball.rigid&&m.ball.motionGroupSize===3)};
}
return{
touching:makeScenario(826101,0),
preContact:makeScenario(826102,.08),
outerAllowed:window.__sixBallReferenceFirstContactCanSplitOuterQuarter,
bilateralRequired:window.__sixBallReferenceFirstContactRequiresBilateralPivot,
signedContact:window.__sixBallHardDropUsesSignedContactOffset,
cohortTiming:window.__sixBallSplitBatchUsesPerCohortTiming
};
})()
`,ctx);
expect(firstContact.outerAllowed===true,"outer-quarter first contact is not enabled");
expect(firstContact.bilateralRequired===false,"first contact still requires bilateral pivot");
expect(firstContact.signedContact===true,"signed hard-drop contact handoff is not enabled");
expect(firstContact.cohortTiming===true,"per-cohort split timing is not enabled");
expect(close(firstContact.touching.rightDistance,1,2e-6),"reference touching ball is not at one-diameter contact");
expect(firstContact.touching.leftDistance>1.20,"opposite lower ball is not clearly free at first contact");
expect(firstContact.touching.count===3,"outer-quarter first contact did not author one 2+1 event");
expect(JSON.stringify(firstContact.touching.pair)===JSON.stringify([firstContact.touching.topId,firstContact.touching.leftId].sort((a,b)=>a-b)),"outer-quarter right contact did not retain top + left pair");
expect(firstContact.touching.soloId===firstContact.touching.rightId,"outer-quarter contacted right ball did not begin outward solo motion");
expect(firstContact.touching.choice.reason==="reference-first-unilateral-contact","first-contact override was not the authority used");
expect(firstContact.touching.choice.hitFraction>.88&&firstContact.touching.choice.hitFraction<.94,"reference outer hit fraction is not near measured .91");
expect(firstContact.preContact.choice.reason!=="reference-first-unilateral-contact","split fired before physical contact");
const lockContact=vm.runInContext(`
(()=>{
const game=createEngine(826201);game.state="PLAYING";
const support=mkBall(game,1);game.board[5][6]=support;noteBoardCell(game.board,5,support);game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
game.piece={x:5,y:4,rot:1,colors:[2,4,0]};game.freeX=4.18;game.pieceVX=4.18;game.dropT=0;
lock(game,5);
const balls=[];for(let y=boardScanMin(game.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?game.board[y][x]:null;if(b&&b!==support&&b.visualTripletId)balls.push({b,x,y,v:game.vis.get(b.id)});}
const right=balls.find(q=>q.b.visualTripletRole===1),left=balls.find(q=>q.b.visualTripletRole===2),top=balls.find(q=>q.b.visualTripletRole===0);
const sv=game.vis.get(support.id);
const rd=right?Math.hypot((right.v.x-sv.x)*.5,(right.v.y-sv.y)*HEX_ROW_H):99;
const firstFrom=right?.b?.fallPath?.[0]?.from||null;
return{rd,firstFrom,rightV:right?.v?{x:right.v.x,y:right.v.y}:null,
rightRigid:!!right?.b?.rigid,rightSize:Number(right?.b?.motionGroupSize)||0,
leftRigid:!!left?.b?.rigid,leftSize:Number(left?.b?.motionGroupSize)||0,
topRigid:!!top?.b?.rigid,topSize:Number(top?.b?.motionGroupSize)||0,
signed:{...(window.__sixBallLastSignedHardDropContactV2||{})},choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})}};
})()
`,ctx);
expect(close(lockContact.rd,1,3e-5),"hard-drop handoff did not land at exact one-diameter visual contact");
expect(lockContact.firstFrom&&lockContact.rightV&&close(lockContact.firstFrom[0],lockContact.rightV.x,1e-9)&&close(lockContact.firstFrom[1],lockContact.rightV.y,1e-9),"first split segment did not start at exact signed contact visual");
expect(lockContact.signed.releaseFrac<0,"outer-quarter hard drop did not use the required negative fractional contact offset");
expect(lockContact.choice.reason==="reference-first-unilateral-contact","hard-drop lock did not split on its first physical contact");
expect(lockContact.rightRigid===false&&lockContact.rightSize===0,"contacted right ball retained triplet rigidity after first contact");
expect(lockContact.leftRigid&&lockContact.topRigid&&lockContact.leftSize===2&&lockContact.topSize===2,"surviving pair was not committed immediately at first contact");
const timing=vm.runInContext(`
(()=>{
const pairCell={id:9101},soloCell={id:9102};
const pairMember={cell:pairCell,duration:.1,seg:{from:[1,1],to:[0,2],pivot:[2,2],topPivot:null,kind:"REFERENCE_FIRST_CONTACT_PAIR",groupSize:2,bundleId:77}};
const soloMember={cell:soloCell,duration:.2,seg:{from:[3,1],to:[4,2],pivot:[2,2],topPivot:null,kind:"REFERENCE_FIRST_CONTACT_SOLO",groupSize:0,bundleId:0}};
const batch={duration:.2,members:[pairMember,soloMember],byId:new Map([[pairCell.id,pairMember],[soloCell.id,soloMember]])};
const states=new Map([[pairCell.id,{startState:{vy:0,speed:0},naturalDuration:.1}],[soloCell.id,{startState:{vy:0,speed:0},naturalDuration:.2}]]);
const p=liveBatchPointAt(batch,pairMember,.5,states,new Map(),new Set()),s=liveBatchPointAt(batch,soloMember,.5,states,new Map(),new Set());
return{pair:p,solo:s,pairTarget:pairMember.seg.to,soloTarget:soloMember.seg.to};
})()
`,ctx);
expect(close(timing.pair[0],timing.pairTarget[0],1e-9)&&close(timing.pair[1],timing.pairTarget[1],1e-9),"short rigid cohort was still stretched to solo duration");
expect(Math.hypot(timing.solo[0]-timing.soloTarget[0],timing.solo[1]-timing.soloTarget[1])>.05,"solo incorrectly completed at pair duration");
console.log("2026-08-26 Nintendo-reference UP-convex v2 PASS",JSON.stringify({dynamic,firstContact,lockContact,timing}));
