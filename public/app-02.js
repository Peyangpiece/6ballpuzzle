/* HEXDROP unified physics core: the only ball-motion definition. */
let HEX_PHYS_EVENT_SEQ=1,HEX_PHYS_GROUP_SEQ=1;
const HEX_MIN_DIST=0.9995;
function normPoint(x,y){return[latticeRealX(x),cellCenterYNorm(y)];}
function lerp2(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
function hexPhysDist(ax,ay,bx,by){return Math.hypot((ax-bx)*.5,(ay-by)*HEX_ROW_H);}
function hexPhysOccupied(b,x,y,ignore=null){if(!valid(x,y))return true;const q=b[y][x];return!!q&&!(ignore&&ignore.has(q.id));}
function hexPhysEmpty(b,x,y,ignore=null){return valid(x,y)&&!hexPhysOccupied(b,x,y,ignore);}
function hexPhysAdoptGroups(){/* no legacy adoption: motionGroup is canonical */}
function hexPhysClearGroupBall(ball){if(!ball)return;ball.motionGroupId=0;ball.motionGroupRole=-1;ball.motionGroupOrientation="";ball.motionGroupSize=0;ball.rigid=false;}
function hexPhysGroups(b){
 const mp=new Map();
 for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(!ball?.motionGroupId)continue;if(!mp.has(ball.motionGroupId))mp.set(ball.motionGroupId,[]);mp.get(ball.motionGroupId).push({ball,x,y,role:ball.motionGroupRole,orientation:ball.motionGroupOrientation});}
 return mp;
}
function hexPhysSetGroup(members,size,orientation=""){
 const gid=HEX_PHYS_GROUP_SEQ++;
 for(const m of members){m.ball.motionGroupId=gid;m.ball.motionGroupRole=Number.isFinite(m.role)?m.role:-1;m.ball.motionGroupOrientation=orientation||m.orientation||"";m.ball.motionGroupSize=size;m.ball.rigid=true;}
 return gid;
}
function hexPhysSupportInfo(b,x,y,ignore=null){
 const floor=touchesFloorRow(y),
       left={x:x-1,y:y+1,valid:valid(x-1,y+1)},
       right={x:x+1,y:y+1,valid:valid(x+1,y+1)};

 left.ball=left.valid?b[left.y][left.x]:null;
 right.ball=right.valid?b[right.y][right.x]:null;

 left.wall=!left.valid;
 right.wall=!right.valid;

 const leftBall=!!(
   left.ball &&
   !(ignore&&ignore.has(left.ball.id))
 );
 const rightBall=!!(
   right.ball &&
   !(ignore&&ignore.has(right.ball.id))
 );

 /*
  * Wall = zero-friction collision constraint.
  * It may provide a normal constraint against penetration,
  * but it is NOT a real lower ball/support.
  */
 left.occupied=left.wall||leftBall;
 right.occupied=right.wall||rightBall;

 const realCount=Number(leftBall)+Number(rightBall);
 const wallContact=left.wall||right.wall;

 return{
   floor,
   left,
   right,

   /*
    * Keep contact stability compatible with a ball trapped
    * between a frictionless wall and one real ball.
    */
   count:floor?2:realCount+(wallContact&&realCount>0?1:0),

   // Used for hole / structural support decisions.
   realCount,
   wallContact
 };
}
function isBalancedHexagonCenterHole(b,cx,cy){
 if(!isHexagonCenterHole(b,cx,cy))return false;
 return [[cx-1,cy+1],[cx+1,cy+1]].every(([x,y])=>{
  if(touchesFloorRow(y))return true;
  const s=hexPhysSupportInfo(b,x,y);
  return s.realCount>=2;
});
}
function ballInBalancedHexagonRing(b,x,y){
 for(let cy=y-1;cy<=y+1;cy++)for(let cx=x-2;cx<=x+2;cx++)if(isBalancedHexagonCenterHole(b,cx,cy)){
  if([[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].some(([dx,dy])=>cx+dx===x&&cy+dy===y))return true;
 }
 return false;
}
function lowerContactSupportCount(b,x,y){return hexPhysSupportInfo(b,x,y).count;}
function hexPhysBias(ball){return Math.sign(ball?.momentumX||ball?.rollDir||ball?.subCellBias||0);}
function hexPhysNaturalMotion(b,x,y,ignore=null){
 if(!valid(x,y)||!b[y][x])return null;const ball=b[y][x];if(touchesFloorRow(y))return null;
 if(ball.garbageBubbleHold)return null;
 if(!ignore&&ballInBalancedHexagonRing(b,x,y))return null;
 const l=hexPhysEmpty(b,x-1,y+1,ignore),r=hexPhysEmpty(b,x+1,y+1,ignore),down=hexPhysEmpty(b,x,y+2,ignore);
 if(l&&r&&down)return{x,y,tx:x,ty:y+2,ball,kind:"FREE_FALL",pivot:null,topPivot:null,followSupportIds:[]};
 if(l&&!r){
  const px=x+1,py=y+1;
  const wall=!valid(px,py);
  return{
    x,y,tx:x-1,ty:y+1,ball,
    kind:wall?"WALL_SLIDE_LEFT":"ROLL_LEFT",
    pivot:wall?null:[px,py],
    topPivot:null,
    followSupportIds:[]
  };
 }
 if(r&&!l){
  const px=x-1,py=y+1;
  const wall=!valid(px,py);
  return{
    x,y,tx:x+1,ty:y+1,ball,
    kind:wall?"WALL_SLIDE_RIGHT":"ROLL_RIGHT",
    pivot:wall?null:[px,py],
    topPivot:null,
    followSupportIds:[]
  };
 }
 if(!l&&!r)return null;

 // Bottom-row parity bridge.
 // On the row immediately above the floor, y+2 is outside the board even
 // though both diagonal cells on the physical floor are legal. Treat that as
 // downward gravity, not REST. This removes the one-row-up error that depended
 // on triangle orientation / row parity.
 if(l&&r&&y+1===ROWS-1){
  let dir=hexPhysBias(ball);
  if(!dir){
   // Perfectly symmetric unstable contact:
   // deterministic neutral tie-break, independent of wall distance.
   dir=((Number(ball.id)||0)&1)?-1:1;
  }
  const tx=x+dir,ty=y+1;
  if(hexPhysEmpty(b,tx,ty,ignore))return{x,y,tx,ty,ball,kind:"FLOOR_DROP",pivot:null,topPivot:null,followSupportIds:[]};
  const alt=x-dir;
  if(hexPhysEmpty(b,alt,ty,ignore))return{x,y,tx:alt,ty,ball,kind:"FLOOR_DROP",pivot:null,topPivot:null,followSupportIds:[]};
 }

 if(!down&&valid(x,y+2)){
  let dir=hexPhysBias(ball);
  if(!dir){
   // No wall attraction / no global left bias.
   dir=((Number(ball.id)||0)&1)?-1:1;
  }
  if(hexPhysEmpty(b,x+dir,y+1,ignore))return{x,y,tx:x+dir,ty:y+1,ball,kind:dir<0?"ROLL_LEFT":"ROLL_RIGHT",pivot:null,topPivot:[x,y+2],followSupportIds:[]};
  if(hexPhysEmpty(b,x-dir,y+1,ignore))return{x,y,tx:x-dir,ty:y+1,ball,kind:dir<0?"ROLL_RIGHT":"ROLL_LEFT",pivot:null,topPivot:[x,y+2],followSupportIds:[]};
 }
 return null;
}
function settleStep(b,x,y){const p=hexPhysNaturalMotion(b,x,y);return p?[p.tx,p.ty]:null;}
function unstableFrozenBalls(b){
 const out=[];for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){if(!valid(x,y)||!b[y][x]||b[y][x].equilibriumLocked||touchesFloorRow(y)||ballInBalancedHexagonRing(b,x,y))continue;const s=hexPhysSupportInfo(b,x,y);if(!hexPhysNaturalMotion(b,x,y)&&s.count<2)out.push({x,y,id:b[y][x].id,contacts:s.count});}return out;
}
function boardHasIllegalFloat(b){return unstableFrozenBalls(b).length>0;}
function clearBoardEquilibriumLocks(b){for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(ball&&typeof ball==="object")delete ball.equilibriumLocked;}}
function markCollisionBalancedGaps(b){
 const stuck=unstableFrozenBalls(b),ids=new Set(stuck.map(q=>q.id));
 for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(ball&&typeof ball==="object"&&ids.has(ball.id))ball.equilibriumLocked=true;}
 return stuck.length;
}
function boardOverflowCells(b){
 const out=[];for(let y=BOARD_MIN_ROW;y<0;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(ball)out.push([x,y,getC(ball),ball.id]);}return out;
}
function boardHasOverflow(b){return boardOverflowCells(b).length>0;}
function isHexagonCenterHole(b,cx,cy){return valid(cx,cy)&&b[cy][cx]===null&&[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].every(([dx,dy])=>valid(cx+dx,cy+dy)&&!!b[cy+dy][cx+dx]);}
function boardHasIntentionalHexagonHole(b){for(let y=1;y<ROWS-1;y++)for(let x=2;x<W2-2;x++)if(isHexagonCenterHole(b,x,y))return true;return false;}
function proposalPointAt(p,t){
 t=Math.max(0,Math.min(1,t));const a=normPoint(p.x,p.y),z=normPoint(p.tx,p.ty);
 if(p.kind==="FOLLOW_SUPPORT"&&p.followProposal){const s0=normPoint(p.followProposal.x,p.followProposal.y),sp=proposalPointAt(p.followProposal,t);return[a[0]+sp[0]-s0[0],a[1]+sp[1]-s0[1]];}
 if(p.topPivot){const pv=normPoint(...p.topPivot),contact=[pv[0],pv[1]-1],fallLen=Math.max(0,contact[1]-a[1]),fallT=Math.sqrt(Math.max(0,2*fallLen/Math.max(.0001,GRAV)));let da=Math.atan2(z[1]-pv[1],z[0]-pv[0])+Math.PI/2;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;const arcT=Math.abs(da)/Math.max(.0001,SLIDE_SPEED),total=Math.max(1e-9,fallT+arcT),cut=fallT/total;if(t<=cut&&cut>1e-9){const q=t/cut;return lerp2(a,contact,q*q);}const q=cut>=1-1e-9?1:(t-cut)/(1-cut),ang=-Math.PI/2+da*Math.max(0,Math.min(1,q));return[pv[0]+Math.cos(ang),pv[1]+Math.sin(ang)];}
 if(p.pivot){const pv=normPoint(...p.pivot),a0=Math.atan2(a[1]-pv[1],a[0]-pv[0]),a1=Math.atan2(z[1]-pv[1],z[0]-pv[0]);let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;const r=Math.hypot(a[0]-pv[0],a[1]-pv[1]),ang=a0+da*t;return[pv[0]+Math.cos(ang)*r,pv[1]+Math.sin(ang)*r];}
 const q=(Math.abs(p.ty-p.y)>=2||p.tx===p.x)?t*t:t;return lerp2(a,z,q);
}
function proposalsSweepOverlap(a,b){for(let i=0;i<=32;i++){const t=i/32,pa=proposalPointAt(a,t),pb=proposalPointAt(b,t);if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1])<HEX_MIN_DIST)return true;}return false;}
function hexPhysPathHitsStationary(p,b,movingIds){
 for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(!q||q.id===p.ball.id||movingIds.has(q.id))continue;const pv=p.topPivot||p.pivot;if(!p.virtualPivot&&pv&&pv[0]===x&&pv[1]===y)continue;const qp=normPoint(x,y);for(let i=1;i<=32;i++){const pt=proposalPointAt(p,i/32);if(Math.hypot(pt[0]-qp[0],pt[1]-qp[1])<HEX_MIN_DIST)return true;}}
 return false;
}
function proposalHitsStationaryBall(p,b,movingOrigins){const ids=new Set();for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(q&&movingOrigins?.has(x+","+y))ids.add(q.id);}return hexPhysPathHitsStationary(p,b,ids);}
function sameMoveVector(a,b){return!!a&&!!b&&(a.tx-a.x)===(b.tx-b.x)&&(a.ty-a.y)===(b.ty-b.y);}
function proposalSignature(p){return p?[p.tx-p.x,p.ty-p.y,p.kind].join("|"):"REST";}
function hexPhysIndependentMemberMotion(b,members,m){const ignore=new Set(members.filter(q=>q.ball.id!==m.ball.id).map(q=>q.ball.id));return hexPhysNaturalMotion(b,m.x,m.y,ignore);}
function hexPhysTranslationSafe(b,members,dx,dy){
 const own=new Set(members.map(m=>m.ball.id)),targets=new Set();
 for(const m of members){const tx=m.x+dx,ty=m.y+dy;if(!valid(tx,ty))return false;const k=tx+","+ty;if(targets.has(k))return false;targets.add(k);const q=b[ty][tx];if(q&&!own.has(q.id))return false;}
 for(const m of members){const p={x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy,ball:m.ball,kind:"GROUP_TRANSLATE",pivot:null,topPivot:null};if(hexPhysPathHitsStationary(p,b,own))return false;}return true;
}
function groupTranslationSafe(b,members,dx,dy){return hexPhysTranslationSafe(b,members,dx,dy);}
function hexPhysGroupTranslationPlan(b,members,dx,dy,kind="GROUP_TRANSLATE"){
 if(!hexPhysTranslationSafe(b,members,dx,dy))return null;
 const bundle=members[0]?.ball?.motionGroupId||HEX_PHYS_GROUP_SEQ;
 return members.map(m=>({x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy,ball:m.ball,kind,pivot:null,topPivot:null,followSupportIds:[],bundleId:bundle,groupSize:members.length}));
}
function hexPhysRigidSlidePlanFromContact(b,members,contact,bundleId=null){
 if(!contact||!members?.length||!contact.dir)return null;
 const dx=Math.sign(contact.dir),dy=1,own=new Set(members.map(m=>m.ball.id)),targets=new Set();
 const support=valid(contact.px,contact.py)?b[contact.py][contact.px]:null;
 if(!support||own.has(support.id))return null;
 const bundle=bundleId||members[0]?.ball?.motionGroupId||HEX_PHYS_GROUP_SEQ,plan=[];
 for(const m of members){
  const tx=m.x+dx,ty=m.y+dy,key=tx+","+ty,q=valid(tx,ty)?b[ty][tx]:null;
  if(!valid(tx,ty)||targets.has(key)||(q&&!own.has(q.id)))return null;
  targets.add(key);
  const pv=[contact.px+(m.x-contact.member.x),contact.py+(m.y-contact.member.y)],isContact=m.ball.id===contact.member.ball.id;
  plan.push({x:m.x,y:m.y,tx,ty,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",pivot:contact.top?null:pv,topPivot:contact.top?pv:null,virtualPivot:!isContact,followSupportIds:[],bundleId:bundle,groupSize:members.length});
 }
 if(plan.some(p=>hexPhysPathHitsStationary(p,b,own)))return null;
 return plan;
}
function hexPhysRigidSlopePlan(b,members,motions){
 const contacts=[],seen=new Set(),bias=Math.sign(members.reduce((n,m)=>n+hexPhysBias(m.ball),0));
 for(let i=0;i<members.length;i++){
  const p=motions[i],pv=p?.topPivot||p?.pivot,dir=Math.sign((p?.tx??members[i].x)-members[i].x);
  if(!pv||!dir)continue;
  const q=valid(pv[0],pv[1])?b[pv[1]][pv[0]]:null,key=members[i].ball.id+":"+pv[0]+","+pv[1]+":"+dir;
  if(!q||seen.has(key))continue;seen.add(key);
  contacts.push({member:members[i],px:pv[0],py:pv[1],dir,top:!!p.topPivot,biasMatch:bias===dir?1:0});
 }
 contacts.sort((a,z)=>z.biasMatch-a.biasMatch||z.member.y-a.member.y||a.member.x-z.member.x);
 for(const contact of contacts){const plan=hexPhysRigidSlidePlanFromContact(b,members,contact);if(plan)return plan;}
 return null;
}
function hexPhysUpConvexSeparator(b,members,motions){
 if(members.length!==3||(members[0]?.orientation||members[0]?.ball?.motionGroupOrientation)!=="up")return null;
 const lowerY=Math.max(...members.map(m=>m.y)),lower=members.filter(m=>m.y===lowerY).sort((a,z)=>a.x-z.x),top=members.find(m=>m.y<lowerY);
 if(lower.length!==2||!top||lower[1].x-lower[0].x!==2)return null;
 const px=(lower[0].x+lower[1].x)/2,py=lowerY+1,support=valid(px,py)?b[py][px]:null;
 if(!support||members.some(m=>m.ball.id===support.id))return null;
 // The continuous release offset is measured in doubled-x lattice units.
 // Split only when the protrusion falls in the middle two quarters of the
 // actual base segment; contacts in either outer quarter remain rigid slopes.
 const offset=Math.max(-1,Math.min(1,Number.isFinite(top.ball?.impactOffsetX)?top.ball.impactOffsetX:0));
 const baseLeft=lower[0].x+offset,baseRight=lower[1].x+offset,hitFraction=(px-baseLeft)/(baseRight-baseLeft);
 // Exact quarter boundaries belong to the rigid outer quarters. Only a
 // strictly interior middle-half contact may split the upward triangle.
 if(hitFraction<=.25+1e-9||hitFraction>=.75-1e-9)return null;
 const actualCenter=(baseLeft+baseRight)/2,relative=px-actualCenter,topIndex=members.indexOf(top),topMove=motions[topIndex];
 const bias=relative>1e-9?-1:relative<-1e-9?1:(Math.sign(topMove?.tx-top.x)||hexPhysBias(top.ball)||Math.sign(members.reduce((n,m)=>n+hexPhysBias(m.ball),0))||-1);
 const pairLower=bias<0?lower[0]:lower[1],solo=bias<0?lower[1]:lower[0],soloMotion=motions[members.indexOf(solo)];
 if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==-bias)return null;
 // A pile ball merely present below the edge is a future geometric candidate,
 // not a collision. Both lower members must name this exact protrusion as
 // their CURRENT pivot. `topPivot` represents an airborne free-fall approach
 // and is intentionally excluded, so no 2+1 metadata can be created in air.
 const currentPivotAtProtrusion=motion=>Array.isArray(motion?.pivot)&&Number(motion.pivot[0])===px&&Number(motion.pivot[1])===py;
 const pairMotion=motions[members.indexOf(pairLower)];
 if(!currentPivotAtProtrusion(pairMotion)||!currentPivotAtProtrusion(soloMotion))return null;
 return{dir:bias,top,pairLower,solo,soloMotion,support,px,py,hitFraction};
}
function hexPhysUpConvexSplitPlan(b,members,info,preview=false){
 if(!info)return null;
 const pair=[info.top,info.pairLower],gid=members[0]?.ball?.motionGroupId||HEX_PHYS_GROUP_SEQ;
 const pairPlan=hexPhysRigidSlidePlanFromContact(b,pair,{member:info.pairLower,px:info.px,py:info.py,dir:info.dir,top:false},gid);
 if(!pairPlan)return null;
 const soloPlan={...info.soloMotion,bundleId:0,groupSize:0};
 /* Once the final UP-convex authority is loaded this legacy routine is a
    trajectory proposer only. Pair rigidity is committed after the current
    contact side has been validated by the final authority. */
 if(!preview&&!(typeof window!=="undefined"&&window.__sixBallFinalRigidityAuthorityV1)){
  hexPhysClearGroupBall(info.solo.ball);
  for(const m of pair){m.ball.motionGroupId=gid;m.ball.motionGroupSize=2;m.ball.rigid=true;m.ball.momentumX=info.dir;m.ball.rollDir=info.dir;m.ball.subCellBias=info.dir;}
  info.solo.ball.momentumX=-info.dir;info.solo.ball.rollDir=-info.dir;info.solo.ball.subCellBias=-info.dir;
 }
 return[...pairPlan,soloPlan];
}
function hexPhysPairPivotPlan(b,members,motions){
 if(members.length!==2)return null;
 for(let i=0;i<2;i++){const fixed=members[i],moving=members[1-i],mp=motions[1-i];if(motions[i]||!mp)continue;if(hexPhysDist(mp.tx,mp.ty,fixed.x,fixed.y)>1.00001)continue;const p={...mp,pivot:[fixed.x,fixed.y],topPivot:null,kind:"PAIR_PIVOT",bundleId:fixed.ball.motionGroupId||0,followSupportIds:[fixed.ball.id]};if(!hexPhysPathHitsStationary(p,b,new Set(members.map(m=>m.ball.id))))return[p];}
 return null;
}
function hexPhysPlanGroup(b,members,preview=false){
 const size=members.length;if(size<2||size>3){if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return[];}
 const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m)),moving=motions.filter(Boolean);
 if(!moving.length){if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return[];}
 if(moving.length===size){const dx=motions[0].tx-motions[0].x,dy=motions[0].ty-motions[0].y;if(motions.every(p=>p.tx-p.x===dx&&p.ty-p.y===dy)){const common=hexPhysGroupTranslationPlan(b,members,dx,dy);if(common)return common;}}
 if(size===2){const pivot=hexPhysPairPivotPlan(b,members,motions);if(pivot)return pivot;if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return[];}
 // A released triplet may touch down one ball before the other two. Detach
 // only the pinned member; the moving pair keeps the original constraint.
 // This must precede signature bucketing because REST is a valid signature
 // but is not part of the still-moving rigid pair.
 const pinned=[];for(let i=0;i<3;i++)if(!motions[i])pinned.push(i);
 if(pinned.length===1){
  const fixedIndex=pinned[0],pm=members.filter((_,i)=>i!==fixedIndex);
  if(preview){const fake=pm.map(m=>({...m,ball:{...m.ball,motionGroupSize:2,rigid:true}}));return hexPhysPlanGroup(b,fake,true);}
  hexPhysClearGroupBall(members[fixedIndex].ball);
  for(const m of pm){m.ball.motionGroupSize=2;m.ball.rigid=true;}
  return hexPhysPlanGroup(b,pm,false);
 }
 if(pinned.length>1){if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return moving.map(p=>({...p,bundleId:0,groupSize:0}));}
 const vertical=hexPhysGroupTranslationPlan(b,members,0,2);if(vertical)return vertical;
 const separator=hexPhysUpConvexSeparator(b,members,motions),split=hexPhysUpConvexSplitPlan(b,members,separator,preview);if(split)return split;
 const slope=hexPhysRigidSlopePlan(b,members,motions);if(slope)return slope;
 // Different individual tendencies alone never break a triplet. With no legal
 // rigid continuation it remains at rest; pile cleanup releases it only after
 // that position has actually settled.
 return[];
}
function hexPhysContactEntries(b,excluded){
 const entries=[],byId=new Map();for(let y=ROWS-1;y>=boardScanMin(b);y--)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(!ball||excluded.has(ball.id))continue;const support=hexPhysSupportInfo(b,x,y),e={x,y,ball,support,p:hexPhysNaturalMotion(b,x,y)};entries.push(e);byId.set(ball.id,e);}
 for(let guard=0;guard<ROWS*2+4;guard++){let changed=false;for(const e of entries){const supports=[e.support.left,e.support.right].filter(s=>s.valid&&s.ball&&!excluded.has(s.ball.id)),moving=supports.map(s=>byId.get(s.ball.id)).filter(q=>q?.p);let next=e.p;if(supports.length&&moving.length===supports.length){const f=moving[0].p;if(moving.every(q=>sameMoveVector(f,q.p))){const dx=f.tx-f.x,dy=f.ty-f.y;if(valid(e.x+dx,e.y+dy))next={x:e.x,y:e.y,tx:e.x+dx,ty:e.y+dy,ball:e.ball,kind:"FOLLOW_SUPPORT",pivot:null,topPivot:null,followProposal:f,followSupportIds:moving.map(q=>q.ball.id)};}}else if(supports.length===2&&moving.length===1){const st=supports.find(s=>s.ball.id!==moving[0].ball.id);if(st){const dir=st.x<e.x?1:-1;if(hexPhysEmpty(b,e.x+dir,e.y+1))next={x:e.x,y:e.y,tx:e.x+dir,ty:e.y+1,ball:e.ball,kind:dir<0?"ROLL_LEFT":"ROLL_RIGHT",pivot:[st.x,st.y],topPivot:null,followSupportIds:[]};}}if(proposalSignature(next)!==proposalSignature(e.p)||(next?.followSupportIds?.join(",")||"")!==(e.p?.followSupportIds?.join(",")||"")){e.p=next;changed=true;}}if(!changed)break;}
 return entries.filter(e=>e.p).map(e=>e.p);
}
