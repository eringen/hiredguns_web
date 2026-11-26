// Run against the multiplayer server, using main's browser modules for the reference round.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {statSync}=require('node:fs');
const {chromium,webkit}=require('playwright');
const base=process.argv[2] || 'http://localhost:8013';
const shotLength=statSync('build/preview/NewGun2.pcm').size;
async function instrument(page){
  const {readRoomUpdate}=await import('../src/room-wire.mjs');
  await page.addInitScript({content:'window.unpackRoom='+readRoomUpdate.toString()});
  await page.addInitScript(()=>{
    window.cues=[];window.paint=[];
    window.WebSocket=class extends WebSocket{
      constructor(...args){super(...args);const sections={};this.addEventListener('message',e=>{const packet=JSON.parse(e.data);if(packet.type!=='chart') window.roomState=window.unpackRoom(sections,packet);});}
    };
    const source=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      if(this.buffer && !this.loop) cues.push({length:this.buffer.length,time:performance.now()});
      return source.apply(this,args);
    };
    const context=CanvasRenderingContext2D.prototype,fill=context.fillRect,image=context.drawImage;
    const view=ctx=>ctx.canvas.closest('main button')===document.querySelector('main button');
    context.fillRect=function(x,y,w,h){
      if(view(this) && x===2 && y===14 && w===142 && h===84) paint.push({type:'flash',time:performance.now()});
      return fill.apply(this,arguments);
    };
    context.drawImage=function(img,x,y){
      if(view(this) && img.width===32 && img.height===40 && y>32) paint.push({type:'muzzle',time:performance.now()});
      return image.apply(this,arguments);
    };
  });
}
async function weapon(page){
  const hands=page.locator('#hands');
  await page.keyboard.press('s');
  await page.locator('main button[aria-pressed=true][aria-label$="Store"]').waitFor();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#hands').textContent.includes('(66)'));
  await page.keyboard.press('v');
  await page.locator('main button[aria-pressed=true][aria-label$="View"]').waitFor();
  await page.evaluate(()=>{window.paint=[];window.cues=[];});
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#hands').textContent.includes('(55)'));
  await page.waitForFunction(n=>cues.some(c=>c.length===n) && paint.some(p=>p.type==='muzzle'),shotLength);
  const trace=await page.evaluate(()=>({paint,cues}));
  assert.equal(trace.paint.filter(e=>e.type==='flash').length,0);
  const sounds=trace.cues.filter(e=>e.length===shotLength);
  assert.equal(sounds.length,1);
  const offset=Math.abs(trace.paint.find(e=>e.type==='muzzle').time-sounds[0].time);
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForFunction(()=>document.querySelector('#hands').textContent.includes('(66)'));
  return {held:await hands.textContent(),audioToMuzzleMs:Math.round(offset)};
}
(async()=>{
  const chrome=await chromium.launch({channel:'chrome'}),safari=await webkit.launch();
  try{
    const ref=await chrome.newPage();await instrument(ref);
    const paths=execFileSync('git',['ls-tree','-r','--name-only','main','web','src'],{encoding:'utf8'}).trim().split('\n');
    const modules=new Map(paths.map(p=>[p.split('/').pop(),p]));
    await ref.route('**/*',async route=>{
      const path=new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if(modules.has(path)) await route.fulfill({body:execFileSync('git',['show','main:'+modules.get(path)]),contentType:path.endsWith('.mjs')?'text/javascript':'text/html'});
      else await route.continue();
    });
    await ref.goto(base+'/?map=43&squad=0,1,2,3');
    await ref.locator('body.mission').waitFor();
    console.log('main',await weapon(ref));
    await ref.close();
    const host=await chrome.newPage(),guest=await safari.newPage();await instrument(host);await instrument(guest);
    const errors=[];for(const page of [host,guest]) page.on('pageerror',e=>errors.push(e.message));
    await host.goto(base+'/?room=new-2');
    await host.locator('aside button').waitFor();
    await guest.goto(host.url());await guest.locator('aside button').waitFor();
    await guest.keyboard.press('t');
    await guest.locator('main button[aria-pressed=true][aria-label$="Stats"]').waitFor();
    console.log('multiplayer',await weapon(host));
    await guest.waitForFunction(n=>cues.some(c=>c.length===n),shotLength);
    assert.equal(await guest.locator('main button[aria-pressed=true]').getAttribute('aria-label'),'Cheule · Stats');
    await host.keyboard.press('d');
    await host.locator('main button[aria-pressed=true][aria-label$="DTS"]').waitFor();
    const mapX=await host.evaluate(()=>roomState.maps[0].x);
    await host.keyboard.press('ArrowRight');
    await guest.waitForFunction(x=>roomState.maps[0].x===x+1,mapX);
    await host.keyboard.press('Escape');
    await guest.locator('#resume:visible').waitFor();
    await guest.keyboard.press('Escape');
    await host.locator('#setup').waitFor({state:'hidden'});
    await host.keyboard.press('v');
    await host.locator('main button[aria-pressed=true][aria-label$="View"]').waitFor();
    const start=await host.evaluate(()=>roomState.squad[0]);
    await host.keyboard.press('Shift+ArrowLeft');
    await guest.waitForFunction(x=>roomState.squad[0].x===x-1,start.x);
    await host.waitForTimeout(110);
    await host.keyboard.press('Shift+ArrowRight');
    await guest.waitForFunction(x=>roomState.squad[0].x===x,start.x);
    await host.waitForTimeout(110);
    await host.keyboard.press('ArrowRight');
    await guest.waitForFunction(()=>roomState.squad[0].dir===1);
    await host.waitForTimeout(110);
    await host.keyboard.press('ArrowLeft');
    await guest.waitForFunction(()=>roomState.squad[0].dir===0);
    await host.waitForTimeout(110);
    await host.keyboard.press('ArrowUp');
    await guest.waitForFunction(y=>roomState.squad[0].y===y-1,start.y);
    await host.waitForTimeout(110);
    await host.keyboard.press('ArrowDown');
    await guest.waitForFunction(y=>roomState.squad[0].y===y,start.y);
    await host.keyboard.press('e');
    await guest.waitForFunction(()=>roomState.squad[0].held.ammo===55);
    await host.keyboard.press('p');
    await guest.waitForFunction(()=>roomState.squad[0].held.ammo===66);
    await host.waitForTimeout(450);
    await host.keyboard.down('Space');
    try{
      await guest.waitForFunction(()=>roomState.squad[0].held.ammo===55);
      for(let i=0;i<6;i++){
        await host.waitForTimeout(100);
        await host.keyboard.down('Space');
      }
      await guest.waitForFunction(()=>roomState.squad[0].held.ammo<55);
    }finally{await host.keyboard.up('Space');}
    await host.keyboard.press('s');
    await host.waitForFunction(()=>roomState.squad[0].mode===1);
    const count=await host.evaluate(()=>roomState.squad[0].pack.length);
    for(let index=1;index<count;index++){
      await host.keyboard.press('ArrowDown');await host.waitForFunction(i=>roomState.squad[0].index===i,index);
    }
    await host.keyboard.press('ArrowRight');
    await host.waitForFunction(()=>roomState.squad[0].held.id===27);
    await host.keyboard.press('v');
    await host.waitForFunction(()=>roomState.squad[0].mode===0);
    await host.keyboard.press('Shift+ArrowUp');
    await guest.waitForFunction(()=>roomState.squad[0].throwPower===0);
    await host.keyboard.press('Space');
    await guest.waitForFunction(()=>roomState.battle.grenades.length>0);
    assert.deepEqual(errors,[]);
    console.log('Remote shot audio, ownership, keyboard panels and shared Escape pause/resume passed');
  }finally{await chrome.close();await safari.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
