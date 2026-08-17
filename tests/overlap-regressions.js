const fs=require("fs");
const vm=require("vm");

const runtime=[
 "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js",
 "app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const seeds=process.argv[2]?process.argv[2].split(",").map(Number):[1,7,19,37];
const seconds=Math.max(30,Number(process.argv[3])||60);

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
function visualBalls(g){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
  if(ball&&v)out.push({id:ball.id,x:v.x,y:v.y,logicalX:x,logicalY:y,path:(ball.fallPath||[]).map(s=>({from:s.from,to:s.to,kind:s.kind,motionSeq:s.motionSeq,pileFlow:!!s.pileFlow})),group:ball.motionGroupId||0,garbage:!!ball.isGarbage});
 }
 if(g.state==="PLAYING"&&g.piece){
  const cells=pieceCells(g.piece),dx=g.pieceVX-g.piece.x;
  let dOff=dispOff(g.piece.rot),frac;
  const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2});
  const align=blocked?Math.max(0,1-Math.min(1,g.lockT/LANDING_ALIGN_DURATION)):1;
  dOff*=align;frac=safeActiveFallOffset(g,cells,dx,dOff,activeDropFraction(g));
  const pts=cells.map(([x,y])=>[latticeRealX(x+dx),cellCenterYNorm(y+frac+dOff)]);
  const gx=pts.reduce((n,p)=>n+p[0],0)/3,gy=pts.reduce((n,p)=>n+p[1],0)/3;
  const k=g.rotAnim.p<1?1-smoothRotationT(g.rotAnim.p):0,ang=-k*g.rotAnim.dir*(TAU/6),ca=Math.cos(ang),sa=Math.sin(ang),ox=k*(g.rotAnim.dx||0)*.5,oy=k*(g.rotAnim.dy||0)*HEX_ROW_H;
  pts.forEach((p,i)=>{const ax=p[0]-gx,ay=p[1]-gy,px=gx+ax*ca-ay*sa+ox,py=gy+ax*sa+ay*ca+oy;out.push({id:"active"+i,x:px/.5,y:(py-BOARD_TOP_CENTER_N)/HEX_ROW_H,logicalX:cells[i][0],logicalY:cells[i][1],path:[],group:-1,garbage:false});});
 }
 return out;
}
function minVisualDistance(g){
 const a=visualBalls(g);let min=Infinity,pair=null;
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
  const d=hexPhysDist(a[i].x,a[i].y,a[j].x,a[j].y);
  if(d<min){min=d;pair=[a[i],a[j]];}
 }
 return{min,pair};
}
function makeParallelFixture(){
 const g=createEngine(9001),a=mkBall(g,0),b=mkBall(g,1);
 a.fallPath=[{from:[10,5],to:[9,6],kind:"ROLL_LEFT",pivot:[11,6],topPivot:null,motionSeq:1,followSupportIds:[]}];
 b.fallPath=[{from:[11,4],to:[10,5],kind:"ROLL_LEFT",pivot:[12,5],topPivot:null,motionSeq:2,followSupportIds:[]}];
 g.board[6][9]=a;g.board[5][10]=b;setVis(g,a,10,5,0);setVis(g,b,11,4,0);
 markPileFlowPaths(g,"parallel-overlap-regression");
 return {g,a,b};
}
{
 const {g,a,b}=makeParallelFixture();
 const sa=a.fallPath[0],sb=b.fallPath[0];
 expect(sb.pileFlowStart<sa.pileFlowEnd-1e-9,"later independent motion remained globally serialized");
 let localMin=Infinity;
 const start=Math.min(sa.pileFlowStart,sb.pileFlowStart),end=Math.max(sa.pileFlowEnd,sb.pileFlowEnd);
 for(let t=start;t<=end+1e-10;t+=1/480){
  const pa=pileFlowPositionAt(g,a,t),pb=pileFlowPositionAt(g,b,t);
  localMin=Math.min(localMin,pileFlowPhysicalDist(pa,pb));
 }
 expect(localMin>=PILE_FLOW_MIN_DIST-1e-7,"parallel scheduler violated ball diameter: "+localMin);
}
{
 const finals=[];
 for(const fps of [30,60,120]){
  const {g,a,b}=makeParallelFixture();
  const end=Math.max(...[a,b].flatMap(ball=>(ball.fallPath||[]).map(s=>s.pileFlowEnd||0)));
  const dt=1/fps;
  while((g.pileFlowClock||0)<end+dt*2){
   g.pileFlowClock=(g.pileFlowClock||0)+dt;
   for(const ball of [a,b]){
    const v=g.vis.get(ball.id);
    if(v)updateScheduledPileFlowVisual(g,ball,v,dt);
   }
  }
  finals.push([fps,[a,b].map(ball=>{const v=g.vis.get(ball.id);return [v.x,v.y];})]);
 }
 const ref=finals[2][1];
 for(const [fps,pos] of finals)for(let i=0;i<ref.length;i++){
  expect(Math.abs(pos[i][0]-ref[i][0])<1e-9&&Math.abs(pos[i][1]-ref[i][1])<1e-9,"final placement changed at "+fps+"fps");
 }
}
function makeVacatedSupportFixture(){
 const g=createEngine(9107),support=mkBall(g,0),upper=mkBall(g,2);
 support.fallPath=[{from:[10,5],to:[9,6],kind:"ROLL_LEFT",pivot:null,topPivot:null,motionSeq:1,followSupportIds:[]}];
 upper.fallPath=[{from:[9,4],to:[10,5],kind:"ROLL_RIGHT",pivot:null,topPivot:null,motionSeq:2,followSupportIds:[]}];
 g.board[6][9]=support;g.board[5][10]=upper;
 setVis(g,support,10,5,0);setVis(g,upper,9,4,0);
 markPileFlowPaths(g,"clear_support_loss");
 return{g,support,upper};
}
{
 const {g,support,upper}=makeVacatedSupportFixture(),sa=support.fallPath[0],sb=upper.fallPath[0];
 expect(sb.pileFlowInferredSupport===true,"post-clear follower did not infer its moving support");
 expect((sb.followSupportIds||[]).includes(support.id),"post-clear follower lost support id");
 expect(sb.pileFlowStart<=sa.pileFlowStart+1e-9,"post-clear follower still waited for a lattice wave");
 const mid=sa.pileFlowStart+Math.min(sa.pileFlowDuration,sb.pileFlowDuration)*0.5;
 const pa=pileFlowPositionAt(g,support,mid),pb=pileFlowPositionAt(g,upper,mid);
 expect(pileFlowPhysicalDist(pa,[10,5])>1e-3,"support did not move during collapse probe");
 expect(pileFlowPhysicalDist(pb,[9,4])>1e-3,"upper ball remained staged while support moved");
 let tangentMin=Infinity,tangentMax=0;
 const start=Math.max(sa.pileFlowStart,sb.pileFlowStart),end=Math.min(sa.pileFlowEnd,sb.pileFlowEnd);
 for(let t=start;t<=end+1e-10;t+=1/480){const d=pileFlowPhysicalDist(pileFlowPositionAt(g,support,t),pileFlowPositionAt(g,upper,t));tangentMin=Math.min(tangentMin,d);tangentMax=Math.max(tangentMax,d);}
 expect(tangentMin>=PILE_FLOW_MIN_DIST-1e-7,"support-following overlapped: "+tangentMin);
 expect(tangentMax<=1.00001,"support-following opened a visible gap: "+tangentMax);
}
let globalMin=Infinity,worst=null,samples=0;
for(const seed of ${JSON.stringify(seeds)}){
 const g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
 for(let step=0;step<120*${seconds}&&g.alive;step++){
  if(step===120*7)g.incomingShapes.push("PYRAMID");
  if(step===120*14)g.incomingShapes.push("HEXAGON");
  if(step===120*23)g.incomingShapes.push("STRAIGHT");
  if(step===120*31)g.incoming+=8;
  stepEngine(g,PHYSICS_FRAME);
  const q=minVisualDistance(g);samples++;
  if(q.min<globalMin){globalMin=q.min;worst={seed,step,state:g.state,phase:g.phase,pair:q.pair};}
 }
}
expect(globalMin>=0.999999-1e-7,"visual balls overlapped: min="+globalMin+" worst="+JSON.stringify(worst));
globalThis.result={samples,min:+globalMin.toFixed(9)};
`;

const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
console.log("overlap regressions PASS",JSON.stringify(context.result));
