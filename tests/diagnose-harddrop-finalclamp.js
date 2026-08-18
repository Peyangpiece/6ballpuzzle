const {runSuite}=require('./audit-harness');
const suite=String.raw`
const logs=[];const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function items(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v,x,y});}return a;}
function state(g,tracked){const a=items(g),tr=a.filter(q=>tracked.has(q.b.id));let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){if(!tracked.has(a[i].b.id)&&!tracked.has(a[j].b.id))continue;const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[a[i].b.id,a[j].b.id];}}return{min,pair,tracked:tr.map(q=>({id:q.b.id,v:[q.v.x,q.v.y],l:[q.x,q.y],noUp:q.b._hexHardDropNoUpY,hold:q.b.hardDropContactHold||null,rest:q.b._hexHardDropContinuousRest||null,path:(q.b.fallPath||[]).slice(0,1).map(s=>({from:s.from,to:s.to,kind:s.kind,pivot:s.pivot||null,topPivot:s.topPivot||null}))}))};}
for(const seed of [3,5,9]){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)],c=Math.floor(rng()*COLORS.length);g.board[y][x]=mk(id++,c);}settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}for(const q of items(g)){delete q.b.fallPath;setVis(g,q.b,q.x,q.y,0);}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);const before=g.nextId;hardDrop(g);const tracked=new Set([before,before+1,before+2]);
 let currentStep=-1,call=0;const old=hexEnforceFinalVisualNonOverlap;hexEnforceFinalVisualNonOverlap=function(gg){const pre=state(gg,tracked),ret=old(gg),post=state(gg,tracked);logs.push({seed,step:currentStep,call:call++,stage:'solver',pre,post,ret});return ret;};
 logs.push({seed,step:-1,stage:'afterDrop',state:state(g,tracked)});
 for(currentStep=0;currentStep<4&&g.alive;currentStep++){call=0;stepEngine(g,PHYSICS_FRAME);logs.push({seed,step:currentStep,stage:'afterStep',state:state(g,tracked)});}
 hexEnforceFinalVisualNonOverlap=old;
}
globalThis.__FINALCLAMP=logs;
`;
const ctx=runSuite(suite,{timeout:180000});console.log('HARD_DROP_FINAL_CLAMP',JSON.stringify(ctx.__FINALCLAMP,null,2));
