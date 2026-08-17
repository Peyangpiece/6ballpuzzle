const {runSuite}=require('./audit-harness');
const suite=String.raw`
const seed=0,rng=mulberry32((0x51A70000+seed)>>>0),b=newBoard();let id=1000000,startCount=0;
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
const n=4+Math.floor(rng()*34);for(let k=0;k<n;k++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!b[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)];b[y][x]=mk(id++,Math.floor(rng()*COLORS.length));startCount++;}
function ids(){const out=[];for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(q)out.push({id:q.id,x,y});}return out;}
let hit=null;
for(let step=0;step<200&&!hit;step++){
 const before=ids(),beforeSet=new Set(before.map(q=>q.id));
 const accepted=hexPhysResolveEvent(b,false)||[];
 const targets=accepted.map(p=>({id:p.ball.id,from:[p.x,p.y],to:[p.tx,p.ty],kind:p.kind,bundle:p.bundleId||0}));
 const dupTargets=[];const seen=new Map();for(const p of targets){const k=p.to.join(',');if(seen.has(k))dupTargets.push([seen.get(k),p]);else seen.set(k,p);}
 const ok=hexPhysApplyEvent(b,accepted),after=ids(),afterSet=new Set(after.map(q=>q.id));
 if(after.length!==before.length){hit={step,ok,beforeCount:before.length,afterCount:after.length,lost:[...beforeSet].filter(x=>!afterSet.has(x)),targets,dupTargets,after};}
 if(!ok)break;
}
globalThis.__LOSS={startCount,hit};
`;
const ctx=runSuite(suite,{timeout:120000});console.log('BALL_LOSS_DIAGNOSTIC',JSON.stringify(ctx.__LOSS,null,2));if(!ctx.__LOSS.hit)process.exitCode=1;
