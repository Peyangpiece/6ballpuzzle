const fs=require("fs");
const vm=require("vm");
const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js","app-garbage-contact.js","app-garbage-rigidity.js"]
 .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const code=String.raw`
function balls(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)out.push({b,v,x,y});}return out;}
function worst(g){let min=Infinity,pair=null;const a=balls(g);for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[a[i],a[j]];}}return{min,pair};}
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
let globalMin=Infinity,worstFrame=null;
for(let step=0;step<=1450&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push("PYRAMID");
 if(step===120*14)g.incomingShapes.push("HEXAGON");
 if(step===120*23)g.incomingShapes.push("STRAIGHT");
 if(step===120*31)g.incoming+=8;
 stepEngine(g,PHYSICS_FRAME);
 const q=worst(g);
 if(q.min<globalMin){
  globalMin=q.min;
  worstFrame={step,state:g.state,phase:g.phase,min:q.min,pair:q.pair&&q.pair.map(z=>({id:z.b.id,logical:[z.x,z.y],visual:[z.v.x,z.v.y],garbage:!!z.b.isGarbage,path:z.b.fallPath||[]}))};
 }
 if(q.min<.9997)throw new Error("garbage/pile visual overlap: "+JSON.stringify(worstFrame));
 for(const z of balls(g))if(z.b.isGarbage&&Array.isArray(z.b.fallPath)&&z.b.fallPath.length){
  const first=z.b.fallPath[0];
  if(Array.isArray(first?.to)&&first.to[1]<z.v.y-1.000001){
   throw new Error("gridified garbage retained a path wholly above its rendered centre: "+JSON.stringify({step,id:z.b.id,logical:[z.x,z.y],visual:[z.v.x,z.v.y],path:z.b.fallPath}));
  }
 }
}
console.log("garbage queued-motion overlap diagnostic PASS",JSON.stringify({min:globalMin,worst:worstFrame}));
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+code,context,{timeout:120000});