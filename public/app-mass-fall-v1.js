/* Mass fall v1.
 *
 * When a clear removes the support of a pile, SETTLE used to show the fall in
 * logical batches: the first batch's segments were staggered by collision
 * scheduling, and every later batch began only after the previous one had been
 * drawn, so a large collapse came down piece by piece over several seconds.
 *
 * Here the logical result is unchanged: at the clear commit the remaining
 * SETTLE gravity passes are run at once (the same calls SETTLE makes) and each
 * ball's path through those passes is recorded. Every released ball then
 * follows its own path from the same instant under gravity, so a collapse
 * falls together and lands in about the time a free fall of that height takes;
 * a step that would run into another ball waits until it is clear. SETTLE waits
 * for the fall (pendingFallPathCount), then confirms the board and continues
 * with CHECK as before.
 *
 * Only a mass collapse is changed: at least MIN_RELEASED balls lose their
 * support at the clear. An ordinary clear releasing a few balls keeps the
 * per-ball motion fitted to the reference captures (2 to 4 balls there; the
 * captured technique and chain collapses release 15 to 33 and keep their
 * final cells and timing within the reference tests' limits).
 */
(function(){
if(typeof window==="undefined"||window.__sixBallMassFallV1||typeof stepEngine!=="function")return;
window.__sixBallMassFallV1=true;
const MAX_PASSES=(ROWS-BOARD_MIN_ROW)*W2*4,MIN_RELEASED=8,H=HEX_ROW_H;
// Ball diameters and seconds, as fitted for clear support loss in app-07.js.
const A=CLEAR_SUPPORT_LOSS_GRAV,VMAX=CLEAR_SUPPORT_LOSS_TERMINAL_VY;
const physLen=(p,q)=>{const dx=(q[0]-p[0])*.5,dy=(q[1]-p[1])*H;return Math.sqrt(dx*dx+dy*dy);};
const same=(p,q)=>Math.abs(p[0]-q[0])<1e-9&&Math.abs(p[1]-q[1])<1e-9;

function boardBalls(g){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)out.push({b,x,y});}
 return out;
}

