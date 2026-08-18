const fs=require('fs');
const vm=require('vm');
const path=require('path');
const {runtime}=require('./audit-harness');

const controls=fs.readFileSync(path.join(__dirname,'..','public','controls-v7.js'),'utf8');
const listeners=new Map(),windowListeners=new Map(),timers=[];
let nowMs=0;
const document={
  hidden:false,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}
};
const windowObj={
  addEventListener(type,fn){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(fn);}
};
function fakeTimer(fn){timers.push({fn,active:true});return timers.length;}
function clearFakeTimer(id){const t=timers[id-1];if(t)t.active=false;}
function fireLastTimer(){for(let i=timers.length-1;i>=0;i--)if(timers[i].active){timers[i].active=false;timers[i].fn();return true;}return false;}
const ctx={
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f}},
  window:windowObj,document,navigator:{},console,Math,Map,Set,WeakMap,WeakSet,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout:fakeTimer,clearTimeout:clearFakeTimer,setInterval(){return 0},clearInterval(){},performance:{now:()=>nowMs}
};
vm.createContext(ctx);
vm.runInContext(runtime+'\n'+controls,ctx,{timeout:120000});
vm.runInContext(`
  globalThis.__touchActiveVisualY=function(g){
    if(!g?.piece)return NaN;
    const dx=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;
    const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2});
    const align=blocked?Math.max(0,1-Math.min(1,g.lockT/LANDING_ALIGN_DURATION)):1;
    const dOff=dispOff(g.piece.rot)*align;
    return g.piece.y+dOff+safeActiveFallOffset(g,pieceCells(g.piece),dx,dOff,activeDropFraction(g,0));
  };
  globalThis.__touchSeedBall=function(g,x,y,id){
    const b={id,c:0,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0};
    g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;
  };
`,ctx,{timeout:120000});

function assert(cond,msg){if(!cond)throw new Error(msg);}
function handlers(type){return listeners.get(type)||[];}
function dispatch(type,e){for(const fn of handlers(type))fn(e);}
function canvas(){return{
  tagName:'CANVAS',
  getBoundingClientRect(){return{left:0,top:0,width:1280,height:720};},
  setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return true;}
};}
function ev(id,target,x,y){return{pointerId:id,target,clientX:x,clientY:y,cancelable:true,preventDefault(){},stopImmediatePropagation(){}};}
function fresh(seed=777){
  const g=ctx.createEngine(seed);ctx.spawn(g);g.state='PLAYING';
  return g;
}
function boardBalls(g){const out=[];for(let y=-16;y<12;y++)for(let x=0;x<19;x++){const b=g.board[y]?.[x];if(b)out.push({b,x,y,v:g.vis.get(b.id)});}return out;}

// A bottom-zone single-finger tap must physically reach the landing shadow, not
// merely change the state to RESOLVING.
{
  const g=fresh(),cv=canvas();
  const shadow=ctx.landingShadowVisualCells(g).map(q=>[q[0],q[1]]);
  dispatch('pointerdown',ev(1,cv,640,680));
  dispatch('pointerup',ev(1,cv,640,680));
  assert(g.state==='RESOLVING'||!g.piece,'single-finger bottom tap did not instant-drop');
  const landed=boardBalls(g).filter(q=>q.b.id<=3);
  assert(landed.length===3,'instant drop did not materialize all three balls');
  for(let i=0;i<3;i++){
    const v=landed.find(q=>q.b.id===i+1)?.v;
    assert(v&&Math.abs(v.x-shadow[i][0])<1.1&&Math.abs(v.y-shadow[i][1])<1.1,'instant drop did not reach its physical landing guide');
  }
}

// A lower-half one-finger long press must survive ordinary touch jitter and
// actually advance the fall clock at the configured fast multiplier.
{
  const g=fresh(778),cv=canvas();
  dispatch('pointerdown',ev(2,cv,640,500));
  nowMs+=80;
  dispatch('pointermove',ev(2,cv,648,503));
  assert(fireLastTimer(),'lower-half press lost its long-press timer to touch jitter');
  assert(g.fastForward===true,'one-finger long press did not enable fast fall');
  const before=g.dropT;
  for(let i=0;i<24&&g.state==='PLAYING';i++)ctx.stepEngine(g,1/120);
  assert(g.dropT-before>0.7,'held fast fall did not accelerate the active fall clock');
  dispatch('pointerup',ev(2,cv,648,503));
  assert(g.fastForward===false,'fast fall remained active after pointer release');
}

