const {runSuite}=require('./audit-harness');
const suite=String.raw`
const failures=[];
function fail(type,data){failures.push({type,...data});}
function items(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v,x,y});}return a;}
function minPair(g){const a=items(g);let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[a[i].b.id,a[j].b.id];}}return{min,pair};}
// Root-cause fixture for the historical seed-8 recoil / random settle ball loss:
// two separately accepted bundles may never reserve the same target, and an
// invalid simultaneous event must not delete either source ball.
{
 const b=newBoard(),a={id:5101,c:0,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false},c={id:5102,c:1,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false};
 b[6][4]=a;b[6][8]=c;
 const pa={x:4,y:6,tx:6,ty:8,ball:a,kind:'FREE_FALL',pivot:null,topPivot:null,bundleId:101};
 const pc={x:8,y:6,tx:6,ty:8,ball:c,kind:'FREE_FALL',pivot:null,topPivot:null,bundleId:202};
 if(!hexPhysBundleTargetsFree([pa],b,[]))fail('atomic-first-bundle-rejected',{});
 if(hexPhysBundleTargetsFree([pc],b,[pa]))fail('accepted-target-not-reserved',{});
 const before=[b[6][4]?.id,b[6][8]?.id];const applied=hexPhysApplyEvent(b,[pa,pc]);
 if(applied)fail('duplicate-target-event-applied',{});
 const after=[b[6][4]?.id,b[6][8]?.id];if(JSON.stringify(before)!==JSON.stringify(after))fail('invalid-event-mutated-board',{before,after});
}
// Exact landing-guide generator seed 6: shadow and hard drop must share the same physical envelope.
{
 const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
 const seed=6,g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,Math.floor(rng()*COLORS.length));}
 settleAll(g.board);try{Object.defineProperty(g.board,'_hexEngine',{value:g,writable:true,configurable:true,enumerable:false});}catch(_){}
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
 const sh=landingShadowVisualCells(g);if(!sh)fail('seed6-missing-guide',{});else{
  for(const p of sh)for(const q of items(g)){const d=hexPhysDist(p[0],p[1],q.v.x,q.v.y);if(d<0.999999-1e-7)fail('seed6-guide-overlap',{p:[p[0],p[1]],id:q.b.id,d});}
  const before=g.nextId,guide=sh.map(p=>[p[0],p[1]]);hardDrop(g);const made=[];for(const q of items(g))if(q.b.id>=before&&q.b.id<before+3)made.push({role:q.b.id-before,v:[q.v.x,q.v.y],id:q.b.id});made.sort((a,b)=>a.role-b.role);
  if(made.length!==3)fail('seed6-harddrop-count',{made:made.length});else for(let i=0;i<3;i++){const d=hexPhysDist(made[i].v[0],made[i].v[1],guide[i][0],guide[i][1]);if(d>.055)fail('seed6-guide-harddrop-disagreement',{role:i,d,guide:guide[i],actual:made[i].v});}
  stepEngine(g,PHYSICS_FRAME);const m=minPair(g);if(m.min<0.999999-1e-7)fail('seed6-post-harddrop-overlap',m);
 }
}
// Explicit 3 -> maximal compatible 2+1 rigidity fixture.
{
 const g=createEngine(777001),gid=9001;const bs=[0,1,2].map(r=>({id:7001+r,c:r,motionGroupId:gid,motionGroupRole:r,motionGroupOrientation:'down',motionGroupSize:3,rigid:true,momentumX:0}));
 const members=[{ball:bs[0],x:7,y:4,role:0,orientation:'down'},{ball:bs[1],x:9,y:4,role:1,orientation:'down'},{ball:bs[2],x:8,y:5,role:2,orientation:'down'}];members.forEach(m=>{g.board[m.y][m.x]=m.ball;setVis(g,m.ball,m.x,m.y,0);});
 const ob={id:7999,c:4,isGarbage:true,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,_hexGarbageContinuousRest:{px:5.25,py:cellCenterYNorm(5),groupKey:'audit'}};g.board[5][10]=ob;setVis(g,ob,10.5,5,0);
 const plan=hexPhysPlanGroup(g.board,members,false),groups=[...hexPhysGroups(g.board).values()];if(!plan.length&&groups.every(gr=>gr.length!==2))fail('rigidity-compatible-pair-lost',{groups:groups.map(gr=>gr.map(m=>m.ball.id))});
}
globalThis.__FAST_REGRESSION={failures};
`;
const ctx=runSuite(suite,{timeout:120000});console.log('FAST_KNOWN_REGRESSION',JSON.stringify(ctx.__FAST_REGRESSION,null,2));if(ctx.__FAST_REGRESSION.failures.length)process.exitCode=1;
