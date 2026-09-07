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
sweepVersion:window.__sixBallReferenceFirstContactSweepVersion,
contactAlwaysSolo:window.__sixBallCurrentContactBallAlwaysBecomesSolo,
kinematic:window.__sixBallReferenceSplitUsesKinematicContinuity,
v21:window.__sixBallFinalRigidityAuthorityVersion
};
})()
`,ctx);
expect(dynamic.version==="reference-upconvex-authority-v1","compatibility authority marker missing");
expect(dynamic.version2==="reference-upconvex-authority-v2","reference authority v2 not loaded");
expect(dynamic.sweepVersion==="reference-first-contact-sweep-v3","reference rendered sweep v3 not loaded");
expect(dynamic.v21==="final-rigidity-authority-v21","v21 safety authority missing underneath reference layer");
expect(dynamic.contactAlwaysSolo===true,"contact-side solo absolute invariant is missing");
expect(dynamic.kinematic===false,"kinematic history can still reverse the physical contact side");
expect(dynamic.momentumLeft.count===3,"left-momentum central contact did not split");
expect(JSON.stringify(dynamic.momentumLeft.pair)===JSON.stringify([dynamic.momentumLeft.topId,dynamic.momentumLeft.rightId].sort((a,b)=>a-b)),"left physical contact did not keep top+right as the opposite pair");
expect(dynamic.momentumLeft.soloId===dynamic.momentumLeft.leftId,"left physical contact did not release the left lower ball");
expect(dynamic.momentumLeft.maxPairDistanceError<1e-9,"left pair stretched");
expect(dynamic.momentumRight.count===3,"right-momentum central contact did not split");
expect(JSON.stringify(dynamic.momentumRight.pair)===JSON.stringify([dynamic.momentumRight.topId,dynamic.momentumRight.rightId].sort((a,b)=>a-b)),"momentum reversed the left physical contact mapping");
expect(dynamic.momentumRight.soloId===dynamic.momentumRight.leftId,"momentum reversed the contacted left solo ball");
expect(dynamic.momentumRight.maxPairDistanceError<1e-9,"right pair stretched");
expect(dynamic.airborne.count===0,"reference selector split while visually airborne");
expect(dynamic.airborne.rigid3,"reference selector broke triplet in air");
const firstContact=vm.runInContext(`
(()=>{
function makeScenario(seed,offset,raiseRows=0){
const game=createEngine(seed),gid=seed;
const specs=[{x:6,y:3,c:2,role:0},{x:5,y:4,c:0,role:2},{x:7,y:4,c:4,role:1}];
const members=specs.map(spec=>{
const ball=mkBall(game,spec.c);ball.motionGroupId=gid;ball.motionGroupRole=spec.role;ball.motionGroupOrientation="up";ball.motionGroupSize=3;ball.rigid=true;
ball.impactOffsetX=offset;ball.momentumX=-1;ball.rollDir=-1;ball.subCellBias=-1;
game.board[spec.y][spec.x]=ball;noteBoardCell(game.board,spec.y,ball);
return{ball,x:spec.x,y:spec.y,role:spec.role,orientation:"up"};
});
const support=mkBall(game,1);game.board[5][6]=support;noteBoardCell(game.board,5,support);game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
const contactX=offset<0?7+offset:5+offset;
const contactRealDx=Math.abs((contactX-6)*.5);
const vertical=Math.sqrt(1-contactRealDx*contactRealDx);
const contactRow=5-vertical/HEX_ROW_H-raiseRows;
const rowOffset=contactRow-4;
for(const member of members){
const v={x:member.x+offset,y:member.y+rowOffset,vy:5,motionSpeed:5,justReleased:true};game.vis.set(member.ball.id,v);
}
game._visualMovingIds=new Set();game._liveBatchClock={elapsed:0,duration:0,states:new Map()};
window.__sixBallLastReferenceUpConvexChoiceV1={};window.__sixBallReferenceFirstContactDiagnosticV2={};window.__sixBallReferenceFirstContactSweepDiagnosticV3={};
const plan=hexPhysPlanGroup(game.board,members,false)||[];
const pair=plan.filter(p=>Number(p.groupSize)===2).map(p=>p.ball.id).sort((a,b)=>a-b),solo=plan.find(p=>Number(p.groupSize)===0);
const rv=game.vis.get(members[2].ball.id),lv=game.vis.get(members[1].ball.id),sv=game.vis.get(support.id);
const rd=Math.hypot((rv.x-sv.x)*.5,(rv.y-sv.y)*HEX_ROW_H),ld=Math.hypot((lv.x-sv.x)*.5,(lv.y-sv.y)*HEX_ROW_H);
return{count:plan.length,pair,soloId:solo?.ball?.id??null,topId:members[0].ball.id,leftId:members[1].ball.id,rightId:members[2].ball.id,
rightDistance:rd,leftDistance:ld,choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})},diag:{...(window.__sixBallReferenceFirstContactDiagnosticV2||{})},sweep:{...(window.__sixBallReferenceFirstContactSweepDiagnosticV3||{})},rigid3:members.every(m=>m.ball.rigid&&m.ball.motionGroupSize===3)};
}
return{
outerRight:makeScenario(826101,-.82,0),
innerRight:makeScenario(826102,-.40,0),
innerLeft:makeScenario(826103,.40,0),
boundaryRight:makeScenario(826104,-.50,0),
boundaryLeft:makeScenario(826105,.50,0),
preContact:makeScenario(826106,-.40,.08),
outerAllowed:window.__sixBallReferenceFirstContactCanSplitOuterQuarter,
innerRequired:window.__sixBallReferenceFirstContactRequiresInnerHalf,
innerMin:window.__sixBallReferenceInnerContactMin,
innerMax:window.__sixBallReferenceInnerContactMax,
boundariesSplit:window.__sixBallReferenceInnerContactBoundariesSplit,
bilateralRequired:window.__sixBallReferenceFirstContactRequiresBilateralPivot,
signedContact:window.__sixBallHardDropUsesSignedContactOffset,
cohortTiming:window.__sixBallSplitBatchUsesPerCohortTiming,
renderedSweep:window.__sixBallReferenceFirstContactSweepUsesRenderedOrigin
};
})()
`,ctx);
console.log("FIRST_CONTACT_DIAGNOSTIC",JSON.stringify(firstContact));
expect(firstContact.outerAllowed===false,"outer-quarter first contact can still split");
expect(firstContact.innerRequired===true,"inner-half first-contact gate is not enabled");
expect(firstContact.innerMin===.25&&firstContact.innerMax===.75,"inner contact boundaries changed");
expect(firstContact.boundariesSplit===false,"25%/75% boundaries can still split");
expect(firstContact.bilateralRequired===false,"first contact still requires bilateral pivot");
expect(firstContact.signedContact===true,"signed hard-drop contact handoff is not enabled");
expect(firstContact.cohortTiming===true,"per-cohort split timing is not enabled");
expect(firstContact.renderedSweep===true,"rendered-origin first-contact sweep is not enabled");
expect(close(firstContact.outerRight.rightDistance,1,2e-6),"outer reference ball is not at one-diameter contact");
expect(firstContact.outerRight.count===0&&firstContact.outerRight.rigid3,"outer-quarter contact split the triplet");
expect(firstContact.outerRight.choice.reason!=="reference-first-unilateral-contact","outer-quarter contact reached the immediate split authority");
expect(close(firstContact.innerRight.rightDistance,1,2e-6),"inner-right ball is not at one-diameter contact");
expect(firstContact.innerRight.count===3,"inner-right contact did not split immediately");
expect(JSON.stringify(firstContact.innerRight.pair)===JSON.stringify([firstContact.innerRight.topId,firstContact.innerRight.leftId].sort((a,b)=>a-b)),"inner-right contact did not retain top + left pair");
expect(firstContact.innerRight.soloId===firstContact.innerRight.rightId,"inner-right contacted ball did not become solo");
expect(firstContact.innerRight.choice.hitFraction>.69&&firstContact.innerRight.choice.hitFraction<.71,"inner-right hit fraction is not near .70");
expect(firstContact.innerRight.sweep.hit===false&&firstContact.innerRight.sweep.minDistance>=.9994,"inner-right split sweep lost separation");
expect(firstContact.innerLeft.count===3,"inner-left contact did not split immediately");
expect(JSON.stringify(firstContact.innerLeft.pair)===JSON.stringify([firstContact.innerLeft.topId,firstContact.innerLeft.rightId].sort((a,b)=>a-b)),"inner-left contact did not retain top + right pair");
expect(firstContact.innerLeft.soloId===firstContact.innerLeft.leftId,"inner-left contacted ball did not become solo");
expect(firstContact.innerLeft.choice.hitFraction>.29&&firstContact.innerLeft.choice.hitFraction<.31,"inner-left hit fraction is not near .30");
expect(firstContact.boundaryRight.count===0&&firstContact.boundaryRight.rigid3,"75% boundary split the triplet");
expect(firstContact.boundaryLeft.count===0&&firstContact.boundaryLeft.rigid3,"25% boundary split the triplet");
expect(firstContact.preContact.choice.reason!=="reference-first-unilateral-contact","split fired before physical contact");
const lockContact=vm.runInContext(`
(()=>{
const game=createEngine(826201);game.state="PLAYING";
const support=mkBall(game,1);game.board[5][6]=support;noteBoardCell(game.board,5,support);game.vis.set(support.id,{x:6,y:5,vy:0,motionSpeed:0});
game.piece={x:5,y:4,rot:1,colors:[2,4,0]};game.freeX=4.60;game.pieceVX=4.60;game.dropT=0;
hardDrop(game);
const balls=[];for(let y=boardScanMin(game.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?game.board[y][x]:null;if(b&&b!==support&&b.visualTripletId)balls.push({b,x,y,v:game.vis.get(b.id)});}
const right=balls.find(q=>q.b.visualTripletRole===1),left=balls.find(q=>q.b.visualTripletRole===2),top=balls.find(q=>q.b.visualTripletRole===0);
const sv=game.vis.get(support.id);
const rd=right?Math.hypot((right.v.x-sv.x)*.5,(right.v.y-sv.y)*HEX_ROW_H):99;
const firstFrom=right?.b?.fallPath?.[0]?.from||null;
return{rd,firstFrom,rightV:right?.v?{x:right.v.x,y:right.v.y}:null,
rightRigid:!!right?.b?.rigid,rightSize:Number(right?.b?.motionGroupSize)||0,
leftRigid:!!left?.b?.rigid,leftSize:Number(left?.b?.motionGroupSize)||0,
topRigid:!!top?.b?.rigid,topSize:Number(top?.b?.motionGroupSize)||0,
maxReleaseVy:Math.max(...balls.map(q=>Number(q.v?.vy)||0)),
maxReleaseSpeed:Math.max(...balls.map(q=>Number(q.v?.motionSpeed)||0)),
neutralReleased:balls.every(q=>q.v?.neutralInstantDrop===true),
impactVelocityAdded:window.__sixBallHardDropAddsImpactVelocity,
normalPostContactVelocity:window.__sixBallHardDropPostContactVelocity,
signed:{...(window.__sixBallLastSignedHardDropContactV2||{})},choice:{...(window.__sixBallLastReferenceUpConvexChoiceV1||{})},sweep:{...(window.__sixBallReferenceFirstContactSweepDiagnosticV3||{})}};
})()
`,ctx);
expect(close(lockContact.rd,1,3e-5),"hard-drop handoff did not land at exact one-diameter visual contact");
expect(lockContact.firstFrom&&lockContact.rightV&&close(lockContact.firstFrom[0],lockContact.rightV.x,1e-9)&&close(lockContact.firstFrom[1],lockContact.rightV.y,1e-9),"first split segment did not start at exact signed contact visual");
expect(lockContact.signed.releaseFrac<0,"inner-contact hard drop did not use the required negative fractional contact offset");
expect(lockContact.impactVelocityAdded===false,"hard drop still adds impact velocity");
expect(lockContact.neutralReleased,"hard-drop release was not tagged as neutral");
expect(lockContact.maxReleaseVy<=lockContact.normalPostContactVelocity+1e-9&&lockContact.maxReleaseSpeed<=lockContact.normalPostContactVelocity+1e-9,"hard drop carried excess momentum into slope motion");
expect(lockContact.choice.reason==="reference-first-unilateral-contact","hard-drop lock did not split on its first physical contact");
expect(lockContact.rightRigid===false&&lockContact.rightSize===0,"contacted right ball retained triplet rigidity after first contact");
expect(lockContact.leftRigid&&lockContact.topRigid&&lockContact.leftSize===2&&lockContact.topSize===2,"surviving pair was not committed immediately at first contact");
expect(lockContact.sweep.hit===false,"hard-drop surviving pair intersects a stationary ball in rendered sweep");
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
console.log("2026-08-26 Nintendo-reference UP-convex v3 PASS",JSON.stringify({dynamic,firstContact,lockContact,timing}));
