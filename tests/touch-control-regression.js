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

// One finger is reserved for horizontal movement / rotation. A single tap,
// including near the bottom, must never issue instant drop.
{
  const g=fresh(),cv=canvas();
  dispatch('pointerdown',ev(1,cv,640,680));
  dispatch('pointerup',ev(1,cv,640,680));
  assert(g.state==='PLAYING'&&!!g.piece,'single-finger tap incorrectly instant-dropped');
}

// Two fingers tapped together must perform the instant drop and physically
// reach the same landing guide as the canonical hard-drop path.
{
  const g=fresh(778),cv=canvas();
  const shadow=ctx.landingShadowVisualCells(g).map(q=>[q[0],q[1]]);
  dispatch('pointerdown',ev(2,cv,500,430));
  nowMs+=20;
  dispatch('pointerdown',ev(3,cv,780,430));
  nowMs+=60;
  dispatch('pointerup',ev(2,cv,500,430));
  dispatch('pointerup',ev(3,cv,780,430));
  assert(g.state==='RESOLVING'||!g.piece,'two-finger tap did not instant-drop');
  const landed=boardBalls(g).filter(q=>q.b.id<=3);
  assert(landed.length===3,'two-finger instant drop did not materialize all three balls');
  for(let i=0;i<3;i++){
    const v=landed.find(q=>q.b.id===i+1)?.v;
    assert(v&&Math.abs(v.x-shadow[i][0])<1.1&&Math.abs(v.y-shadow[i][1])<1.1,'two-finger instant drop missed its physical landing guide');
  }
}

// Two-finger long press must survive normal independent touch jitter, enable
// fast fall only after the hold threshold, and stop as soon as either finger
// is released.
{
  const g=fresh(779),cv=canvas();
  dispatch('pointerdown',ev(4,cv,500,440));
  nowMs+=25;
  dispatch('pointerdown',ev(5,cv,780,440));
  nowMs+=80;
  dispatch('pointermove',ev(4,cv,507,443));
  dispatch('pointermove',ev(5,cv,774,444));
  assert(g.fastForward===false,'two-finger fast fall started before long-press threshold');
  assert(fireLastTimer(),'two-finger press did not arm a long-press timer');
  assert(g.fastForward===true,'two-finger long press did not enable fast fall');
  const before=g.dropT;
  for(let i=0;i<24&&g.state==='PLAYING';i++)ctx.stepEngine(g,1/120);
  assert(g.dropT-before>0.7,'two-finger long press did not accelerate the active fall clock');
  dispatch('pointerup',ev(4,cv,507,443));
  assert(g.fastForward===false,'fast fall remained active after one of the two fingers was released');
  dispatch('pointerup',ev(5,cv,774,444));
  assert(g.state==='PLAYING'&&!!g.piece,'two-finger long press incorrectly converted into instant drop on release');
}

// Upper/play-area horizontal motion must stay continuous rather than snapping
// solely by whole lattice columns.
{
  const g=fresh(780),cv=canvas();
  const start=g.pieceVX;
  dispatch('pointerdown',ev(6,cv,576,230));
  dispatch('pointermove',ev(6,cv,593,230));
  const x=Number.isFinite(g.freeX)?g.freeX:g.pieceVX;
  assert(Number.isFinite(x)&&Math.abs(x-start)>1e-6,'single-finger horizontal slide did not move piece');
  assert(Math.abs((x-start)/2-Math.round((x-start)/2))>1e-4,'horizontal slide snapped only to whole logical columns');
  dispatch('pointerup',ev(6,cv,593,230));
}

// Reproduce the fractional-X release freeze at contact. The single-finger slide
// must remain continuous even after two-finger drop controls are introduced.
{
  const g=fresh(781),cv=canvas();
  g.piece={...g.piece,y:8};g.pieceVY=8;g.dropT=0;g.lockT=0;
  ctx.__touchSeedBall(g,10,11,900001);
  dispatch('pointerdown',ev(7,cv,560,230));
  dispatch('pointermove',ev(7,cv,584,230));
  dispatch('pointerup',ev(7,cv,584,230));
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

// Moving either finger too far cancels the two-finger tap/hold gesture; it must
// not generate a drop from an ambiguous multi-touch swipe.
{
  const g=fresh(782),cv=canvas();
  dispatch('pointerdown',ev(8,cv,500,400));
  dispatch('pointerdown',ev(9,cv,780,400));
  dispatch('pointermove',ev(9,cv,840,400));
  dispatch('pointerup',ev(8,cv,500,400));
  dispatch('pointerup',ev(9,cv,840,400));
  assert(g.state==='PLAYING'&&!!g.piece,'moved two-finger gesture incorrectly instant-dropped');
  assert(g.fastForward===false,'moved two-finger gesture left fast fall active');
}

// A third contact is not a command. It cancels the pair safely and cannot
// trigger either instant drop or a latched fast-fall state.
{
  const g=fresh(783),cv=canvas();
  dispatch('pointerdown',ev(10,cv,420,400));
  dispatch('pointerdown',ev(11,cv,650,400));
  dispatch('pointerdown',ev(12,cv,880,400));
  assert(g.state==='PLAYING'&&!!g.piece,'third pointer incorrectly triggered a drop');
  assert(g.fastForward===false,'third pointer incorrectly triggered fast fall');
}

// Browser/OS pointer cancellation is never a gameplay command.
{
  const g=fresh(784),cv=canvas();
  dispatch('pointerdown',ev(13,cv,500,420));
  dispatch('pointerdown',ev(14,cv,780,420));
  dispatch('pointercancel',ev(13,cv,500,420));
  dispatch('pointerup',ev(14,cv,780,420));
  assert(g.state==='PLAYING'&&!!g.piece,'pointercancel incorrectly instant-dropped');
  assert(g.fastForward===false,'pointercancel left fast fall active');
}

// During a NEW match READY phase, an older PLAYING engine must never receive
// input. The newest local human engine owns the canvas even before PLAYING.
{
  const old=fresh(785),oldPiece={...old.piece};
  const current=ctx.createEngine(786);
  const cv=canvas();
  dispatch('pointerdown',ev(15,cv,500,420));
  dispatch('pointerdown',ev(16,cv,780,420));
  dispatch('pointerup',ev(15,cv,500,420));
  dispatch('pointerup',ev(16,cv,780,420));
  assert(old.state==='PLAYING'&&!!old.piece,'READY input leaked into stale previous engine');
  assert(old.piece.x===oldPiece.x&&old.piece.y===oldPiece.y&&old.piece.rot===oldPiece.rot,'stale previous engine changed during new READY');
  assert(current.state==='READY','test current engine unexpectedly changed state');
}

console.log('TOUCH_CONTROL_REGRESSION PASS');
