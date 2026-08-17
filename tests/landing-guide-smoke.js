const {runSuite}=require('./audit-harness');
const suite=String.raw`
const failures=[];function fail(type,data){failures.push({type,...data});}
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
for(const seed of [1,3,5,6,9]){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,Math.floor(rng()*COLORS.length));}
 settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
 const sh=landingShadowVisualCells(g);if(!sh){fail('missing',{seed});continue;}const before=g.nextId,shadow=sh.map(v=>[v[0],v[1]]);hardDrop(g);const made=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b&&b.id>=before&&b.id<before+3){const v=g.vis.get(b.id);made.push({role:b.id-before,v:v&&[v.x,v.y],l:[x,y]});}}made.sort((a,b)=>a.role-b.role);
 if(made.length!==3){fail('count',{seed,made});continue;}for(let i=0;i<3;i++){const d=hexPhysDist(made[i].v[0],made[i].v[1],shadow[i][0],shadow[i][1]);if(d>.055)fail('disagreement',{seed,role:i,d,guide:shadow[i],actual:made[i].v,logical:made[i].l});}
}
globalThis.__LANDING_SMOKE={failures};
`;
const ctx=runSuite(suite,{timeout:120000});console.log('LANDING_GUIDE_SMOKE',JSON.stringify(ctx.__LANDING_SMOKE,null,2));if(ctx.__LANDING_SMOKE.failures.length)process.exitCode=1;
