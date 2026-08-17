const {runSuite}=require('./audit-harness');
const start=Math.max(1,Number(process.argv[2])||1),count=Math.max(1,Number(process.argv[3])||4),seconds=Math.max(12,Number(process.argv[4])||24);
const suite=String.raw`
const START=${start},COUNT=${count},SECONDS=${seconds},bugs=[],stats={},LIMIT=120;
function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<LIMIT)bugs.push({type,...data});}
function activeSig(g){if(g.state!=='PLAYING'||!g.piece)return'';return JSON.stringify([g.piece.x,g.piece.y,g.piece.rot,+Number(g.pieceVX).toFixed(5),+Number(g.dropT).toFixed(5),+Number(g.lockT).toFixed(5),!!g.fastForward]);}
function boardSig(g){const q=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)q.push([b.id,x,y,b.fallPath?.length||0]);}return JSON.stringify([g.state,g.phase,q]);}
for(let seed=START;seed<START+COUNT;seed++)for(let level=1;level<=5;level++){
 const g=createEngine((0xA1100000+seed*17+level)>>>0);g.ai={level,target:null,thinkT:0,actT:0};
 let sameActive=0,lastActive='',sameResolve=0,lastResolve='',pieceAge=0,maxPieceAge=0,spawnCount=0,lastPieceId='';
 for(let step=0;step<Math.floor(SECONDS/PHYSICS_FRAME)&&g.alive;step++){
  if(step===120*5)g.incomingShapes.push('PYRAMID');if(step===120*10)g.incomingShapes.push('HEXAGON');if(step===120*15)g.incomingShapes.push('STRAIGHT');
  stepEngine(g,PHYSICS_FRAME);
  if(!Number.isFinite(g.stateT)||!Number.isFinite(g.pileFlowClock)||!Number.isFinite(g.garbageClock))bug('nan-clock',{seed,level,step,state:g.state,phase:g.phase});
  if(g.incoming<0||g.garbLeft<0||g.sendBuffer<0)bug('negative-counter',{seed,level,step,incoming:g.incoming,garbLeft:g.garbLeft,sendBuffer:g.sendBuffer});
  if(g.state==='PLAYING'){
   if(!g.piece){bug('playing-without-piece',{seed,level,step});break;}
   if(!Number.isFinite(g.piece.x)||!Number.isFinite(g.piece.y)||!Number.isFinite(g.pieceVX)||!Number.isFinite(g.dropT)||!Number.isFinite(g.lockT))bug('active-nan',{seed,level,step,piece:g.piece,pieceVX:g.pieceVX,dropT:g.dropT,lockT:g.lockT});
   const sig=activeSig(g);sameActive=sig===lastActive?sameActive+1:0;lastActive=sig;if(sameActive>360)bug('ai-playing-stall-3s',{seed,level,step,sameActive,piece:g.piece,pieceVX:g.pieceVX,ai:g.ai});
   const pid=JSON.stringify(g.piece.colors);if(pid!==lastPieceId){lastPieceId=pid;pieceAge=0;spawnCount++;}else pieceAge+=PHYSICS_FRAME;maxPieceAge=Math.max(maxPieceAge,pieceAge);if(pieceAge>10)bug('ai-piece-over-10s',{seed,level,step,pieceAge,piece:g.piece,ai:g.ai});
   const [lo,hi]=legalXRange(g);if(g.pieceVX<lo-1.01||g.pieceVX>hi+1.01)bug('active-x-outside-reachable',{seed,level,step,lo,hi,pieceVX:g.pieceVX});
  }else{sameActive=0;lastActive='';pieceAge=0;lastPieceId='';}
  if(g.state==='RESOLVING'){
   const sig=boardSig(g);sameResolve=sig===lastResolve?sameResolve+1:0;lastResolve=sig;
   if(sameResolve>600)bug('ai-resolving-stall-5s',{seed,level,step,phase:g.phase,sameResolve,stateT:g.stateT});
  }else{sameResolve=0;lastResolve='';}
 }
 console.log('AI_STATE_CASE',JSON.stringify({seed,level,alive:g.alive,state:g.state,phase:g.phase,spawnCount,maxPieceAge:+maxPieceAge.toFixed(3),bugs:bugs.filter(b=>b.seed===seed&&b.level===level).length}));
}
globalThis.__AI_AUDIT={start:START,count:COUNT,seconds:SECONDS,stats,bugs};
`;
const ctx=runSuite(suite,{timeout:420000});console.log('AI_STATE_AUDIT',JSON.stringify(ctx.__AI_AUDIT,null,2));if(Object.keys(ctx.__AI_AUDIT.stats).length)process.exitCode=1;
