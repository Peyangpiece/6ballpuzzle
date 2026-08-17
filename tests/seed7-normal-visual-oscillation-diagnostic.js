const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function findBall(g,id){
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{b,x,y,v:g.vis.get(id)};
 }
 return null;
}
function safeNatural(g,q){
 try{const m=hexPhysNaturalMotion(g.board,q.x,q.y);return m?{kind:m.kind,tx:m.tx,ty:m.ty,pivot:m.pivot||null,topPivot:m.topPivot||null}:null;}catch(e){return{error:String(e)}}
}
function safeSupport(g,q){
 try{const s=hexPhysSupportInfo(g.board,q.x,q.y);return s?{count:s.count,left:!!s.left,right:!!s.right,below:!!s.below}:null;}catch(e){return{error:String(e)}}
}
function stateOf(g,id){
 const q=findBall(g,id);if(!q||!q.v)return null;
 const path=Array.isArray(q.b.fallPath)?q.b.fallPath:[];
 let toLogicalSafe=null,pointLogicalSafe=null;
 try{toLogicalSafe=visualSegmentSafe(g,id,q.v.x,q.v.y,q.x,q.y);}catch(e){toLogicalSafe='ERR:'+e;}
 try{pointLogicalSafe=visualPointSafe(g,id,q.x,q.y);}catch(e){pointLogicalSafe='ERR:'+e;}
 return{id,isGarbage:!!q.b.isGarbage,logical:[q.x,q.y],visual:[q.v.x,q.v.y],vy:q.v.vy||0,speed:q.v.motionSpeed||0,path:path.length,moving:!!g._visualMovingIds?.has(id),rest:!!q.b._hexGarbageContinuousRest,relax:!!q.b._hexGarbageRelax,natural:safeNatural(g,q),support:safeSupport(g,q),toLogicalSafe,pointLogicalSafe};
}
function neighbors(g,id){
 const q=findBall(g,id);if(!q||!q.v)return[];
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b||b.id===id)continue;
  const v=g.vis.get(b.id);if(!v)continue;
  const d=hexPhysDist(q.v.x,q.v.y,v.x,v.y);
  if(d<1.5)out.push({id:b.id,isGarbage:!!b.isGarbage,logical:[x,y],visual:[v.x,v.y],d,vy:v.vy||0,speed:v.motionSpeed||0,path:b.fallPath?.length||0,rest:!!b._hexGarbageContinuousRest,relax:!!b._hexGarbageRelax});
 }
 return out.sort((a,b)=>a.d-b.d);
}
let currentStep=-1,events=[],armed=false;
function capture(label,before,after,g){
 if(!armed||!before||!after)return;
 const changed=Math.abs(after.vy-before.vy)>0.05||Math.abs(after.speed-before.speed)>0.05||hexPhysDist(before.visual[0],before.visual[1],after.visual[0],after.visual[1])>1e-5;
 if(changed)events.push({step:currentStep,label,before,after,neighbors:neighbors(g,16)});
}
const oldUpdateVisuals=updateVisuals;
updateVisuals=function(g,dt){const b=stateOf(g,16);const r=oldUpdateVisuals(g,dt);const a=stateOf(g,16);capture('updateVisuals',b,a,g);return r;};
const oldResolve=resolveVisualContacts;
resolveVisualContacts=function(g){const b=stateOf(g,16);const r=oldResolve(g);const a=stateOf(g,16);capture('resolveVisualContacts',b,a,g);return r;};

const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};
let found=false;
for(let step=0;step<120*18&&g.alive;step++){
 currentStep=step;
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 const pre=stateOf(g,16);
 if(pre&&pre.path===0&&!pre.isGarbage&&step>=1380){armed=true;events=[];}
 stepEngine(g,PHYSICS_FRAME);
 const post=stateOf(g,16);
 if(armed&&post&&post.path===0&&!post.isGarbage&&post.vy>1){
   console.log('NORMAL_OSC_FRAME '+JSON.stringify({step,sec:step/120,state:g.state,phase:g.phase,pre,post,events,neighbors:neighbors(g,16)}));
   found=true;break;
 }
 if(armed&&events.length>80)events=events.slice(-80);
}
if(!found)console.log('NORMAL_OSC_FRAME none');
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:60000});
