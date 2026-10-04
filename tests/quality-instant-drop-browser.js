const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=process.env.REVIEW_OUTPUT||path.join(__dirname,'../audit-results/instant-drop-2026-10-05/browser');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8018/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__hexdropMounted&&typeof NEON!=='undefined');
  const result=await page.evaluate(()=>{
   let turns=0;
   for(const seed of [1,2,3]){
    const g=createEngine(seed);spawn(g);
    for(let turn=0;turn<35&&g.state==='PLAYING';turn++){
     const rot=Math.floor(g.rng()*6),x=1+g.rng()*16;
     g.piece.rot=rot;setFreeX(g,x);g.pieceVX=g.freeX;hardDrop(g);
     for(let frame=0;frame<1200&&g.state==='RESOLVING';frame++)stepEngine(g,1/120);
     if(g.state==='RESOLVING')throw Error('Immediate drop stalled '+JSON.stringify({seed,turn,phase:g.phase,pending:pendingFallPathCount(g)}));
     if(g.state==='PLAYING'&&!g.piece)throw Error('Next piece missing');
     turns++;
    }
   }
   return{seeds:3,turns};
  });
  assert(result.turns>60);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'runtime.png')});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({result,errors,url:process.env.REVIEW_URL||'local'},null,2));
  console.log('Chrome repeated instant-drop progress PASS',JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
