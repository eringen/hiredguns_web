// End the mission through the normal exit handler with a disposable copy of map 7.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {chromium,webkit}=require('playwright');
(async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hg-shared-map-')),preview=path.resolve('build/preview'),build=path.join(tmp,'build/preview');
  let server,chrome,safari;
  try{
    fs.mkdirSync(path.join(build,'maps'),{recursive:true});
    for(const name of fs.readdirSync(preview)) if(name!=='maps') fs.symlinkSync(path.join(preview,name),path.join(build,name));
    for(const name of fs.readdirSync(path.join(preview,'maps'))) if(name!=='7.map') fs.symlinkSync(path.join(preview,'maps',name),path.join(build,'maps',name));
    const bytes=fs.readFileSync(path.join(preview,'maps/7.map'));
    const {readLevel}=await import('../src/level.mjs');
    const level=readLevel(bytes);
    for(const {x,y,floor} of level.starts.slice(0,2)){
      const pos=level.terrainOffset+542+4*((floor*level.depth+y)*level.width+x);
      bytes.writeUInt32BE(1,pos);
      bytes.writeUInt32BE(3<<11|3,pos-4*level.width);
    }
    fs.writeFileSync(path.join(build,'maps/7.map'),bytes);
    for(const name of ['src','node_modules']) fs.symlinkSync(path.resolve(name),path.join(tmp,name));
    fs.mkdirSync(path.join(tmp,'tools'));
    const file=path.join(tmp,'tools/multiplayer-server.mjs');
    fs.copyFileSync('tools/multiplayer-server.mjs',file);
    server=spawn(process.execPath,[file],{env:{...process.env,PORT:'0'}});
    const [line]=await once(server.stdout,'data'),port=line.toString().trim().split(':').pop();
    chrome=await chromium.launch({channel:'chrome'});safari=await webkit.launch();
    const host=await chrome.newPage(),guest=await safari.newPage();
    for(const p of [host,guest]) await p.addInitScript(()=>{
      window.WebSocket=class extends WebSocket{constructor(...args){super(...args);window.gameSocket=this;}};
      const ctx=CanvasRenderingContext2D.prototype,fill=ctx.fillRect,img=ctx.drawImage;
      ctx.drawImage=function(source,...args){
        if(this.canvas.id==='mission-screen' && source.src?.endsWith('/world.png')) window.camera=args.slice(0,2);
        if(this.canvas.id==='mission-screen' && source.src?.includes('/map-cross')) window.crossX=args[0];
        return img.call(this,source,...args);
      };
      ctx.fillRect=function(x,y,w,h){
        if(this.canvas.id==='mission-screen' && w===640 && h===2 && this.fillStyle==='#ff3333') window.crossY=y;
        if(this.canvas.id==='mission-screen' && w===2 && h===320 && this.fillStyle==='#ff3333') window.crossX=x;
        return fill.call(this,x,y,w,h);
      };
    });
    const view=p=>p.evaluate(()=>JSON.stringify([camera,crossX,crossY,document.querySelector('#level').value]));
    const matches=async expected=>guest.waitForFunction(e=>JSON.stringify([camera,crossX,crossY,document.querySelector('#level').value])===e,expected);
    await host.goto('http://localhost:'+port+'/?room=new-2&map=7');await host.locator('aside button').waitFor();
    await guest.goto(host.url());await guest.locator('aside button').waitFor();
    await host.keyboard.press('ArrowUp');await guest.keyboard.press('ArrowUp');
    for(const p of [host,guest]) await p.locator('#world').waitFor();
    await host.keyboard.down('ArrowRight');await host.waitForTimeout(300);await host.keyboard.up('ArrowRight');
    await host.waitForTimeout(1400);
    const keyboard=await view(host);await matches(keyboard);
    await guest.keyboard.press('ArrowLeft');
    await guest.evaluate(()=>gameSocket.send(JSON.stringify({slot:1,chart:{x:780,y:280,sx:440,sy:190,replay:false}})));
    await host.waitForTimeout(150);
    assert.equal(await view(host),keyboard);assert.equal(await view(guest),keyboard);
    const bounds=await host.locator('#world').boundingBox();
    await host.mouse.click(bounds.x+20,bounds.y+40);await host.waitForTimeout(1600);
    const pointer=await view(host);assert.notEqual(pointer,keyboard);await matches(pointer);
    await guest.reload();await guest.locator('#world').waitFor();await matches(pointer);
    console.log('Campaign exit, host keyboard and mouse, matching rendered crosshair and camera, guest input rejection, and reconnect passed.');
  }finally{
    await chrome?.close();await safari?.close();server?.kill();fs.rmSync(tmp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
