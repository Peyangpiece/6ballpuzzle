const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/\"(app-\d+\.js)\"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
for(const type of ["PYRAMID","HEXAGON","STRAIGHT"]){
 const g=createEngine(87);g.garbShapes=[type];prepareGarbageBatch(g);
 const last=new Map();let worstUp=null,worstDist=null,min=Infinity,up=0;
 for(let frame=0;frame<600;frame++){
  updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);
  const balls=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
   const q=valid(x,y)?g.board[y][x]:null,v=q&&g.vis.get(q.id);
   if(q?.isGarbage&&v)balls.push([q,v,x,y]);
  }
  for(const[q,v,x,y]of balls){
   const p=last.get(q.id);
   if(p!=null&&v.y<p-1e-8){up++;const delta=v.y-p;if(!worstUp||delta<worstUp.delta)worstUp={frame,id:q.id,logical:[x,y],prevY:p,y:v.y,delta,relax:!!q._hexGarbageRelax,continuousSettled:!!q._hexContinuousSettled};}
   last.set(q.id,v.y);
  }
  for(let a=0;a<balls.length;a++)for(let b=a+1;b<balls.length;b++){
   const A=balls[a],B=balls[b],d=hexPhysDist(A[1].x,A[1].y,B[1].x,B[1].y);
   if(d<min){min=d;worstDist={frame,d,a:{id:A[0].id,logical:[A[2],A[3]],visual:[A[1].x,A[1].y],relax:!!A[0]._hexGarbageRelax},b:{id:B[0].id,logical:[B[2],B[3]],visual:[B[1].x,B[1].y],relax:!!B[0]._hexGarbageRelax}};}
  }
  resolveVisualContacts(g);
 }
 console.log('G87 '+JSON.stringify({type,up,min,threshold:HEX_MIN_DIST,worstUp,worstDist}));
}
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
