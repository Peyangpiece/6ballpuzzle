const {runSuite}=require('./audit-harness');
const cases=Math.max(80,Number(process.argv[2])||300);
const suite=String.raw`
const CASES=${cases},bugs=[],stats={};function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<100)bugs.push({type,...data});}
const D=64,X=0,Y=0,BW=(W2-1)*D*.5,BH=BOARD_FLOOR_N*D;
const pos=(x,y)=>[x*D*.5,D*.5+y*D*HEX_ROW_H];
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
for(let seed=0;seed<CASES;seed++){
 const g=createEngine(930000+seed);spawn(g);const rng=mulberry32(950000+seed);let id=4000000+seed*70;
 for(let n=0;n<4+(seed%20);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,Math.floor(rng()*COLORS.length));}
 settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%37)+.41)/37;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
 const sh=landingShadowVisualCells(g);if(!sh)continue;const px=rigidShadowPixelPlacement(g,sh,pos,D,X,Y,BW,BH);if(px.length!==sh.length){bug('rendered-guide-count',{seed,logical:sh.length,pixels:px.length});continue;}
 let maxShift=0,shifts=[];for(let i=0;i<sh.length;i++){const base=pos(sh[i][0],sh[i][1]),d=Math.hypot(px[i][0]-base[0],px[i][1]-base[1]);maxShift=Math.max(maxShift,d);shifts.push(d);}
 if(maxShift>1e-5)bug('rendered-guide-extra-correction',{seed,maxShift,shifts,shadow:sh,pixels:px});
}
globalThis.__RENDER_GUIDE_AUDIT={cases:CASES,stats,bugs};
`;
const ctx=runSuite(suite,{timeout:300000});console.log('RENDERED_GUIDE_AUDIT',JSON.stringify(ctx.__RENDER_GUIDE_AUDIT,null,2));if(Object.keys(ctx.__RENDER_GUIDE_AUDIT.stats).length)process.exitCode=1;
