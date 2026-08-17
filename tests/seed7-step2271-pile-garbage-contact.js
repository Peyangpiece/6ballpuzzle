const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function findBall(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{ball:b,v:g.vis.get(id),x,y};}return null;}
function snap(g,id){const q=findBall(g,id);if(!q)return null;const b=q.ball,v=q.v;return{id,x:v?.x,y:v?.y,lx:q.x,ly:q.y,garbage:!!b.isGarbage,path:(b.fallPath||[]).map(s=>({from:s.from,to:s.to,kind:s.kind,pileFlow:!!s.pileFlow,start:s.pileFlowStart,end:s.pileFlowEnd})),rest:b._hexGarbageContinuousRest||null,relax:!!b._hexGarbageRelax,moving:!!g._visualMovingIds?.has(id)};}
function dist(g){const a=findBall(g,30),b=findBall(g,38);return a&&b?hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y):Infinity;}
const oldResolve=resolveVisualContacts,oldFinal=hexEnforceFinalVisualNonOverlap;
let current=-1,calls=[];
resolveVisualContacts=function(g){if(current===2271){const pre={d:dist(g),a:snap(g,30),b:snap(g,38)},t=Date.now(),r=oldResolve(g),post={d:dist(g),a:snap(g,30),b:snap(g,38)};calls.push({kind:'resolve',ms:Date.now()-t,pre,post});return r;}return oldResolve(g);};
hexEnforceFinalVisualNonOverlap=function(g){if(current===2271){const pre={d:dist(g),a:snap(g,30),b:snap(g,38)},t=Date.now(),r=oldFinal(g),post={d:dist(g),a:snap(g,30),b:snap(g,38)};calls.push({kind:'final',n:r,ms:Date.now()-t,pre,post});return r;}return oldFinal(g);};
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};let out=null;
for(let step=0;step<=2271&&g.alive;step++){
 current=step;if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');
 const before=step===2271?{d:dist(g),a:snap(g,30),b:snap(g,38),state:g.state,phase:g.phase}:null;
 stepEngine(g,PHYSICS_FRAME);
 if(step===2271){
  const after={d:dist(g),a:snap(g,30),b:snap(g,38),state:g.state,phase:g.phase};
  const extra=[];for(let i=0;i<4;i++){const pre=dist(g),n=oldFinal(g),post=dist(g);extra.push({i:i+1,n,pre,post,a:snap(g,30),b:snap(g,38)});}
  out={before,after,calls,extra};break;
 }
}
console.log('S7_2271 '+JSON.stringify(out));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
