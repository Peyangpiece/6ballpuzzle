const {runSuite}=require('./audit-harness');
const suite=String.raw`
const out={};
function describeBall(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b||b.id!==id)continue;const v=g.vis.get(id);return{id:b.id,c:b.c,garbage:!!b.isGarbage,garbageType:b.garbageType||null,logical:[x,y],visual:v?[v.x,v.y]:null,vy:v?.vy||0,motionSpeed:v?.motionSpeed||0,rigid:!!b.rigid,group:b.motionGroupId||0,role:b.motionGroupRole,rest:b._hexGarbageContinuousRest||null,relax:b._hexGarbageRelax||null,path:(b.fallPath||[]).map(s=>({from:s.from,to:s.to,kind:s.kind,motionSeq:s.motionSeq,pileFlow:!!s.pileFlow,pileFlowStart:s.pileFlowStart,pileFlowEnd:s.pileFlowEnd,garbageContinuousHandoff:!!s.garbageContinuousHandoff,followSupportIds:s.followSupportIds||[]}))};}return null;}
function boardPairMin(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v});}let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[a[i].b.id,a[j].b.id];}}return{min,pair};}
// Seed 8: reproduce first gross overlap under broad fuzz injection.
{
 const g=createEngine(8);g.ai={level:4,target:null,thinkT:0,actT:0};
 for(let step=0;step<3600&&g.alive;step++){
   if(step===120*5)g.incomingShapes.push('PYRAMID');
   if(step===120*10)g.incomingShapes.push('HEXAGON');
   if(step===120*15)g.incomingShapes.push('STRAIGHT');
   if(step===120*20)g.incoming+=8;
   const pre=new Map();for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)pre.set(b.id,{x:v.x,y:v.y,path:JSON.stringify(b.fallPath||[])});}
   stepEngine(g,PHYSICS_FRAME);
   if(!out.upwardPath){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;for(const s of b.fallPath||[])if(s?.from&&s?.to&&s.to[1]<s.from[1]-1e-9){out.upwardPath={seed:8,step,state:g.state,phase:g.phase,ball:describeBall(g,b.id),pre:pre.get(b.id)||null};break;}if(out.upwardPath)break;}}
   if(!out.upwardVisual){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id),p=b&&pre.get(b.id);if(b&&v&&p&&v.y<p.y-1e-5){out.upwardVisual={seed:8,step,state:g.state,phase:g.phase,from:[p.x,p.y],to:[v.x,v.y],ball:describeBall(g,b.id)};break;}}}
   const q=boardPairMin(g);if(!out.grossOverlap&&q.min<.99){const [a,b]=q.pair;out.grossOverlap={seed:8,step,state:g.state,phase:g.phase,min:q.min,a:describeBall(g,a),b:describeBall(g,b),pending:pendingFallPathCount(g),pileClock:g.pileFlowClock,garbageClock:g.garbageClock};break;}
 }
}
// Seed 1: capture the first stale continuous-rest divergence before it floods later logs.
{
 const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
 for(let step=0;step<2200&&g.alive;step++){
   if(step===120*5)g.incomingShapes.push('PYRAMID');if(step===120*10)g.incomingShapes.push('HEXAGON');if(step===120*15)g.incomingShapes.push('STRAIGHT');if(step===120*20)g.incoming+=8;
   stepEngine(g,PHYSICS_FRAME);
   let hit=null;for(let y=boardScanMin(g.board);y<ROWS&&!hit;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,r=b?._hexGarbageContinuousRest,v=b&&g.vis.get(b.id);if(!b||!r||!v)continue;const rx=r.px/.5,ry=(r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H,d=Math.hypot((v.x-rx)*.5,(v.y-ry)*HEX_ROW_H);if(d>1e-4)hit={id:b.id,d};}if(hit){out.staleRest={seed:1,step,state:g.state,phase:g.phase,ball:describeBall(g,hit.id),distance:hit.d};break;}
 }
}
// First landing shadow that physically overlaps current rendered pile; record both calculators.
{
 const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
 for(let seed=0;seed<500&&!out.guideOverlap;seed++){
   const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
   for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,Math.floor(rng()*COLORS.length));}
   settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
   g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
   const sh=landingShadowVisualCells(g);if(!sh)continue;let hit=null;for(let role=0;role<sh.length&&!hit;role++){const p=sh[role];for(let y=boardScanMin(g.board);y<ROWS&&!hit;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(!b||!v)continue;const d=hexPhysDist(p[0],p[1],v.x,v.y);if(d<.999999-1e-7)hit={role,p,d,obstacle:describeBall(g,b.id)};}}if(hit){const cells=pieceCells(dropPiece(g.board,g.piece)),dx=(g.freeX!=null?g.freeX:g.pieceVX)-g.piece.x,frac=safeActiveFallOffset(g,cells,dx,0,2);out.guideOverlap={seed,piece:{...g.piece},pieceVX:g.pieceVX,freeX:g.freeX,range,shadow:sh,hit,dropCells:cells,dx,physicalContactFrac:frac};}
 }
}
globalThis.__TARGET=out;
`;
const ctx=runSuite(suite,{timeout:300000});console.log('TARGETED_FAILURES',JSON.stringify(ctx.__TARGET,null,2));
