const fs=require("fs");
const vm=require("vm");

const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const runtimeNames=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js",
  "app-clear-vacancy-priority.js","app-release-parity-settle.js","app-08.js","app-09.js",
  "app-10.js","app-14.js","app-clear-all-ball-fx.js","app-gameover-garbage-fade.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js","app-garbage-deep-settle.js",
  "app-garbage-simultaneous-motion.js","app-garbage-render-overlap-guard.js",
  "app-runtime-performance.js","app-physics-safety-invariants.js","app-position-lock-sfx.js",
  "app-mass-motion-safety.js","app-gravity-priority-v1.js","app-garbage-performance-v1.js",
  "app-post-clear-two-stage-v1.js","app-simultaneous-collapse-v1.js",
  "app-garbage-continuous-v1.js","app-contact-separation-v1.js",
  "app-floor-bridge-collapse-v1.js","app-lattice-finalize-v2.js",
  "app-coherent-collapse-v1.js","app-wall-boundary-authoritative-v1.js",
  "app-slope-upconvex-authoritative-v3.js","app-intentional-hexagon-stability-v1.js",
  "app-rigidity-resolver-authoritative-v3.js","app-upconvex-contact-priority-v1.js",
  "app-upconvex-pocket-capture-v1.js","app-upconvex-rigid-until-contact-v1.js",
  "app-collapse-timing-authoritative-v2.js","app-runtime-performance-v3.js"
];
const runtime=runtimeNames.map(read).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){
  expect(valid(x,y),"invalid cell "+x+","+y);
  const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;
}
function pending(g){
  const out=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);
    if(b?.fallPath?.length)out.push({id:b.id,cell:[x,y],visual:v&&[v.x,v.y],path:b.fallPath.map(s=>({from:s.from,to:s.to,kind:s.kind,pileFlow:s.pileFlow,start:s.pileFlowStart,duration:s.pileFlowDuration,end:s.pileFlowEnd}))});
  }
  return out;
}
function residuals(g){
  const out=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);
    if(b&&v&&(Math.abs(v.x-x)>0.01||Math.abs(v.y-y)>0.01))out.push({id:b.id,cell:[x,y],visual:[v.x,v.y],delta:[v.x-x,v.y-y],vy:v.vy,motionSpeed:v.motionSpeed,gravityMismatch:!!v.gravityMismatch,path:b.fallPath||null});
  }
  return out;
}

const g=createEngine(930041);g.state="RESOLVING";g.phase="CLEAR";
const top=put(g,9,8,3);
const upper=put(g,8,9,2);
put(g,10,9,4);
const removed=put(g,7,10,3);
put(g,9,10,1);
put(g,11,10,2);
for(const [x,c] of [[6,4],[8,0],[10,1],[12,2]])put(g,x,11,c);
g.clearing={ids:new Set([removed.id]),cells:[[7,10,removed.c,removed.id]],waza:[],committed:true,ghosts:[]};
g.board[10][7]=null;
clearBoardEquilibriumLocks(g.board);

const flow=prepareContinuousPileFlow(g,"clear_support_loss");
expect(flow.moved,"fixture produced no pile collapse");
expect((upper.fallPath?.length||0)>0&&(top.fallPath?.length||0)>0,"fixture did not create simultaneous paths");
const firstStart=Math.min(upper.fallPath[0].pileFlowStart,top.fallPath[0].pileFlowStart);
expect(Number.isFinite(firstStart),"pile collapse was not scheduled");

let movingFrame=-1;
for(let frame=0;frame<600&&pendingFallPathCount(g)>0;frame++){
  updateVisuals(g,PHYSICS_FRAME);
  resolveVisualContacts(g);
  if(frame===10)movingFrame=pendingFallPathCount(g);
}

const left=pending(g);
expect(left.length===0,"simultaneous pile collapse froze: "+JSON.stringify(left));
expect(pendingFallPathCount(g)===0,"fallPath counter remained non-zero");
for(const [b,x,y] of [[upper,7,10],[top,8,9]]){
  const v=g.vis.get(b.id);
  expect(v&&Math.abs(v.x-x)<0.01&&Math.abs(v.y-y)<0.01,"ball stopped away from logical cell: "+JSON.stringify({id:b.id,visual:v,target:[x,y]}));
}
expect(movingFrame>=2,"fixture did not retain multiple simultaneous moving balls");

let observedMulti=1;
let observedClears=0;
let timingMismatches=0;
for(const seed of [2]){
  const game=createEngine(770000+seed);spawn(game);
  for(let pieceNo=0;pieceNo<30&&game.alive;pieceNo++){
    const target=bestMove(game.board,game.piece.colors,game.queue[0],3,game.aiRng);
    if(target){game.piece={...target};game.pieceVX=target.x;game.pieceVY=target.y;}
    hardDrop(game);

    let unchanged=0,lastVisual="",sawClear=false;
    for(let frame=0;frame<2400&&game.alive&&game.state!=="PLAYING";frame++){
      stepEngine(game,PHYSICS_FRAME);
      const active=pending(game);
      observedMulti=Math.max(observedMulti,active.length);
      if(game.phase==="CLEAR")sawClear=true;
      for(const q of active){
        const seg=q.path[0];
        if(seg?.pileFlow){
          expect(Number.isFinite(seg.start)&&Number.isFinite(seg.duration)&&Number.isFinite(seg.end),"scheduled pile segment lost timing: "+JSON.stringify({seed,pieceNo,frame,q}));
          if(Math.abs(seg.end-(seg.start+seg.duration))>=1e-7)timingMismatches++;
        }
      }
      const visual=JSON.stringify(active.map(q=>[q.id,q.visual,q.path.length]));
      unchanged=active.length&&visual===lastVisual?unchanged+1:0;
      lastVisual=visual;
      expect(unchanged<240,"pile balls froze at intermediate positions: "+JSON.stringify({seed,pieceNo,frame,clock:game.pileFlowClock,active}));
    }
    if(sawClear)observedClears++;
    expect(game.state==="PLAYING"||!game.alive,"resolution did not converge: "+JSON.stringify({seed,pieceNo,state:game.state,phase:game.phase,clock:game.pileFlowClock,timingMismatches,pending:pending(game),residuals:residuals(game)}));
  }
}
expect(observedMulti>=2,"stress run never exercised multiple simultaneous pile paths");
expect(observedClears>0,"stress run produced no clears");
expect(timingMismatches===0,"scheduled pile timing fields diverged: "+timingMismatches);
globalThis.__report={clock:g.pileFlowClock,movingFrame,observedMulti,observedClears,timingMismatches};
`;

const context={
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  fetch(){return Promise.resolve({ok:false,status:404,arrayBuffer:async()=>new ArrayBuffer(0)});},
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null},addEventListener(){}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
};
context.window.addEventListener=()=>{};

vm.runInNewContext(runtime+checks,context,{timeout:120000});
console.log("simultaneous accumulated-pile collapse PASS",JSON.stringify(context.__report));
