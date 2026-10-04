// Deterministic canvas review using production rendering, without a match.
const{chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const fixture=require('./fixtures/reference-clear-timing-20260814.json');
const out=process.env.REVIEW_OUTPUT||path.join(__dirname,'../audit-results/reference-clear-2026-10-02/browser-clear');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.REVIEW_URL||'http://127.0.0.1:8018/',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.__hexdropMounted&&window.__hexClearAllBallFx,{timeout:60000});
  const seeded=await p.evaluate(cells=>{
   const g=createEngine(598);g.state='RESOLVING';g.phase='CLEAR';g.holdT=.4;g.stateT=0;
   for(const[x,y,c]of cells){if(!valid(x,y))throw Error('Invalid reference cell');const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);}
   const groups=findGroups(g.board);if(groups.length!==1||classify(groups[0].cells)!==null)throw Error('Reference ordinary clear misclassified');
   const selected=groups[0].cells.map(([x,y])=>[x,y,g.board[y][x].c,g.board[y][x].id]);
   g.clearing={cells:selected,ids:new Set(selected.map(q=>q[3])),waza:[],committed:false,ghosts:[]};
   const cv=document.createElement('canvas');cv.id='clear-review-canvas';cv.width=700;cv.height=800;
   cv.style='position:fixed;top:0;left:0;z-index:9999;background:#060512';document.body.appendChild(cv);
   window.__clearReview={g,cv};return{cells:cells.length,clearing:selected.length};
  },fixture.ordinaryBoard.cells);
  assert.deepEqual(seeded,{cells:21,clearing:6});
  for(const time of [0,1/30,.1,.2,.3,.35,.36]){
   await p.evaluate(t=>{const{g,cv}=window.__clearReview;g.stateT=t;const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);drawSide(ctx,g,{D:63.4,DX:64.4,X:20,Y:100,BW:644,BH:636},0,t,'','','',0);},time);
   await p.locator('#clear-review-canvas').screenshot({path:path.join(out,`clear-${time.toFixed(3)}.png`)});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({seeded,errors,scope:'Production canvas rendering of reconstructed ordinary-clear board; not full source-frame parity'},null,2));
  console.log('Production ordinary-clear Chrome rendering PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
