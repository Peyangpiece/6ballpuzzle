const vm=require('vm'),assert=require('assert/strict');
const {ctx}=require('./v1303-plan-group-smoke.js');
const result=vm.runInContext(`(()=>{
 let worst=1,detail=null,turns=0;
 for(let seed=1;seed<=3;seed++){
  const g=createEngine(seed);spawn(g);
  for(let turn=0;turn<35&&g.state==='PLAYING';turn++){
   g.piece.rot=Math.floor(g.rng()*6);setFreeX(g,1+g.rng()*16);g.pieceVX=g.freeX;hardDrop(g);
   for(let frame=0;frame<1200&&g.state==='RESOLVING';frame++){
    stepEngine(g,1/120);
    const items=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
     const b=g.board[y][x],v=b&&g.vis.get(b.id);if(b&&v){
      if(v.y>(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H+.0001)
       throw Error('Contact correction crossed wall/floor '+JSON.stringify({seed,turn,frame,id:b.id,x:v.x,y:v.y}));
      items.push({b,v,x,y});
     }
    }
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
     const a=items[i],b=items[j],d=Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*HEX_ROW_H);
     if(d<worst){worst=d;detail={seed,turn,frame,phase:g.phase,pending:pendingFallPathCount(g),a:{id:a.b.id,x:a.v.x,y:a.v.y,lx:a.x,ly:a.y,gid:a.b.motionGroupId,kind:a.b.fallPath?.[0]?.kind},b:{id:b.b.id,x:b.v.x,y:b.v.y,lx:b.x,ly:b.y,gid:b.b.motionGroupId,kind:b.b.fallPath?.[0]?.kind}};}
    }
   }
   if(g.state==='RESOLVING')throw Error('Contact protection stalled '+seed+':'+turn);
   turns++;
  }
 }
 return{worst,detail,turns};
})()`,ctx,{timeout:240000});
console.log(JSON.stringify(result));
assert(result.worst>=.9994,'Balls must not penetrate each other');
