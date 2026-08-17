const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
let currentStep=-1,records=[];
function shortStack(){return String(new Error().stack||'').split('\n').slice(2,8).join(' <- ');}
function wrapSet(s,label){
 if(!(s instanceof Set)||s.__watched16)return s;
 const add0=s.add,del0=s.delete,clear0=s.clear;
 Object.defineProperty(s,'__watched16',{value:true,configurable:true});
 s.add=function(v){if(v===16)records.push({step:currentStep,op:'add',label,stack:shortStack()});return add0.call(this,v);};
 s.delete=function(v){if(v===16)records.push({step:currentStep,op:'delete',label,stack:shortStack()});return del0.call(this,v);};
 s.clear=function(){if(this.has(16))records.push({step:currentStep,op:'clear',label,stack:shortStack()});return clear0.call(this);};
 return s;
}
function watchMovingSet(g){
 let backing=wrapSet(g._visualMovingIds||new Set(),'initial');
 Object.defineProperty(g,'_visualMovingIds',{
  configurable:true,enumerable:true,
  get(){return backing;},
  set(v){
   if(v instanceof Set&&v.has(16))records.push({step:currentStep,op:'assign-containing-16',size:v.size,stack:shortStack()});
   backing=wrapSet(v,'assigned');
  }
 });
}
function find16(g){
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.id!==16)continue;
  const v=g.vis.get(16);return b&&v?{logical:[x,y],visual:[v.x,v.y],vy:v.vy||0,speed:v.motionSpeed||0,path:b.fallPath?.length||0,isGarbage:!!b.isGarbage,moving:!!g._visualMovingIds?.has(16)}:null;
 }
 return null;
}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};watchMovingSet(g);
let reported=false;
for(let step=0;step<120*18&&g.alive;step++){
 currentStep=step;
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 stepEngine(g,PHYSICS_FRAME);
 const s=find16(g);
 if(!reported&&s&&s.path===0&&s.moving&&s.vy>1){
  console.log('MOVING16_ORIGIN '+JSON.stringify({step,sec:step/120,state:g.state,phase:g.phase,s,records:records.slice(-40)}));
  reported=true;break;
 }
}
if(!reported)console.log('MOVING16_ORIGIN none '+JSON.stringify(records.slice(-40)));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,Error},{timeout:60000});
