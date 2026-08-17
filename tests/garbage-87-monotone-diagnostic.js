const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function state(g,q,x,y){const v=g.vis.get(q.id),r=q._hexGarbageContinuousRest;return{id:q.id,logical:[x,y],visual:v?[v.x,v.y]:null,vy:v?.vy||0,speed:v?.motionSpeed||0,rest:r?{px:r.px,py:r.py}:null,path:q.fallPath?.length||0};}
const results=[];
for(const type of ['PYRAMID','HEXAGON','STRAIGHT']){
 const g=createEngine(87);g.garbShapes=[type];prepareGarbageBatch(g);const last=new Map();let min=Infinity,worst=null,firstUp=null;
 for(let frame=0;frame<600;frame++){
  updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
  const balls=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null,v=q&&g.vis.get(q.id);if(q?.isGarbage&&v)balls.push({q,v,x,y});}
  for(const b of balls){const p=last.get(b.q.id);if(p!=null&&b.v.y<p-1e-8&&!firstUp)firstUp={frame,previousY:p,currentY:b.v.y,ball:state(g,b.q,b.x,b.y)};last.set(b.q.id,b.v.y);}
  for(let a=0;a<balls.length;a++)for(let b=a+1;b<balls.length;b++){const A=balls[a],B=balls[b],d=hexPhysDist(A.v.x,A.v.y,B.v.x,B.v.y);if(d<min){min=d;worst={frame,d,a:state(g,A.q,A.x,A.y),b:state(g,B.q,B.x,B.y)};}}
 }
 results.push({type,min,worst,firstUp});
}
console.log('G87_MONOTONE '+JSON.stringify({threshold:HEX_MIN_DIST,results}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
