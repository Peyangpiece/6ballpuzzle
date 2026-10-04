const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=process.env.REVIEW_OUTPUT||path.join(__dirname,'../audit-results/reference-garbage-2026-10-04/browser');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:900,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8018/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__hexdropMounted&&typeof drawSide==='function'&&typeof NEON!=='undefined');
  const results=[];
  for(const type of ['PYRAMID','HEXAGON','STRAIGHT']){
   await page.evaluate(type=>{
    const g=createEngine(232);g.state='RESOLVING';g.phase='GARBAGE';g.garbShapes=Array(type==='PYRAMID'?4:type==='HEXAGON'?6:1).fill(type);g.garbLeft=0;
    prepareGarbageBatch(g);updateGarbagePacks(g,0);
    let cv=document.getElementById('garbage-review');
    if(!cv){cv=document.createElement('canvas');cv.id='garbage-review';cv.width=700;cv.height=820;cv.style='position:fixed;left:0;top:0;z-index:99999;background:#060512';document.body.appendChild(cv);}
    window.__garbageReview={g,cv,frame:0};
   },type);
   for(const frame of [0,12,24,36,48,60,72,96,144,240,480]){
    const state=await page.evaluate(target=>{
     const r=window.__garbageReview,{g,cv}=r;
     while(r.frame<target){updateVisuals(g,1/120);resolveVisualContacts(g);updateGarbagePacks(g,1/120);r.frame++;}
     const ctx=cv.getContext('2d');ctx.clearRect(0,0,700,820);drawSide(ctx,g,{D:63.4,DX:64.4,X:20,Y:100,BW:644,BH:700},0,target/120,'','','',0);
     for(const v of g.vis.values())if(!Number.isFinite(v.x)||!Number.isFinite(v.y))throw Error('Non-finite garbage position');
     return{frame:target,pending:pendingFallPathCount(g),done:garbageBatchDone(g),starts:g.garbagePlans.map(p=>p.actualStartTime)};
    },frame);
    await page.locator('#garbage-review').screenshot({path:path.join(out,`${type}-${frame}.png`)});
    if(frame===480){assert(state.done,'Garbage batch froze: '+type);assert.equal(state.pending,0);results.push({type,...state});}
   }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors,scope:'Actual production renderer and garbage playback; source vertical-motion comparison is a separate measured test'},null,2));
  console.log('Production Chrome garbage playback PASS',JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
