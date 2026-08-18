const {runSuite}=require('./audit-harness');
const suite=String.raw`
const out=[];
const mk=(id,c)=>({id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0});
function prop(p){return p?{from:[p.x,p.y],to:[p.tx,p.ty],kind:p.kind,pivot:p.pivot||null,topPivot:p.topPivot||null}:null;}
for(const seed of [6,9]){
 const g=createEngine(710000+seed);spawn(g);const rng=mulberry32(910000+seed);let id=3000000+seed*60;
 for(let n=0;n<3+(seed%15);n++){const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,Math.floor(rng()*COLORS.length));}
 settleAll(g.board);for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q){delete q.fallPath;setVis(g,q,x,y,0);}}
 g.state='PLAYING';g.piece.rot=seed%6;const range=legalXRange(g),f=((seed%31)+.37)/31;setFreeX(g,range[0]+(range[1]-range[0])*f);updateVisuals(g,PHYSICS_FRAME);
 const shadow=landingShadowVisualCells(g),target=dropPiece(g.board,g.piece),cells=pieceCells(target),b=cloneHexGrid(g.board,v=>v);let fid=8000000+seed*10;const gid=9000000+seed;
 const members=cells.map(([x,y,c],role)=>{const ball=mk(fid++,c);ball.motionGroupId=gid;ball.motionGroupRole=role;ball.motionGroupOrientation=(target.rot&1)?'up':'down';ball.motionGroupSize=3;ball.rigid=true;b[y][x]=ball;return{ball,x,y,role,orientation:ball.motionGroupOrientation};});
 const full=(hexPhysPlanGroup(b,members,true)||[]).map(prop);
 const independent=members.map(m=>prop(hexPhysIndependentMemberMotion(b,members,m)));
 const pairs=[];for(let omit=0;omit<3;omit++){const pair=members.filter((_,i)=>i!==omit).map((m,i)=>({...m,ball:{...m.ball,motionGroupSize:2,motionGroupRole:i,rigid:true}}));pairs.push({omit,ids:pair.map(m=>m.ball.id),plan:(hexPhysPlanGroup(b,pair,true)||[]).map(prop)});}
 out.push({seed,rot:target.rot,orientation:(target.rot&1)?'up':'down',target:cells.map(c=>c.slice(0,2)),shadow:shadow&&shadow.map(c=>c.slice(0,2)),full,independent,pairs});
}
globalThis.__POST_CONTACT=out;
`;
const ctx=runSuite(suite,{timeout:120000});console.log('POST_CONTACT',JSON.stringify(ctx.__POST_CONTACT,null,2));
