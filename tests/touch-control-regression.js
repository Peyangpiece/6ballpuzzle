const fs=require('fs');
const vm=require('vm');
const path=require('path');
const {runtime}=require('./audit-harness');

const controls=fs.readFileSync(path.join(__dirname,'..','public','controls-v7.js'),'utf8');
const listeners=new Map(),windowListeners=new Map(),timers=[];
const document={
  hidden:false,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}
};
const windowObj={
  addEventListener(type,fn){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(fn);}
};
function fakeTimer(fn){timers.push(fn);return timers.length;}
function clearFakeTimer(){}
const ctx={
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f}},
  window:windowObj,document,navigator:{},console,Math,Map,Set,WeakMap,WeakSet,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout:fakeTimer,clearTimeout:clearFakeTimer,setInterval(){return 0},clearInterval(){},performance:{now:(()=>{let t=0;return()=>t;})()}
};
vm.createContext(ctx);
vm.runInContext(runtime+'\n'+controls,ctx,{timeout:120000});

function assert(cond,msg){if(!cond)throw new Error(msg);}
function handlers(type){return listeners.get(type)||[];}
function dispatch(type,e){for(const fn of handlers(type))fn(e);}
function canvas(){return{
  tagName:'CANVAS',
  getBoundingClientRect(){return{left:0,top:0,width:ctx.VW||1280,height:ctx.VH||720};},
  setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return true;}
};}
function ev(id,target,x,y){return{pointerId:id,target,clientX:x,clientY:y,cancelable:true,preventDefault(){},stopImmediatePropagation(){}};}
function fresh(){
  const g=ctx.createEngine(777);ctx.spawn(g);g.state='PLAYING';
  return g;
}

// A bottom-zone single-finger tap must hard drop; no second pointer required.
{
  const g=fresh(),cv=canvas();
  const before=g.piece&&g.piece.y;
  dispatch('pointerdown',ev(1,cv,(ctx.VW||1280)*.5,(ctx.VH||720)*.9));
  dispatch('pointerup',ev(1,cv,(ctx.VW||1280)*.5,(ctx.VH||720)*.9));
  assert(g.state==='RESOLVING'||!g.piece,'single-finger bottom tap did not instant-drop');
  assert(before!==undefined,'invalid test engine');
}

// A lower-half one-finger long press must enable fast fall while held and stop
// immediately on release.
{
  const g=fresh(),cv=canvas();
  dispatch('pointerdown',ev(2,cv,(ctx.VW||1280)*.5,(ctx.VH||720)*.7));
  assert(timers.length>0,'lower-half press did not arm long-press timer');
  timers[timers.length-1]();
  assert(g.fastForward===true,'one-finger long press did not enable fast fall');
  dispatch('pointerup',ev(2,cv,(ctx.VW||1280)*.5,(ctx.VH||720)*.7));
  assert(g.fastForward===false,'fast fall remained active after pointer release');
}

// Upper/play-area horizontal motion must stay continuous rather than snapping
// solely by whole lattice columns.
{
  const g=fresh(),cv=canvas();
  const start=g.pieceVX;
  dispatch('pointerdown',ev(3,cv,(ctx.VW||1280)*.45,(ctx.VH||720)*.32));
  dispatch('pointermove',ev(3,cv,(ctx.VW||1280)*.45+17,(ctx.VH||720)*.32));
  const x=Number.isFinite(g.freeX)?g.freeX:g.pieceVX;
  assert(Number.isFinite(x)&&Math.abs(x-start)>1e-6,'single-finger horizontal slide did not move piece');
  assert(Math.abs((x-start)/2-Math.round((x-start)/2))>1e-4,'horizontal slide snapped only to whole logical columns');
  dispatch('pointerup',ev(3,cv,(ctx.VW||1280)*.45+17,(ctx.VH||720)*.32));
}

// An accidental second finger must never itself trigger hard drop / fast fall.
{
  const g=fresh(),cv=canvas();
  dispatch('pointerdown',ev(4,cv,300,250));
  dispatch('pointerdown',ev(5,cv,500,250));
  assert(g.state==='PLAYING'&&!!g.piece,'second pointer incorrectly triggered a drop');
  assert(g.fastForward===false,'second pointer incorrectly triggered fast fall');
}

console.log('TOUCH_CONTROL_REGRESSION PASS');
