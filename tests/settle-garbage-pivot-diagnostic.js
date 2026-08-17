const fs=require('fs');
const vm=require('vm');

const names=[
  'app-01.js','app-02.js','app-03.js','app-04.js','app-05.js','app-06.js',
  'app-07.js','app-08.js','app-09.js','app-10.js','app-14.js','app-17.js',
  'app-18.js','app-19.js','app-20.js','app-21.js','app-22.js','app-23.js','app-24.js'
];
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,'utf8')).join('\n');

const probe=String.raw`
const g=createEngine(19);g.ai={level:5,target:null,thinkT:0,actT:0};
function entries(useAuthoritative=false){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;const v=g.vis.get(b.id);if(!v)continue;
  const seg=b.fallPath?.[0];let p=[v.x,v.y];
  if(useAuthoritative&&seg?.pileFlow)p=pileFlowPositionAt(g,b,g.pileFlowClock);
  out.push({b,v,x,y,p,seg});
 }
 return out;
}
function minPair(useAuthoritative=false){
 const a=entries(useAuthoritative);let min=Infinity,pair=null;
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
  const d=hexPhysDist(a[i].p[0],a[i].p[1],a[j].p[0],a[j].p[1]);
  if(d<min){min=d;pair=[a[i],a[j]];}
 }
 const slim=q=>({id:q.b.id,logical:[q.x,q.y],p:q.p,garbage:!!q.b.isGarbage,seg:q.seg&&{from:q.seg.from,to:q.seg.to,start:q.seg.pileFlowStart,end:q.seg.pileFlowEnd,pivot:q.seg.pivot,topPivot:q.seg.topPivot}});
 return{min,pair:pair&&pair.map(slim)};
}
for(let step=0;step<=5106&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 if(step===5106){
  console.log('CLOCK',g.pileFlowClock,'CURRENT_MIN',JSON.stringify(minPair(false)),'AUTH_MIN',JSON.stringify(minPair(true)));
  const before=new Map();
  for(const q of entries(false))before.set(q.b.id,[q.v.x,q.v.y]);
  for(const q of entries(true))if(q.seg?.pileFlow){q.v.x=q.p[0];q.v.y=q.p[1];}
  console.log('RESET_MIN',JSON.stringify(minPair(false)));
  const authBefore=new Map(entries(false).map(q=>[q.b.id,[q.v.x,q.v.y]]));
  resolveVisualContacts(g);
  let maxShift=0,worst=null;
  for(const q of entries(false)){
   const p=authBefore.get(q.b.id);if(!p)continue;const d=hexPhysDist(q.v.x,q.v.y,p[0],p[1]);if(d>maxShift){maxShift=d;worst={id:q.b.id,from:p,to:[q.v.x,q.v.y],seg:q.seg&&{from:q.seg.from,to:q.seg.to,start:q.seg.pileFlowStart,end:q.seg.pileFlowEnd}};}
  }
  console.log('AFTER_RESOLVE_MIN',JSON.stringify(minPair(false)),'MAX_SHIFT',maxShift,JSON.stringify(worst));
  break;
 }
 stepEngine(g,PHYSICS_FRAME);
}
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+probe,context,{timeout:180000});
