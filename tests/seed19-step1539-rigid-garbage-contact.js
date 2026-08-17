const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function findBall(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{ball:b,v:g.vis.get(id),x,y};}return null;}
function snap(g,id){const q=findBall(g,id);if(!q)return null;const z={ball:q.ball,v:q.v,x:q.x,y:q.y};return{id,garbage:!!q.ball.isGarbage,logical:[q.x,q.y],visual:[q.v.x,q.v.y],path:(q.ball.fallPath||[]).map(s=>({from:s.from,to:s.to,kind:s.kind,motionSeq:s.motionSeq})),group:q.ball.motionGroupId||0,rest:q.ball._hexGarbageContinuousRest||null,mob:typeof hexReferenceFinalMobility==='function'?hexReferenceFinalMobility(g,z):null};}
function dist(g){const a=findBall(g,16),b=findBall(g,36);return a&&b?hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y):Infinity;}
const g=createEngine(19);g.ai={level:5,target:null,thinkT:0,actT:0};let out=null;
for(let step=0;step<=1539&&g.alive;step++){
 if(step===840)g.incomingShapes.push('PYRAMID');
 if(step===1680)g.incomingShapes.push('HEXAGON');
 const before=step===1539?{d:dist(g),a:snap(g,16),b:snap(g,36),state:g.state,phase:g.phase}:null;
 stepEngine(g,PHYSICS_FRAME);
 if(step===1539){
  const after={d:dist(g),a:snap(g,16),b:snap(g,36),state:g.state,phase:g.phase};
  const normalBefore=[findBall(g,36).v.x,findBall(g,36).v.y];
  const oldMob=hexReferenceFinalMobility;
  hexReferenceFinalMobility=function(gg,q){if(q?.ball?.isGarbage)return 1;return oldMob(gg,q);};
  const trials=[];
  for(let i=0;i<5;i++){const pre=dist(g),n=hexEnforceFinalVisualNonOverlap(g),post=dist(g);trials.push({i:i+1,n,pre,post,a:snap(g,16),b:snap(g,36)});if(post>=1-1e-7)break;}
  const normalAfter=[findBall(g,36).v.x,findBall(g,36).v.y];
  out={before,after,trials,normalBefore,normalAfter};break;
 }
}
console.log('S19_1539 '+JSON.stringify(out));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
