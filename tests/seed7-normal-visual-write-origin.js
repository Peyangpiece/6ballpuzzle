const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
let currentStep=-1,events=[],armed=false,watched=null;
function shortStack(){return String(new Error().stack||'').split('\n').slice(2,7).join(' <- ');}
function find16(g){
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.id===16){const v=g.vis.get(16);return b&&v?{b,v,x,y}:null;}
 }
 return null;
}
function install(v){
 if(!v||v.__traceWrites16)return;
 Object.defineProperty(v,'__traceWrites16',{value:true,configurable:true});
 for(const key of ['x','y','vy','motionSpeed']){
  let value=v[key];
  Object.defineProperty(v,key,{configurable:true,enumerable:true,get(){return value;},set(n){
   if(armed&&Number.isFinite(n)&&Number.isFinite(value)&&Math.abs(n-value)>1e-9&&events.length<120)events.push({step:currentStep,key,from:value,to:n,stack:shortStack()});
   value=n;
  }});
 }
 watched=v;
}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};
let reported=false;
for(let step=0;step<120*18&&g.alive;step++){
 currentStep=step;
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 const q=find16(g);if(q)install(q.v);
 if(step>=1380&&q&&(!q.b.fallPath||!q.b.fallPath.length)){armed=true;events=[];}
 stepEngine(g,PHYSICS_FRAME);
 const a=find16(g);if(a)install(a.v);
 if(armed&&a&&(!a.b.fallPath||!a.b.fallPath.length)&&(a.v.vy||0)>1){
  console.log('WRITE16_ORIGIN '+JSON.stringify({step,sec:step/120,state:g.state,phase:g.phase,logical:[a.x,a.y],final:{x:a.v.x,y:a.v.y,vy:a.v.vy,speed:a.v.motionSpeed},moving:!!g._visualMovingIds?.has(16),events}));
  reported=true;break;
 }
}
if(!reported)console.log('WRITE16_ORIGIN none');
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,Error},{timeout:60000});
