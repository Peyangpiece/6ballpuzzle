(function(){
if(
typeof window==="undefined" ||
window.__sixBallReferenceUpConvexAuthorityV2 ||
typeof hexPhysPlanGroup!=="function" ||
typeof hexPhysIndependentMemberMotion!=="function"
)return;
window.__sixBallReferenceUpConvexAuthorityV1=true;
window.__sixBallReferenceUpConvexAuthorityV2=true;
const basePlanGroup=hexPhysPlanGroup;
const liveEngineByBoard=new WeakMap();
const FIRST_CONTACT_EPS=0.014;
const FIRST_CONTACT_MIN=0.94;
const HARD_DROP_VY_MIN=4.5;
if(typeof createEngine==="function"){
const baseCreateEngine=createEngine;
createEngine=function(...args){
const game=baseCreateEngine(...args);
if(game?.board&&typeof game.board==="object")liveEngineByBoard.set(game.board,game);
return game;
};
}
function memberId(value){return value?.ball?.id;}
function vectorOf(step){
if(!step)return null;
const dx=Number(step.tx)-Number(step.x),dy=Number(step.ty)-Number(step.y);
return Number.isFinite(dx)&&Number.isFinite(dy)&&(dx||dy)?{dx,dy,key:dx+","+dy}:null;
}
function sameVector(steps){
if(!Array.isArray(steps)||!steps.length)return null;
const v=vectorOf(steps[0]);
return v&&steps.every(step=>vectorOf(step)?.key===v.key)?v:null;
}
function ordinaryTriplet(members){
return Array.isArray(members)&&members.length===3&&members.every(m=>
m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage
);
}
function upwardLayout(members){
if(!ordinaryTriplet(members))return null;
const ordered=[...members].sort((a,b)=>a.y-b.y||a.x-b.x);
const top=ordered[0],lower=ordered.slice(1).sort((a,b)=>a.x-b.x);
if(
!top||lower.length!==2||lower[0].y!==lower[1].y||
!(top.y<lower[0].y)||!(lower[0].x<top.x&&top.x<lower[1].x)
)return null;
return{top,left:lower[0],right:lower[1]};
}
function clearMember(member){
if(!member?.ball)return;
if(typeof hexPhysClearGroupBall==="function")hexPhysClearGroupBall(member.ball);
else{
member.ball.motionGroupId=0;member.ball.motionGroupRole=-1;
member.ball.motionGroupOrientation="";member.ball.motionGroupSize=0;
member.ball.rigid=false;
}
}
function pairCommit(pair,solo,steps,fallbackGid=0){
const gid=Number(steps?.find(step=>Number(step.bundleId))?.bundleId)||
Number(pair[0]?.ball?.motionGroupId)||Number(fallbackGid)||0;
clearMember(solo);
for(const member of pair){
if(gid)member.ball.motionGroupId=gid;
member.ball.motionGroupSize=2;
member.ball.motionGroupOrientation="up";
member.ball.rigid=true;
}
return gid;
}
function independentMotions(board,members){
return members.map(member=>{
try{return hexPhysIndependentMemberMotion(board,members,member)||null;}
catch(_){return null;}
});
}
function ballBias(ball){
for(const key of["momentumX","rollDir","subCellBias"]){
const sign=Math.sign(Number(ball?.[key])||0);if(sign)return sign;
}
return 0;
}
function physicalVisualDistance(a,b){
return Math.hypot((Number(a.x)-Number(b.x))*.5,(Number(a.y)-Number(b.y))*HEX_ROW_H);
}
function visualFor(game,ball){return game?.vis?.get?.(ball?.id)||null;}
function supportIsMoving(game,ball){
if(!ball)return true;
const v=visualFor(game,ball);
const clock=game?._liveBatchClock;
return !!(
(Array.isArray(ball.fallPath)&&ball.fallPath.length)||
(game?._visualMovingIds instanceof Set&&game._visualMovingIds.has(ball.id))||
(clock?.states instanceof Map&&clock.states.has(ball.id)&&Number(clock.elapsed)<Number(clock.duration)-1e-9)||
v?.pileFlow||v?.justReleased||v?._pendingPathComplete
);
}
function firstUnilateralReleaseContact(board,members,layout){
const game=liveEngineByBoard.get(board);
if(!game)return null;
const topV=visualFor(game,layout.top.ball),leftV=visualFor(game,layout.left.ball),rightV=visualFor(game,layout.right.ball);
if(!topV||!leftV||!rightV)return null;
if(![topV,leftV,rightV].some(v=>v?.justReleased))return null;
if(members.some(m=>Array.isArray(m.ball.fallPath)&&m.ball.fallPath.length))return null;
const own=new Set(members.map(memberId)),contacts=[];
for(const lower of[layout.left,layout.right]){
const lv=visualFor(game,lower.ball);if(!lv)continue;
let best=null;
for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
const support=valid(x,y)?board[y][x]:null;
if(!support||own.has(support.id)||supportIsMoving(game,support))continue;
const sv=visualFor(game,support);if(!sv)continue;
const dy=(Number(sv.y)-Number(lv.y))*HEX_ROW_H;
if(!(dy>0.02&&dy<1.15))continue;
const dist=physicalVisualDistance(lv,sv);
if(dist>1+FIRST_CONTACT_EPS||dist<FIRST_CONTACT_MIN)continue;
const score=Math.abs(dist-1);
if(!best||score<best.score)best={lower,support,lv,sv,x,y,dist,score};
}
if(best)contacts.push(best);
}
if(contacts.length!==1)return null;
const hit=contacts[0],span=Number(rightV.x)-Number(leftV.x);
if(!(span>1e-6))return null;
const hitFraction=(Number(hit.sv.x)-Number(leftV.x))/span;
if(hitFraction<-.06||hitFraction>1.06)return null;
const outward=Math.sign(Number(hit.lv.x)-Number(hit.sv.x))||
(hit.lower===layout.right?1:-1);
const other=hit.lower===layout.left?layout.right:layout.left;
return{...hit,hitFraction,outward,pair:[layout.top,other],solo:hit.lower,game};
}
function wholeRigidProposal(plan,members){
const moving=(plan||[]).filter(step=>vectorOf(step));
const ids=new Set(moving.map(memberId));
return moving.length===members.length&&ids.size===members.length&&sameVector(moving)?moving:null;
}
function pairFromWhole(whole,pair,gid){
const ids=new Set(pair.map(memberId));
const steps=whole.filter(step=>ids.has(memberId(step)));
if(steps.length!==2||!sameVector(steps))return null;
return steps.map(step=>({
...step,
kind:"REFERENCE_FIRST_CONTACT_PAIR",
bundleId:Number(step.bundleId)||gid,
groupSize:2
}));
}
function pairFromIndependent(board,members,pair,motions,gid){
const pairMotions=pair.map(member=>motions[members.indexOf(member)]).filter(Boolean);
const v=pairMotions.length===2?sameVector(pairMotions):null;
if(!v)return null;
const own=new Set(members.map(memberId)),targets=new Set(),steps=[];
for(const member of pair){
const tx=member.x+v.dx,ty=member.y+v.dy,key=tx+","+ty;
if(!valid(tx,ty)||targets.has(key))return null;
const q=board[ty][tx];if(q&&!own.has(q.id))return null;
targets.add(key);
const step={x:member.x,y:member.y,tx,ty,ball:member.ball,
kind:"REFERENCE_FIRST_CONTACT_PAIR",pivot:null,topPivot:null,
followSupportIds:[],bundleId:gid,groupSize:2};
if(typeof hexPhysPathHitsStationary==="function"&&hexPhysPathHitsStationary(step,board,own))return null;
steps.push(step);
}
return steps;
}
function soloFirstContactMotion(board,members,hit,motions){
const index=members.indexOf(hit.solo),natural=index>=0?motions[index]:null;
const naturalPivot=Array.isArray(natural?.pivot)&&
Number(natural.pivot[0])===hit.x&&Number(natural.pivot[1])===hit.y;
if(natural&&naturalPivot&&Math.sign(Number(natural.tx)-Number(natural.x))===hit.outward){
return{...natural,kind:"REFERENCE_FIRST_CONTACT_SOLO",bundleId:0,groupSize:0};
}
const tx=hit.x+2*hit.outward,ty=hit.y;
const own=new Set(members.map(memberId));
if(!valid(tx,ty)){return null;}
const q=board[ty][tx];if(q&&!own.has(q.id))return null;
return{
x:hit.solo.x,y:hit.solo.y,tx,ty,ball:hit.solo.ball,
kind:"REFERENCE_FIRST_CONTACT_SOLO",pivot:[hit.x,hit.y],topPivot:null,
followSupportIds:[],bundleId:0,groupSize:0
};
}
function planFirstContact(board,members,layout,hit,preview){
let underlying=[];
try{underlying=basePlanGroup(board,members,true)||[];}catch(_){underlying=[];}
const motions=independentMotions(board,members),gid=Number(members[0]?.ball?.motionGroupId)||0;
const whole=wholeRigidProposal(underlying,members);
const pairPlan=(whole&&pairFromWhole(whole,hit.pair,gid))||
pairFromIndependent(board,members,hit.pair,motions,gid);
const soloPlan=soloFirstContactMotion(board,members,hit,motions);
if(!pairPlan||!soloPlan)return null;
const plan=[...pairPlan,soloPlan];
if(!preview){
pairCommit(hit.pair,hit.solo,pairPlan,gid);
const pairV=sameVector(pairPlan);
const pairDir=Math.sign(pairV?.dx||0);
for(const member of hit.pair){
if(pairDir){member.ball.momentumX=pairDir;member.ball.rollDir=pairDir;member.ball.subCellBias=pairDir;}
member.ball._referenceFirstContactSplitV2=true;
}
hit.solo.ball.momentumX=hit.outward;
hit.solo.ball.rollDir=hit.outward;
hit.solo.ball.subCellBias=hit.outward;
hit.solo.ball._referenceFirstContactSplitV2=true;
window.__sixBallLastReferenceUpConvexChoiceV1={
reason:"reference-first-unilateral-contact",
hitFraction:hit.hitFraction,
contactSide:hit.solo===layout.left?"left":"right",
contactSoloId:memberId(hit.solo),
pairIds:hit.pair.map(memberId),
supportId:hit.support.id,
supportCell:[hit.x,hit.y],
visualDistance:hit.dist,
at:Date.now()
};
}
return plan;
}
function classifyActiveSplit(plan,members){
const layout=upwardLayout(members);if(!layout||!Array.isArray(plan))return null;
const moving=plan.filter(step=>vectorOf(step));
const pairSteps=moving.filter(step=>Number(step.groupSize)===2),soloSteps=moving.filter(step=>Number(step.groupSize)===0);
const pairIds=new Set(pairSteps.map(memberId));
if(pairIds.size!==2||soloSteps.length!==1||!pairIds.has(memberId(layout.top)))return null;
const soloId=memberId(soloSteps[0]);if(pairIds.has(soloId))return null;
const pairLower=pairIds.has(memberId(layout.left))?layout.left:pairIds.has(memberId(layout.right))?layout.right:null;
const solo=soloId===memberId(layout.left)?layout.left:soloId===memberId(layout.right)?layout.right:null;
if(!pairLower||!solo||pairLower===solo)return null;
const dir=pairLower===layout.left?-1:1,pairVector=vectorOf(pairSteps[0]);
if(!pairVector||Math.sign(pairVector.dx)!==dir||pairVector.dy<=0)return null;
return{plan:moving,layout,pairLower,solo,dir,pairIds,soloId};
}
function buildCandidate(board,members,layout,separator,motions,dir){
if(typeof hexPhysUpConvexSplitPlan!=="function")return null;
const pairLower=dir<0?layout.left:layout.right,solo=dir<0?layout.right:layout.left;
const soloIndex=members.indexOf(solo),soloMotion=soloIndex>=0?motions[soloIndex]:null,soloVector=vectorOf(soloMotion);
if(!soloVector||Math.sign(soloVector.dx)!==-dir||soloVector.dy<=0)return null;
const info={...separator,dir,top:layout.top,pairLower,solo,soloMotion,
pairSide:dir<0?"left":"right",soloSide:dir<0?"right":"left",splitSide:dir<0?"right":"left"};
let plan=null;try{plan=hexPhysUpConvexSplitPlan(board,members,info,true)||null;}catch(_){plan=null;}
const classified=classifyActiveSplit(plan,members);
return classified&&classified.dir===dir?{...classified,info}:null;
}
function evidenceScore(candidate,members,motions,isBase){
const expected=new Map([
[memberId(candidate.layout.top),candidate.dir],
[memberId(candidate.pairLower),candidate.dir],
[memberId(candidate.solo),-candidate.dir]
]);
let score=isBase?.75:0;
for(const member of members){
const target=expected.get(memberId(member));if(!target)continue;
const moveDir=Math.sign(vectorOf(motions[members.indexOf(member)])?.dx||0),isTop=member===candidate.layout.top;
if(moveDir)score+=moveDir===target?(isTop?10:2):-(isTop?10:2);
const bias=ballBias(member.ball);if(bias)score+=bias===target?(isTop?6:1.5):-(isTop?6:1.5);
}
const groupBias=Math.sign(members.reduce((sum,m)=>sum+ballBias(m.ball),0));
if(groupBias)score+=groupBias===candidate.dir?3:-3;
return score;
}
function commitChosen(candidate,members,baseChoice,baseScore,chosenScore){
const pair=[...members].filter(m=>candidate.pairIds.has(memberId(m))),solo=candidate.solo;
pairCommit(pair,solo,candidate.plan,Number(members[0]?.ball?.motionGroupId)||0);
for(const member of pair){member.ball.momentumX=candidate.dir;member.ball.rollDir=candidate.dir;member.ball.subCellBias=candidate.dir;}
solo.ball.momentumX=-candidate.dir;solo.ball.rollDir=-candidate.dir;solo.ball.subCellBias=-candidate.dir;
window.__sixBallLastReferenceUpConvexChoiceV1={
reason:"reference-kinematic-side-overrode-contact-side",
chosenDir:candidate.dir,baseDir:baseChoice.dir,chosenPairIds:[...candidate.pairIds],chosenSoloId:memberId(solo),
basePairIds:[...baseChoice.pairIds],baseSoloId:baseChoice.soloId,baseScore,chosenScore,at:Date.now()
};
}
hexPhysPlanGroup=function(board,members,preview=false){
const layout=upwardLayout(members);
if(!layout)return basePlanGroup(board,members,preview)||[];
const first=firstUnilateralReleaseContact(board,members,layout);
if(first){
const plan=planFirstContact(board,members,layout,first,preview);
if(plan)return plan;
}
let authorized=[];try{authorized=basePlanGroup(board,members,true)||[];}catch(_){authorized=[];}
const baseChoice=classifyActiveSplit(authorized,members);
if(!baseChoice)return basePlanGroup(board,members,preview)||[];
const motions=independentMotions(board,members);
let separator=null;try{separator=typeof hexPhysUpConvexSeparator==="function"?hexPhysUpConvexSeparator(board,members,motions):null;}catch(_){separator=null;}
if(!separator||!Number.isFinite(Number(separator.px))||!Number.isFinite(Number(separator.py)))return basePlanGroup(board,members,preview)||[];
const baseCandidate=buildCandidate(board,members,layout,separator,motions,baseChoice.dir)||baseChoice;
const alternateCandidate=buildCandidate(board,members,layout,separator,motions,-baseChoice.dir);
if(!alternateCandidate)return basePlanGroup(board,members,preview)||[];
const baseScore=evidenceScore(baseCandidate,members,motions,true),alternateScore=evidenceScore(alternateCandidate,members,motions,false);
if(!(alternateScore>baseScore+1.5))return basePlanGroup(board,members,preview)||[];
if(preview)return alternateCandidate.plan;
commitChosen(alternateCandidate,members,baseChoice,baseScore,alternateScore);
return alternateCandidate.plan;
};
function signedHardDropContactOffset(g,cells,dx,dOff,desired=2){
if(!g?.board)return 0;
const H=HEX_ROW_H,R=1.000001;let safe=desired;
for(const[sx0,sy]of cells){
const sxN=latticeRealX(sx0+dx),syN=cellCenterYNorm(sy+dOff);
safe=Math.min(safe,(FLOOR_CENTER_N-syN)/H);
for(let by=boardScanMin(g.board);by<ROWS;by++)for(let bx=0;bx<W2;bx++){
const ball=valid(bx,by)?g.board[by][bx]:null;if(!ball)continue;
const bv=g.vis.get(ball.id),bxx=latticeRealX(bv?bv.x:bx),byy=cellCenterYNorm(bv?bv.y:by);
const hx=Math.abs(sxN-bxx);if(hx>=R)continue;
const vertical=Math.sqrt(Math.max(0,R*R-hx*hx));
safe=Math.min(safe,(byy-vertical-syN)/H);
}
}
return Math.max(-1.999999,Math.min(desired,safe));
}
if(typeof lock==="function"){
const baseLock=lock;
lock=function(g,vy=2){
if(!g?.piece||Number(vy)<HARD_DROP_VY_MIN)return baseLock(g,vy);
clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
const preSnapX=g.freeX!=null?g.freeX:g.piece.x,splitRot=g.piece.rot;
if(g.freeX!=null)setColumn(g,g.freeX);
const splitOffset=Math.max(-1,Math.min(1,preSnapX-g.piece.x));
let cells=pieceCells(g.piece);
let releaseFrac=signedHardDropContactOffset(g,cells,splitOffset,0,2);
let invalid=cells.some(([x,y])=>!valid(x,y)||g.board[y][x]!==null);
if(invalid){
let recovered=null;
for(let y=Math.min(ROWS-1,g.piece.y);y>=BOARD_MIN_ROW;y--){
const q={...g.piece,y};if(pieceFits(g.board,q)){recovered=dropPiece(g.board,q);break;}
}
if(recovered)g.piece=recovered;
cells=pieceCells(g.piece);releaseFrac=signedHardDropContactOffset(g,cells,splitOffset,0,2);
invalid=cells.some(([x,y])=>!valid(x,y)||g.board[y][x]!==null);
if(invalid){die(g,cells.map(([x,y,c])=>[x,y,c]),"LIMIT");return;}
}
const made=[];
for(let role=0;role<cells.length;role++){
const[x,y,c]=cells[role],ball=mkBall(g,c);
ball.impactOffsetX=splitOffset;ball.subCellBias=Math.abs(splitOffset)>1e-5?Math.sign(splitOffset):0;ball.momentumX=ball.subCellBias;
g.board[y][x]=ball;noteBoardCell(g.board,y,ball);made.push({ball,role,x,y});
setVis(g,ball,x+splitOffset,y+releaseFrac,Math.max(RELEASE_INITIAL_VY,vy||0));
const vv=g.vis.get(ball.id);vv.motionSpeed=Math.max(RELEASE_INITIAL_VY,vy||0);vv.justReleased=true;
}
const gid=made.length?HEX_PHYS_GROUP_SEQ++:0,orientation=((splitRot&1)===0)?"down":"up";
for(const m of made){
m.ball.motionGroupId=gid;m.ball.motionGroupRole=m.role;m.ball.motionGroupOrientation=orientation;m.ball.motionGroupSize=3;m.ball.rigid=true;
m.ball.visualTripletId=gid;m.ball.visualTripletOrientation=orientation;m.ball.visualTripletRole=m.role;
}
const immediateMoved=settlePass(g.board);if(immediateMoved)g.ver++;
for(const m of made){
const seg=m.ball.fallPath?.[0],v=g.vis.get(m.ball.id);
if(seg?.from&&v)seg.from=[v.x,v.y];
}
g.piece=null;g.hardDropAnim=null;g.freeX=null;g.dragging=false;g.ver++;emit(g,{t:"land"});
g.state="RESOLVING";g.phase="SETTLE";g.stateT=0;
if(immediateMoved&&g.physicsWatch){g.physicsWatch.lastSig=physicsSignature(g);g.physicsWatch.repeats=0;g.physicsWatch.steps=0;}
window.__sixBallLastSignedHardDropContactV2={releaseFrac,splitOffset,immediateMoved,at:Date.now()};
};
}
if(typeof hexMotionDuration==="function"){
const baseHexMotionDuration=hexMotionDuration;
hexMotionDuration=function(seg,state={vy:0,speed:0}){
const d=baseHexMotionDuration(seg,state);
return String(seg?.kind||"").startsWith("REFERENCE_FIRST_CONTACT_")
?Math.max(1/120,d*(REFERENCE_SLOPE_HARD_FRAMES/REFERENCE_SLIDE_FRAMES))
:d;
};
}
if(typeof liveBatchPointAt==="function"){
const baseLiveBatchPointAt=liveBatchPointAt;
liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
const members=batch?.members||[];
const splitBatch=members.some(m=>Number(m.seg?.groupSize)===2)&&members.some(m=>Number(m.seg?.groupSize)===0)&&
!members.some(m=>m.seg?.kind==="FOLLOW_SUPPORT");
if(!splitBatch)return baseLiveBatchPointAt(batch,member,t,states,memo,stack);
const state=states?.get(member?.cell?.id),natural=Math.max(1e-9,Number(state?.naturalDuration)||Number(member?.duration)||0);
let cohortDuration=natural;
const size=Number(member?.seg?.groupSize)||0,bundle=Number(member?.seg?.bundleId)||0;
if(size>=2){
const cohort=members.filter(m=>Number(m.seg?.groupSize)===size&&Number(m.seg?.bundleId)===bundle);
cohortDuration=Math.max(natural,...cohort.map(m=>Math.max(1e-9,Number(states?.get(m.cell.id)?.naturalDuration)||Number(m.duration)||0)));
}
const localT=Math.max(0,Math.min(1,Number(t)*Math.max(1e-9,Number(batch?.duration)||cohortDuration)/cohortDuration));
return baseLiveBatchPointAt(batch,member,localT,states,memo,stack);
};
}
window.__sixBallCurrentContactBallAlwaysBecomesSolo=false;
window.__sixBallReferenceMayKeepContactSideInPair=true;
window.__sixBallReferenceSplitUsesKinematicContinuity=true;
window.__sixBallReferenceSplitStillRequiresV21CurrentContact=false;
window.__sixBallReferenceFirstContactCanSplitOuterQuarter=true;
window.__sixBallReferenceFirstContactRequiresBilateralPivot=false;
window.__sixBallHardDropUsesSignedContactOffset=true;
window.__sixBallSplitBatchUsesPerCohortTiming=true;
window.__sixBallReferenceImpactSlideFrames=REFERENCE_SLOPE_HARD_FRAMES;
window.__sixBallReferenceUpConvexAuthorityVersion="reference-upconvex-authority-v1";
window.__sixBallReferenceUpConvexAuthorityVersion2="reference-upconvex-authority-v2";
})();
