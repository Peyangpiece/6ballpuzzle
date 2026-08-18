const {runSuite}=require('./audit-harness');
const suite=String.raw`
const out=[];const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function snap(g){const balls=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(!b)continue;balls.push({id:b.id,l:[x,y],v:v?[v.x,v.y]:null,path:(b.fallPath||[]).slice(0,2).map(s=>({from:s.from,to:s.to,kind:s.kind,pivot:s.pivot,topPivot:s.topPivot})),hold:b.hardDropContactHold||null,group:b.motionGroupId||0,size:b.motionGroupSize||0,role:b.motionGroupRole,rigid:!!b.rigid});}return balls;}
for(const seed of [1,3,5,6,9]){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)],c=Math.floor(rng()*COLORS.length);g.board[y][x]=mk(id++,c);}
 settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b){delete b.fallPath;setVis(g,b,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);hardDrop(g);
 for(let step=0;step<600&&g.alive;step++)stepEngine(g,PHYSICS_FRAME);
 out.push({seed,state:g.state,phase:g.phase,pending:pendingFallPathCount(g),near:nearlySettled(g,SETTLE_TOL),illegal:boardHasIllegalFloat(g.board),legal:hasLegalGravityMove(g.board),watch:g.physicsWatch,balls:snap(g)});
}
globalThis.__STALL=out;
`;
const ctx=runSuite(suite,{timeout:180000});console.log('HARD_DROP_STALL',JSON.stringify(ctx.__STALL,null,2));
