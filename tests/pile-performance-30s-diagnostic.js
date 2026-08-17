const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function visualItems(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)a.push({b,v});}return a;}
function minDist(g){const a=visualItems(g);let m=Infinity;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)m=Math.min(m,hexPhysDist(a[i].v.x,a[i].v.y,a[j].v.x,a[j].v.y));return m;}
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
let total=0,max=0,maxStep=-1,min=Infinity,slow=0;
for(let step=0;step<3600&&g.alive;step++){
 if(step===840)g.incomingShapes.push('PYRAMID');
 if(step===1680)g.incomingShapes.push('HEXAGON');
 if(step===2760)g.incomingShapes.push('STRAIGHT');
 const t=Date.now();stepEngine(g,PHYSICS_FRAME);const ms=Date.now()-t;total+=ms;
 if(ms>max){max=ms;maxStep=step;}if(ms>16)slow++;
 if((step%30)===0)min=Math.min(min,minDist(g));
}
console.log('PILE_PERF_30S '+JSON.stringify({totalMs:total,maxFrameMs:max,maxStep,slowFrames:slow,minDistance:min,state:g.state,phase:g.phase,balls:visualItems(g).length}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
