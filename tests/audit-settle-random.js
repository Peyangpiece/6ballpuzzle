const {runSuite}=require('./audit-harness');
const cases=Math.max(100,Number(process.argv[2])||5000);
const suite=String.raw`
const CASES=${cases},bugs=[],stats={},LIMIT=100;
function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<LIMIT)bugs.push({type,...data});}
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
for(let seed=0;seed<CASES;seed++){
 const rng=mulberry32((0x51A70000+seed)>>>0),b=newBoard();let id=1000000+seed*100,startCount=0;
 const n=4+Math.floor(rng()*34);
 for(let k=0;k<n;k++){
  const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!b[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)],ball=mk(id++,Math.floor(rng()*COLORS.length));b[y][x]=ball;noteBoardCell(b,y,ball);startCount++;
 }
 let guard=0,previous='',repeat=0,maxRepeat=0;
 while(guard<1000){
  const sig=physicsSignature(b);repeat=sig===previous?repeat+1:0;previous=sig;maxRepeat=Math.max(maxRepeat,repeat);
  const moved=settlePass(b,false);guard++;if(!moved)break;
 }
 if(guard>=1000)bug('settle-nontermination',{seed,startCount,maxRepeat});
 if(hasLegalGravityMove(b))bug('settle-left-legal-move',{seed,guard});
 const ids=new Set();let endCount=0,locked=0,float=0;
 for(let y=BOARD_MIN_ROW;y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(!q)continue;endCount++;if(ids.has(q.id))bug('duplicate-id',{seed,id:q.id});ids.add(q.id);if(q.equilibriumLocked)locked++;}
 if(endCount!==startCount)bug('ball-conservation',{seed,startCount,endCount});
 float=unstableFrozenBalls(b).length;
 if(float)bug('unsupported-after-settle',{seed,float,locked,guard});
 if(locked)bug('equilibrium-lock-in-logical-settle',{seed,locked,float,guard});
 if(maxRepeat>2)bug('repeating-state',{seed,maxRepeat,guard});
}
globalThis.__AUDIT={cases:CASES,bugs,stats};
`;
const ctx=runSuite(suite,{timeout:300000});
console.log('SETTLE_AUDIT',JSON.stringify(ctx.__AUDIT,null,2));
if(Object.keys(ctx.__AUDIT.stats).length)process.exitCode=1;
