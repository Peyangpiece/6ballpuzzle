const {runSuite}=require('./audit-harness');
const suite=String.raw`
const seeds=[1,3,5,6,9],failures=[];function fail(type,data){failures.push({type,...data});}
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function visuals(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v,x,y});}return a;}
function holds(g){let n=0;for(const q of visuals(g))if(q.b.hardDropContactHold)n++;return n;}
for(const seed of seeds){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)],c=Math.floor(rng()*COLORS.length);g.board[y][x]=mk(id++,c);}
 settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}
 // Register every logical pile ball in the visual map before asking the guide
 // or hard-drop contact solver for a physical pose. Using visuals(g) here was
 // circular: freshly seeded board balls have no visual entry yet, so the test
 // accidentally made the guide ignore most of the pile.
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;delete b.fallPath;setVis(g,b,x,y,0);}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
 const shadow=landingShadowVisualCells(g),before=g.nextId;if(!shadow){fail('missing-shadow',{seed});continue;}hardDrop(g);
 const tracked=new Set([before,before+1,before+2]),prevY=new Map();let clearedHoldAt=null,settledAt=null,maxHold=holds(g),worstOverlap=Infinity;
 for(let step=0;step<600&&g.alive;step++){
   const arr=visuals(g);
   for(const q of arr){
     if(!Number.isFinite(q.v.x)||!Number.isFinite(q.v.y)){fail('nonfinite-visual',{seed,step,id:q.b.id});continue;}
     if(tracked.has(q.b.id)){
       const py=prevY.get(q.b.id);if(Number.isFinite(py)&&q.v.y<py-1e-6)fail('tracked-upward-motion',{seed,step,id:q.b.id,from:py,to:q.v.y});
       prevY.set(q.b.id,q.v.y);
     }
   }
   for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){const d=hexPhysDist(arr[i].v.x,arr[i].v.y,arr[j].v.x,arr[j].v.y);worstOverlap=Math.min(worstOverlap,d);if(d<0.9999)fail('visual-overlap',{seed,step,d,a:arr[i].b.id,b:arr[j].b.id,state:g.state,phase:g.phase});}
   const h=holds(g);maxHold=Math.max(maxHold,h);if(h===0&&clearedHoldAt===null)clearedHoldAt=step;
   if(g.state!=='RESOLVING'&&settledAt===null)settledAt=step;
   stepEngine(g,PHYSICS_FRAME);
 }
 if(holds(g)>0)fail('harddrop-hold-stuck',{seed,holds:holds(g),state:g.state,phase:g.phase});
 if(g.state==='RESOLVING')fail('harddrop-resolution-stuck',{seed,phase:g.phase,holds:holds(g)});
 globalThis.__LAST={seed,clearedHoldAt,settledAt,maxHold,worstOverlap,state:g.state,phase:g.phase};
}
globalThis.__HARD_DROP_CONVERGENCE={failures,last:globalThis.__LAST};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('HARD_DROP_CONVERGENCE',JSON.stringify(ctx.__HARD_DROP_CONVERGENCE,null,2));if(ctx.__HARD_DROP_CONVERGENCE.failures.length)process.exitCode=1;
