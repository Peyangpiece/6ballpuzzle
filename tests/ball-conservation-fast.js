const {runSuite}=require('./audit-harness');
const suite=String.raw`
const failures=[];function fail(type,data){if(failures.length<50)failures.push({type,...data});}
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
for(let seed=0;seed<300;seed++){
 const rng=mulberry32((0x51A70000+seed)>>>0),b=newBoard();let id=1000000+seed*100,start=0;
 const n=4+Math.floor(rng()*34);for(let k=0;k<n;k++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!b[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)];b[y][x]=mk(id++,Math.floor(rng()*COLORS.length));start++;}
 let guard=0;while(guard++<1000&&settlePass(b,false)){}
 let end=0;const ids=new Set();for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(!q)continue;end++;if(ids.has(q.id))fail('duplicate-id',{seed,id:q.id});ids.add(q.id);}
 if(end!==start)fail('ball-count',{seed,start,end});if(guard>=1000)fail('nontermination',{seed});if(hasLegalGravityMove(b))fail('legal-move-left',{seed});
}
globalThis.__BALL_CONSERVATION={failures};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('BALL_CONSERVATION_FAST',JSON.stringify(ctx.__BALL_CONSERVATION,null,2));if(ctx.__BALL_CONSERVATION.failures.length)process.exitCode=1;
