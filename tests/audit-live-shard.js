const {runSuite}=require('./audit-harness');
const start=Math.max(1,Number(process.argv[2])||1);
const count=Math.max(1,Number(process.argv[3])||6);
const seconds=Math.max(8,Number(process.argv[4])||30);
const suite=String.raw`
const START=${start},COUNT=${count},SECONDS=${seconds};
const bugs=[],stats={},LIMIT=80;
function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<LIMIT)bugs.push({type,...data});}
function boardItems(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;out.push({id:ball.id,ball,v:g.vis.get(ball.id),lx:x,ly:y,active:false});}return out;}
function activeItems(g){if(g.state!=='PLAYING'||!g.piece)return[];const cells=pieceCells(g.piece),dx=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;let dOff=dispOff(g.piece.rot);const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2});const align=blocked?Math.max(0,1-Math.min(1,g.lockT/LANDING_ALIGN_DURATION)):1;dOff*=align;const frac=safeActiveFallOffset(g,cells,dx,dOff,activeDropFraction(g));const pts=cells.map(([x,y])=>[latticeRealX(x+dx),cellCenterYNorm(y+frac+dOff)]);const gx=pts.reduce((n,p)=>n+p[0],0)/3,gy=pts.reduce((n,p)=>n+p[1],0)/3;const k=g.rotAnim.p<1?1-smoothRotationT(g.rotAnim.p):0,ang=-k*g.rotAnim.dir*(TAU/6),ca=Math.cos(ang),sa=Math.sin(ang),ox=k*(g.rotAnim.dx||0)*.5,oy=k*(g.rotAnim.dy||0)*HEX_ROW_H;return pts.map((p,i)=>{const ax=p[0]-gx,ay=p[1]-gy,px=gx+ax*ca-ay*sa+ox,py=gy+ax*sa+ay*ca+oy;return{id:'active'+i,active:true,v:{x:px/.5,y:(py-BOARD_TOP_CENTER_N)/HEX_ROW_H},lx:cells[i][0],ly:cells[i][1]};});}
function signature(g){const q=boardItems(g).map(o=>[o.id,o.lx,o.ly,+(o.v?.x??o.lx).toFixed(5),+(o.v?.y??o.ly).toFixed(5),o.ball.fallPath?.length||0,o.ball.motionGroupId||0]);return JSON.stringify([g.state,g.phase,g.piece&&[g.piece.x,g.piece.y,g.piece.rot,+g.pieceVX.toFixed(5)],q,(g.activeGarbagePacks||[]).filter(p=>!p.landed).map(p=>[p.seq,+p.y.toFixed(5),p.pat?.length||0])]);}
for(let seed=START;seed<START+COUNT;seed++){
 const g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};const prevY=new Map(),seenGarbageStarts=new Set(),starts=[];let same=0,last='';let min=Infinity,steps=0;
 for(let step=0;step<Math.floor(SECONDS/PHYSICS_FRAME)&&g.alive;step++){
  if(step===120*5)g.incomingShapes.push('PYRAMID');
  if(step===120*10)g.incomingShapes.push('HEXAGON');
  if(step===120*15)g.incomingShapes.push('STRAIGHT');
  if(step===120*20)g.incoming+=8;
  stepEngine(g,PHYSICS_FRAME);steps++;
  const board=boardItems(g),all=board.concat(activeItems(g)),ids=new Set();
  for(const q of board){
   if(ids.has(q.id))bug('duplicate-id',{seed,step,id:q.id});ids.add(q.id);
   if(!q.v){bug('missing-vis',{seed,step,id:q.id,l:[q.lx,q.ly]});continue;}
   if(!Number.isFinite(q.v.x)||!Number.isFinite(q.v.y)||!Number.isFinite(q.v.vy||0))bug('nan-vis',{seed,step,id:q.id,v:q.v});
   const floorY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
   if(q.v.y>floorY+1e-6)bug('floor-penetration',{seed,step,id:q.id,y:q.v.y,floorY});
   if(q.v.x<-1e-6||q.v.x>W2-1+1e-6)bug('wall-penetration',{seed,step,id:q.id,x:q.v.x});
   const py=prevY.get(q.id);if(Number.isFinite(py)&&q.v.y<py-1e-5)bug('upward-visual',{seed,step,id:q.id,from:py,to:q.v.y,path:q.ball.fallPath?.[0]?.kind||''});prevY.set(q.id,q.v.y);
   for(const seg of q.ball.fallPath||[])if(seg?.from&&seg?.to&&seg.to[1]<seg.from[1]-1e-8)bug('upward-path',{seed,step,id:q.id,kind:seg.kind,from:seg.from,to:seg.to});
   if(q.ball._hexGarbageContinuousRest){const r=q.ball._hexGarbageContinuousRest,rx=r.px/.5,ry=(r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H,d=Math.hypot((q.v.x-rx)*.5,(q.v.y-ry)*HEX_ROW_H);if(d>2e-5)bug('stale-garbage-rest',{seed,step,id:q.id,d,visual:[q.v.x,q.v.y],rest:[rx,ry]});}
  }
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];if(!a.v||!b.v)continue;const d=hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y);min=Math.min(min,d);if(d<0.999999-1e-7)bug('visual-overlap',{seed,step,d,a:{id:a.id,active:a.active,x:a.v.x,y:a.v.y},b:{id:b.id,active:b.active,x:b.v.x,y:b.v.y},state:g.state,phase:g.phase});}
  for(const [gid,members] of hexPhysGroups(g.board)){const sizes=new Set(members.map(m=>m.ball.motionGroupSize));if(sizes.size!==1||![2,3].includes([...sizes][0])||[...sizes][0]!==members.length)bug('group-size-metadata',{seed,step,gid,sizes:[...sizes],actual:members.length});if(members.some(m=>!m.ball.rigid))bug('group-nonrigid',{seed,step,gid});}
  for(const p of g.garbagePlans||[])if(p._started&&!seenGarbageStarts.has(p.seq)){seenGarbageStarts.add(p.seq);starts.push(p.actualStartTime);}
  const sig=signature(g);same=sig===last?same+1:0;last=sig;if(g.state==='RESOLVING'&&same>360)bug('resolving-stall-3s',{seed,step,phase:g.phase,same});
  if(g.state==='GAMEOVER'){const pending=pendingFallPathCount(g);if(pending||hasLegalGravityMove(g.board)||boardHasIllegalFloat(g.board))bug('gameover-before-stable',{seed,step,pending,legal:hasLegalGravityMove(g.board),floating:boardHasIllegalFloat(g.board),reason:g.gameOverReason});}
 }
 for(let i=1;i<starts.length;i++){const d=starts[i]-starts[i-1];if(Math.abs(d-.5)>1e-7)bug('garbage-interval',{seed,i,d,starts});}
 console.log('LIVE_SEED',JSON.stringify({seed,steps,alive:g.alive,state:g.state,phase:g.phase,min:+min.toFixed(9),starts,bugs:bugs.filter(b=>b.seed===seed).length}));
}
globalThis.__AUDIT={bugs,stats};
`;
const ctx=runSuite(suite,{timeout:420000});
console.log('LIVE_AUDIT',JSON.stringify(ctx.__AUDIT,null,2));
if(Object.keys(ctx.__AUDIT.stats).length)process.exitCode=1;
