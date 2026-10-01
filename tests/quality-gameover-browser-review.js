// Local-only, controlled rendering check. Never connect to an online match.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const output=process.env.REVIEW_OUTPUT||path.join(__dirname,'../audit-results/reference-full-2026-10-02/browser-gameover');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8018/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByText('AI対戦',{exact:true}).waitFor({timeout:60000});
  await page.getByText('AI対戦',{exact:true}).click();
  await page.getByText('超強い',{exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.__sixBallDebugRefs?.meRef?.current?.board),{timeout:30000});
  await page.evaluate(()=>{
   const {meRef,foeRef}=window.__sixBallDebugRefs;
   foeRef.current.matchFrozen=true;
   const g=meRef.current;g.matchFrozen=true;g.state='GAMEOVER';g.stateT=0;
   g.piece=null;g.clearing=null;g.activeGarbagePacks=[];g.vis.clear();
   for(let y=0;y<g.board.length;y++)g.board[y].fill(null);
   for(let y=0;y<12;y++)for(let x=1-y%2;x<19;x+=2){
    const id=g.nextId++;g.board[y][x]={id,c:(x+y)%5,group:0,isGarbage:x===1-y%2};
    g.vis.set(id,{x,y,sq:0,garbageBubbleT:0});
   }
  });
  const results=[];
  for(const time of [0,1.5,2.5,3]){
   await page.evaluate(t=>{window.__sixBallDebugRefs.meRef.current.stateT=t;},time);
   await page.waitForTimeout(100);
   results.push(await page.evaluate(()=>{const g=window.__sixBallDebugRefs.meRef.current;return{time:g.stateT,balls:g.board.flat().filter(Boolean).length,state:g.state};}));
   await page.screenshot({path:path.join(output,`gameover-${time}.png`)});
  }
  assert(results.every(r=>r.balls===114&&r.state==='GAMEOVER'),'Loss presentation mutated the board');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'Controlled loss rendering, not Nintendo parity proof',results,errors},null,2));
  console.log('Controlled gameover Chrome rendering PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
