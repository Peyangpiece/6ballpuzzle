const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function its(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v,x,y});}return a;}
function mp(g){const a=its(g);let m=Infinity,p=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<m){m=d;p=[a[i].b.id,a[j].b.id];}}return{m,p};}
function ct(g){let relax=0,rest=0,path=0,garb=0;for(const q of its(g)){if(q.b._hexGarbageRelax)relax++;if(q.b._hexGarbageContinuousRest)rest++;if(q.b.fallPath?.length)path++;if(q.b.isGarbage)garb++;}return{balls:its(g).length,garb,relax,rest,path,moving:g._visualMovingIds?.size||0};}
let step=-1,st=[];
function hit(k,pre,post,ms,n){if(step>=2980)st.push({k,pre:pre.m,post:post.m,ms,n});}
const r0=hexGarbageRelaxStep;hexGarbageRelaxStep=function(g,dt){const a=mp(g),t=Date.now(),r=r0(g,dt),b=mp(g);hit('R',a,b,Date.now()-t,r||0);return r;};
const f0=hexEnforceFinalVisualNonOverlap;hexEnforceFinalVisualNonOverlap=function(g){const a=mp(g),t=Date.now(),r=f0(g),b=mp(g);hit('F',a,b,Date.now()-t,r||0);return r;};
const a0=hexGarbageApplyContinuousRests;hexGarbageApplyContinuousRests=function(g){const a=mp(g),t=Date.now(),r=a0(g),b=mp(g);hit('A',a,b,Date.now()-t,0);return r;};
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
for(step=0;step<3600&&g.alive;step++){
 st=[];if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');if(step===2760)g.incomingShapes.push('STRAIGHT');
 const bef=mp(g),t=Date.now();stepEngine(g,PHYSICS_FRAME);const ms=Date.now()-t,aft=mp(g);
 if(step>=2980&&(aft.m<.9995||ms>200)){
  const z={};for(const e of st){const q=z[e.k]||(z[e.k]={calls:0,ms:0,minPre:Infinity,minPost:Infinity,maxN:0,worst:null});q.calls++;q.ms+=e.ms;q.minPre=Math.min(q.minPre,e.pre);q.minPost=Math.min(q.minPost,e.post);q.maxN=Math.max(q.maxN,e.n);if(!q.worst||e.post<q.worst.post)q.worst=e;}
  console.log('S1 '+JSON.stringify({step,sec:step/120,ms,bef,aft,ct:ct(g),z}));break;
 }
}
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:90000});
