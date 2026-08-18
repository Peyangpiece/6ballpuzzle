const {runSuite}=require('./audit-harness');
const suite=String.raw`
const out=[];
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function contactsAt(g,shadow){
 const result=[];
 for(let role=0;role<shadow.length;role++){
  const [sx,sy]=shadow[role],near=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
   const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(!b||!v)continue;
   const d=hexPhysDist(sx,sy,v.x,v.y);if(d<=1.015)near.push({id:b.id,x,y,vx:v.x,vy:v.y,d,side:Math.sign(v.x-sx),below:v.y>sy+1e-8});
  }
  near.sort((a,b)=>a.d-b.d);
  result.push({role,pose:[sx,sy],floorGap:((FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H)-sy,near});
 }
 return result;
}
for(const seed of [1,3,5,6,9]){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;const ball=mk(id++,Math.floor(rng()*COLORS.length));const x=xs[Math.floor(rng()*xs.length)];g.board[y][x]=ball;}
 settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
 const shadow=landingShadowVisualCells(g);const target=dropPiece(g.board,g.piece),base=pieceCells(target);const candidates=[];
 for(let dy=0;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
   const q={...target,x:target.x+dx,y:target.y+dy};if(!pieceFits(g.board,q))continue;const cs=pieceCells(q);
   const ox=shadow?.[0]?.[0]-cs[0][0],oy=shadow?.[0]?.[1]-cs[0][1];
   let rigid=true;for(let i=1;i<3;i++)if(Math.abs((shadow[i][0]-cs[i][0])-ox)>1e-8||Math.abs((shadow[i][1]-cs[i][1])-oy)>1e-8)rigid=false;
   if(!rigid)continue;
   const phys=Math.hypot(ox*.5,oy*HEX_ROW_H),noUp=oy<=1e-8;
   candidates.push({x:q.x,y:q.y,dx,dy,ox,oy,phys,noUp,cells:cs.map(c=>c.slice(0,2))});
 }
 candidates.sort((a,b)=>Number(b.noUp)-Number(a.noUp)||a.phys-b.phys||a.dy-b.dy||Math.abs(a.dx)-Math.abs(b.dx));
 out.push({seed,piece:{x:g.piece.x,y:g.piece.y,rot:g.piece.rot},freeX:g.freeX,pieceVX:g.pieceVX,target:{x:target.x,y:target.y,cells:base.map(c=>c.slice(0,2))},shadow:shadow&&shadow.map(c=>c.slice(0,2)),contacts:shadow?contactsAt(g,shadow):[],candidates:candidates.slice(0,12)});
}
globalThis.__LANDING_ANCHOR_DIAG=out;
`;
const ctx=runSuite(suite,{timeout:120000});console.log('LANDING_ANCHOR_DIAG',JSON.stringify(ctx.__LANDING_ANCHOR_DIAG,null,2));
