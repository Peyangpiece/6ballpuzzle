const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function items(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);if(ball&&v)out.push({ball,v,x,y});}return out;}
function snap(g,q){const z={ball:q.ball,v:q.v,x:q.x,y:q.y};return{id:q.ball.id,garbage:!!q.ball.isGarbage,logical:[q.x,q.y],visual:[q.v.x,q.v.y],path:q.ball.fallPath?.length||0,relax:!!q.ball._hexGarbageRelax,rest:!!q.ball._hexGarbageContinuousRest,moving:!!g._visualMovingIds?.has(q.ball.id),mob:typeof hexRenderMobility==='function'?hexRenderMobility(g,z):null,wall:q.v.x<=1e-9||q.v.x>=W2-1-1e-9,floor:q.v.y>=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H-1e-9};}
function minPair(g){const a=items(g);let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[snap(g,a[i]),snap(g,a[j])];}}return{min,pair};}
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};let result=null;
for(let step=0;step<=1894&&g.alive;step++){
 if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');
 const before=minPair(g);stepEngine(g,PHYSICS_FRAME);const after=minPair(g);
 if(step===1894){
  const extra=[];
  for(let i=0;i<16;i++){const pre=minPair(g),n=hexEnforceFinalVisualNonOverlap(g),post=minPair(g);extra.push({i:i+1,n,pre:pre.min,post:post.min,pair:post.pair});if(post.min>=1-1e-10)break;}
  result={step,before,after,extra,state:g.state,phase:g.phase};break;
 }
}
console.log('S1_1894 '+JSON.stringify(result));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:90000});
