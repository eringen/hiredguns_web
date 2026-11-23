// Run with Playwright installed and the native preview server running.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

async function check() {
  const base = process.argv[2] || 'http://127.0.0.1:8000';
  const directory = 'build/comparison';
  await fs.mkdir(directory,{recursive:true});
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:960,height:720}});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      document.addEventListener('DOMContentLoaded',()=>{void window.details;});
      const AudioElement=window.Audio;
      window.menuTracks=[];
      window.Audio=class extends AudioElement {
        constructor(src){super(src);window.menuTracks.push(this);}
      };
    });
    await page.goto(base);
    const front = page.locator('#front');
    await front.waitFor();
    await front.screenshot({path:directory+'/native-credits.png'});
    // An unrelated gesture unlocks sound while keeping the splash visible.
    await front.press('Shift');
    await page.waitForFunction(()=>window.menuTracks.some(t=>t.src.endsWith('/front.mp3') && t.currentTime>0));
    const card=()=>front.locator('canvas').evaluate(c=>c.toDataURL());
    const firstCard=await card();
    await page.waitForFunction(()=>document.querySelector('#front').classList.contains('scanning'));
    await page.waitForFunction(()=>!document.querySelector('#front').classList.contains('scanning'));
    assert.notEqual(await card(),firstCard);
    await front.press('Enter');
    await page.getByRole('button',{name:'Training',exact:true}).waitFor();
    for(const width of [640,360]) {
      await page.setViewportSize({width,height:720});
      for(let i=0;i<4;i++) {
        const button=front.locator('button').nth(i);
        await button.focus();
        const bounds=await button.evaluate(b=>{
          const f=b.parentNode.getBoundingClientRect(),r=b.getBoundingClientRect();
          const frame=getComputedStyle(b,'::before');
          return {x:(r.x-f.x)*640/f.width,y:(r.y-f.y)*400/f.height,
            w:parseFloat(frame.width)*640/f.width,h:parseFloat(frame.height)*400/f.height};
        });
        const textTop=[157,201,245,319][i];
        assert.ok(bounds.y<=textTop && bounds.y+bounds.h>=textTop+42);
        assert.ok(bounds.x<75 && bounds.x+bounds.w>469);
      }
    }
    await page.setViewportSize({width:960,height:720});
    await front.locator('button').first().focus();
    await front.screenshot({path:directory+'/native-front.png'});
    await page.getByRole('button',{name:'Full campaign game'}).click();
    const roster=page.locator('#toggle-person');
    await roster.waitFor();assert.equal(await page.locator('#world').isVisible(),false);
    for(let i=0;i<4;i++){
      if(i) {
        const previous=await roster.getAttribute('aria-label');
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(prev=>document.querySelector('#toggle-person').getAttribute('aria-label')!==prev,previous);
        await page.waitForTimeout(230);
      }
      await roster.click();
      if(i===1) await page.locator('#mission-screen').screenshot({path:directory+'/native-character-menu.png'});
    }
    await page.keyboard.press('Enter');await page.locator('#world').waitFor();
    assert.deepEqual(await page.locator('#world button:enabled').evaluateAll(nodes=>nodes.map(b=>b.dataset.location)),['7']);
    await page.waitForTimeout(1300);
    await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');
    assert.notEqual(await page.locator('#level').inputValue(),'13');
    await page.locator('#mission-screen').screenshot({path:directory+'/native-campaign.png'});
    assert.ok(await page.evaluate(()=>window.menuTracks.find(t=>t.src.endsWith('/front.mp3')).paused));
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Training',exact:true}).click();
    await page.click('#next-map');assert.equal(await page.locator('#level').inputValue(),'44');
    await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#level').inputValue(),'43');
    await page.locator('#mission-screen').screenshot({path:directory+'/native-training-menu.png'});
    await page.locator('#deploy').click();
    await page.locator('#briefing[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelectorAll('main button canvas').length===4);
    const ready=Date.now();
    await page.locator('#briefing canvas').screenshot({path:directory+'/native-training-briefing.png'});
    await page.locator('#menu:enabled').waitFor();
    assert.ok(Date.now()-ready>=2850,'Hold the briefing after the mission is ready.');
    assert.ok(!await page.locator('#briefing').isVisible());
    const view=page.locator('main button canvas').first(),box=await view.boundingBox();
    const point=(x,y)=>[box.x+x*box.width/160,box.y+y*box.height/103];
    await page.mouse.move(...point(121,39));
    assert.match(await view.evaluate(c=>c.style.cursor),/mouse4/);
    await page.mouse.click(...point(121,39));
    assert.match(await page.locator('#status').textContent(),/East/);
    await page.mouse.click(...point(49,5));
    assert.match(await view.locator('..').getAttribute('aria-label'),/Store/);
    await page.mouse.click(...point(32,55));
    await view.screenshot({path:directory+'/native-store-equipped.png'});
    await page.mouse.click(...point(74,20));
    assert.match(await view.locator('..').getAttribute('aria-label'),/Item information/);
    await view.screenshot({path:directory+'/native-item-info.png'});
    await page.mouse.click(...point(50,60));
    assert.match(await view.locator('..').getAttribute('aria-label'),/Store/);
    const held = await page.locator('#hands').textContent();
    await page.click('#menu');
    await page.click('#save');await page.click('#slot-1');await page.click('#write-slot');
    await page.goto(base);
    await page.click('#continue');await page.click('#slot-1');
    await page.locator('#menu:enabled').waitFor();
    assert.equal(await page.locator('#hands').textContent(),held);
    // Put the saved squad at a known script location to exercise the normal input,
    // completion and redeploy paths without bypassing their checks.
    await page.goto(base+'/?campaign=1&map=7&squad=0,1,2,3');
    const briefing=page.locator('#briefing[open]');
    await briefing.waitFor();
    await briefing.press('Shift');
    await page.waitForFunction(()=>window.menuTracks.some(t=>t.src.endsWith('/static-05.mp3') && t.currentTime>0));
    await briefing.screenshot({path:directory+'/native-depot-briefing.png'});
    await briefing.waitFor({state:'hidden'});
    assert.ok(await page.evaluate(()=>window.menuTracks.find(t=>t.src.endsWith('/static-05.mp3')).paused));
    await page.locator('#menu:enabled').waitFor();await page.click('#menu');await page.click('#save');await page.click('#slot-1');await page.click('#write-slot');
    await page.evaluate(()=>{
      const save=JSON.parse(localStorage.getItem('hiredguns.mission.v1'));
      save.state.members.forEach((p,i)=>Object.assign(p,{x:6,y:5,floor:13,dir:2,exited:i!==0}));
      save.state.members[0].held={id:29,ammo:0,damage:0};
      const key=(13*23+5)*23+6;
      save.machines.changes.push([key,1]);
      localStorage.setItem('hiredguns.mission.v1',JSON.stringify(save));
    });
    await page.goto(base+'/?campaign=1&map=7&squad=0,1,2,3&restore=1');
    await page.locator('#menu:enabled').waitFor();
    await page.mouse.click(...point(70,30));await page.waitForURL('**/?campaign=1');
    await page.locator('#world button:enabled').first().waitFor();
    assert.deepEqual(await page.locator('#world button:enabled').evaluateAll(nodes=>nodes.map(b=>Number(b.dataset.location))),[1,2,7]);
    await page.waitForTimeout(1400);
    const legendPixels=()=>page.locator('#mission-screen').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,320,640,80).data));
    const depotLegend=await legendPixels();
    await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>document.querySelector('#level').value==='');
    await page.waitForTimeout(165);await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>document.querySelector('#level').value==='2',{},{timeout:3000});await page.keyboard.up('ArrowUp');
    assert.equal(await page.locator('#level').inputValue(),'2');
    assert.notDeepEqual(await legendPixels(),depotLegend);
    await page.locator('#mission-screen').screenshot({path:directory+'/native-campaign-destination.png'});
    await page.keyboard.press('Enter');
    await page.locator('#menu:enabled').waitFor();
    assert.match(await page.locator('#hands').textContent(),/FUSION POWER CORE RING/);
    await page.click('#menu');await page.click('#save');await page.click('#slot-1');await page.click('#write-slot');
    await page.goto(base);await page.getByRole('button',{name:'Full campaign game'}).click();
    await roster.waitFor();assert.equal(await roster.getAttribute('aria-label'),'Select Clavius');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('hiredguns.campaign.v1')),null);
    await page.keyboard.press('Escape');await page.click('#continue');await page.click('#slot-1');await page.locator('#menu:enabled').waitFor();
    assert.equal(await page.locator('#level').inputValue(),'2');
    assert.match(await page.locator('#hands').textContent(),/FUSION POWER CORE RING/);
    const catalog = await (await page.request.get(base+'/levels.json')).json();
    const report = [];
    for (const entry of catalog) {
      await page.goto(base+'/?map='+entry.id+'&squad=0,1,2,3');
      await page.locator('#menu:enabled').waitFor();
      assert.equal(await page.locator('#level').inputValue(),String(entry.id));
      assert.equal(await page.locator('main button canvas').count(),4);
      await page.locator('main').screenshot({path:directory+'/map-'+entry.id+'.png'});
      const pixels = await page.locator('main button canvas').evaluateAll(views=>views.map(c=>{
        const rgba=c.getContext('2d').getImageData(2,29,140,68).data;
        let painted=0;
        for(let i=3;i<rgba.length;i+=4) if(rgba[i]) painted++;
        return painted;
      }));
      await page.keyboard.press('d');
      const scanner=page.locator('main button').first();
      assert.match(await scanner.getAttribute('aria-label'),/DTS/);
      const position=await page.locator('#status').textContent();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('d');
      assert.equal(await page.locator('#status').textContent(),position);
      if(entry.id===43) await scanner.screenshot({path:directory+'/native-dts.png'});
      await page.keyboard.press('3');await page.keyboard.press('d');
      const noise=await page.locator('main button canvas').nth(2).evaluate(c=>c.toDataURL());
      await page.waitForFunction(frame=>document.querySelectorAll('main button canvas')[2].toDataURL()!==frame,noise);
      report.push({...entry,paintedPixels:pixels});
    }
    await fs.writeFile(directory+'/levels.json',JSON.stringify(report,null,2));
    await page.reload();await front.waitFor();
    assert.equal(new URL(page.url()).search,'');
    assert.ok(await front.evaluate(f=>f.classList.contains('credits')));
    assert.deepEqual(errors,[]);
    console.log('Captured '+report.length+' native level starts. Blank viewports: '+report.reduce((n,m)=>n+m.paintedPixels.filter(p=>!p).length,0));
  } finally { await browser.close(); }
}
check().catch(e=>{console.error(e);process.exitCode=1;});
