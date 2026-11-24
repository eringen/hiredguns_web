import {physique} from './psionics.mjs';
import {fireSprites} from './fire-sprites.mjs';
import {mapTile,scannerType} from './dts.mjs';
export function hudFont(font){
  const fontStart = new DataView(font.buffer).getUint32(0);
  return function text(ctx,value,x,y,color='#e2d7b9') {
    ctx.fillStyle=color;
    for(const char of String(value)) {
      const n=char.charCodeAt(0)-32;
      if(n<0 || n>=95) continue;
      for(let row=0;row<6;row++) {
        const pos=fontStart+n*12+row*2;
        const mask=font[pos]*256+font[pos+1];
        for(let col=0;col<16;col++) if(mask & (32768>>col)) ctx.fillRect(x+col,y+row,1,1);
      }
      x+=font[20+n];
    }
  }
}
// GameFast.dat/Windows.s and Drawviews.s use four interchangeable 160×103 windows.
export async function hudGraphics(load, palette, equipment, level, prefix) {
  async function image(path) {
    const img = new Image();
    img.src=path;
    await img.decode();
    return img;
  }
  const [frames,font,compasses] = await Promise.all([
    Promise.all([0,1,2,3].map(i=>image('art/window'+i+'.png'))),
    load('hud-font.bin'),
    Promise.all(Array.from('nesw',dir=>load('compass-'+dir+'.bin')))
  ]);
  const [blocks,...lines]=await Promise.all([prefix+'MapBlocks.bin','VertLine.bin','HorizLine.bin','Rotations.bin'].map(load));
  const tiles=new Map();
  function tile(id,lit) {
    const key=id+(lit?64:0);
    if (!tiles.has(key)) {
      const c=document.createElement('canvas');
      c.width=c.height=16;
      const ctx=c.getContext('2d'), pixels=ctx.createImageData(16,16);
      for(let i=0;i<256;i++) {
        let color=0;
        for(let plane=0;plane<4;plane++) {
          color|=((blocks[18+id*128+plane*32+(i>>3)]>>(7-(i&7)))&1)<<plane;
        }
        if(lit && palette.length>=96) color+=16;
        pixels.data.set(palette.subarray(color*3,color*3+3),i*4);
        pixels.data[i*4+3]=255;
      }
      ctx.putImageData(pixels,0,0);
      tiles.set(key,c);
    }
    return tiles.get(key);
  }
  const indicators=lines.map((bytes,i)=>Array.from({length:i===2?4:1},(_,j)=>planar(bytes,18+j*14,4,true)));
  const infoBytes=await load('info-panel.bin');
  const infoPanel=document.createElement('canvas');infoPanel.width=80;infoPanel.height=79;
  const infoCtx=infoPanel.getContext('2d'), infoImage=infoCtx.createImageData(80,79);
  const windowPalette=await load('window-palette.bin');
  for(let i=0;i<80*79;i++){
    let color=0;for(let plane=0;plane<5;plane++) color|=((infoBytes[790*plane+(i>>3)]>>(7-i%8))&1)<<plane;
    infoImage.data.set(windowPalette.subarray(color*3,color*3+3),4*i);infoImage.data[4*i+3]=255;
  }
  infoCtx.putImageData(infoImage,0,0);
  const items = new Map();
  const text=hudFont(font);
  function planar(bytes,offset,count,masked) {
    const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const w=data.getUint16(offset), h=data.getUint16(offset+2), start=data.getUint32(offset+10);
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d'), pixels=ctx.createImageData(w,h), stride=w*h/8;
    for(let p=0;p<w*h;p++) {
      const b=start+(p>>3), bit=1<<(7-(p&7));
      if(masked && !(bytes[b+count*stride]&bit)) continue;
      let idx=0;
      for(let k=0;k<count;k++) if(bytes[b+k*stride]&bit) idx|=1<<k;
      pixels.data.set(palette.subarray(idx*3,idx*3+3),p*4);
      pixels.data[p*4+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    return c;
  }
  const compass=compasses.map(bytes=>planar(bytes,18,5,true));
  const rip=await load('Rip.bin');
  const mia=document.createElement('canvas');
  const record=new DataView(rip.buffer,rip.byteOffset,rip.byteLength);
  mia.width=record.getUint16(18);mia.height=record.getUint16(20);
  const miaCtx=mia.getContext('2d'),ink=record.getUint32(28);
  const teamLights=await Promise.all(['LeaderOff','Leader'].map(async name=>{
    const data=await load(name+'.bin');
    const light=document.createElement('canvas');light.width=16;light.height=7;
    const gc=light.getContext('2d'),image=gc.createImageData(16,7);
    for(let i=0;i<112;i++){
      const at=18+(i>>3),bit=128>>(i&7);if(!(data[at+70]&bit)) continue;
      let color=0;for(let n=0;n<5;n++) if(data[at+n*14]&bit) color|=1<<n;
      image.data.set(windowPalette.subarray(3*color,3*color+3),4*i);image.data[4*i+3]=255;
    }
    gc.putImageData(image,0,0);return light;
  }));
  const rgb=index=>'rgb('+windowPalette.subarray(index*3,index*3+3).join(',')+')';
  miaCtx.fillStyle=rgb(21);
  for(let i=0;i<mia.width*mia.height;i++) {
    if(rip[ink+(i>>3)]&(128>>(i&7))) miaCtx.fillRect(i%mia.width,Math.floor(i/mia.width),1,1);
  }
  const exitBytes=await load('Exit.bin'),exitSprite=document.createElement('canvas');
  const exitData=new DataView(exitBytes.buffer,exitBytes.byteOffset),exitStart=exitData.getUint32(28);
  exitSprite.width=exitData.getUint16(18);exitSprite.height=exitData.getUint16(20);
  const exitCtx=exitSprite.getContext('2d');exitCtx.fillStyle=rgb(21);
  for(let n=0;n<exitSprite.width*exitSprite.height;n++)
    if(exitBytes[exitStart+(n>>3)]&(128>>(n&7))) exitCtx.fillRect(n%exitSprite.width,Math.floor(n/exitSprite.width),1,1);
  const icons=await Promise.all([1,2,3,4].map(async n=>planar(await load('Icon'+n+'.bin'),18,5,false)));
  const fire=fireSprites(await load('fire-effects.bin'));
  const warnings={};
  for(const name of ['Locked','Locked2','Using','TooHeavy','NoRoom','Drowning','Poisoned','Invalid']) {
    const bytes=await load(name+'.bin');
    warnings[name]=planar(bytes,18,4,bytes[9]===4);
  }
  const claws={};
  for(const name of ['Claws','BigClaws']) {
    const bytes=await load(name+'.bin'),data=new DataView(bytes.buffer,bytes.byteOffset);
    const canvas=document.createElement('canvas');canvas.width=data.getUint16(18);canvas.height=data.getUint16(20);
    const ctx=canvas.getContext('2d'),start=data.getUint32(28);
    ctx.fillStyle='rgb('+palette.subarray(27,30).join(',')+')';
    for(let i=0;i<canvas.width*canvas.height;i++) if(bytes[start+(i>>3)]&(128>>(i&7))) ctx.fillRect(i%canvas.width,Math.floor(i/canvas.width),1,1);
    claws[name]=canvas;
  }
  const offline=document.createElement('canvas');
  offline.width=160;offline.height=103;
  const offlineCtx=offline.getContext('2d');offlineCtx.drawImage(frames[2],0,0);
  const faceplate=offlineCtx.getImageData(13,16,128,79);
  const colors=new Map();
  for(let i=0;i<32;i++) colors.set(windowPalette.subarray(i*3,i*3+3).join(','),i);
  const base=Uint8Array.from({length:128*79},(_,i)=>(colors.get(faceplate.data.subarray(i*4,i*4+3).join(','))??6)&30);
  const rgba=new Uint8Array(32*4);
  for(let i=0;i<32;i++){
    rgba.set(windowPalette.subarray(i*3,i*3+3),i*4);
    rgba[i*4+3]=255;
  }
  const inks=new Uint32Array(rgba.buffer),staticFrames=[];
  function drawStatic(ctx,playerIndex,refresh=false) {
    let frame=staticFrames[playerIndex];
    if(!frame){
      const image=ctx.createImageData(128,79);
      frame=staticFrames[playerIndex]={image,pixels:new Uint32Array(image.data.buffer)};
      refresh=true;
    }
    if(refresh){
      // Only the low bit of the CD32 faceplate flickers. Each random word
      // supplies that bit for 32 pixels, keeping the OFFLINE lettering intact.
      let bits=0;
      for(let i=0;i<base.length;i++){
        if((i&31)===0) bits=Math.random()*0x100000000>>>0;
        frame.pixels[i]=inks[base[i]+(bits&1)];
        bits>>>=1;
      }
    }
    ctx.putImageData(frame.image,13,16);
  }
  const faces=new Map();
  async function preload(players,figures) {
    players.forEach((p,i)=>{
      const bytes=figures[i].subarray(14224);
      faces.set(p.character.id,[planar(bytes,18,4,true),planar(bytes,32,4,true)]);
    });
    await Promise.all([...new Set(equipment.items.filter(Boolean).map(item=>item.image))].map(async id=>{
      items.set(id,await image('art/item'+id+'.png'));
    }));
  }
  function draw(ctx,scene,p,mode,index,weight,panel,playerIndex,warningClock) {
    ctx.clearRect(0,0,160,103);
    if(!p.fitness) {
      ctx.fillStyle=rgb(5);ctx.fillRect(0,0,160,103);
      ctx.drawImage(mia,23+record.getInt16(22),22+record.getInt16(24));return;
    }
    if(p.exited) {
      ctx.fillStyle=rgb(5);ctx.fillRect(0,0,160,103);
      ctx.drawImage(exitSprite,exitData.getInt16(22),22+exitData.getInt16(24));
      text(ctx,'PRESS F'+[1,3,2,4][playerIndex],32,80);text(ctx,'TO RETURN',32,87);return;
    }
    ctx.drawImage(frames[mode===6?1:mode],0,0);
    if(mode===0) {
      ctx.save();ctx.beginPath();ctx.rect(2,14,143,84);ctx.clip();ctx.drawImage(scene,2,14);
      if(p.flashFrames) {
        ctx.fillStyle='rgb('+palette.subarray(3*p.flashColor,3*p.flashColor+3).join(',')+')';
        ctx.fillRect(2,14,142,84);
      } else {
        if(p.claws) ctx.drawImage(claws.Claws,p.claws.x-18,14);
        if(p.bigClaws) ctx.drawImage(claws.BigClaws,p.bigClaws.x-30,16);
      }
      if(p.shot) fire.muzzle(ctx,p.shot,equipment.items[p.shot.id]);
      ctx.restore();
      ctx.drawImage(frames[0],0,0);
      ctx.drawImage(compass[p.dir],112,9);
      const power=panel.touchPower??panel.throwPower;
      if(power!==undefined && p.held && equipment.items[p.held.id].category===21){
        ctx.fillStyle='#000';ctx.fillRect(84,89,59,8);
        text(ctx,'THROW '+(power+1)+'/4',86,90);
      }
    }
    ctx.save();
    if(mode) {ctx.beginPath();ctx.rect(0,0,mode===1 || mode===6?32:48,10);ctx.clip();}
    ctx.drawImage(faces.get(p.character.id)[mode===0?0:1],0,0);ctx.restore();
    if(mode===1 || mode===6) {
      function itemAt(item,x,y) {
        const art=item && items.get(equipment.items[item.id].image);
        if(art) ctx.drawImage(art,Math.round(x-art.width/2),Math.round(y-art.height/2));
      }
      ctx.save();ctx.beginPath();ctx.rect(0,18,80,75);ctx.clip();
      for(let d=-3;d<=3;d++) itemAt(p.pack[index+d],33,55+14*d);
      ctx.restore();
      if(mode===6){
        ctx.drawImage(infoPanel,0,18);
        if(p.held) equipment.items[p.held.id].info.forEach((line,i)=>text(ctx,line,1,20+i*7));
      }
      itemAt(p.held,116,54);
      if(p.held) {
        const def=equipment.items[p.held.id];
        const [first,second,ammo,wear]=def.labels;
        [first,second,ammo.replace(/^X+/,p.held.ammo),wear.replace(/^X+/,Math.floor(p.held.damage*25600/(def.maxDamage||1)))].forEach((line,i)=>{
          const width=[...line].reduce((w,c)=>w+(font[20+c.charCodeAt(0)-32]??0),0);
          text(ctx,line,116-Math.floor(width/2),[22,29,76,83][i]);
        });
      }
    } else if(mode===2) {
      const scanner=scannerType(p);
      ctx.save();ctx.beginPath();ctx.rect(13,16,128,79);ctx.clip();
      if(scanner) {
        for(let dy=-2;dy<=2;dy++) for(let dx=-4;dx<=4;dx++) {
          const x=panel.x+dx,y=panel.y+dy;
          const id=mapTile(level,x,y,p.floor,playerIndex,scanner,panel.seen);
          const lit=id!==0 && id!==39 && !!(level.cell(x,y,p.floor).contents>>>31);
          ctx.drawImage(tile(id,lit),69+dx*16,48+dy*16);
        }
        const px=(p.x-panel.x)*16,py=(p.y-panel.y)*16;
        ctx.drawImage(indicators[0][0],77+px,15);
        ctx.drawImage(indicators[1][0],12,55+py);
        ctx.drawImage(indicators[2][p.dir],70+px,48+py);
      } else drawStatic(ctx,playerIndex);
      ctx.restore();
      if(scanner) text(ctx,Math.floor(2*Math.hypot(p.x-level.exit.x,p.y-level.exit.y,p.floor-level.exit.floor)),144,52);
    } else if(mode===3) {
      const stats=[Math.floor(p.fitness/655),physique(p),p.character.agility,p.character.experience+(p.psiExperience??0),Math.floor(weight/1000)];
      stats.forEach((v,i)=>text(ctx,v,113,41+i*10,i===0 && p.poison?rgb(18):undefined));
    }
    if(!mode && p.powers){
      let x=127;
      ['shield','strength','wings','water'].forEach((slot,i)=>{if(p.powers[slot]) {ctx.drawImage(icons[i],x,81);x-=17;}});
    }
    if(!mode && p.invalidFrames) ctx.drawImage(warnings.Invalid,3,60);
    if(!mode && p.lockFrames) {
      const {key,used}=p.lockNotice;
      if(key) {
        ctx.drawImage(warnings.Locked,3,59);
        if(used) ctx.drawImage(warnings.Using,3,64);
        const art=items.get(equipment.items[key].image);
        ctx.save();ctx.shadowColor=rgb(5);ctx.shadowOffsetX=2;ctx.shadowOffsetY=2;
        ctx.drawImage(art,27+equipment.items[key].imageOffset[0],82+equipment.items[key].imageOffset[1]);ctx.restore();
      } else ctx.drawImage(warnings.Locked2,4,72);
    }
    if(mode===0 || mode===1 || mode===6) {
      if(p.noRoomFrames) ctx.drawImage(warnings.NoRoom,3,26);
      else if(mode!==6 && Math.floor(weight/140)>physique(p)) ctx.drawImage(warnings.TooHeavy,3,26);
    }
    if(mode===0 && !p.exited) {
      if(p.drowningFrames) ctx.drawImage(warnings.Drowning,3,43);
      else if(p.poison && (warningClock&32)) ctx.drawImage(warnings.Poisoned,3,43);
    }
    const length=p.fitness?1+(p.fitness>>>11):0;
    // Main.s sets plane 3 and changes plane 0 over the existing striped Windows art.
    for(let i=0;i<32;i++){
      const base=i%2?8:7,idx=(base|8)&~1;
      const color=idx+Number(i>=length);
      ctx.fillStyle=({8:'#44ff44',9:'#ff4444',14:'#440000',15:'#330000'})[color];
      ctx.fillRect(112+i,5,1,2);
    }
    ctx.drawImage(teamLights[Number(!!p.inTeam)],mode===0?145:mode===2?143:147,11);
    if(p.healthFrames) fire.health(ctx);

  }
  return {preload,draw,drawStatic,text,width:value=>[...value].reduce((w,c)=>w+(font[20+c.charCodeAt(0)-32]??0),0)};
}
