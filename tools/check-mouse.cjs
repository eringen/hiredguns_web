// Exercise movement and item actions on the live Fusion Reactor map.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try {
    const page=await browser.newPage(),base=process.argv[2]??'http://127.0.0.1:8013';
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      document.addEventListener('DOMContentLoaded',()=>{void window.details;});
      window.loops=[];
      const start=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args){
        if(this.loop) window.loops.push({rate:this.playbackRate.value,length:this.buffer.length});
        return start.apply(this,args);
      };
    });
    const url=base+'/?map=18&squad=0,1,2,3';
    await page.goto(url);
    const canvas=page.locator('main button canvas').first();
    async function save(){
      await page.click('#menu');await page.click('#save');await page.click('#slot-1');await page.click('#write-slot');
      return page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    }
    await page.locator('#menu:enabled').waitFor();
    let state=await save();
    // Isolate mouse dispatch in a supported open patch surrounding the actual ring.
    const k=3209, x=k%23,y=Math.floor(k/23)%23,floor=Math.floor(k/529);
    Object.assign(state.state.members[0],{x,y,floor,dir:0,held:null});
    state.battle.actors=[];state.battle.opened=state.battle.opened.map(()=>true);
    for(let dx=-1;dx<2;dx++) for(let dy=-1;dy<2;dy++) if(dx||dy) state.machines.changes.push([k+dx+23*dy,1]);
    await page.evaluate(s=>localStorage.setItem('hiredguns.mission.v1',JSON.stringify(s)),state);
    await page.goto(url+'&restore=1');await page.locator('#menu:enabled').waitFor();
    async function click(x,y,button='left'){
      const r=await canvas.boundingBox();
      await page.mouse.click(r.x+x*r.width/160,r.y+y*r.height/103,{button});
    }
    async function position(){
      const p=(await save()).state.members[0];return [p.x,p.y,p.floor,p.dir];
    }
    await page.keyboard.press('Shift+ArrowLeft');assert.deepEqual(await position(),[x-1,y,floor,0]);
    await page.keyboard.press('Shift+ArrowRight');assert.deepEqual(await position(),[x,y,floor,0]);
    await click(22,80,'right');
    state=await save();assert.ok(state.state.members[0].pack.some(item=>item.id===29));
    await click(70,30);assert.deepEqual(await position(),[x,y-1,floor,0]);
    await click(70,85);assert.deepEqual(await position(),[x,y,floor,0]);
    await click(130,85);assert.deepEqual(await position(),[x+1,y,floor,0]);
    await click(20,85);assert.deepEqual(await position(),[x,y,floor,0]);
    await click(20,30);assert.deepEqual(await position(),[x,y,floor,3]);
    await click(130,30);assert.deepEqual(await position(),[x,y,floor,0]);
    await click(48,5);await click(30,55);
    assert.match(await page.locator('#hands').textContent(),/FUSION POWER CORE RING/);
    await click(113,55);
    assert.match(await page.locator('#hands').textContent(),/nothing/);
    assert.equal((await save()).state.members[0].pack[0].id,29);
    await page.waitForFunction(()=>window.loops.some(voice=>voice.rate>0 && voice.length>0));
    state=await save();
    state.state.members[0].held={id:27,ammo:1,damage:0};
    state.state.members[1].fitness=0;
    await page.evaluate(s=>localStorage.setItem('hiredguns.mission.v1',JSON.stringify(s)),state);
    await page.goto(url+'&restore=1');await page.locator('#menu:enabled').waitFor();
    const missing=page.locator('main button').nth(1);
    assert.match(await missing.getAttribute('aria-label'),/MIA/);
    await missing.screenshot({path:'build/comparison/native-mia.png'});
    const rect=await canvas.boundingBox();
    for(const [height,cursor] of [[46,18],[55,17],[64,16],[73,15]]) {
      await page.mouse.move(rect.x+70*rect.width/160,rect.y+height*rect.height/103);
      assert.ok((await canvas.evaluate(c=>c.style.cursor)).includes('mouse'+cursor+'.png'));
    }
    await click(70,64);assert.equal((await save()).state.members[0].held,null);
    await page.keyboard.press('3');await page.keyboard.press('d');
    await page.locator('main button').nth(2).screenshot({path:'build/comparison/native-offline.png'});
    assert.deepEqual(errors,[]);
    console.log('Mouse walk, backstep, both strafes, both turns, right-click pickup, Store equip/stow, and live ambient playback passed.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
