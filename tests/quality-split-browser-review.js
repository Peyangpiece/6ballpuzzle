const{chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=process.env.REVIEW_OUTPUT||path.join(__dirname,'../audit-results/reference-motion-2026-10-04/browser-split');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.REVIEW_URL||'http://127.0.0.1:8018/',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.__hexdropMounted,{timeout:60000});
  const results=[];
  for(const kind of['up','up-mirror','down']){
   await p.evaluate(kind=>{
    const g=createEngine(140826);g.state='PLAYING';const down=kind==='down',mirror=kind==='up-mirror';
    const cells=down?[[6,11,2],[8,11,4],[7,10,4]]:[[6,11,0],[8,11,4],[10,11,1],[12,11,2],[9,10,0],[11,10,0]];
    for(const[x,y,c]of cells){const b=mkBall(g,c),xx=mirror?18-x:x;g.board[y][xx]=b;noteBoardCell(g.board,y,b);setVis(g,b,xx,y,0);}
    const first=g.nextId,free=down?.67:5.3;
    g.piece={x:6,y:1,rot:down?0:1,colors:down?[0,2,2]:mirror?[4,2,3]:[4,3,2]};
    setFreeX(g,mirror?16-free:free);g.pieceVX=g.freeX;hardDrop(g);
    let cv=document.getElementById('split-review-canvas');if(!cv){cv=document.createElement('canvas');cv.id='split-review-canvas';cv.width=700;cv.height=820;cv.style='position:fixed;top:0;left:0;z-index:9999;background:#060512';document.body.appendChild(cv);}
    window.__splitReview={g,cv,time:0,ids:[first,first+1,first+2]};
   },kind);
   for(const frame of[0,4,8,12,16,20,28]){
    await p.evaluate(frame=>{
     const r=window.__splitReview;while(r.time<frame/120-1e-9){stepEngine(r.g,1/120);r.time+=1/120;}
     const ctx=r.cv.getContext('2d');ctx.clearRect(0,0,r.cv.width,r.cv.height);
     drawSide(ctx,r.g,{D:63.4,DX:64.4,X:20,Y:100,BW:644,BH:700},0,r.time,'','','',0);
    },frame);
    await p.locator('#split-review-canvas').screenshot({path:path.join(out,`${kind}-${frame}.png`)});
   }
   const result=await p.evaluate(()=>{const{g,ids}=window.__splitReview;return ids.map(id=>{const v=g.vis.get(id);const b=g.board.flat().find(b=>b?.id===id);return{x:v.x,y:v.y,pending:b?.fallPath?.length||0};});});
   for(const q of result){assert(Number.isFinite(q.x)&&Number.isFinite(q.y));assert.equal(q.pending,0);}
   results.push({kind,balls:result});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors,scope:'Production Chrome split replay and rendered snapshots; not source-pixel equivalence'},null,2));
  console.log('Production split Chrome replay PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
