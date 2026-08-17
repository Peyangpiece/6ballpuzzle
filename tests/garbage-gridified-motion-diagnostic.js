const fs=require("fs");
const vm=require("vm");
const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const runtimeNames=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];
const runtime=runtimeNames.map(read).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
let globalMin=Infinity,worst=null,totalUp=0,upWorst=null;
for(const type of ["PYRAMID","HEXAGON","STRAIGHT"]){
 const g=createEngine(87);g.garbShapes=[type];prepareGarbageBatch(g);const last=new Map();
 for(let i=0;i<600;i++){
  updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);
  const balls=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
   const q=valid(x,y)?g.board[y][x]:null,v=q&&g.vis.get(q.id);
   if(q?.isGarbage&&v)balls.push({q,v,x,y});
  }
  for(const a of balls){
   const prev=last.get(a.q.id);
   if(prev!=null&&a.v.y<prev-1e-8){totalUp++;if(!upWorst||prev-a.v.y>upWorst.delta)upWorst={type,frame:i,id:a.q.id,prev,now:a.v.y,delta:prev-a.v.y,logical:[a.x,a.y],path:a.q.fallPath||[]};}
   last.set(a.q.id,a.v.y);
  }
  for(let a=0;a<balls.length;a++)for(let b=a+1;b<balls.length;b++){
   const A=balls[a],B=balls[b],d=hexPhysDist(A.v.x,A.v.y,B.v.x,B.v.y);
   if(d<globalMin){globalMin=d;worst={type,frame:i,d,a:{id:A.q.id,logical:[A.x,A.y],visual:[A.v.x,A.v.y],path:A.q.fallPath||[]},b:{id:B.q.id,logical:[B.x,B.y],visual:[B.v.x,B.v.y],path:B.q.fallPath||[]}};}
  }
 }
}
console.log("gridified garbage diagnostic",JSON.stringify({totalUp,upWorst,min:globalMin,worst}));
expect(totalUp===0,"gridified garbage moved upward: "+JSON.stringify(upWorst));
expect(globalMin>=HEX_MIN_DIST,"gridified garbage overlap: "+JSON.stringify(worst));
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+checks,context,{timeout:120000});
