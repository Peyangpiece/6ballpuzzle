const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function balls(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({id:b.id,b,v,x,y});}return a;}
function snap(q){return{id:q.id,isGarbage:!!q.b.isGarbage,logical:[q.x,q.y],visual:[q.v.x,q.v.y],vy:q.v.vy||0,speed:q.v.motionSpeed||0,path:q.b.fallPath?.length||0,first:q.b.fallPath?.[0]||null,rest:q.b._hexGarbageContinuousRest||null,relax:!!q.b._hexGarbageRelax,finalized:!!q.b._hexGarbageGroupFinalized};}
function minPair(g){const a=balls(g);let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[snap(a[i]),snap(a[j])];}}return{min,pair};}
let stepNo=-1,events=[];
function cap(label,g){if(stepNo<780)return;const m=minPair(g);if(m.min<1.05){events.push({step:stepNo,label,min:m.min,pair:m.pair,state:g.state,phase:g.phase});if(events.length>100)events=events.slice(-100);}}
if(typeof hexGarbageApplyContinuousRests==='function'){const old=hexGarbageApplyContinuousRests;hexGarbageApplyContinuousRests=function(g){cap('beforeRest',g);const r=old(g);cap('afterRest',g);return r;};}
if(typeof hexGarbageBridgeContinuousRests==='function'){const old=hexGarbageBridgeContinuousRests;hexGarbageBridgeContinuousRests=function(g){cap('beforeBridge',g);const r=old(g);cap('afterBridge',g);return r;};}
const oldUpdate=updateVisuals;updateVisuals=function(g,dt){cap('beforeUpdate',g);const r=oldUpdate(g,dt);cap('afterUpdate',g);return r;};
const oldResolve=resolveVisualContacts;resolveVisualContacts=function(g){cap('beforeResolve',g);const r=oldResolve(g);cap('afterResolve',g);return r;};
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};let found=false;
for(let step=0;step<2160&&g.alive;step++){stepNo=step;if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');const before=minPair(g);stepEngine(g,PHYSICS_FRAME);const after=minPair(g);if(after.min<0.999998&&before.min>=0.999998){console.log('FIRST_OVERLAP '+JSON.stringify({step,sec:step/120,before,after,state:g.state,phase:g.phase,events}));found=true;break;}}
if(!found)console.log('FIRST_OVERLAP none '+JSON.stringify(minPair(g)));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:60000});
