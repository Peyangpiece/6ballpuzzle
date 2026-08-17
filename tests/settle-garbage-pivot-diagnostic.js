const fs=require('fs');
const vm=require('vm');

const names=[
  'app-01.js','app-02.js','app-03.js','app-04.js','app-05.js','app-06.js',
  'app-07.js','app-08.js','app-09.js','app-10.js','app-14.js','app-17.js',
  'app-18.js','app-19.js','app-20.js','app-21.js','app-22.js','app-23.js','app-24.js','app-25.js','app-26.js'
];
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,'utf8')).join('\n');

const probe=String.raw`
const g=createEngine(19);g.ai={level:5,target:null,thinkT:0,actT:0};
function entries(){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;const v=g.vis.get(b.id);if(!v)continue;
  out.push({b,v,x,y,p:[v.x,v.y],seg:b.fallPath?.[0]});
 }
 return out;
}
function minPair(){
 const a=entries();let min=Infinity,pair=null;
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
  const d=hexPhysDist(a[i].p[0],a[i].p[1],a[j].p[0],a[j].p[1]);
  if(d<min){min=d;pair=[a[i],a[j]];}
 }
 const slim=q=>({id:q.b.id,logical:[q.x,q.y],p:q.p,garbage:!!q.b.isGarbage,seg:q.seg&&{from:q.seg.from,to:q.seg.to,start:q.seg.pileFlowStart,end:q.seg.pileFlowEnd,pivot:q.seg.pivot,topPivot:q.seg.topPivot}});
 return{min,pair:pair&&pair.map(slim)};
}
let worst={min:Infinity,step:-1,pair:null};
for(let step=0;step<=5120&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 stepEngine(g,PHYSICS_FRAME);
 if(step>=5090){const q=minPair();if(q.min<worst.min)worst={min:q.min,step,pair:q.pair};}
}
console.log('SETTLE_PIVOT_MIN',JSON.stringify(worst));
if(worst.min<0.9999989)throw new Error('authoritative pile-flow still overlapped in seed 19: '+JSON.stringify(worst));
console.log('settled-garbage authoritative pile-flow diagnostic PASS');
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+probe,context,{timeout:180000});
