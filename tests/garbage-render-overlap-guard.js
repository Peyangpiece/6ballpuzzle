const fs=require("fs");
const vm=require("vm");

const overlay=fs.readFileSync(`${__dirname}/../public/app-garbage-render-overlap-guard.js`,"utf8");
const source=String.raw`
const ROWS=12,W2=19,HEX_ROW_H=Math.sqrt(3)/2;
function valid(x,y){return y>=0&&y<ROWS&&x>=0&&x<W2&&(((x+y)&1)===1);}
function boardScanMin(){return 0;}
function expect(v,m){if(!v)throw new Error(m);}
function d(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

let mode="cross";
function pileFlowPositionAt(g,ball,t){
  const q=Math.max(0,Math.min(1,t/(1/120)));
  if(mode==="safe")return ball.id===1?[4+q,5+q]:[6+q,5+q];
  return ball.id===1?[4+q,5+q]:[6-q,5+q];
}
const drawn=[];
function drawSide(ctx,g,L,side,t,label,sub,big,renderLead=0){
  drawn.length=0;
  for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
    const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;
    const v=g.vis.get(ball.id);let p=[v.x,v.y];
    if(renderLead>0&&v.pileFlow&&ball.fallPath?.length)p=pileFlowPositionAt(g,ball,(g.pileFlowClock||0)+renderLead);
    drawn.push({id:ball.id,p});
  }
}

${overlay}
expect(window.__hexGarbageRenderOverlapGuard===true,"guard not installed");
expect(window.__hexGarbageRenderLeadPhysicsUnchanged===true,"guard changed physics contract");

function game(){
  const board=Array.from({length:ROWS},()=>Array(W2).fill(null));
  const a={id:1,fallPath:[{from:[4,5],to:[5,6]}]},b={id:2,fallPath:[{from:[6,5],to:[5,6]}]};
  board[5][4]=a;board[5][6]=b;
  const vis=new Map([[1,{x:4,y:5,pileFlow:true}],[2,{x:6,y:5,pileFlow:true}]]);
  return{state:"RESOLVING",phase:"GARBAGE",board,vis,pileFlowClock:0};
}

{
  mode="cross";const g=game(),lead=1/120;
  const guarded=window.__hexGarbageRenderSafePositions(g,lead);
  expect(guarded.scale<1,"unsafe full render lead was not reduced");
  const pa=guarded.positions.get(1),pb=guarded.positions.get(2);
  expect(d(pa,pb)>=0.999999,"guarded positions still overlap: "+d(pa,pb));
  drawSide({},g,{},0,0,"","",true,lead);
  expect(d(drawn[0].p,drawn[1].p)>=0.999999,"drawSide still rendered a transient overlap");
  expect(g.vis.get(1).x===4&&g.vis.get(2).x===6,"render guard mutated visual physics state");
  expect(g.pileFlowClock===0,"render guard changed pile-flow clock");
}

{
  mode="safe";const g=game(),lead=1/120;
  const guarded=window.__hexGarbageRenderSafePositions(g,lead);
  expect(guarded.scale===1,"safe render lead was unnecessarily reduced");
  drawSide({},g,{},0,0,"","",true,lead);
  expect(Math.abs(drawn[0].p[0]-5)<1e-12&&Math.abs(drawn[1].p[0]-7)<1e-12,"safe trajectory was changed");
}

{
  mode="cross";const g=game(),lead=1/120;g.phase="SETTLE";
  drawSide({},g,{},0,0,"","",true,lead);
  expect(d(drawn[0].p,drawn[1].p)<1e-9,"non-garbage rendering was altered");
}
console.log("garbage render overlap guard PASS");
`;
vm.runInNewContext(source,{console,Math,Map,Set,Array,Object,Number,String,Boolean,JSON,Date,window:{}});
