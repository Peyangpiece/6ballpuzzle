const fs=require("fs");
const vm=require("vm");
const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"]
 .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const code=String.raw`
function balls(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)out.push({b,v,x,y});}return out;}
function worst(g){let min=Infinity,pair=null;const a=balls(g);for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y);if(d<min){min=d;pair=[a[i],a[j]];}}return{min,pair};}
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
for(let step=0;step<=1220&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push("PYRAMID");
 if(step===120*14)g.incomingShapes.push("HEXAGON");
 if(step===120*23)g.incomingShapes.push("STRAIGHT");
 if(step===120*31)g.incoming+=8;
 stepEngine(g,PHYSICS_FRAME);
 const q=worst(g);
 if(q.min<.999999){
  const fmt=q.pair.map(z=>({id:z.b.id,logical:[z.x,z.y],visual:[z.v.x,z.v.y],garbage:!!z.b.isGarbage,path:z.b.fallPath||[]}));
  const before={step,state:g.state,phase:g.phase,min:q.min,pair:fmt,stateT:g.stateT,garbageClock:g.garbageClock,watchdog:g.garbageWatchdogLimit};
  resolveVisualContacts(g);
  const r=worst(g);
  const fmt2=r.pair&&r.pair.map(z=>({id:z.b.id,logical:[z.x,z.y],visual:[z.v.x,z.v.y],garbage:!!z.b.isGarbage,path:z.b.fallPath||[]}));
  console.log("garbage overlap frame diagnostic",JSON.stringify({before,afterExtraResolve:{min:r.min,pair:fmt2}}));
  if(r.min<.999999)throw new Error("extra resolve could not remove overlap");
  globalThis.result={step,before:q.min,after:r.min};
  break;
 }
}
if(!globalThis.result)throw new Error("target garbage overlap did not reproduce");
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+code,context,{timeout:120000});
