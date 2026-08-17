const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function balls(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({id:b.id,b,v,x,y});}return a;}
function snap(q,g){return{id:q.id,isGarbage:!!q.b.isGarbage,logical:[q.x,q.y],visual:[q.v.x,q.v.y],vy:q.v.vy||0,speed:q.v.motionSpeed||0,path:q.b.fallPath?.length||0,rest:!!q.b._hexGarbageContinuousRest,mobility:typeof hexRenderMobility==='function'?hexRenderMobility(g,q):null,wall:q.v.x<=1e-9||q.v.x>=W2-1-1e-9,floor:q.v.y>=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H-1e-9};}
function minPair(g){const a=balls(g);let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[snap(a[i],g),snap(a[j],g)];}}return{min,pair};}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};let found=false;
for(let step=0;step<2160&&g.alive;step++){
 if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');
 const before=minPair(g);stepEngine(g,PHYSICS_FRAME);const after=minPair(g);
 if(after.min<0.999998&&before.min>=0.999998){
   const convergence=[];
   for(let i=0;i<16;i++){
     const pre=minPair(g),corrections=hexEnforceFinalVisualNonOverlap(g),post=minPair(g);
     convergence.push({call:i+1,corrections,pre:pre.min,post:post.min,pair:post.pair});
     if(post.min>=1-1e-10)break;
   }
   console.log('CONTACT_CONVERGENCE '+JSON.stringify({step,sec:step/120,before,after,state:g.state,phase:g.phase,convergence}));found=true;break;
 }
}
if(!found)console.log('CONTACT_CONVERGENCE none '+JSON.stringify(minPair(g)));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:60000});
