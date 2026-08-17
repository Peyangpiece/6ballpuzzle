const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function diagItems(g){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
  if(ball&&v)out.push({ball,v,x,y});
 }
 return out;
}
function snap(g,q){return{id:q.ball.id,garbage:!!q.ball.isGarbage,logical:[q.x,q.y],visual:[q.v.x,q.v.y],path:q.ball.fallPath?.length||0,relax:!!q.ball._hexGarbageRelax,rest:!!q.ball._hexGarbageContinuousRest,moving:!!g._visualMovingIds?.has(q.ball.id),vy:q.v.vy||0,speed:q.v.motionSpeed||0};}
function minPair(g){
 const a=diagItems(g);let min=Infinity,pair=null;
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
  const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);
  if(d<min){min=d;pair=[snap(g,a[i]),snap(g,a[j])];}
 }
 return{min,pair,count:a.length};
}
function counts(g){let relax=0,rest=0,paths=0;for(const q of diagItems(g)){if(q.ball._hexGarbageRelax)relax++;if(q.ball._hexGarbageContinuousRest)rest++;if(q.ball.fallPath?.length)paths++;}return{relax,rest,paths,moving:g._visualMovingIds?.size||0};}
let currentStep=-1,events=[],seq=0;
function record(stage,g,pre,post,extra={}){
 if(currentStep<2990)return;
 if(pre.min<1.0002||post.min<1.0002||currentStep>=3015){
  events.push({seq:++seq,step:currentStep,stage,pre:pre.min,post:post.min,prePair:pre.pair,postPair:post.pair,counts:counts(g),...extra});
  if(events.length>180)events.shift();
 }
}
const oldRelax=hexGarbageRelaxStep;
hexGarbageRelaxStep=function(g,dt){const pre=minPair(g),t=Date.now(),r=oldRelax(g,dt),post=minPair(g);record('RELAX',g,pre,post,{dt,ms:Date.now()-t,contacts:r||0});return r;};
const oldFinal=hexEnforceFinalVisualNonOverlap;
hexEnforceFinalVisualNonOverlap=function(g){const pre=minPair(g),t=Date.now(),r=oldFinal(g),post=minPair(g);record('FINAL',g,pre,post,{ms:Date.now()-t,corrections:r||0});return r;};
const oldRest=hexGarbageApplyContinuousRests;
hexGarbageApplyContinuousRests=function(g){const pre=minPair(g),r=oldRest(g),post=minPair(g);record('REST_APPLY',g,pre,post);return r;};
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
let found=false;
for(let step=0;step<120*30&&g.alive;step++){
 currentStep=step;
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 const before=minPair(g);const t=Date.now();stepEngine(g,PHYSICS_FRAME);const ms=Date.now()-t,after=minPair(g);
 if(step>=2990&&(after.min<0.9995||ms>200)){
  console.log('SEED1_STAGE_BREAK '+JSON.stringify({step,sec:step/120,ms,state:g.state,phase:g.phase,before,after,counts:counts(g),events}));found=true;break;
 }
}
if(!found)console.log('SEED1_STAGE_BREAK none '+JSON.stringify({state:g.state,phase:g.phase,min:minPair(g),counts:counts(g)}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:60000});
