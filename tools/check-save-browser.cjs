// Exercise the normal mission, pause and title screens in either browser engine.
const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const engine=process.argv[2]==='webkit'?webkit:chromium;
  const browser=await engine.launch(engine===webkit?{}:{channel:'chrome'});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.earlyEffects=0;
      const start=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args){
        if(document.querySelector('#briefing')?.open) earlyEffects++;
        return start.apply(this,args);
      };
    });
    const base=process.argv[3] || 'http://127.0.0.1:8013';
    await page.goto(base+'/?map=7&squad=0,1,2,3');
    await page.locator('#briefing[open]').waitFor();
    await page.keyboard.press('ArrowUp');
    await page.locator('#briefing').click();
    await page.waitForSelector('body.mission');
    for(const viewport of [{width:1600,height:1000},{width:960,height:720},{width:844,height:390},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      const [frame,top,radio,bottom]=await Promise.all(['main','main button','main #ticker','main button:nth-of-type(3)'].map(
        selector=>page.locator(selector).first().boundingBox()));
      assert.ok(Math.abs(frame.width-Math.min(1280,viewport.width,viewport.height*320/214))<1);
      assert.ok(Math.abs(frame.x*2+frame.width-viewport.width)<2);
      assert.ok(Math.abs(frame.y*2+frame.height-viewport.height)<2);
      assert.ok(Math.abs(top.y+top.height-radio.y)<1 && Math.abs(radio.y+radio.height-bottom.y)<1);
    }
    for(const selector of ['#menu','nav','#equipment','#status']) assert.equal(await page.locator(selector).isVisible(),false);
    await page.keyboard.press('Escape');await page.click('#resume');
    await page.evaluate(()=>details);
    await page.locator('#menu:enabled').waitFor();
    assert.equal(await page.evaluate(()=>earlyEffects),0);
    const key='hiredguns.mission.v1.slot3';
    await page.click('#menu');await page.click('#save');
    await page.keyboard.press('F3');await page.fill('#save-name','Depot entrance');
    await page.keyboard.press('Enter');await page.locator('#setup').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).name,key),'Depot entrance');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hiredguns.mission.v1')),null);
    await page.click('#menu');await page.click('#save');await page.click('#slot-3');
    await page.fill('#save-name','Cancelled change');await page.keyboard.press('Escape');
    await page.click('#cancel-slots');await page.click('#resume');
    await page.reload();
    await page.locator('#front').waitFor();await page.locator('#front').press('Escape');
    await page.click('#continue');assert.equal(await page.locator('#slot-1').isDisabled(),true);
    await page.keyboard.press('F3');await page.waitForSelector('body.mission');
    assert.equal(await page.locator('#menu').isVisible(),false);
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).name,key),'Depot entrance');
    assert.deepEqual(errors,[]);
    console.log(engine.name()+' passed briefing audio isolation, manual named save, overwrite cancellation, fresh launch and selected-slot load.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
