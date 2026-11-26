const assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright');
const base=process.argv[2] || 'http://localhost:8013';

(async()=>{
  const chrome=await chromium.launch({channel:'chrome'}),safari=await webkit.launch();
  try{
    const phone=await chrome.newPage({...devices['Pixel 7']});
    const tablet=await safari.newPage({...devices['iPad (gen 7)']});
    const desktop=await chrome.newPage();
    const errors=[];
    for(const p of [phone,tablet,desktop]) p.on('pageerror',e=>errors.push(e.message));
    const pad=(p,action)=>p.locator('#touch-pad [data-action="'+action+'"]');
    async function checkSquadLayout(page,count,slot){
      await page.waitForFunction(({count,slot})=>{
        const buttons=[...document.querySelectorAll('main button')];
        if(buttons.length!==count || buttons[slot].getAttribute('aria-pressed')!=='true') return false;
        const rects=buttons.map(b=>b.querySelector('canvas').getBoundingClientRect());
        const large=rects[slot],small=rects.filter((_,i)=>i!==slot),ratio=count===4?3:2;
        const radio=document.querySelector('#ticker').getBoundingClientRect();
        return small.every((r,i)=>Math.abs(r.left-large.right)<1 && Math.abs(r.width*ratio-large.width)<2 &&
          Math.abs(r.height*ratio-large.height)<2 && (!i || Math.abs(r.top-small[i-1].bottom)<1)) &&
          Math.abs((small[0].top+small.at(-1).bottom)-(large.top+large.bottom))<2 &&
          Math.abs(radio.top-large.bottom)<1 && Math.abs(radio.width-large.width-small[0].width)<2;
      },{count,slot});
    }
    async function checkGroundPickup(page,slot,tapIcon){
      const view=page.locator('main button canvas').nth(slot);
      const hands=page.locator('#hands'),store=pad(page,'store');
      if(await store.textContent()==='Store') await store.tap();
      await page.waitForFunction(()=>document.querySelector('[data-action="primary"]').textContent==='Equip');
      if((await hands.textContent()).endsWith('nothing')){
        await pad(page,'primary').tap();
        await page.waitForFunction(()=>!document.querySelector('#hands').textContent.endsWith('nothing'));
      }
      const item=(await hands.textContent()).split('Held: ')[1];
      async function tapPixel(x,y){
        const r=await view.boundingBox();
        await page.touchscreen.tap(Math.round(r.x+r.width*x/160),Math.round(r.y+r.height*y/103));
      }
      await tapPixel(75,71); // Store's drop icon
      await page.waitForFunction(name=>document.querySelector('#ground').textContent==='At your feet: '+name,item);
      const previousPack=await page.locator('#pack option').allTextContents();
      await store.tap();
      await page.waitForFunction(()=>document.querySelector('[data-action="Use"]').textContent==='Pick up');
      if(tapIcon) await tapPixel(20,80);
      else await pad(page,'Use').tap();
      await page.waitForFunction(()=>document.querySelector('#ground').textContent==='At your feet: nothing' &&
        document.querySelector('[data-action="Use"]').textContent==='Use');
      assert.deepEqual(await page.locator('#pack option').allTextContents(),[item,...previousPack]);
      assert.ok((await hands.textContent()).endsWith('nothing'));
    }
    await phone.goto(base+'/?room=new-2');
    await phone.locator('#rotate-device').waitFor();
    assert.equal(await phone.locator('#touch-movement').isVisible(),false);
    assert.match(await phone.locator('meta[name="viewport"]').getAttribute('content'),/user-scalable=no/);
    await phone.setViewportSize({width:844,height:390});
    await phone.locator('aside button').waitFor();
    await tablet.setViewportSize({width:1024,height:768});await tablet.goto(phone.url());await tablet.locator('aside button').waitFor();
    await checkSquadLayout(phone,2,0);
    await checkSquadLayout(tablet,2,1);
    for(const p of [phone,tablet]){
      await pad(p,'store').tap();
      await p.waitForFunction(()=>document.querySelector('#touch-pad [data-action="primary"]').textContent==='Equip');
      await pad(p,'primary').tap();
      await p.waitForFunction(()=>!document.querySelector('#hands').textContent.endsWith('nothing'));
      await pad(p,'store').tap();
      await p.waitForFunction(()=>document.querySelector('#touch-pad [data-action="primary"]').textContent==='Fire');
      const before=await p.locator('#hands').innerText();
      await pad(p,'primary').tap();
      await p.waitForFunction(value=>document.querySelector('#hands').textContent!==value,before);
      await pad(p,'pull').tap();
      await p.waitForFunction(rounds=>document.querySelector('#hands').textContent.endsWith('('+rounds+')'),p===phone?66:65);
      assert.equal(await pad(p,'member').isDisabled(),true);
    }
    // A previously taller portrait page must not leave a scroll offset after rotation.
    for(const [p,width,height] of [[phone,844,390],[tablet,1024,768]]){
      await p.setViewportSize({width:height,height:width});
      await p.locator('#rotate-device').waitFor();
      await p.evaluate(()=>window.scrollTo(50,500));
      await p.setViewportSize({width,height});
      await p.locator('#rotate-device').waitFor({state:'hidden'});
      for(const h of [height-60,height]){
        await p.setViewportSize({width,height:h});
        await p.evaluate(()=>window.scrollTo(50,500));
        await p.waitForFunction(()=>{
          const v=visualViewport,r=document.querySelector('main').getBoundingClientRect();
          const expected=Math.min(v.width,v.height*480/218);
          return Math.abs(r.width-expected)<1 && !scrollX && !scrollY && Math.abs(r.x+r.width/2-v.offsetLeft-v.width/2)<1 &&
            Math.abs(r.y+r.height/2-v.offsetTop-v.height/2)<1;
        });
      }
    }
    const cdp=await phone.context().newCDPSession(phone);
    const scale=await phone.evaluate(()=>visualViewport.scale);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:360,y:12},{id:2,x:450,y:12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:240,y:14},{id:2,x:570,y:14}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await phone.evaluate(()=>visualViewport.scale),scale);
    const canvas=phone.locator('main button canvas').first();
    const box=await canvas.boundingBox(),point={x:box.x+box.width*.45,y:box.y+box.height*.56};
    await pad(phone,'primary').tap();
    await phone.waitForFunction(()=>document.querySelector('#hands').textContent.endsWith('(55)'));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await phone.waitForTimeout(510);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await phone.waitForTimeout(180);
    assert.ok((await phone.locator('#hands').innerText()).endsWith('(66)'),'Long press reloads the gun');
    // A focused viewport can overlap the floating pad. Probe both sides and
    // the center of each visible control after tapping that viewport.
    const misses=await phone.evaluate(()=>{
      const errors=[];
      for(const el of document.querySelectorAll('#touch-pad button')){
        const r=el.getBoundingClientRect();if(!r.width) continue;
        for(const t of [.1,.5,.9]){
          const hit=document.elementFromPoint(r.left+r.width*t,r.top+r.height/2);
          if(!el.contains(hit)) errors.push(el.id || el.dataset.action);
        }
      }
      return errors;
    });
    assert.deepEqual(misses,[]);
    const fire=await pad(phone,'primary').boundingBox();
    const strafe=await phone.locator('#touch-actions [data-action="Strafe left"]').boundingBox();
    const left={id:1,x:strafe.x+strafe.width/2,y:strafe.y+strafe.height/2};
    const right={id:2,x:fire.x+fire.width/2,y:fire.y+fire.height/2};
    await phone.evaluate(()=>{
      window.strafes=0;
      const send=WebSocket.prototype.send;
      WebSocket.prototype.send=function(data){const c=JSON.parse(data);if(c.action==='Strafe left'){if(c.slot!==0) throw Error('Wrong slot');window.strafes++;}return send.call(this,data);};
    });
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});
    await phone.waitForFunction(()=>window.strafes>=2 && Number(document.querySelector('#hands').textContent.match(/\((\d+)\)$/)?.[1])<=44);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.match(await tablet.locator('#hands').innerText(),/Cheule.*\(65\)/);
    await phone.waitForTimeout(200);
    const released=await phone.locator('#hands').textContent();
    await phone.waitForTimeout(550);assert.equal(await phone.locator('#hands').textContent(),released);
    await phone.locator('#touch-movement [data-action="Right"]').tap();
    await phone.waitForFunction(()=>document.querySelector('#status').textContent.endsWith('East'));
    await phone.setViewportSize({width:390,height:844});await phone.locator('#rotate-device').waitFor();
    await phone.setViewportSize({width:844,height:390});
    await pad(phone,'menu').tap();
    await tablet.locator('#setup[open]').waitFor();await tablet.locator('#resume').tap();
    await phone.locator('#setup').waitFor({state:'hidden'});
    await phone.setViewportSize({width:844,height:390});
    for(const selector of ['main','#touch-movement','#touch-actions']){
      const rect=await phone.locator(selector).boundingBox();
      assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=845 && rect.y+rect.height<=391,selector+JSON.stringify(rect));
    }
    await checkGroundPickup(tablet,1,false);
    await desktop.goto(base+'/?room=new-2');await desktop.locator('aside button').waitFor();
    assert.equal(await desktop.locator('#touch-pad').isVisible(),false);
    assert.ok(!(await desktop.locator('meta[name="viewport"]').getAttribute('content')).includes('user-scalable=no'));
    await tablet.goto(base+'/?map=43&squad=0,1,2,3');await tablet.locator('body.mission').waitFor();
    await tablet.setViewportSize({width:1024,height:500});
    await tablet.waitForFunction(()=>{
      const r=document.querySelector('main').getBoundingClientRect(),v=visualViewport;
      return Math.abs(r.height-v.height)<1 && Math.abs(r.y-v.offsetTop)<1 && Math.abs(r.x+r.width/2-v.width/2-v.offsetLeft)<1;
    });
    await checkSquadLayout(tablet,4,0);
    await pad(tablet,'member').tap();assert.equal(await pad(tablet,'member').innerText(),'Cheule');
    await checkSquadLayout(tablet,4,1);
    const third=tablet.locator('main button').nth(2);
    await third.tap();
    await checkSquadLayout(tablet,4,2);
    assert.match(await third.getAttribute('aria-label'),/ · View$/);
    const iphone=await safari.newPage({...devices['iPhone 13'],viewport:{width:844,height:390}});
    iphone.on('pageerror',e=>errors.push(e.message));
    await iphone.goto(base+'/?map=43&squad=0,1,2,3');
    const store=pad(iphone,'store'),member=pad(iphone,'member');
    await store.waitFor();
    for(const height of [320,390]){
      await iphone.setViewportSize({width:844,height});
      await iphone.waitForFunction(()=>{
        const v=visualViewport,game=document.querySelector('main').getBoundingClientRect();
        const left=document.querySelector('#touch-movement').getBoundingClientRect();
        const right=document.querySelector('#touch-actions').getBoundingClientRect();
        return Math.abs(left.left-v.offsetLeft-12)<1 && Math.abs(v.offsetLeft+v.width-right.right-12)<1 &&
          Math.abs(v.offsetTop+v.height-right.bottom-12)<1 && Math.abs(left.bottom-right.bottom)<1 &&
          Math.abs(game.left+game.width/2-v.offsetLeft-v.width/2)<1 &&
          Math.abs(game.top+game.height/2-v.offsetTop-v.height/2)<1;
      });
    }
    const initialMember=await member.textContent();
    const bounds=await store.boundingBox();
    for(const fraction of [.05,.5,.95]){
      const x=Math.round(bounds.x+bounds.width*fraction),y=Math.round(bounds.y+bounds.height/2);
      await iphone.touchscreen.tap(x,y);
      await iphone.waitForFunction(()=>document.querySelector('[data-action="store"]').textContent==='View');
      assert.equal(await member.textContent(),initialMember);
      await iphone.touchscreen.tap(x,y);
      await iphone.waitForFunction(()=>document.querySelector('[data-action="store"]').textContent==='Store');
    }
    await iphone.touchscreen.tap(Math.round(bounds.x+bounds.width+6),Math.round(bounds.y+bounds.height/2));
    assert.equal(await store.textContent(),'Store','Tapping the margin to the right must not activate Store');
    assert.equal(await member.textContent(),initialMember);
    // Model Safari assigning a touch to the neighboring button even though its
    // raw coordinates are over Store. Only the button under the finger acts.
    await iphone.evaluate(()=>{
      const store=document.querySelector('[data-action="store"]'),neighbor=document.querySelector('[data-action="member"]');
      const r=store.getBoundingClientRect(),touch={identifier:99,clientX:r.left+2,clientY:r.top+r.height/2};
      for(const type of ['touchstart','touchend']){
        const event=new Event(type,{bubbles:true,cancelable:true});
        Object.defineProperty(event,'changedTouches',{value:[touch]});
        neighbor.dispatchEvent(event);
      }
    });
    assert.equal(await store.textContent(),'View');
    assert.equal(await member.textContent(),initialMember);
    await checkGroundPickup(iphone,0,false);
    await checkGroundPickup(iphone,0,true);
    const desktopViews=await desktop.locator('main button canvas').evaluateAll(cs=>cs.map(c=>c.getBoundingClientRect().width));
    assert.equal(desktopViews.length,2);
    assert.equal(desktopViews[0],desktopViews[1]);
    for(const size of [3,4]){
      await phone.goto(base+'/?room=new-'+size);
      await phone.locator('aside button').waitFor();
      await tablet.goto(phone.url());await tablet.locator('aside button').waitFor();
      await checkSquadLayout(phone,size,0);
      await checkSquadLayout(tablet,size,1);
    }
    for(const query of ['?map=43&squad=0,1,2,3','?room=new-2']){
      await phone.goto(base+'/'+query);
      await pad(phone,'store').waitFor();
      if(query.includes('room')) await phone.locator('aside button').waitFor();
      const view=phone.locator('main button[aria-pressed=true] canvas');
      const box=await view.boundingBox();
      const pt=(x,y)=>({x:box.x+x*box.width/160,y:box.y+y*box.height/103});
      const finger=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x===undefined?[]:[pt(x,y)]});
      async function swipe(x,y,dx,dy){
        await finger('touchStart',x,y);await finger('touchMove',x+dx,y+dy);await finger('touchEnd');
      }
      await pad(phone,'store').tap();
      await phone.waitForFunction(()=>document.querySelector('[data-action=primary]').textContent==='Equip');
      for(let n=1;n<=3;n++){
        await swipe(45,80,0,-44);
        await phone.waitForFunction(index=>document.querySelector('#pack').selectedIndex===index,n*3);
      }
      await pad(phone,'primary').tap();
      await phone.waitForFunction(()=>document.querySelector('#hands').textContent.includes('GRENADES (6)'));
      await pad(phone,'store').tap();
      await phone.waitForFunction(()=>document.querySelector('[data-action=store]').textContent==='Store');
      const mapTab=pt(69,5);
      assert.equal(await phone.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,mapTab),'CANVAS',query+' DTS tab');
      await phone.touchscreen.tap(mapTab.x,mapTab.y);
      await phone.locator('main button[aria-pressed=true][aria-label$="DTS"]').waitFor();
      const mapPixels=()=>view.evaluate(c=>Array.from(c.getContext('2d').getImageData(13,16,128,79).data).join(','));
      const before=await mapPixels();
      await swipe(78,52,35,19);
      await phone.waitForFunction(old=>Array.from(document.querySelector('main button[aria-pressed=true] canvas').getContext('2d').getImageData(13,16,128,79).data).join(',')!==old,before);
      const viewTab=pt(20,5);await phone.touchscreen.tap(viewTab.x,viewTab.y);
      await phone.locator('main button[aria-pressed=true][aria-label$="View"]').waitFor();
      await finger('touchStart',70,58);await finger('touchCancel');
      await finger('touchStart',70,58);await phone.waitForTimeout(810);
      assert.match(await phone.locator('#hands').textContent(),/GRENADES \(6\)/);
      await finger('touchEnd');
      await phone.waitForFunction(()=>document.querySelector('#hands').textContent.includes('GRENADES (5)'));
    }
    assert.deepEqual(errors,[]);
    console.log('iPhone Store edges, neighboring button and right margin passed. Movement buttons, simultaneous strafe and fire, release, reload, shared pause, rotation and desktop fallback passed.');
  } finally {await chrome.close();await safari.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
