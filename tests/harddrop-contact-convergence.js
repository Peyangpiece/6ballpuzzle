const {runSuite}=require('./audit-harness');
const suite=String.raw`
const failures=[],arcDebugged=new Set();
function fail(type,data){failures.push({type,...data});}
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function visuals(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v,x,y});}return a;}
function holds(g){let n=0;for(const q of visuals(g))if(q.b.hardDropContactHold)n++;return n;}
function seedPile(g,seed,visibleOnly){
  const rng=mulberry32(910000+seed);let id=3000000+seed*60;
  for(let n=0;n<3+(seed%15);n++){
    const y=visibleOnly?Math.floor(rng()*ROWS):BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];
    for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);
    if(!xs.length)continue;
    const x=xs[Math.floor(rng()*xs.length)],c=Math.floor(rng()*COLORS.length);g.board[y][x]=mk(id++,c);
  }
  settleAll(g.board);
  try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null;if(b){delete b.fallPath;setVis(g,b,x,y,0);}
  }
}
function arm(g,seed){
  g.state='PLAYING';g.piece.rot=seed%6;
  const range=legalXRange(g),f=((seed%31)+.37)/31;
  setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
  const shadow=landingShadowVisualCells(g);if(!shadow)return null;
  const target=dropPiece(g.board,g.piece),base=pieceCells(target),anchor=hexHardDropContactAnchor(g,target,shadow);
  g._hexTestHardDropArm={
    shadow:shadow.map(v=>[v[0],v[1]]),
    target:{x:target.x,y:target.y,rot:target.rot,cells:base.map(c=>[c[0],c[1]])},
    anchor:anchor?{x:anchor.q.x,y:anchor.q.y,rot:anchor.q.rot,ox:anchor.ox,oy:anchor.oy,noUp:anchor.noUp,localX:anchor.localX,dist:anchor.dist,dy:anchor.dy,dx:anchor.dx,cells:pieceCells(anchor.q).map(c=>[c[0],c[1]])}:null
  };
  const before=g.nextId;hardDrop(g);
  return{shadow,before,tracked:new Set([before,before+1,before+2])};
}
function proposalMeta(p){return p?{from:[p.x,p.y],to:[p.tx,p.ty],kind:p.kind||'',pivot:p.pivot||null,topPivot:p.topPivot||null,virtualPivot:!!p.virtualPivot,bundleId:p.bundleId||0,groupSize:p.groupSize||0}:null;}
function motionMeta(b){
  const s=b?.fallPath?.[0];
  return s?{from:s.from,to:s.to,kind:s.kind,pivot:s.pivot||null,topPivot:s.topPivot||null,virtualPivot:!!s.virtualPivot,arc:s._hexHardDropRigidArc||null,pathN:b.fallPath.length,protect:b._hexHardDropProtectRigid||0,gid:b.motionGroupId||0,role:b.motionGroupRole,orientation:b.motionGroupOrientation,rigid:!!b.rigid}:null;
}
function separatorMeta(s){return s?{dir:s.dir,top:s.top?.ball?.id||0,pairLower:s.pairLower?.ball?.id||0,solo:s.solo?.ball?.id||0,support:s.support?.id||0,px:s.px,py:s.py,hitFraction:s.hitFraction,contactSide:s.contactSide}:null;}
function analyzeMembers(g,members){
  const independent=members.map(m=>hexPhysIndependentMemberMotion(g.board,members,m));
  const raw=members.map(m=>hexPhysNaturalMotion(g.board,m.x,m.y,null));
  const plan=hexPhysPlanGroup(g.board,members,true);
  const contacts=typeof slopeRigidExternalContacts==='function'?slopeRigidExternalContacts(g.board,members):[];
  const separator=hexPhysUpConvexSeparator(g.board,members,independent);
  return{
    members:members.map((m,i)=>({id:m.ball.id,logical:[m.x,m.y],role:m.ball.motionGroupRole,orientation:m.ball.motionGroupOrientation,bias:hexPhysBias(m.ball),raw:proposalMeta(raw[i]),independent:proposalMeta(independent[i])})),
    contacts,
    rigidPlan:plan.map(proposalMeta),
    separator:separatorMeta(separator)
  };
}
function preMoveDiag(g,tracked){
  const qs=visuals(g).filter(q=>tracked.has(q.b.id)).sort((a,b)=>a.b.id-b.b.id);
  if(qs.length!==3)return{reason:'member-count',memberCount:qs.length};
  let dir=0;
  for(const q of qs){
    const s=q.b.fallPath?.[0],pv=s?.topPivot||s?.pivot;
    if(!s?.to||!pv)continue;
    const d=Math.sign(s.to[0]-pv[0]);
    if(d){if(dir&&dir!==d)return{reason:'mixed-dir'};dir=d;}
  }
  if(!dir)return{reason:'no-dir'};
  const src=qs.map(q=>({q,x:q.x-dir,y:q.y-1}));
  if(src.some(s=>!valid(s.x,s.y)))return{reason:'invalid-source',dir,sources:src.map(s=>[s.x,s.y])};
  const trackedIds=new Set(qs.map(q=>q.b.id));
  for(const s of src){const occ=g.board[s.y][s.x];if(occ&&!trackedIds.has(occ.id))return{reason:'source-occupied',dir,source:[s.x,s.y],occupant:occ.id};}
  for(const q of qs)if(g.board[q.y][q.x]===q.b)g.board[q.y][q.x]=null;
  let result;
  try{
    for(const s of src)g.board[s.y][s.x]=s.q.b;
    const members=src.map(s=>({ball:s.q.b,x:s.x,y:s.y,role:s.q.b.motionGroupRole,orientation:s.q.b.motionGroupOrientation}));
    result={reason:'ok',dir,analysis:analyzeMembers(g,members)};
  }finally{
    for(const s of src)if(g.board[s.y][s.x]===s.q.b)g.board[s.y][s.x]=null;
    for(const q of qs)g.board[q.y][q.x]=q.b;
  }
  return result;
}
function releaseDiag(g,tracked){
  const qs=visuals(g).filter(q=>tracked.has(q.b.id)).sort((a,b)=>a.b.id-b.b.id);
  if(qs.length!==3)return{memberCount:qs.length};
  const members=qs.map(q=>({ball:q.b,x:q.x,y:q.y,role:q.b.motionGroupRole,orientation:q.b.motionGroupOrientation}));
  const now=analyzeMembers(g,members);
  now.visuals=qs.map(q=>({id:q.b.id,visual:[q.v.x,q.v.y]}));
  now.preMove=preMoveDiag(g,tracked);
  return now;
}
function arcDebug(g,tracked){
  const memberQs=visuals(g).filter(q=>tracked.has(q.b.id)).sort((a,b)=>a.b.id-b.b.id);
  const members=memberQs.map(q=>({id:q.b.id,ball:q.b,seg:q.b.fallPath?.[0]}));
  if(members.length!==3)return{arm:g._hexTestHardDropArm||null,memberCount:members.length,installAttempt:g._hex75InstallAttempt||null,release:releaseDiag(g,tracked)};
  const ids=new Set(members.map(m=>m.id)),obs=visuals(g).filter(q=>!ids.has(q.b.id));
  const base={arm:g._hexTestHardDropArm||null,installAttempt:g._hex75InstallAttempt||null,gid:members[0].ball.motionGroupId,kinds:members.map(m=>m.seg?.kind),sameDisp:null,linearSafe:null,candidates:[],release:releaseDiag(g,tracked)};
  if(members.every(m=>m.seg?.from&&m.seg?.to)){
    const d0=[members[0].seg.to[0]-members[0].seg.from[0],members[0].seg.to[1]-members[0].seg.from[1]];
    base.sameDisp=members.every(m=>Math.abs((m.seg.to[0]-m.seg.from[0])-d0[0])<1e-6&&Math.abs((m.seg.to[1]-m.seg.from[1])-d0[1])<1e-6);
    base.linearSafe=hex74RigidLinearSafe(members,obs.map(q=>({ball:q.b,p:[q.v.x,q.v.y]})));
    for(const leader of members){
      const s=leader.seg.from,e=leader.seg.to;
      for(const o of obs){
        if(Array.isArray(o.b.fallPath)&&o.b.fallPath.length)continue;
        const op=[o.v.x,o.v.y],ds=hex74Dist(s,op),de=hex74Dist(e,op),mid=[(s[0]+e[0])*.5,(s[1]+e[1])*.5],midD=hex74Dist(mid,op);
        if(Math.abs(ds-1)>.05||Math.abs(de-1)>.05)continue;
        const arc=hex74ShortestArc(s,e,op),meta={pivot:op,leaderFrom:s,leaderTo:e,a0:arc.a0,da:arc.da,r0:ds,r1:de,groupId:base.gid,supportId:o.b.id};
        base.candidates.push({leader:leader.id,support:o.b.id,ds,de,midD,da:arc.da,safe:hex74RigidArcSafe(meta,members,obs.map(q=>({ball:q.b,p:[q.v.x,q.v.y]})))});
      }
    }
  }
  return base;
}
function checkFrame(g,seed,step,tracked,prevY){
  const arr=visuals(g);
  for(const q of arr){
    if(!Number.isFinite(q.v.x)||!Number.isFinite(q.v.y)){fail('nonfinite-visual',{seed,step,id:q.b.id});continue;}
    if(tracked.has(q.b.id)){
      const py=prevY.get(q.b.id);
      if(Number.isFinite(py)&&q.v.y<py-1e-6){
        let dbg=null;if(!arcDebugged.has(seed)){arcDebugged.add(seed);dbg=arcDebug(g,tracked);}
        fail('tracked-upward-motion',{seed,step,id:q.b.id,from:py,to:q.v.y,visual:[q.v.x,q.v.y],motion:motionMeta(q.b),arcDebug:dbg});
      }
      prevY.set(q.b.id,q.v.y);
    }
  }
  for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
    const d=hexPhysDist(arr[i].v.x,arr[i].v.y,arr[j].v.x,arr[j].v.y);
    if(d<0.9999)fail('visual-overlap',{seed,step,d,a:arr[i].b.id,b:arr[j].b.id,state:g.state,phase:g.phase});
  }
}
for(const seed of [1,3,5,6,9]){
  const g=createEngine(710000+seed);spawn(g);seedPile(g,seed,false);const a=arm(g,seed);
  if(!a){fail('missing-shadow-exact',{seed});continue;}
  const prevY=new Map();for(let step=0;step<30&&g.alive;step++){checkFrame(g,seed,step,a.tracked,prevY);stepEngine(g,PHYSICS_FRAME);}
}
for(const seed of [1,3,5,6,9,11,17,23]){
  const g=createEngine(810000+seed);spawn(g);seedPile(g,seed,true);const a=arm(g,seed);
  if(!a){fail('missing-shadow-visible',{seed});continue;}
  const prevY=new Map();let settled=false;
  for(let step=0;step<600&&g.alive;step++){
    checkFrame(g,seed,step,a.tracked,prevY);
    if(g.state!=='RESOLVING'){settled=true;break;}
    stepEngine(g,PHYSICS_FRAME);
  }
  if(!g.alive)fail('visible-fixture-gameover',{seed,reason:g.gameOverReason});
  if(holds(g)>0)fail('harddrop-hold-stuck',{seed,holds:holds(g),state:g.state,phase:g.phase});
  if(!settled&&g.state==='RESOLVING')fail('harddrop-resolution-stuck',{seed,phase:g.phase,holds:holds(g)});
}
globalThis.__HARD_DROP_CONVERGENCE={failures};
`;
const ctx=runSuite(suite,{timeout:180000});
console.log('HARD_DROP_CONVERGENCE',JSON.stringify(ctx.__HARD_DROP_CONVERGENCE,null,2));
if(ctx.__HARD_DROP_CONVERGENCE.failures.length)process.exitCode=1;
