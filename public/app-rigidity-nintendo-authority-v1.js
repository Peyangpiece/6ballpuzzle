/* Nintendo-reference rigidity authority v1.
 * Final ordinary-ball constraint policy. Earlier layers may propose motion,
 * but only physical distance-preserving continuation or a real current contact
 * may change a 3/2-ball constraint here.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallNintendoRigidityAuthorityV1||typeof hexPhysPlanGroup!=="function")return;
window.__sixBallNintendoRigidityAuthorityV1=true;
const basePlanGroup=hexPhysPlanGroup;
const gameByBoard=new WeakMap();
const baseCreateEngine=typeof createEngine==="function"?createEngine:null;
if(baseCreateEngine){createEngine=function(...args){const g=baseCreateEngine(...args);if(g?.board)gameByBoard.set(g.board,g);return g;};}
const MUTATION_FIELDS=["motionGroupId","motionGroupRole","motionGroupOrientation","motionGroupSize","rigid","momentumX","rollDir","subCellBias"];
function id(v){return v?.ball?.id;}
function vec(p){if(!p)return null;const dx=Number(p.tx)-Number(p.x),dy=Number(p.ty)-Number(p.y);return Number.isFinite(dx)&&Number.isFinite(dy)&&(dx||dy)?{dx,dy,key:dx+","+dy}:null;}
function sameVector(steps){if(!steps?.length)return null;const a=vec(steps[0]);return a&&steps.every(s=>vec(s)?.key===a.key)?a:null;}
function ordinary(members){return Array.isArray(members)&&(members.length===2||members.length===3)&&members.every(m=>m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage);}
function snapshot(members){return members.map(m=>({ball:m.ball,fields:Object.fromEntries(MUTATION_FIELDS.map(k=>[k,{has:Object.prototype.hasOwnProperty.call(m.ball,k),v:m.ball[k]}]))}));}
function restore(s){for(const e of s)for(const[k,q]of Object.entries(e.fields)){if(q.has)e.ball[k]=q.v;else delete e.ball[k];}}
function previewBase(board,members){const s=snapshot(members);let p=[];try{p=basePlanGroup(board,members,true)||[];}catch(_){p=[];}finally{restore(s);}return p;}
function clear(m){if(typeof hexPhysClearGroupBall==="function")hexPhysClearGroupBall(m.ball);else{m.ball.motionGroupId=0;m.ball.motionGroupSize=0;m.ball.rigid=false;}}
function gidOf(members){return Number(members.find(m=>Number(m.ball.motionGroupId))?.ball.motionGroupId)||0;}
function commitGroup(members,size,gid=gidOf(members)){for(const m of members){if(gid)m.ball.motionGroupId=gid;m.ball.motionGroupSize=size;m.ball.rigid=true;}}
function pointFor(step,t){return typeof proposalPointAt==="function"?proposalPointAt(step,t):normPoint(step.x+(step.tx-step.x)*t,step.y+(step.ty-step.y)*t);}
function pairDistanceAt(a,b,t){const pa=a.step?pointFor(a.step,t):normPoint(a.member.x,a.member.y),pb=b.step?pointFor(b.step,t):normPoint(b.member.x,b.member.y);return Math.hypot(pa[0]-pb[0],pa[1]-pb[1]);}
function distancePreserved(members,plan,eps=2e-5){const byId=new Map((plan||[]).map(p=>[id(p),p]));for(let a=0;a<members.length;a++)for(let b=a+1;b<members.length;b++){const ma=members[a],mb=members[b],d0=hexPhysDist(ma.x,ma.y,mb.x,mb.y);for(let i=0;i<=48;i++){const d=pairDistanceAt({member:ma,step:byId.get(id(ma))},{member:mb,step:byId.get(id(mb))},i/48);if(Math.abs(d-d0)>eps)return false;}}return true;}
function allMembersMove(members,plan){const ids=new Set((plan||[]).filter(vec).map(id));return ids.size===members.length&&members.every(m=>ids.has(id(m)));}
function normalizedWhole(members,plan,gid){return(plan||[]).filter(vec).map(p=>({...p,bundleId:gid||Number(p.bundleId)||0,groupSize:members.length}));}
function motions(board,members){return members.map(m=>{try{return hexPhysIndependentMemberMotion(board,members,m)||null;}catch(_){return null;}});}
function wholeRigid(board,members,ind,base){
  const gid=gidOf(members);
  if(allMembersMove(members,base)&&distancePreserved(members,base))return normalizedWhole(members,base,gid);
  if(ind.every(Boolean)&&sameVector(ind)&&typeof hexPhysGroupTranslationPlan==="function"){
    const v=vec(ind[0]);let p=null;try{p=hexPhysGroupTranslationPlan(board,members,v.dx,v.dy,"NINTENDO_RIGID_TRANSLATE");}catch(_){}
    if(allMembersMove(members,p)&&distancePreserved(members,p))return normalizedWhole(members,p,gid);
  }
  if(members.length===3&&typeof hexPhysRigidSlopePlan==="function"){
    let p=null;try{p=hexPhysRigidSlopePlan(board,members,ind);}catch(_){}
    if(allMembersMove(members,p)&&distancePreserved(members,p))return normalizedWhole(members,p,gid);
  }
  if(members.length===2){
    let p=null;try{p=typeof hexPhysPairPivotPlan==="function"?hexPhysPairPivotPlan(board,members,ind):null;}catch(_){}
    if(Array.isArray(p)&&p.length===1&&vec(p[0])&&distancePreserved(members,p))return normalizedWhole(members,p,gid);
  }
  return null;
}
function liveBusy(game,ball){const v=game?.vis?.get?.(ball.id),clock=game?._liveBatchClock;return!!((Array.isArray(ball.fallPath)&&ball.fallPath.length)||(game?._visualMovingIds instanceof Set&&game._visualMovingIds.has(ball.id))||(clock?.states instanceof Map&&clock.states.has(ball.id)&&Number(clock.elapsed)<Number(clock.duration)-1e-9)||v?.pileFlow||v?._pendingPathComplete);}
function liveContacts(board,members){const game=gameByBoard.get(board);const own=new Set(members.map(id));const out=[];if(!game?.vis)return out;
 for(const m of members){const mv=game.vis.get(m.ball.id);if(!mv)continue;if(typeof touchesFloorRow==="function"&&touchesFloorRow(m.y)&&Math.abs(Number(mv.y)-Number(m.y))<.08)out.push({member:m,kind:"floor",distance:0});
  for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?board[y][x]:null;if(!q||own.has(q.id)||liveBusy(game,q))continue;const qv=game.vis.get(q.id);if(!qv)continue;const dy=(Number(qv.y)-Number(mv.y))*HEX_ROW_H;if(dy<-.04||dy>1.15)continue;const d=Math.hypot((Number(qv.x)-Number(mv.x))*.5,dy);if(d>=.985&&d<=1.018)out.push({member:m,kind:"ball",support:q,x,y,distance:d});}
 }
 return out;
}
function logicalContact(board,members){const own=new Set(members.map(id));for(const m of members){if(typeof touchesFloorRow==="function"&&touchesFloorRow(m.y))return true;if(typeof hexPhysSupportInfo==="function"){let s=null;try{s=hexPhysSupportInfo(board,m.x,m.y,own);}catch(_){}if(s&&(s.realCount>0||s.floor))return true;}}return false;}
function currentContactState(board,members){const game=gameByBoard.get(board);if(!game)return{current:logicalContact(board,members),busy:false,live:false,contacts:[]};const busy=members.some(m=>liveBusy(game,m.ball));const contacts=liveContacts(board,members);return{current:contacts.length>0,busy,live:true,contacts};}
function pairPlan(board,pair){const base=previewBase(board,pair);if(base.length&&distancePreserved(pair,base))return base;const ind=motions(board,pair);if(ind.every(Boolean)&&sameVector(ind)&&typeof hexPhysGroupTranslationPlan==="function"){const v=vec(ind[0]);let p=null;try{p=hexPhysGroupTranslationPlan(board,pair,v.dx,v.dy,"NINTENDO_PAIR_TRANSLATE");}catch(_){}if(p?.length&&distancePreserved(pair,p))return p;}if(typeof hexPhysPairPivotPlan==="function"){let p=null;try{p=hexPhysPairPivotPlan(board,pair,ind);}catch(_){}if(p?.length&&distancePreserved(pair,p))return p;}return null;}
function baseSpecialSplit(members,base){if(members.length!==3)return null;const moving=(base||[]).filter(vec);if(!moving.length)return null;const kinds=moving.map(p=>String(p.kind||""));const firstContact=kinds.some(k=>k==="REFERENCE_FIRST_CONTACT_PAIR"||k==="REFERENCE_FIRST_CONTACT_SOLO");const inverted=kinds.some(k=>/^REFERENCE_INVERTED_HARD_SPLIT_|^INVERTED_FLAT_SPLIT_/.test(k));if(firstContact){const pairSteps=moving.filter(p=>Number(p.groupSize)===2),solo=moving.find(p=>Number(p.groupSize)===0);const pairIds=new Set(pairSteps.map(id));if(pairIds.size===2&&solo&&distancePreserved(members.filter(m=>pairIds.has(id(m))),pairSteps))return{type:"pair",pairIds,soloId:id(solo),plan:moving,reason:"reference-first-contact"};}
 if(inverted)return{type:"full",plan:moving,reason:"reference-inverted-flat"};return null;}
function candidatePairs(board,members,ind,base){const combos=[[0,1,2],[0,2,1],[1,2,0]],special=baseSpecialSplit(members,base);if(special?.type==="pair")return special;let best=null;
 for(const[a,b,s]of combos){const pair=[members[a],members[b]],solo=members[s],pp=pairPlan(board,pair);if(!pp?.length)continue;const soloMotion=ind[s]||null;const va=vec(ind[a]),vb=vec(ind[b]),vs=vec(soloMotion);let score=0;if(va&&vb&&va.key===vb.key)score+=100;if(!soloMotion)score+=35;if(vs&&(va?.key!==vs.key||vb?.key!==vs.key))score+=25;const basePairIds=new Set((base||[]).filter(p=>Number(p.groupSize)===2).map(id));if(basePairIds.has(id(pair[0]))&&basePairIds.has(id(pair[1])))score+=12;const mv=pp.filter(vec);if(distancePreserved(pair,mv))score+=10;if(!best||score>best.score)best={type:"pair",pairIds:new Set(pair.map(id)),soloId:id(solo),pairPlan:mv,soloMotion,score,reason:"kinematic-partition"};}
 return best||special;}
/* A constraint is removed only after the complete body has actually become
 * part of the accumulated pile. Independent-member probes intentionally ignore
 * the other members and therefore cannot prove settlement: a supported top
 * ball may look free when its two partner supports are omitted. Use the real
 * board with every partner present, and reject any release while visuals still
 * carry motion. */
