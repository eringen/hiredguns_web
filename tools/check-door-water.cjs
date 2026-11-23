// Advance the original door one frame at a time on the live Mission 1 renderer.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const {readLevel}=await import('../src/level.mjs');
  const level=readLevel(fs.readFileSync('build/preview/maps/1.map'));
  const d=level.doors.find(d=>d.key && !d.dir && !d.buttonOnly && !d.lock);
  const x=d.key%23,y=Math.floor(d.key/23)%23,z=Math.floor(d.key/529);
  const browser=await chromium.launch({channel:'chrome'});
  try {
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      document.addEventListener('DOMContentLoaded',()=>{void window.details;});
      window.clocks=new Map();window.cues=[];window.motors=[];window.liftVoices=[];
      window.setInterval=(fn,ms)=>{const previous=window.clocks.get(ms);window.clocks.set(ms,()=>{previous?.();fn();});return ms;};
      window.scenePaints=0;
      const clear=CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect=function(...args){
        if(this.canvas.width===144 && this.canvas.height===84) window.scenePaints++;
        return clear.apply(this,args);
      };
      const connect=AudioBufferSourceNode.prototype.connect;
      AudioBufferSourceNode.prototype.connect=function(node,...args){
        this.testGain=node.gain;
        return connect.call(this,node,...args);
      };
      const original=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args){
        if(!this.loop && this.buffer) window.cues.push({length:this.buffer.length,period:Math.round(3546895/(22050*this.playbackRate.value))});
        if(this.loop && this.loopStart===3330/22050) window.motors.push(this);
        if(this.loop && this.loopStart===12666/22050) window.liftVoices.push(this);
        return original.apply(this,args);
      };
    });
    async function savePosition(){
      await page.click('#menu');await page.click('#save');
      await page.click('#slot-1');await page.click('#write-slot');
    }
    let url=(process.argv[2]??'http://127.0.0.1:8013')+'/?map=1&squad=0,1,2,3';
    await page.goto(url);await page.locator('#menu:enabled').waitFor();
    await savePosition();
    const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    const eq=JSON.parse(fs.readFileSync('build/preview/equipment.json'));
    const gun=eq.items.findIndex(item=>item?.category===0 && item.damagePerHit && item.burst);
    const sampleLength=name=>fs.statSync('build/preview/'+name+'.pcm').size;
    const player=initial.state.members[0];
    const dx=d.type>>>11===21?1:0,dy=dx?0:1;
    Object.assign(player,{x:x-dx,y:y-dy,floor:z,dir:dx?1:2});
    initial.machines.changes.push([d.key-dx-dy*23,1]);
    initial.battle.actors=[];
    async function restore(state) {
      await page.evaluate(s=>localStorage.setItem('hiredguns.mission.v1',JSON.stringify(s)),state);
      await page.goto(url+'&restore=1');await page.locator('#menu:enabled').waitFor();
    }
    await restore(initial);
    const canvas=page.locator('main button canvas').first();
    // Compare the entire warning rectangle against the CD32 four-plane bitmap.
    function warningPixels(name) {
      const art=fs.readFileSync('build/preview/view-palette.bin'),palette=0;
      const bob=fs.readFileSync('build/preview/'+name+'.bin'),start=bob.readUInt32BE(28);
      return Array.from({length:48*16},(_,i)=>{
        let ink=0;
        for(let plane=0;plane<4;plane++) if(bob[start+plane*96+(i>>3)]&(128>>(i&7))) ink+=1<<plane;
        return [...art.subarray(palette+ink*3,palette+ink*3+3),255];
      }).flat();
    }
    const readWarning=(i=0)=>page.locator('main button canvas').nth(i).evaluate(c=>Array.from(c.getContext('2d').getImageData(3,43,48,16).data));
    const advance=(ms,n)=>page.evaluate(([ms,n])=>{for(let i=0;i<n;i++) window.clocks.get(ms)();},[ms,n]);
    const offline=structuredClone(initial);
    for(const member of offline.state.members.slice(0,2)){member.held=null;member.pack=[];}
    await restore(offline);
    for(const key of ['1','d','2','d']) await page.keyboard.press(key);
    const frames=()=>page.locator('main button canvas').evaluateAll(list=>list.map(c=>c.toDataURL()));
    const paints=()=>page.evaluate(()=>window.scenePaints);
    const beforeStatic=await frames(),worldPaints=await paints();
    await advance(120,1);
    const afterStatic=await frames();
    assert.notEqual(afterStatic[0],beforeStatic[0]);
    assert.notEqual(afterStatic[1],beforeStatic[1]);
    assert.deepEqual(afterStatic.slice(2),beforeStatic.slice(2));
    assert.equal(await paints(),worldPaints,'Offline static must leave world views alone.');
    await page.keyboard.press('v');
    const beforeTurn=await frames();
    await page.keyboard.press('ArrowRight');
    const afterTurn=await frames();
    assert.notEqual(afterTurn[1],beforeTurn[1],'The second character can turn with the first DTS offline.');
    assert.equal(afterTurn[0],beforeTurn[0],'A turn must preserve the current static frame.');
    await restore(initial);
    const interrupted=await page.evaluate(async()=>{
      const {movementAudio}=await import('./samples.mjs');
      const stopped=[],original=AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop=function(...args){stopped.push(this);return original.apply(this,args);};
      try {
        const sound=movementAudio({hit:new Uint8Array(2205)});
        for(let n=0;n<8;n++) sound('hit',360,0);
        return stopped.length;
      } finally {AudioBufferSourceNode.prototype.stop=original;}
    });
    assert.equal(interrupted,0,'One-shot effects sharing a Paula channel must overlap.');
    const poisoned=warningPixels('Poisoned'),drowning=warningPixels('Drowning');
    const hazard=structuredClone(initial),patient=hazard.state.members[0],mech=hazard.state.members[2];
    Object.assign(patient,{x:7,y:8,floor:9,dir:1,poison:655,poisonCount:100,underwater:0,held:{id:64,damage:0,ammo:0}});
    Object.assign(mech,{x:8,y:8,floor:9,underwater:99});
    const cell=(9*23+8)*23+7,deep=1|4|(2<<17);
    hazard.machines.changes.push([cell,deep],[cell+1,deep]);
    await restore(hazard);await advance(1000,1);
    assert.notDeepEqual(await readWarning(),drowning);
    await advance(20,32);
    assert.deepEqual(await readWarning(),poisoned);
    await canvas.screenshot({path:'build/comparison/native-poisoned.png'});
    await advance(20,32);assert.notDeepEqual(await readWarning(),poisoned);
    await advance(20,32);await page.keyboard.press('Space');
    assert.notDeepEqual(await readWarning(),poisoned);
    patient.underwater=Math.floor(eq.characters[0].physique*patient.fitness/655/400);
    await restore(hazard);await advance(20,32);await advance(1000,1);
    assert.deepEqual(await readWarning(),drowning);
    assert.notDeepEqual(await readWarning(2),drowning);
    await canvas.screenshot({path:'build/comparison/native-drowning.png'});
    await savePosition();
    const surfaced=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.equal(surfaced.state.members[0].drowningFrames,150);
    surfaced.machines.changes.push([cell,1]);
    await restore(surfaced);await advance(1000,1);await advance(20,149);
    assert.deepEqual(await readWarning(),drowning);
    await advance(20,1);assert.notDeepEqual(await readWarning(),drowning);
    await advance(20,10);assert.deepEqual(await readWarning(),poisoned);
    console.log('Passed CD32 poison blinking, medical pack cure, drowning priority, mech immunity, and warning expiry after surfacing.');
    const passage=structuredClone(initial),lead=passage.state.members[0],mate=passage.state.members[1];
    const pathKey=(9*23+8)*23+8;
    Object.assign(lead,{x:8,y:8,floor:9,dir:1,held:{id:87,ammo:2,damage:0}});
    Object.assign(mate,{x:9,y:8,floor:9,dir:3});
    passage.machines.changes.push([pathKey,1],[pathKey+1,1]);
    await restore(passage);
    await page.keyboard.press('Space');await advance(20,5);
    const observer=page.locator('main button canvas').nth(1);
    const scenePixels=node=>node.evaluate(c=>Array.from(c.getContext('2d').getImageData(2,14,143,84).data));
    const shield=await scenePixels(observer);await advance(20,1);
    assert.notDeepEqual(await scenePixels(observer),shield);
    await observer.screenshot({path:'build/comparison/native-psi-shield.png'});
    await page.keyboard.press('ArrowUp');await savePosition();
    const swapped=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.equal(swapped.state.members[0].x,9);assert.equal(swapped.state.members[1].x,8);
    passage.machines.changes.push([pathKey+1,3|(3<<11)]);
    Object.assign(mate,{y:9});
    await restore(passage);
    const portal=await scenePixels(canvas);await advance(20,1);
    assert.notDeepEqual(await scenePixels(canvas),portal);
    await canvas.screenshot({path:'build/comparison/native-exit-field.png'});
    await page.keyboard.press('ArrowUp');assert.match(await canvas.locator('..').getAttribute('aria-label'),/Exited/);
    await canvas.screenshot({path:'build/comparison/native-exited.png'});
    await page.keyboard.press('F1');assert.match(await canvas.locator('..').getAttribute('aria-label'),/View/);
    passage.state.members.slice(1).forEach(p=>p.exited=true);
    await restore(passage);await page.keyboard.press('ArrowUp');
    await page.waitForURL(/map=1&result=/);await page.locator('#deploy').waitFor();
    assert.equal(await page.locator('#level').inputValue(),'1');
    const group=structuredClone(initial);
    Object.assign(group.state.members[0],{x:8,y:8,floor:9,dir:1,path:[]});
    Object.assign(group.state.members[1],{x:7,y:8,floor:9,dir:1,path:[]});
    group.machines.changes.push(...[-1,0,1,2].map(dx=>[pathKey+dx,1]));
    await restore(group);
    async function teamSquare(i){
      const r=await page.locator('main button canvas').nth(i).boundingBox();
      await page.mouse.click(r.x+148*r.width/160,r.y+14*r.height/103);
    }
    const fitnessDots=await canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(112,5,4,1).data));
    assert.deepEqual(fitnessDots.slice(0,4),fitnessDots.slice(8,12));
    assert.notDeepEqual(fitnessDots.slice(0,4),fitnessDots.slice(4,8));
    await teamSquare(0);await teamSquare(1);await page.keyboard.press('1');await page.keyboard.press('ArrowUp');
    await advance(200,1);await savePosition();
    const team=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.equal(team.leader,0);assert.equal(team.state.members[1].x,8);assert.ok(team.state.members[1].inTeam);
    await restore(team);await teamSquare(1);await page.keyboard.press('1');await page.keyboard.press('ArrowUp');
    await advance(200,2);await savePosition();
    const detached=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.equal(detached.state.members[1].x,8);assert.equal(detached.state.members[1].inTeam,false);
    const signScene=structuredClone(initial);
    Object.assign(signScene.state.members[0],{x:8,y:9,floor:6,dir:1});
    await restore(signScene);
    const signed=await scenePixels(canvas);await canvas.screenshot({path:'build/comparison/native-wall-sign.png'});
    // The front panel's opaque face has color index zero. Both this and index
    // five display as black before Drawviews.s ORs the two lettering planes.
    const signKey=(6*23+9)*23+9;
    const signId=(level.cell(9,9,6).terrain>>>23)&31;
    async function checkSignColors(map,signId){
      const pixelsOnSign=await canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(50,36,48,40).data));
      const signPalette=fs.readFileSync('build/preview/view-palette.bin');
      let verified=0;
      for(let y=0;y<40;y++) for(let x=5;x<42;x++){
        const i=y*48+x,at=signId*480+(i>>3),bit=128>>(i&7);
        const ink=Number(!!(map.signs[at]&bit))+2*Number(!!(map.signs[at+240]&bit));
        if(!ink) continue;
        assert.deepEqual(pixelsOnSign.slice(i*4,i*4+3),[...signPalette.subarray(ink*3,ink*3+3)]);
        verified++;
      }
      assert.ok(verified>100);
    }
    await checkSignColors(level,signId);
    signScene.machines.changes.push([signKey,level.cell(9,9,6).terrain&~8]);
    await restore(signScene);assert.notDeepEqual(await scenePixels(canvas),signed);
    console.log('Passed squad swap, external shield, animated exit field, exit and return, mission completion, and wall sign rendering.');
    const panelSave=structuredClone(initial);
    Object.assign(panelSave.state.members[0],{x:15,y:7,floor:9,dir:1,held:{id:gun,ammo:9,damage:0}});
    for(const input of ['mouse','keyboard']) {
      await restore(panelSave);
      if(input==='keyboard') await page.keyboard.press('e');
      else {
        const rect=await canvas.boundingBox();
        await page.mouse.click(rect.x+72*rect.width/160,rect.y+52*rect.height/103);
      }
      await savePosition();
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
      assert.equal(saved.state.members[0].held.ammo,9);
      assert.equal(saved.machines.lifts[0].dir,2);
    }
    await restore(panelSave);await page.keyboard.press('Space');await savePosition();
    const fired=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.ok(fired.state.members[0].held.ammo<9);
    assert.equal(fired.machines.lifts[0].dir,panelSave.machines.lifts[0].dir);
    for(let steps=0;steps<=4;steps++){
      const throwing=structuredClone(panelSave),p=throwing.state.members[0];
      p.held={id:27,ammo:1,damage:0};
      await restore(throwing);
      for(let n=0;n<steps;n++) await page.keyboard.press('Shift+ArrowUp');
      await page.keyboard.press('Space');await savePosition();
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
      const member=saved.state.members[0];
      assert.deepEqual([member.x,member.y,member.dir,member.held],[p.x,p.y,p.dir,null]);
      assert.equal(saved.battle.grenades[0].horizontal,(3+steps)%4);
    }
    const frame=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(52,60,42,23).data));
    const shooting=structuredClone(initial);
    shooting.state.members[0].held={id:gun,ammo:200,damage:0};
    await restore(shooting);
    const aim=await canvas.boundingBox();
    const clickView=y=>page.mouse.click(aim.x+72*aim.width/160,aim.y+y*aim.height/103);
    const before=await paints(),beforeAmmo=await page.locator('#hands').textContent();
    await clickView(52);await clickView(52);
    assert.notEqual(await page.locator('#hands').textContent(),beforeAmmo);
    assert.equal(await paints(),before,'Gunfire into a closed door only updates the HUD.');
    await restore(initial);
    const closed=await frame();
    await clickView(30);
    await page.evaluate(()=>window.clocks.get(120)());
    await page.waitForFunction(()=>window.motors.length===1);
    const firstDoorFrame=await paints();
    for(let i=0;i<3;i++) await clickView(30);
    assert.equal(await paints(),firstDoorFrame,'Bumping the moving door must not repaint between animation ticks.');
    await page.evaluate(()=>{for(let i=0;i<4;i++) window.clocks.get(120)();});
    assert.notDeepEqual(await frame(),closed);
    await canvas.screenshot({path:'build/comparison/native-door-opening.png'});
    await page.evaluate(()=>{window.motorStopped=false;window.motors[0].onended=()=>window.motorStopped=true;
      for(let i=0;i<6;i++) window.clocks.get(120)();});
    await page.waitForFunction(()=>window.motorStopped);
    await clickView(30);await savePosition();
    const through=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')).state.members[0]);
    assert.deepEqual([through.x,through.y,through.floor],[x,y,z]);
    // Shallow water on the same cell as an opaque wall is behind its face.
    const wallState=structuredClone(initial);
    wallState.machines.changes.push([d.key,3]);
    await restore(wallState);
    const wallSample=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(50,55,46,18).data));
    const dryWall=await wallSample();
    wallState.machines.changes.push([d.key,3|4|(2<<17)]);
    await restore(wallState);
    assert.deepEqual(await wallSample(),dryWall);
    // Place the same observer in half-depth water and compare the source foam mask.
    initial.machines.changes.push([d.key-dx-dy*23,1|4|(1<<17)]);
    await restore(initial);
    const bytes=fs.readFileSync('build/preview/Foam.bin'),start=bytes.readUInt32BE(42);
    const foam=[...fs.readFileSync('build/preview/view-palette.bin').subarray(51,54)];
    const pixels=await canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(2,52,142,12).data));
    let matched=0;
    for(let y=0;y<12;y++) for(let x=0;x<142;x++){
      const bit=y*144+x;
      if(bytes[start+(bit>>3)]&(128>>(bit&7))){
        const at=(y*142+x)*4;
        if(foam.every((v,k)=>v===pixels[at+k])) matched++;
      }
    }
    assert.ok(matched>100,'The original foam bitmap must be visible at half depth');
    await canvas.screenshot({path:'build/comparison/native-half-water.png'});
    // The near pickup is the last auxiliary blit in shallow water. Its four
    // source colour planes reach the HUD unchanged when the water is below it.
    const shallowPickup=structuredClone(initial),location=d.key-dx-dy*23;
    shallowPickup.state.ground.push([location,{id:76,ammo:0,damage:0}]);
    const style='build/preview/styles/'+level.style+'/';
    const [offset]=JSON.parse(fs.readFileSync(style+'terrain.json'))['container'+(eq.items[76].container-1)];
    const sheet=fs.readFileSync(style+'terrain.bin'),record=offset+18+44*14;
    const w=sheet.readUInt16BE(record),h=sheet.readUInt16BE(record+2);
    const pickupX=2+sheet.readInt16BE(record+4),pickupY=14+sheet.readInt16BE(record+6);
    const data=offset+sheet.readUInt32BE(record+10),stride=w*h/8;
    const palette=fs.readFileSync('build/preview/view-palette.bin');
    await restore(shallowPickup);
    const pickupPixels=await canvas.evaluate((c,[x,y,w,h])=>Array.from(c.getContext('2d').getImageData(x,y,w,h).data),[pickupX,pickupY,w,h]);
    for(let i=0;i<w*h;i++){
      const at=data+(i>>3),mask=128>>(i&7);
      if(!(sheet[at+4*stride]&mask)) continue;
      let ink=0;
      for(let plane=0;plane<4;plane++) if(sheet[at+plane*stride]&mask) ink|=1<<plane;
      assert.deepEqual(pickupPixels.slice(i*4,i*4+3),Array.from(palette.subarray(ink*3,ink*3+3)));
    }
    // Container 4 has fifty pen-13 pixels in its near sprite. Deep water
    // selects pen 29 for all fifty. The Copper changes it to $654 in the view.
    const crate=structuredClone(initial);
    const crateId=eq.items.findIndex(item=>item?.container===5);
    crate.state.ground.push([location,{id:crateId,ammo:0,damage:0}]);
    // A controlled pen-6 patch exercises the underwater wall register on
    // each scanline, including maps whose shipped walls do not use that pen.
    const wallBytes=Buffer.from(fs.readFileSync(style+'Stone.bin'));
    const wallRecord=18+41*14,wallStart=wallBytes.readUInt32BE(wallRecord+10);
    const wallStride=wallBytes.readUInt16BE(wallRecord)*wallBytes.readUInt16BE(wallRecord+2)/8;
    for(let n=0;n<4;n++) wallBytes.fill((6&(1<<n))?255:0,wallStart+n*wallStride,wallStart+(n+1)*wallStride);
    await page.route('**/Stone.bin',route=>route.fulfill({body:wallBytes}));
    crate.machines.changes.push([location,1],[d.key,3]);
    await restore(crate);
    const rgbScene=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(2,14,144,84).data));
    const dry=await rgbScene();
    crate.machines.changes.push([location,1|4|(3<<17)]);
    await restore(crate);
    const deepView=await rgbScene(),mist=JSON.parse(fs.readFileSync('build/preview/sky.json')).scotch_mist;
    let crateHighlights=0,wallHighlights=0;
    for(let y=16;y<84;y++) for(let x=0;x<140;x++){
      const i=(144*y+x)*4;
      if(x>=2 && x<34 && y>=50 && y<82 && [153,102,34].every((v,k)=>dry[i+k]===v)){
        assert.deepEqual(deepView.slice(i,i+3),[102,85,68]);crateHighlights++;
      }
      if(x>=40 && dry.slice(i,i+3).every(v=>v===255)){
        assert.deepEqual(deepView.slice(i,i+3),mist[level.sky*44+Math.min(43,y+2)]);wallHighlights++;
      }
    }
    assert.equal(crateHighlights,50);
    assert.ok(wallHighlights>0);
    await page.unroute('**/Stone.bin');
    const locked=level.doors.find(d=>d.key && d.dir===3 && d.lock>=73 && !d.buttonOnly);
    const keyPos=locked.key, lx=keyPos%23,ly=Math.floor(keyPos/23)%23,lz=Math.floor(keyPos/529);
    Object.assign(player,{x:lx-1,y:ly,floor:lz,dir:1,held:null,pack:[]});
    initial.machines.changes.push([keyPos-1,1]);
    await restore(initial);
    const notice=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(3,59,48,38).data));
    const noNotice=await notice();
    await page.keyboard.press('ArrowUp');
    assert.match(await page.locator('#feedback').textContent(),/Requires/);
    const needsKey=await notice();assert.notDeepEqual(needsKey,noNotice);
    await canvas.screenshot({path:'build/comparison/native-wafer-required.png'});
    await page.evaluate(()=>{for(let i=0;i<100;i++) window.clocks.get(20)();});
    assert.deepEqual(await notice(),noNotice);
    player.pack=[{id:locked.lock,ammo:0,damage:0}];
    await restore(initial);await page.keyboard.press('ArrowUp');
    assert.match(await page.locator('#feedback').textContent(),/Used/);
    assert.notDeepEqual(await notice(),needsKey);
    await canvas.screenshot({path:'build/comparison/native-wafer-used.png'});
    const lift=initial.machines.lifts[0];
    Object.assign(player,{x:lift.key%23,y:Math.floor(lift.key/23)%23,floor:lift.height});
    lift.dir=2;
    await restore(initial);
    await page.keyboard.press('1');await page.evaluate(()=>window.clocks.get(1000)());
    assert.match(await page.locator('#status').textContent(),new RegExp('Floor '+(lift.height-1)+'\\b'));
    await page.waitForFunction(()=>{window.clocks.get(20)();return window.liftVoices.length===1;},{},{timeout:5000});
    assert.equal(await page.evaluate(()=>window.liftVoices[0].loopEnd),(12666+14288)/22050);
    await page.evaluate(()=>{window.liftEnded=false;window.liftVoices[0].onended=()=>window.liftEnded=true;
      for(let i=0;i<25;i++) {window.clocks.get(1000)();window.clocks.get(20)();}});
    await page.waitForFunction(()=>window.liftEnded);

    const emptyLift=structuredClone(initial);
    emptyLift.state.members.forEach((p,i)=>{if(i) p.fitness=0;});
    const listener=emptyLift.state.members[0];
    listener.x+=2;
    emptyLift.radioLine='RADIO SCROLL TEST';emptyLift.radioX=160;
    await restore(emptyLift);await page.keyboard.press('1');await advance(1000,1);await advance(20,1);
    await page.waitForFunction(()=>{window.clocks.get(20)();return window.liftVoices.length>0;});
    assert.ok(Math.abs(await page.evaluate(()=>window.liftVoices[0].testGain.value)-28/63)<0.001,
      'An empty lift two squares away and one floor below is audible at 70% volume.');
    const animation=page.locator('#ticker canvas');
    const scrollX=()=>animation.evaluate(c=>new DOMMatrix(getComputedStyle(c).transform).m41);
    const beforeScroll=await scrollX();
    await page.waitForFunction(x=>new DOMMatrix(getComputedStyle(document.querySelector('#ticker canvas')).transform).m41<x-4,beforeScroll);
    await page.click('#menu');
    await page.waitForFunction(()=>document.querySelector('#ticker canvas').getAnimations()[0]?.playState==='paused');
    await page.click('#resume');
    Object.assign(player,{x:12,y:13,floor:14,dir:2});
    await restore(initial);
    const skyColors=JSON.parse(fs.readFileSync('build/preview/sky.json')).nosky;
    const skyRow=await canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(3,17,140,1).data));
    const expected=skyColors[level.sky*44+5];
    assert.ok(skyRow.some((v,i)=>i%4===0 && expected.every((c,k)=>skyRow[i+k]===c)));
    await canvas.screenshot({path:'build/comparison/native-open-sky.png'});

    // Exercise a refused pickup on open ground through the view's mouse gadget.
    const pos=(player.floor*23+player.y)*23+player.x;
    initial.state.ground.push([pos,{id:76,damage:7,ammo:0}]);
    player.pack=Array.from({length:30},()=>({id:76,damage:0,ammo:0}));
    await restore(initial);
    const packWarning=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(3,26,48,16).data));
    const bare=await packWarning(),box=await canvas.boundingBox();
    await page.mouse.click(box.x+22*box.width/160,box.y+80*box.height/103,{button:'right'});
    assert.match(await page.locator('#feedback').textContent(),/Pack full/);
    assert.notDeepEqual(await packWarning(),bare);
    await canvas.screenshot({path:'build/comparison/native-pack-full.png'});
    await page.evaluate(()=>{for(let i=0;i<150;i++) window.clocks.get(20)();});
    assert.deepEqual(await packWarning(),bare);
    player.pack=Array.from({length:12},()=>({id:1,damage:0,ammo:0}));
    await restore(initial);
    const heavy=await packWarning();assert.notDeepEqual(heavy,bare);
    await page.mouse.click(box.x+22*box.width/160,box.y+80*box.height/103,{button:'right'});
    assert.match(await page.locator('#feedback').textContent(),/Too heavy/);
    await canvas.screenshot({path:'build/comparison/native-too-heavy.png'});
    url=url.replace('map=1&','map=5&');
    await page.goto(url);await page.locator('#menu:enabled').waitFor();
    await savePosition();
    const eggState=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    const key=4966,actor=eggState.state.members[0];
    Object.assign(actor,{x:key%23-1,y:Math.floor(key/23)%23,floor:Math.floor(key/529),dir:1});
    const items=JSON.parse(fs.readFileSync('build/preview/equipment.json')).items;
    actor.held={id:items.findIndex(item=>item?.category===0 && item.damagePerHit && item.burst),ammo:1,damage:0};
    eggState.machines.changes.push([key-1,1]);await restore(eggState);
    await page.keyboard.press('Space');
    const view=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(38,28,70,55).data));
    const firing=await view();
    await canvas.screenshot({path:'build/comparison/native-firing.png'});
    await page.evaluate(()=>{for(let i=0;i<16;i++) window.clocks.get(20)();});
    const monster=await view();assert.notDeepEqual(firing,monster);
    await canvas.screenshot({path:'build/comparison/native-hatched-monster.png'});
    await savePosition();
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    const born=after.battle.actors.find(m=>m.x===actor.x+1 && m.y===actor.y && m.floor===actor.floor);
    assert.equal(born.type,33);
    after.battle.actors=after.battle.actors.filter(m=>m!==born);
    await restore(after);
    assert.notDeepEqual(monster,await view(),'Hatched monster sprite must change the first-person view');
    const partner=eggState.state.members[1];
    Object.assign(partner,{x:actor.x+1,y:actor.y,floor:actor.floor,fitness:65535});
    await restore(eggState);
    const victim=page.locator('main button canvas').nth(1);
    const wounded=()=>victim.evaluate(c=>Array.from(c.getContext('2d').getImageData(40,38,46,28).data));
    await page.evaluate(()=>{for(let i=0;i<100;i++) window.clocks.get(20)();});
    const beforeShot=await wounded();
    await page.keyboard.press('Space');assert.notDeepEqual(await wounded(),beforeShot);
    assert.ok((await page.evaluate(()=>window.cues)).some(c=>c.length===sampleLength('FemaleGrunt') && c.period>=198 && c.period<=325));
    await victim.screenshot({path:'build/comparison/native-hit.png'});
    await page.evaluate(()=>{for(let i=0;i<5;i++) window.clocks.get(20)();});
    assert.deepEqual(await wounded(),beforeShot);
    partner.fitness=655;partner.held={id:76,ammo:0,damage:2};
    eggState.machines.changes.push([key,1]);
    await restore(eggState);await page.keyboard.press('Space');
    assert.ok((await page.evaluate(()=>window.cues)).some(c=>c.length===sampleLength('EchoScream') && c.period===180));
    assert.match(await victim.locator('..').getAttribute('aria-label'),/MIA/);
    await page.evaluate(()=>{for(let i=0;i<16;i++) window.clocks.get(20)();});
    await canvas.screenshot({path:'build/comparison/native-squad-remains.png'});
    await page.keyboard.press('ArrowUp');
    assert.match(await page.locator('#ground').textContent(),/SECURITY ACCESS WAFER/);
    const pickupBox=await canvas.boundingBox();
    await page.mouse.click(pickupBox.x+22*pickupBox.width/160,pickupBox.y+80*pickupBox.height/103,{button:'right'});
    assert.match(await page.locator('#feedback').textContent(),/Picked up/);

    // Use the same camera and source monster definition, then remove the remains
    // from a copy of the finished state to isolate the corpse's rendered pixels.
    after.battle.actors.push({...born,fitness:1});
    after.state.members[0].held={...actor.held,ammo:1};
    after.machines.changes.push([key,1]);
    await restore(after);await page.keyboard.press('Space');
    await page.evaluate(()=>{for(let i=0;i<16;i++) window.clocks.get(20)();});
    const remains=await view();await canvas.screenshot({path:'build/comparison/native-monster-remains.png'});
    await savePosition();
    const cleared=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.ok(!cleared.battle.actors.some(m=>m.x===born.x && m.y===born.y && m.floor===born.floor));
    cleared.machines.changes.push([key,1]);await restore(cleared);
    assert.notDeepEqual(await view(),remains);
    const attacker={...born,fitness:65535,wait:1};
    after.battle.actors=[attacker];
    after.state.members[0].held=null;
    after.machines.changes.push([key,1]);await restore(after);
    const preClaw=await view();await page.evaluate(()=>window.clocks.get(200)());
    assert.ok((await page.evaluate(()=>window.cues)).some(c=>c.length===sampleLength('Swish') && c.period>=134 && c.period<=261));
    const attacked=await view();assert.notDeepEqual(attacked,preClaw);
    await advance(20,24);await canvas.screenshot({path:'build/comparison/native-melee-hit.png'});const lunge=await view();await advance(20,1);assert.notDeepEqual(await view(),lunge);

    const scene=structuredClone(after);
    scene.battle.actors=[];scene.battle.flames=[{x:born.x,y:born.y,floor:born.floor,density:4,flip:false}];
    await restore(scene);
    const firePixels=await view();
    assert.ok(firePixels.some((v,i)=>i%4===0 && v===255 && firePixels[i+1]===159 && firePixels[i+2]===90),'Source orange explosion pixels');
    await canvas.screenshot({path:'build/comparison/native-grenade-explosion.png'});
    scene.battle.flames=[];
    scene.battle.grenades=[{x:born.x,y:born.y,floor:born.floor,height:0}];
    await restore(scene);const low=await view();
    scene.battle.grenades[0].height=25;await restore(scene);assert.notDeepEqual(low,await view());
    url=url.replace('map=5&','map=18&');
    await page.goto(url);await page.locator('#menu:enabled').waitFor();
    await savePosition();
    const waterState=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    Object.assign(waterState.state.members[0],{x:16,y:9,floor:10,dir:3});
    await restore(waterState);
    const waterPixels=await view();
    assert.ok(!waterPixels.some((v,i)=>i%4===0 && v>200 && waterPixels[i+1]<60 && waterPixels[i+2]>200));
    assert.ok(waterPixels.some((v,i)=>i%4===0 && foam.every((c,k)=>c===waterPixels[i+k])));
    await canvas.screenshot({path:'build/comparison/native-style2-water.png'});
    url=url.replace('map=18&','map=7&');
    await page.goto(url);await page.locator('#menu:enabled').waitFor();
    await savePosition();
    const holding=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    Object.assign(holding.state.members[0],{x:6,y:6,floor:11,dir:0});
    await restore(holding);
    const depot=readLevel(fs.readFileSync('build/preview/maps/7.map'));
    assert.equal((depot.cell(6,5,11).terrain>>>23)&31,6);
    await checkSignColors(depot,6);
    await canvas.screenshot({path:'build/comparison/native-secure-holding.png'});
    console.log('Verified the Secure Holding sign in Abandoned Depot against the CD32 sign planes.');
    url=url.replace(/map=\d+/,'map=11');await page.goto(url);await page.locator('#menu:enabled').waitFor();
    await savePosition();
    const puzzle=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    const block=puzzle.machines.pushables[0],mover=puzzle.state.members[0];
    Object.assign(mover,{x:block%23-1,y:Math.floor(block/23)%23,floor:Math.floor(block/529),dir:1});
    puzzle.machines.changes.push([block-1,1],[block-2,1]);
    puzzle.battle.actors=[];
    await restore(puzzle);await page.keyboard.press('Shift+ArrowDown');await savePosition();
    const pulled=await page.evaluate(()=>JSON.parse(localStorage.getItem('hiredguns.mission.v1')));
    assert.equal(pulled.machines.pushables[0],block-1);
    assert.equal(pulled.state.members[0].x,mover.x-1);
    const defeat=structuredClone(puzzle);
    defeat.state.members.forEach((p,i)=>Object.assign(p,{fitness:i===0?655:0,underwater:200,exited:false}));
    const lastAlive=defeat.state.members[0];
    defeat.machines.changes.push([(lastAlive.floor*23+lastAlive.y)*23+lastAlive.x,1|4|(3<<17)]);
    await restore(defeat);
    assert.equal(await page.locator('#death').isVisible(),false);
    await advance(1000,1);
    const deathScreen=page.locator('#death[open]');
    await deathScreen.waitFor();
    assert.equal(await deathScreen.locator('img').evaluate(img=>img.complete && img.naturalWidth===320),true);
    await deathScreen.press('Enter');
    await page.locator('#front').waitFor();
    console.log('Passed armed panel use, grenade height and explosion colors, Floor 10 water, injury, death and monster attack audio.');
    console.log('Passed door animation, wafer prompts, lift and door audio, sky, water, pack limit, firing, injury, egg hatch, and squad and monster remains.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