// One leg of a path. Its shape is chosen later (shapeLegs): a roll round a
// touching support, a fall that shifts onto its cell at the end or at the
// start (pileGravityLateralProgress, app-07.js), or a straight step.
function leg(from,to,key,seg){
 const l={from:[from[0],from[1]],to:[to[0],to[1]],key,shapes:[]};
 const dx=to[0]-from[0],dy=to[1]-from[1];
 if(seg&&Array.isArray(seg.pivot)&&!seg.pileGravityFall){
  const[px,py]=seg.pivot,r0=physLen(from,seg.pivot),r1=physLen(to,seg.pivot);
  if(Math.abs(r0-1)<1e-3&&Math.abs(r1-1)<1e-3){
   const a0=Math.atan2((from[1]-py)*H,(from[0]-px)*.5);let da=Math.atan2((to[1]-py)*H,(to[0]-px)*.5)-a0;
   while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
   l.shapes.push({pivot:{px,py,a0,da}});
  }
 }
 if(dx&&dy>0){
  const own=seg?.pileGravityLateralMode;
  for(const lateral of own?[own,"late","early"]:["late","early"])if(!l.shapes.some(q=>q.lateral===lateral))l.shapes.push({lateral});
 }
 l.shapes.push({});
 setShape(l,l.shapes[0]);
 return l;
}
function setShape(l,shape){
 l.pivot=shape.pivot||null;l.lateral=shape.lateral||null;
 l.len=l.pivot?Math.abs(l.pivot.da):physLen(l.from,l.to);
}
function legPoint(l,u){
 u=Math.max(0,Math.min(1,u));
 if(l.pivot){const p=l.pivot,a=p.a0+p.da*u;return[p.px+Math.cos(a)/.5,p.py+Math.sin(a)/H];}
 const ux=l.lateral?pileGravityLateralProgress({pileGravityLateralMode:l.lateral},u):u;
 return[l.from[0]+(l.to[0]-l.from[0])*ux,l.from[1]+(l.to[1]-l.from[1])*u];
}
// For each sideways leg keep the shape that stays furthest from the other
// balls during that logical event: the balls that never move, where the
// others rest, or, for a ball moving in the same event, where it is at the
// same point of its own leg and its ends. A second round lets neighbours in
// one event settle on matching shapes.
function shapeLegs(items,resting){
 for(let round=0;round<2;round++)shapeRound(items,resting);
}
function shapeRound(items,resting){
 const where=(it,key)=>{let p=it.legs[0].from;for(const l of it.legs){if(l.key<key)p=l.to;else break;}return p;};
 for(const it of items)for(const l of it.legs){
  if(l.shapes.length<2)continue;
  const near=[];
  for(const p of resting)if(Math.abs(p[0]-l.from[0])<=4&&Math.abs(p[1]-l.from[1])<=3)near.push(()=>p);
  for(const o of items){
   if(o===it)continue;
   const q=o.legs.find(m=>m.key===l.key&&m.len>0)||null,p=q?q.from:where(o,l.key);
   if(Math.abs(p[0]-l.from[0])>4||Math.abs(p[1]-l.from[1])>3)continue;
   if(!q){near.push(()=>p);continue;}
   // It may also be planned before or after this leg: its ends count too,
   // except the cell one of the two vacates for the other.
   near.push(u=>legPoint(q,u));
   if(!same(q.from,l.to))near.push(()=>q.from);
   if(!same(q.to,l.from))near.push(()=>q.to);
  }
  let best=null,bestD=-1;
  for(const shape of l.shapes){
   setShape(l,shape);let d=1;
   for(let k=1;k<8;k++){const p=legPoint(l,k/8);for(const f of near)d=Math.min(d,physLen(p,f(k/8)));}
   if(d>bestD+1e-3){best=shape;bestD=d;}
  }
  setShape(l,best);
 }
}
function addLeg(path,to,key,seg){
 if(same(path.end,to))return;
 path.legs.push(leg(path.end,to,key,seg));path.end=[to[0],to[1]];path.key=key;
}

// Record every queued segment as a leg, keyed by its logical event number,
// then treat the batch as shown: no queue, every ball resting on its cell
// (the next passes check both).
function harvest(g,paths){
 const unmerged=g._massFallUnmerged;g._massFallUnmerged=null;
 for(const{b,x,y}of boardBalls(g)){
  if(Array.isArray(b.fallPath)&&b.fallPath.length){
   const path=paths.get(b.id);
   for(const seg of unmerged?.get(b.id)||b.fallPath){
    if(!seg?.to)continue;
    const key=Number(seg.pileFlowOriginalSeq)||Number(seg.motionSeq)||path.key+1e-3;
    if(seg.from&&!same(path.end,seg.from))addLeg(path,seg.from,key,null);
    addLeg(path,seg.to,key,seg);
   }
  }
  delete b.fallPath;
  const v=g.vis.get(b.id);if(!v)continue;
  v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;v.pileFlow=false;
  for(const k of Object.keys(v))if(k.startsWith("_seg")||k==="_pendingPathComplete")delete v[k];
 }
 g._visualMovingIds=new Set();g._visualMotionSeqById=new Map();
 g._liveBatchClock={seq:0,elapsed:0,duration:1/120};
}

// Run what SETTLE would run between batches until no gravity move is left.
function settleNow(g,paths){
 harvest(g,paths);
 for(let i=0;i<MAX_PASSES;i++){
  releaseSettledConstraints(g,"SETTLE_INCREMENTAL");
  if(!hasLegalGravityMove(g.board))break;
  const moved=settlePass(g.board);
  physicsSafetyCheck(g,moved,"SETTLE_INCREMENTAL");
  harvest(g,paths);
  if(!moved)break;
  g.balanceWait=0;g.ver++;
 }
}