function stableAccumulated(board,members){
 const game=gameByBoard.get(board);
 if(game&&members.some(m=>liveBusy(game,m.ball)))return false;
 if(typeof hexPhysNaturalMotion!=="function")return false;
 for(const m of members){
  let p=null;try{p=hexPhysNaturalMotion(board,m.x,m.y,null);}catch(_){return false;}
  if(p)return false;
 }
 return true;
}
function commitPairSplit(members,candidate,gid){const pair=members.filter(m=>candidate.pairIds.has(id(m))),solo=members.find(m=>id(m)===candidate.soloId);if(pair.length!==2||!solo)return[];clear(solo);commitGroup(pair,2,gid);const pairSteps=(candidate.pairPlan||candidate.plan||[]).filter(p=>candidate.pairIds.has(id(p))).map(p=>({...p,bundleId:gid||Number(p.bundleId)||0,groupSize:2}));let soloStep=candidate.soloMotion||(candidate.plan||[]).find(p=>id(p)===candidate.soloId&&vec(p))||null;if(soloStep)soloStep={...soloStep,bundleId:0,groupSize:0};return soloStep?[...pairSteps,soloStep]:pairSteps;}
hexPhysPlanGroup=function(board,members,preview=false){
 if(!ordinary(members))return basePlanGroup(board,members,preview)||[];
 const gid=gidOf(members),ind=motions(board,members),base=previewBase(board,members);
 const contact=currentContactState(board,members);
 if(contact.live&&contact.busy&&!contact.current){if(!preview)commitGroup(members,members.length,gid);return[];}
 const special=baseSpecialSplit(members,base);
 if(special?.type==="pair"&&contact.current){
   if(preview){const pairSteps=special.plan.filter(p=>special.pairIds.has(id(p))).map(p=>({...p,groupSize:2,bundleId:gid||Number(p.bundleId)||0}));const soloStep=special.plan.find(p=>id(p)===special.soloId&&vec(p));return soloStep?[...pairSteps,{...soloStep,groupSize:0,bundleId:0}]:pairSteps;}
   const out=commitPairSplit(members,special,gid);window.__sixBallLastNintendoRigidityDecision={reason:special.reason,pairIds:[...special.pairIds],soloId:special.soloId,contactCount:contact.contacts.length,at:Date.now()};return out;
 }
 if(special?.type==="full"&&contact.current){if(!preview)for(const m of members)clear(m);return special.plan.map(p=>({...p,bundleId:0,groupSize:0}));}
 const whole=wholeRigid(board,members,ind,base);
 if(whole){if(!preview)commitGroup(members,members.length,gid);return whole;}
 if(members.length===3&&(contact.current||!contact.live)){
   const candidate=candidatePairs(board,members,ind,base);
   if(candidate?.type==="pair"){if(preview){const pairSteps=(candidate.pairPlan||candidate.plan||[]).filter(p=>candidate.pairIds.has(id(p))).map(p=>({...p,groupSize:2,bundleId:gid||Number(p.bundleId)||0}));const soloStep=candidate.soloMotion||(candidate.plan||[]).find(p=>id(p)===candidate.soloId&&vec(p));return soloStep?[...pairSteps,{...soloStep,groupSize:0,bundleId:0}]:pairSteps;}const out=commitPairSplit(members,candidate,gid);window.__sixBallLastNintendoRigidityDecision={reason:candidate.reason,pairIds:[...candidate.pairIds],soloId:candidate.soloId,contactCount:contact.contacts.length,at:Date.now()};return out;}
   const moving=ind.filter(Boolean);
   if(moving.length){if(!preview)for(const m of members)clear(m);const out=moving.map(p=>({...p,bundleId:0,groupSize:0}));if(!preview)window.__sixBallLastNintendoRigidityDecision={reason:"full-physical-fragmentation",ids:members.map(id),contactCount:contact.contacts.length,at:Date.now()};return out;}
 }
 if(members.length===2&&(contact.current||!contact.live)){
   const moving=ind.filter(Boolean);if(moving.length){if(!preview)for(const m of members)clear(m);return moving.map(p=>({...p,bundleId:0,groupSize:0}));}
 }
 if(stableAccumulated(board,members)){if(!preview)for(const m of members)clear(m);return[];}
 if(!preview)commitGroup(members,members.length,gid);
 return[];
};
window.__sixBallNintendoRigidityVersion="nintendo-rigidity-authority-v1";
window.__sixBallRigidityUsesPhysicalContact=true;
window.__sixBallRigidityUsesKinematicPartition=true;
window.__sixBallRigidityMiddleFiftyGateRemoved=true;
window.__sixBallRigidityBilateralPivotGateRemoved=true;
window.__sixBallRigidBodyDistanceInvariant=true;
window.__sixBallPairPivotPreservesRigidity=true;
window.__sixBallAccumulatedReleaseUsesActualBoard=true;
})();
