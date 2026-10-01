// Run with Playwright available through NODE_PATH. No account actions are made.
const {chromium}=require("playwright");
const fs=require("fs"),path=require("path"),assert=require("assert");
const output=path.join(__dirname,"../audit-results/quality-2026-10-02");
const url=process.env.REVIEW_URL||"http://127.0.0.1:8018";
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const errors=[];
    const assetFailures=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("response",response=>{
      if(new URL(response.url()).origin===new URL(url).origin&&response.status()>=400){
        assetFailures.push({url:response.url(),status:response.status()});
      }
    });
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
    await page.getByText("AI対戦",{exact:true}).waitFor({timeout:60000});
    await page.screenshot({path:path.join(output,"browser-home.png")});
    await page.getByText("AI対戦",{exact:true}).click();
    await page.getByText("超強い",{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,"browser-ai.png")});
    await page.getByText("超強い",{exact:true}).click();
    await page.locator("canvas").waitFor();
    await page.waitForTimeout(7000);
    await page.screenshot({path:path.join(output,"browser-match.png")});
    for(let i=0;i<24;i++){
      await page.keyboard.press(i%2?"ArrowLeft":"ArrowRight");
      await page.keyboard.press("x");
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
    }
    const mounted=await page.evaluate(()=>({mounted:window.__hexdropMounted,canvases:document.querySelectorAll("canvas").length,bootError:document.getElementById("bootMsg")?.textContent||"",playerState:window.__sixBallDebugRefs?.meRef?.current?.state,opponentNextId:window.__sixBallDebugRefs?.foeRef?.current?.nextId,playerBalls:window.__sixBallDebugRefs?.meRef?.current?.board.flat().filter(Boolean).length}));
    assert.equal(mounted.mounted,true,"Game did not mount");
    assert(mounted.canvases>0,"Gameplay canvas missing");
    assert.equal(mounted.bootError,"","Startup error shown");
    assert(mounted.playerBalls>0,"Input sequence did not place balls");
    assert(mounted.opponentNextId>1,"CPU did not place any balls");
    assert.deepEqual(errors,[],"Browser runtime errors");
    assert.deepEqual(assetFailures,[],"Game assets failed to load");
    await page.screenshot({path:path.join(output,"browser-after-inputs.png")});
    await page.setViewportSize({width:390,height:844});
    await page.locator("#orientationGate").getByText("端末を横向きにしてください",{exact:true}).waitFor();
    assert.equal(await page.locator("#orientationGate").isVisible(),true);
    await page.screenshot({path:path.join(output,"browser-portrait.png")});
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#orientationGate").isVisible(),false);
    await page.screenshot({path:path.join(output,"browser-mobile-landscape.png")});
    fs.writeFileSync(path.join(output,"browser-results.json"),JSON.stringify({url,mounted,errors,assetFailures,inputSequences:24,viewports:["1280x720","390x844","844x390"]},null,2)+"\n");
    console.log("Real Chrome review PASS",JSON.stringify({errors:errors.length,inputSequences:24,viewports:3}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