// Upper/play-area horizontal motion must stay continuous rather than snapping
// solely by whole lattice columns.
{
  const g=fresh(779),cv=canvas();
  const start=g.pieceVX;
  dispatch('pointerdown',ev(3,cv,576,230));
  dispatch('pointermove',ev(3,cv,593,230));
  const x=Number.isFinite(g.freeX)?g.freeX:g.pieceVX;
  assert(Number.isFinite(x)&&Math.abs(x-start)>1e-6,'single-finger horizontal slide did not move piece');
  assert(Math.abs((x-start)/2-Math.round((x-start)/2))>1e-4,'horizontal slide snapped only to whole logical columns');
  dispatch('pointerup',ev(3,cv,593,230));
}

// Reproduce the reported freeze at the actual transition: put the active
// triplet immediately above an asymmetric support, slide it between columns,
// then release. It must keep its fractional X, continue monotonically to the
// circle contact, and lock within the normal contact window.
{
  const g=fresh(780),cv=canvas();
  g.piece={...g.piece,y:8};g.pieceVY=8;g.dropT=0;g.lockT=0;
  ctx.__touchSeedBall(g,10,11,900001);
  dispatch('pointerdown',ev(4,cv,560,230));
  dispatch('pointermove',ev(4,cv,584,230));
  dispatch('pointerup',ev(4,cv,584,230));
  assert(Number.isFinite(g.freeX)&&Math.abs(g.freeX-g.piece.x)>1e-4,'fixture did not release at fractional X');
  let last=ctx.__touchActiveVisualY(g),same=0,maxSame=0;
  for(let i=0;i<900&&g.state==='PLAYING'&&g.piece;i++){
    ctx.stepEngine(g,1/120);
    if(g.state!=='PLAYING'||!g.piece)break;
    const y=ctx.__touchActiveVisualY(g);
    assert(Number.isFinite(y),'fractional release produced non-finite visual Y');
    assert(y>=last-1e-6,'fractional release moved upward');
    if(Math.abs(y-last)<1e-7)same++;else same=0;
    maxSame=Math.max(maxSame,same);last=y;
  }
  assert(maxSame<=14,'fractional-X release froze between lattice cells');
  assert(g.state!=='PLAYING'||!g.piece,'fractional-X release never reached a legal lock near contact');
}

// An accidental second finger must never itself trigger hard drop / fast fall.
{
  const g=fresh(781),cv=canvas();
  dispatch('pointerdown',ev(5,cv,300,250));
  dispatch('pointerdown',ev(6,cv,500,250));
  assert(g.state==='PLAYING'&&!!g.piece,'second pointer incorrectly triggered a drop');
  assert(g.fastForward===false,'second pointer incorrectly triggered fast fall');
}

// Browser/OS pointer cancellation is not a gameplay command.
{
  const g=fresh(782),cv=canvas();
  dispatch('pointerdown',ev(7,cv,640,680));
  dispatch('pointercancel',ev(7,cv,640,680));
  assert(g.state==='PLAYING'&&!!g.piece,'pointercancel incorrectly instant-dropped');
  assert(g.fastForward===false,'pointercancel left fast fall active');
}

// During a NEW match READY phase, an older PLAYING engine must never receive
// input. The newest local human engine owns the canvas even before PLAYING.
{
  const old=fresh(783),oldPiece={...old.piece};
  const current=ctx.createEngine(784);
  const cv=canvas();
  dispatch('pointerdown',ev(8,cv,640,680));
  dispatch('pointerup',ev(8,cv,640,680));
  assert(old.state==='PLAYING'&&!!old.piece,'READY input leaked into stale previous engine');
  assert(old.piece.x===oldPiece.x&&old.piece.y===oldPiece.y&&old.piece.rot===oldPiece.rot,'stale previous engine changed during new READY');
  assert(current.state==='READY','test current engine unexpectedly changed state');
}

console.log('TOUCH_CONTROL_REGRESSION PASS');
