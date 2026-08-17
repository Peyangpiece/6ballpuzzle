const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function blockers(g,tol=SETTLE_TOL){
 const out=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;
  const v=g.vis.get(b.id),path=Array.isArray(b.fallPath)?b.fallPath:[];
  const rest=b._hexGarbageContinuousRest;
  const off=v?Math.hypot((v.x-x)*.5,(v.y-y)*HEX_ROW_H):Infinity;
  const legacyBlocked=path.length>0||(!rest&&v&&(Math.abs(v.y-y)>tol||Math.abs(v.x-x)>tol));
  if(legacyBlocked||path.length||rest)out.push({id:b.id,isGarbage:!!b.isGarbage,logical:[x,y],visual:v?[v.x,v.y]:null,dx:v?v.x-x:null,dy:v?v.y-y:null,realOff:off,vy:v?.vy,speed:v?.motionSpeed,path:path.length,first:path[0]?{from:path[0].from,to:path[0].to,kind:path[0].kind,garbageContinuousHandoff:!!path[0].garbageContinuousHandoff}:null,rest:rest?{...rest}:null,relax:!!b._hexGarbageRelax,finalized:!!b._hexGarbageGroupFinalized,gravityMismatch:!!v?.gravityMismatch});
 }
 return out;
}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};
for(let step=0;step<120*18&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 stepEngine(g,PHYSICS_FRAME);
 if(step>=1400&&step%60===0){
  const b=blockers(g);
  console.log('SETTLE_BLOCKERS '+JSON.stringify({step,sec:step/120,state:g.state,phase:g.phase,near:nearlySettled(g,SETTLE_TOL),pending:pendingFallPathCount(g),legal:hasLegalGravityMove(g.board),illegal:boardHasIllegalFloat(g.board),count:b.length,blockers:b}));
 }
}
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:60000});
