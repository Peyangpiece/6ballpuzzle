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
 for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(!ball?.motionGroupId)continue;if(!mp.has(ball.motionGroupId))mp.set(ball.motionGroupId,[]);mp.get(ball.motionGroupId).push({ball,x,y,role:ball.motionGroupRole,orientation:ball.motionGroupOrientation});}
 return mp;
}
function hexPhysSetGroup(members,size,orientation=""){
 const gid=HEX_PHYS_GROUP_SEQ++;
 for(const m of members){m.ball.motionGroupId=gid;m.ball.motionGroupRole=Number.isFinite(m.role)?m.role:-1;m.ball.motionGroupOrientation=orientation||m.orientation||"";m.ball.motionGroupSize=size;m.ball.rigid=true;}
 return gid;
}
function hexPhysSupportInfo(b,x,y,ignore=null){
 const floor=touchesFloorRow(y),left={x:x-1,y:y+1,valid:valid(x-1,y+1)},right={x:x+1,y:y+1,valid:valid(x+1,y+1)};
 left.ball=left.valid?b[left.y][left.x]:null;right.ball=right.valid?b[right.y][right.x]:null;
 left.occupied=!left.valid||!!(left.ball&&!(ignore&&ignore.has(left.ball.id)));right.occupied=!right.valid||!!(right.ball&&!(ignore&&ignore.has(right.ball.id)));
 return{floor,left,right,count:floor?2:Number(left.occupied)+Number(right.occupied)};
}
function lowerContactSupportCount(b,x,y){return hexPhysSupportInfo(b,x,y).count;}
function hexPhysBias(ball){return Math.sign(ball?.momentumX||ball?.rollDir||ball?.subCellBias||0);}
function hexPhysNaturalMotion(b,x,y,ignore=null){
 if(!valid(x,y)||!b[y][x])return null;const ball=b[y][x];if(touchesFloorRow(y))return null;
 const l=hexPhysEmpty(b,x-1,y+1,ignore),r=hexPhysEmpty(b,x+1,y+1,ignore),down=hexPhysEmpty(b,x,y+2,ignore);
 if(l&&r&&down)return{x,y,tx:x,ty:y+2,ball,kind:"FREE_FALL",pivot:null,topPivot:null,followSupportIds:[]};
 if(l&&!r)return{x,y,tx:x-1,ty:y+1,ball,kind:"ROLL_LEFT",pivot:[x+1,y+1],topPivot:null,followSupportIds:[]};
 if(r&&!l)return{x,y,tx:x+1,ty:y+1,ball,kind:"ROLL_RIGHT",pivot:[x-1,y+1],topPivot:null,followSupportIds:[]};
 if(!l&&!r)return null;

 // Bottom-row parity bridge.
 // On the row immediately above the floor, y+2 is outside the board even
 // though both diagonal cells on the physical floor are legal. Treat that as
 // downward gravity, not REST. This removes the one-row-up error that depended
 // on triangle orientation / row parity.
 if(l&&r&&y+1===ROWS-1){
  let dir=hexPhysBias(ball);
  if(!dir){
   const sl=floorPackingScore(b,x-1,y+1),sr=floorPackingScore(b,x+1,y+1);
   if(sl!==sr)dir=sl>sr?-1:1;
  }
  if(!dir)dir=(x<=1?1:(x>=W2-2?-1:-1));
  const tx=x+dir,ty=y+1;
  if(hexPhysEmpty(b,tx,ty,ignore))return{x,y,tx,ty,ball,kind:"FLOOR_DROP",pivot:null,topPivot:null,followSupportIds:[]};
  const alt=x-dir;
  if(hexPhysEmpty(b,alt,ty,ignore))return{x,y,tx:alt,ty,ball,kind:"FLOOR_DROP",pivot:null,topPivot:null,followSupportIds:[]};
 }

 if(!down&&valid(x,y+2)){
  let dir=hexPhysBias(ball);
  if(!dir&&y+1===ROWS-1){const sl=floorPackingScore(b,x-1,y+1),sr=floorPackingScore(b,x+1,y+1);if(sl!==sr)dir=sl>sr?-1:1;}
  if(!dir)dir=-1;
  if(hexPhysEmpty(b,x+dir,y+1,ignore))return{x,y,tx:x+dir,ty:y+1,ball,kind:dir<0?"ROLL_LEFT":"ROLL_RIGHT",pivot:null,topPivot:[x,y+2],followSupportIds:[]};
  if(hexPhysEmpty(b,x-dir,y+1,ignore))return{x,y,tx:x-dir,ty:y+1,ball,kind:dir<0?"ROLL_RIGHT":"ROLL_LEFT",pivot:null,topPivot:[x,y+2],followSupportIds:[]};
 }
 return null;
}
function settleStep(b,x,y){const p=hexPhysNaturalMotion(b,x,y);return p?[p.tx,p.ty]:null;}
function unstableFrozenBalls(b){
 const out=[];for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){if(!valid(x,y)||!b[y][x]||touchesFloorRow(y))continue;const s=hexPhysSupportInfo(b,x,y);if(!hexPhysNaturalMotion(b,x,y)&&s.count<2)out.push({x,y,id:b[y][x].id,contacts:s.count});}return out;
}
function boardHasIllegalFloat(b){return unstableFrozenBalls(b).length>0;}
function isHexagonCenterHole(b,cx,cy){return valid(cx,cy)&&b[cy][cx]===null&&[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].every(([dx,dy])=>valid(cx+dx,cy+dy)&&!!b[cy+dy][cx+dx]);}
function boardHasIntentionalHexagonHole(b){for(let y=1;y<ROWS-1;y++)for(let x=2;x<W2-2;x++)if(isHexagonCenterHole(b,x,y))return true;return false;}
function proposalPointAt(p,t){
 t=Math.max(0,Math.min(1,t));const a=normPoint(p.x,p.y),z=normPoint(p.tx,p.ty);
 if(p.topPivot){const pv=normPoint(...p.topPivot),contact=[pv[0],pv[1]-1],fallLen=Math.max(0,contact[1]-a[1]),fallT=Math.sqrt(Math.max(0,2*fallLen/Math.max(.0001,GRAV)));let da=Math.atan2(z[1]-pv[1],z[0]-pv[0])+Math.PI/2;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;const arcT=Math.abs(da)/Math.max(.0001,SLIDE_SPEED),total=Math.max(1e-9,fallT+arcT),cut=fallT/total;if(t<=cut&&cut>1e-9){const q=t/cut;return lerp2(a,contact,q*q);}const q=cut>=1-1e-9?1:(t-cut)/(1-cut),ang=-Math.PI/2+da*Math.max(0,Math.min(1,q));return[pv[0]+Math.cos(ang),pv[1]+Math.sin(ang)];}
 if(p.pivot){const pv=normPoint(...p.pivot),a0=Math.atan2(a[1]-pv[1],a[0]-pv[0]),a1=Math.atan2(z[1]-pv[1],z[0]-pv[0]);let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;const r=Math.hypot(a[0]-pv[0],a[1]-pv[1]),ang=a0+da*t;return[pv[0]+Math.cos(ang)*r,pv[1]+Math.sin(ang)*r];}
 const q=(Math.abs(p.ty-p.y)>=2||p.tx===p.x)?t*t:t;return lerp2(a,z,q);
}
function proposalsSweepOverlap(a,b){for(let i=0;i<=32;i++){const t=i/32,pa=proposalPointAt(a,t),pb=proposalPointAt(b,t);if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1])<HEX_MIN_DIST)return true;}return false;}
function hexPhysPathHitsStationary(p,b,movingIds){
 for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(!q||q.id===p.ball.id||movingIds.has(q.id))continue;const pv=p.topPivot||p.pivot;if(pv&&pv[0]===x&&pv[1]===y)continue;const qp=normPoint(x,y);for(let i=1;i<=32;i++){const pt=proposalPointAt(p,i/32);if(Math.hypot(pt[0]-qp[0],pt[1]-qp[1])<HEX_MIN_DIST)return true;}}
 return false;
}
function proposalHitsStationaryBall(p,b,movingOrigins){const ids=new Set();for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(q&&movingOrigins?.has(x+","+y))ids.add(q.id);}return hexPhysPathHitsStationary(p,b,ids);}
function sameMoveVector(a,b){return!!a&&!!b&&(a.tx-a.x)===(b.tx-b.x)&&(a.ty-a.y)===(b.ty-b.y);}
function proposalSignature(p){return p?[p.tx-p.x,p.ty-p.y,p.kind].join("|"):"REST";}
function hexPhysIndependentMemberMotion(b,members,m){const ignore=new Set(members.filter(q=>q.ball.id!==m.ball.id).map(q=>q.ball.id));return hexPhysNaturalMotion(b,m.x,m.y,ignore);}
function hexPhysTranslationSafe(b,members,dx,dy){
 const own=new Set(members.map(m=>m.ball.id)),targets=new Set();
 for(const m of members){const tx=m.x+dx,ty=m.y+dy;if(!valid(tx,ty))return false;const k=tx+","+ty;if(targets.has(k))return false;targets.add(k);const q=b[ty][tx];if(q&&!own.has(q.id))return false;}
 for(const m of members){const p={x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy,ball:m.ball,kind:"GROUP_TRANSLATE",pivot:null,topPivot:null};if(hexPhysPathHitsStationary(p,b,own))return false;}return true;
}
function groupTranslationSafe(b,members,dx,dy){return hexPhysTranslationSafe(b,members,dx,dy);}
function hexPhysPairPivotPlan(b,members,motions){
 if(members.length!==2)return null;
 for(let i=0;i<2;i++){const fixed=members[i],moving=members[1-i],mp=motions[1-i];if(motions[i]||!mp)continue;if(hexPhysDist(mp.tx,mp.ty,fixed.x,fixed.y)>1.00001)continue;const p={...mp,pivot:[fixed.x,fixed.y],topPivot:null,kind:"PAIR_PIVOT",bundleId:fixed.ball.motionGroupId||0,followSupportIds:[fixed.ball.id]};if(!hexPhysPathHitsStationary(p,b,new Set(members.map(m=>m.ball.id))))return[p];}
 return null;
}
function hexPhysPlanGroup(b,members,preview=false){
 const size=members.length;if(size<2||size>3){if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return[];}
 const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m)),moving=motions.filter(Boolean);
 if(!moving.length){if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return[];}
 if(moving.length===size){const dx=motions[0].tx-motions[0].x,dy=motions[0].ty-motions[0].y;if(motions.every(p=>p.tx-p.x===dx&&p.ty-p.y===dy)&&hexPhysTranslationSafe(b,members,dx,dy)){const bundle=members[0].ball.motionGroupId||HEX_PHYS_GROUP_SEQ;return members.map(m=>({x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy,ball:m.ball,kind:"GROUP_TRANSLATE",pivot:null,topPivot:null,followSupportIds:[],bundleId:bundle,groupSize:size}));}}
 if(size===2){const pivot=hexPhysPairPivotPlan(b,members,motions);if(pivot)return pivot;if(!preview)for(const m of members)hexPhysClearGroupBall(m.ball);return[];}
 const buckets=new Map();for(let i=0;i<3;i++){const key=proposalSignature(motions[i]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);}let pair=null;for(const a of buckets.values())if(a.length>=2&&a.length>(pair?.length||0))pair=a.slice(0,2);
 if(pair){const pm=pair.map(i=>members[i]);if(preview){const fake=pm.map((m,j)=>({...m,ball:{...m.ball,motionGroupId:members[0].ball.motionGroupId||1}}));return hexPhysPlanGroup(b,fake,true);}for(const m of members)hexPhysClearGroupBall(m.ball);hexPhysSetGroup(pm,2,pm[0]?.orientation||"");return hexPhysPlanGroup(b,pm,false);}
 if(!preview){for(let a=0;a<3;a++)for(let c=a+1;c<3;c++){const pm=[members[a],members[c]],pivot=hexPhysPairPivotPlan(b,pm,[motions[a],motions[c]]);if(pivot){for(const m of members)hexPhysClearGroupBall(m.ball);hexPhysSetGroup(pm,2,pm[0]?.orientation||"");return pivot;}}for(const m of members)hexPhysClearGroupBall(m.ball);}return[];
}
function hexPhysContactEntries(b,excluded){
 const entries=[],byId=new Map();for(let y=ROWS-1;y>=0;y--)for(let x=0;x<W2;x++){const ball=valid(x,y)?b[y][x]:null;if(!ball||excluded.has(ball.id))continue;const support=hexPhysSupportInfo(b,x,y),e={x,y,ball,support,p:hexPhysNaturalMotion(b,x,y)};entries.push(e);byId.set(ball.id,e);}
 for(let guard=0;guard<ROWS*2+4;guard++){let changed=false;for(const e of entries){const supports=[e.support.left,e.support.right].filter(s=>s.valid&&s.ball&&!excluded.has(s.ball.id)),moving=supports.map(s=>byId.get(s.ball.id)).filter(q=>q?.p);let next=e.p;if(supports.length&&moving.length===supports.length){const f=moving[0].p;if(moving.every(q=>sameMoveVector(f,q.p))){const dx=f.tx-f.x,dy=f.ty-f.y;if(valid(e.x+dx,e.y+dy))next={x:e.x,y:e.y,tx:e.x+dx,ty:e.y+dy,ball:e.ball,kind:"FOLLOW_SUPPORT",pivot:null,topPivot:null,followSupportIds:moving.map(q=>q.ball.id)};}}else if(supports.length===2&&moving.length===1){const st=supports.find(s=>s.ball.id!==moving[0].ball.id);if(st){const dir=st.x<e.x?1:-1;if(hexPhysEmpty(b,e.x+dir,e.y+1))next={x:e.x,y:e.y,tx:e.x+dir,ty:e.y+1,ball:e.ball,kind:dir<0?"ROLL_LEFT":"ROLL_RIGHT",pivot:[st.x,st.y],topPivot:null,followSupportIds:[]};}}if(proposalSignature(next)!==proposalSignature(e.p)||(next?.followSupportIds?.join(",")||"")!==(e.p?.followSupportIds?.join(",")||"")){e.p=next;changed=true;}}if(!changed)break;}
 return entries.filter(e=>e.p).map(e=>e.p);
}