// `before` holds the rendered centres just before the commit step.
function startMassFall(g,before){
 const start=new Map(),paths=new Map();
 for(const{b,x,y}of boardBalls(g)){
  const p=before.get(b.id)||[x,y];
  start.set(b.id,p);paths.set(b.id,{end:p,legs:[],key:0});
 }
 settleNow(g,paths);
 const all=[],resting=[];
 for(const{b,x,y}of boardBalls(g)){
  const path=paths.get(b.id),p0=start.get(b.id);
  addLeg(path,[x,y],path.key,null);
  const v=g.vis.get(b.id);if(v){v.x=p0[0];v.y=p0[1];}
  if(path.legs.length)all.push({ball:b,legs:path.legs,start:p0,plan:[]});
  else resting.push([x,y]);
 }
 shapeLegs(all,resting);
 const end=schedule(all);
 g._massFall=all.length?{t:0,end,items:all,byId:new Map(all.map(it=>[it.ball.id,it]))}:null;
 g._visualMovingIds=new Set(all.map(it=>it.ball.id));g._visualMotionSeqById=new Map();
 window.__sixBallLastMassFall={balls:all.length,end:+end.toFixed(3),delayed:all.reduce((n,it)=>n+it.plan.filter(q=>q.delayed).length,0),closest:+Math.min(1,...all.flatMap(it=>it.plan.map(q=>q.clearance))).toFixed(3)};
}

