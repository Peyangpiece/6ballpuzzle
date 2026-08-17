const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function balls(g){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)out.push({id:b.id,x:v.x,y:v.y,garbage:!!b.isGarbage,group:b.motionGroupId||0,l:[x,y],path:(b.fallPath||[]).map(s=>({from:s.from,to:s.to,kind:s.kind,motionSeq:s.motionSeq}))});
 }
 if(g.state==='PLAYING'&&g.piece){
  const cells=pieceCells(g.piece),dx=g.pieceVX-g.piece.x,dOff=dispOff(g.piece.rot),frac=safeActiveFallOffset(g,cells,dx,dOff,activeDropFraction(g));
  for(let i=0;i<cells.length;i++){const [x,y]=cells[i];out.push({id:'active'+i,x:x+dx,y:y+frac+dOff,garbage:false,group:-1,l:[x,y],path:[]});}
 }
 return out;
}
function minPair(g){const a=balls(g);let min=Infinity,pair=null;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=hexPhysDist(a[i].x,a[i].y,a[j].x,a[j].y);if(d<min){min=d;pair=[a[i],a[j]];}}return{min,pair};}
const g=createEngine(19);g.ai={level:5,target:null,thinkT:0,actT:0};let globalMin=Infinity,worst=null,firstBad=null,maxStateHold=0,lastSig='',hold=0;
for(let step=0;step<120*20&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');if(step===120*14)g.incomingShapes.push('HEXAGON');
 stepEngine(g,PHYSICS_FRAME);const q=minPair(g);
 if(q.min<globalMin){globalMin=q.min;worst={step,state:g.state,phase:g.phase,pair:q.pair};}
 if(!firstBad&&q.min<0.999999-1e-7)firstBad={step,min:q.min,state:g.state,phase:g.phase,pair:q.pair};
 const sig=g.state+':'+g.phase+':'+physicsSignature(g);if(sig===lastSig)hold++;else{hold=0;lastSig=sig;}maxStateHold=Math.max(maxStateHold,hold);
}
console.log('S19_CONTINUOUS '+JSON.stringify({min:globalMin,worst,firstBad,maxStateHold,state:g.state,phase:g.phase,alive:g.alive,balls:balls(g).length}));
if(firstBad)process.exitCode=2;
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,process},{timeout:120000});
