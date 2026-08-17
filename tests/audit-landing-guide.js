const {runSuite}=require('./audit-harness');
const cases=Math.max(50,Number(process.argv[2])||500);
const suite=String.raw`
const CASES=${cases},bugs=[],stats={},LIMIT=100;function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<LIMIT)bugs.push({type,...data});}
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function setBoardEngine(g){try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){g.board._hexEngine=g;}}
function physicalSafe(g,x,y,ignore=new Set()){for(let yy=boardScanMin(g.board);yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){const b=valid(xx,yy)?g.board[yy][xx]:null,v=b&&g.vis.get(b.id);if(!b||!v||ignore.has(b.id))continue;if(hexPhysDist(x,y,v.x,v.y)<0.999999-1e-7)return false;}return true;}
for(let seed=0;seed<CASES;seed++){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 // Build an irregular but settled accumulated pile.
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,Math.floor(rng()*COLORS.length));}
 settleAll(g.board);setBoardEngine(g);for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31,targetX=range[0]+(range[1]-range[0])*f;setFreeX(g,targetX);updateVisuals(g,PHYSICS_FRAME);
 if(g.freeX<range[0]-1e-8||g.freeX>range[1]+1e-8)bug('drag-outside-range',{seed,range,freeX:g.freeX});
 const sh=landingShadowVisualCells(g);if(!sh){bug('missing-guide',{seed,rot:g.piece.rot,range,freeX:g.freeX});continue;}
 for(const [x,y] of sh){const floorY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;if(y>floorY+1e-7)bug('guide-floor-penetration',{seed,x,y,floorY});if(x<-1e-7||x>W2-1+1e-7)bug('guide-wall-penetration',{seed,x,y});if(!physicalSafe(g,x,y))bug('guide-overlap',{seed,x,y});}
 for(let i=0;i<sh.length;i++)for(let j=i+1;j<sh.length;j++){const d=hexPhysDist(sh[i][0],sh[i][1],sh[j][0],sh[j][1]);if(Math.abs(d-1)>2e-5)bug('guide-breaks-triplet',{seed,i,j,d,sh});}
 const before=g.nextId,shadow=sh.map(v=>[v[0],v[1]]);hardDrop(g);const made=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b&&b.id>=before&&b.id<before+3){const v=g.vis.get(b.id);made.push({role:b.id-before,id:b.id,v:v&&[v.x,v.y],l:[x,y]});}}
 if(made.length!==3){bug('harddrop-created-count',{seed,before,made});continue;}made.sort((a,b)=>a.role-b.role);
 for(const m of made){if(!m.v||!Number.isFinite(m.v[0])||!Number.isFinite(m.v[1]))bug('harddrop-missing-visual',{seed,m});}
 // At hand-off, each role should start at the same physical contact envelope as its guide, before pile flow consumes later path segments.
 for(let i=0;i<3;i++)if(made[i]?.v){const d=hexPhysDist(made[i].v[0],made[i].v[1],shadow[i][0],shadow[i][1]);if(d>.055)bug('guide-harddrop-contact-disagreement',{seed,role:i,d,guide:shadow[i],actual:made[i].v,logical:made[i].l});}
 // One full physics frame after hard drop must remain penetration-free.
 stepEngine(g,PHYSICS_FRAME);const items=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)items.push({b,v});}for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const d=hexPhysDist(items[i].v.x,items[i].v.y,items[j].v.x,items[j].v.y);if(d<0.999999-1e-7)bug('post-harddrop-overlap',{seed,d,a:items[i].b.id,b:items[j].b.id});}
}
// Rotation wall/contact sweep: accepted rotations must be collision-free throughout their rendered 0.10s path.
for(let seed=0;seed<CASES;seed++){
 const g=createEngine(810000+seed);spawn(g);const rng=mulberry32(820000+seed);let id=5000000+seed*20;for(let n=0;n<seed%8;n++){const y=ROWS-1-2*Math.floor(rng()*4),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(xs.length)g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,n%COLORS.length);}settleAll(g.board);setBoardEngine(g);for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b){delete b.fallPath;setVis(g,b,x,y,0);}}
 g.state='PLAYING';g.piece.y=-2+2*(seed%5);g.pieceVX=g.piece.x;const from={...g.piece,colors:g.piece.colors.slice()},dir=seed%2?1:-1;if(rotate(g,dir)){const to={...g.piece,colors:g.piece.colors.slice()};if(!rotationSweepSafe(g.board,from,to,dir))bug('accepted-rotation-unsafe-base-sweep',{seed,dir,from,to});}
}
globalThis.__AUDIT={cases:CASES,bugs,stats};
`;
const ctx=runSuite(suite,{timeout:420000});console.log('LANDING_AUDIT',JSON.stringify(ctx.__AUDIT,null,2));if(Object.keys(ctx.__AUDIT.stats).length)process.exitCode=1;
