const vm=require('vm'),assert=require('assert/strict');
const {ctx}=require('./v1303-plan-group-smoke.js');
ctx.dropSeeds=Number(process.env.DROP_SEEDS)||8;
const result=vm.runInContext(`(()=>{
 let turns=0;const phases={};
 for(let seed=1;seed<=dropSeeds;seed++){
  const g=createEngine(seed);spawn(g);
  for(let turn=0;turn<35&&g.state==='PLAYING';turn++){
   const before=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(g.board[y][x])before.push([x,y,g.board[y][x].c]);
   const input={rot:Math.floor(g.rng()*6),x:1+g.rng()*16,colors:[...g.piece.colors]};
   g.piece.rot=input.rot;setFreeX(g,input.x);g.pieceVX=g.freeX;hardDrop(g);
   if(seed>6&&turn%6===0)g.incomingShapes.push('PYRAMID');
   let frame=0;for(;frame<1200&&g.state==='RESOLVING';frame++){
    stepEngine(g,1/120);
    if(g.state==='RESOLVING')phases[g.phase]=(phases[g.phase]||0)+1;
   }
   if(g.state==='RESOLVING'){
    const balls=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=g.board[y][x],v=b&&g.vis.get(b.id);if(b)balls.push({id:b.id,x,y,vx:v?.x,vy:v?.y,path:b.fallPath?.map(s=>({from:s.from,to:s.to,kind:s.kind}))});}
    return{failure:true,seed,turn,input,before,phase:g.phase,pending:pendingFallPathCount(g),legal:!!hasLegalGravityMove(g.board),settled:nearlySettled(g,SETTLE_TOL),balls};
   }
   turns++;
  }
 }
 return{seeds:dropSeeds,turns,phases};
})()`,ctx,{timeout:120000});
console.log('Instant drop progress',JSON.stringify(result));
assert(!result.failure,'Instant drop must finish resolving and allow next piece');
if(ctx.dropSeeds>=8){assert(result.phases.CLEAR>0);assert(result.phases.GARBAGE>0);}