// Distance covered along a leg tau seconds after it starts with speed v0.
const legDist=(q,tau)=>Math.min(q.leg.len,clearSupportLossFallDistance(tau,q.v0,A,VMAX));
function posAt(it,t){
 let p=it.start;
 for(const q of it.plan){
  if(t<q.t0)return p;
  if(t<=q.t1){const l=q.leg;return legPoint(l,l.len>0?legDist(q,t-q.t0)/l.len:1);}
  p=q.leg.to;
 }
 return p;
}
// Plan every leg in logical order, and within one event the leg ending lowest
// first (it usually vacates the way for the others). All balls set off
// together at the commit, so a column falls as one. A ball keeps its speed
// from one leg into the next when it can; a leg starts at the earliest moment
// (from rest when it had to wait) at which it, and then the ball resting at
// its end, stays MIN_GAP clear of every ball already planned, including balls
// still resting where they are.
const MIN_GAP=.86,STEP=1/240,MAX_WAIT=1.5;
// Planned centres on the STEP grid, cached per ball until its plan grows.
function posAtStep(it,j){
 let p=it.cache[j];
 if(!p){p=posAt(it,j*STEP);it.cache[j]=p;}
 return p;
}
function box(points,pad){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of points){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
 return[x0-pad*2,y0-pad/H,x1+pad*2,y1+pad/H];
}
const overlap=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
function schedule(items){
 const next=new Map(items.map(it=>[it,0]));let end=0;
 // Everywhere a ball can be, padded so that two boxes apart never come
 // within MIN_GAP of each other.
 for(const it of items){it.cache=[];it.box=box([it.start,...it.legs.flatMap(l=>[l.from,l.to,legPoint(l,.5)])],.5);}
 for(;;){
  let it=null;
  for(const c of items){
   const i=next.get(c);if(i>=c.legs.length)continue;
   if(!it){it=c;continue;}
   const a=c.legs[i],b=it.legs[next.get(it)];
   if(a.key<b.key||a.key===b.key&&(a.to[1]>b.to[1]||a.to[1]===b.to[1]&&a.to[0]<b.to[0]))it=c;
  }
  if(!it)break;
  const i=next.get(it),l=it.legs[i],prev=it.plan[i-1],earliest=prev?prev.t1:0,vPrev=prev?prev.v1:0;
  const reach=box([l.from,l.to,legPoint(l,.5)],.5),others=items.filter(o=>o!==it&&overlap(reach,o.box));
  const horizon=Math.max(0,...others.map(o=>o.plan.length?o.plan[o.plan.length-1].t1:0));
  // First the earliest start that is clear; only if there is none, the
  // start that keeps the most room.
  let best=null;
  for(let wait=0;wait<=MAX_WAIT+1e-9&&!best;wait+=wait<.1?STEP:4*STEP){
   const q=plan(l,earliest+wait,wait?0:vPrev);
   if(clearance(q,others,MIN_GAP-1e-9,horizon)>=MIN_GAP)best=Object.assign(q,{clearance:MIN_GAP,delayed:wait>0});
  }
  for(let wait=0;!best||best.clearance<MIN_GAP&&wait<=MAX_WAIT+1e-9;wait+=wait<.1?STEP:4*STEP){
   const q=plan(l,earliest+wait,wait?0:vPrev),c=clearance(q,others,best?best.clearance:-1,horizon);
   if(!best||c>best.clearance+1e-6)best=Object.assign(q,{clearance:c,delayed:wait>0});
  }
  it.plan.push(best);it.cache=[];next.set(it,i+1);end=Math.max(end,best.t1);
 }
 return end;
}
function plan(leg,t0,v0){
 const v=Math.min(VMAX,v0),d=leg.len>0?clearSupportLossFallDuration(leg.len,v,A,VMAX):0;
 return{leg,t0,t1:t0+d,v0:v,v1:Math.min(VMAX,v+A*d)};
}
// Smallest distance to the planned balls over the leg and while the ball then
// rests at its end (until `horizon`, when the planned motion ends); stops once
// it is no better than `floor`.
function clearance(q,others,floor,horizon){
 let c2=1;const l=q.leg,j0=Math.floor(q.t0/STEP),j1=Math.ceil(Math.max(q.t1,horizon)/STEP),f2=floor>0?floor*floor:-1;
 for(let j=j0;j<=j1;j++){
  const t=Math.max(q.t0,j*STEP),p=t>=q.t1?l.to:legPoint(l,l.len>0?legDist(q,t-q.t0)/l.len:1);
  for(const o of others){
   const r=posAtStep(o,j),dx=(r[0]-p[0])*.5,dy=(r[1]-p[1])*H,d2=dx*dx+dy*dy;
   if(d2<c2){c2=d2;if(c2<=f2)return Math.sqrt(c2);}
  }
 }
 return Math.sqrt(c2);
}
// Where a planned centre still comes closer than a diameter to another ball
// (a legal lattice step can pass between two balls 1.73 apart; planned balls
// may pass MIN_GAP apart) the moving ball is pushed out along the contact
// normal, both halves when both move. It is recomputed from the plan every
// step, so nothing accumulates.
const FLOOR_ROW=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;
function separate(balls){
 const moving=balls.filter(q=>q.moving);
 for(let pass=0;pass<48;pass++){
  let worst=0;
  for(const a of moving)for(const b of balls){
   if(a===b||b.moving&&b.i<a.i)continue;
   const dx=(b.p[0]-a.p[0])*.5,dy=(b.p[1]-a.p[1])*H;
   if(Math.abs(dx)>=1||Math.abs(dy)>=1)continue;
   const d=Math.sqrt(dx*dx+dy*dy);if(d>=1)continue;
   const nx=d>1e-9?dx/d:0,ny=d>1e-9?dy/d:-1,push=(1-d)*(b.moving?.5:1);
   a.p[0]-=nx*push/.5;a.p[1]-=ny*push/H;
   if(b.moving){b.p[0]+=nx*push/.5;b.p[1]+=ny*push/H;}
   worst=Math.max(worst,1-d);
  }
  for(const q of moving){q.p[0]=Math.max(0,Math.min(W2-1,q.p[0]));q.p[1]=Math.min(FLOOR_ROW,q.p[1]);}
  if(worst<2e-4)break;
 }
}
// The balls that do not fall, and those that have landed, stay on their
// cells while the others pass.
function showMassFall(g,dt){
 const m=g._massFall;if(!m)return;
 m.t+=Math.max(0,Number(dt)||0);
 const balls=[];
 for(const{b,x,y}of boardBalls(g)){
  const it=m.byId.get(b.id);
  balls.push(it?{it,p:posAt(it,m.t).slice(),moving:m.t<it.plan[it.plan.length-1].t1,i:balls.length}:{b,p:[x,y],moving:false});
 }
 separate(balls);
 for(const q of balls){
  const v=g.vis.get(q.it?q.it.ball.id:q.b.id);if(!v)continue;
  if(!q.moving){v.x=q.p[0];v.y=q.p[1];v.vy=0;v.motionSpeed=0;v.pileFlow=false;continue;}
  const last=q.it.last||[v.x,v.y];
  v.x=q.p[0];v.y=q.p[1];v.pileFlow=false;
  for(const k of Object.keys(v))if(k.startsWith("_seg"))delete v[k];
  v.vy=dt>0?Math.max(0,q.p[1]-last[1])/dt:0;v.motionSpeed=dt>0?physLen(last,q.p)/dt:0;
  q.it.last=q.p;
 }
 if(m.t>=m.end){g._massFall=null;g._visualMovingIds=new Set();}
}

