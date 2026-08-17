const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(`${__dirname}/../public/index.html`,'utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,'utf8')).join('\n');
const probe=String.raw`
function visualBallCount(g){let n=0;for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]&&g.vis.get(g.board[y][x].id))n++;return n;}
function relaxCount(g){let n=0;for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?._hexGarbageRelax)n++;}return n;}
function relaxGroups(g){const s=new Set();for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,k=b?._hexGarbageRelax?.groupKey;if(k)s.add(k);}return s.size;}
function distanceScan(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push(v);}let min=Infinity;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)min=Math.min(min,hexPhysDist(a[i].x,a[i].y,a[j].x,a[j].y));return min;}
const seed=7,g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
let engineMs=0,scanMs=0,maxStepMs=0,maxScanMs=0,globalMin=Infinity;
for(let step=0;step<120*60&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 let t=Date.now();stepEngine(g,PHYSICS_FRAME);let d=Date.now()-t;engineMs+=d;maxStepMs=Math.max(maxStepMs,d);
 t=Date.now();const min=distanceScan(g);d=Date.now()-t;scanMs+=d;maxScanMs=Math.max(maxScanMs,d);globalMin=Math.min(globalMin,min);
 if(step%120===0||d>50){console.log('SEED7_PROGRESS '+JSON.stringify({step,sec:+(step/120).toFixed(2),state:g.state,phase:g.phase,alive:g.alive,balls:visualBallCount(g),relax:relaxCount(g),groups:relaxGroups(g),activeGarbage:g.activeGarbagePacks?.filter(p=>p&&!p.landed).length||0,engineMs,scanMs,maxStepMs,maxScanMs,min:globalMin}));}
}
console.log('SEED7_DONE '+JSON.stringify({alive:g.alive,engineMs,scanMs,maxStepMs,maxScanMs,min:globalMin}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:300000});