// The clear's own segments are merged into longer vertical falls once they
// are marked (app-collapse-vertical-merge-v1.js); keep each original step and
// its event number for the planning above.
const baseMarkPileFlowPaths=markPileFlowPaths;
markPileFlowPaths=function(g,reason){
 if(reason==="clear_support_loss"&&g?.board){
  const m=new Map();
  for(const{b}of boardBalls(g))if(Array.isArray(b.fallPath)&&b.fallPath.length)m.set(b.id,b.fallPath.slice());
  g._massFallUnmerged=m;
  g._massFallActive=!window.__sixBallMassFallDisabled&&m.size>=MIN_RELEASED;
 }
 return baseMarkPileFlowPaths.apply(this,arguments);
};
// The per-ball timing of the batched animation is not used for a mass fall,
// so it is not computed (it is the costly part of the commit). Until the
// commit step ends the segments wait where they are.
const baseScheduleFreshPileFlow=scheduleFreshPileFlow;
scheduleFreshPileFlow=function(g,fresh){
 if(!g?._massFallActive)return baseScheduleFreshPileFlow.apply(this,arguments);
 for(const{seg}of fresh){seg.pileFlowStart=Infinity;seg.pileFlowDuration=1;seg.pileFlowEnd=Infinity;}
};
// While a mass fall is shown every centre is set here, so the batched
// animation's contact correction (up to 128 passes a step) is not needed.
const baseResolveVisualContacts=resolveVisualContacts;
resolveVisualContacts=function(g){
 if(g?._massFall)return 0;
 return baseResolveVisualContacts.apply(this,arguments);
};
const basePending=pendingFallPathCount;
pendingFallPathCount=function(g){
 const n=basePending(g);
 return g?._massFall?n+g._massFall.items.length:n;
};
const baseStepEngine=stepEngine;
stepEngine=function(g,dt){
 let before=null;
 if(g?.state==="RESOLVING"&&g.clearing&&!g.clearing.committed){
  before=new Map();
  for(const[id,v]of g.vis)if(Number.isFinite(v?.x)&&Number.isFinite(v?.y))before.set(id,[v.x,v.y]);
 }
 const r=baseStepEngine(g,dt);
 if(!g||g.state!=="RESOLVING"){if(g){g._massFall=null;g._massFallActive=false;}return r;}
 if(before&&g.clearing?.committed){
  if(g._massFallActive)startMassFall(g,before);
  g._massFallUnmerged=null;g._massFallActive=false;
 }
 else showMassFall(g,dt);
 return r;
};
window.__sixBallMassFallVersion="mass-fall-v1";
})();
