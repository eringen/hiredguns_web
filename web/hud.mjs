import {physique} from './psionics.mjs';
import {fireSprites} from './fire-sprites.mjs';
import {mapTile,scannerType} from './dts.mjs';
export async function loadHudFont() {
  const [meta,image]=await Promise.all([fetch('art/hud.json').then(r=>r.json()),loadImage('art/hud-font.png')]);
  return {image,widths:meta.fontWidths};
}
async function loadImage(path) { const image=new Image();image.src=path;await image.decode();return image; }
export function hudFont(font){
  const tinted=new Map();
  return function text(ctx,value,x,y,color='#e2d7b9') {
    if(!tinted.has(color)) {
      const c=document.createElement('canvas');c.width=font.image.width;c.height=6;
      const gc=c.getContext('2d');gc.drawImage(font.image,0,0);gc.globalCompositeOperation='source-in';gc.fillStyle=color;gc.fillRect(0,0,c.width,6);tinted.set(color,c);
    }
    for(const char of String(value)) {const n=char.charCodeAt(0)-32;if(n<0||n>=95)continue;ctx.drawImage(tinted.get(color),n*16,0,16,6,x,y,16,6);x+=font.widths[n];}
  };
}
// GameFast.dat/Windows.s and Drawviews.s use four interchangeable 160×103 windows.
export async function hudGraphics(load, palette, equipment, level, prefix) {
  const image=loadImage;
  const meta=await fetch('art/hud.json').then(r=>r.json());
  const [frames,font,compass,infoPanel,teamLights]=await Promise.all([
    Promise.all([0,1,2,3].map(i=>image('art/window'+i+'.png'))),loadHudFont(),
    Promise.all(Array.from('nesw',d=>image('art/compass-'+d+'.png'))),image('art/info-panel.png'),
    Promise.all(['LeaderOff','Leader'].map(n=>image('art/'+n+'.png')))
  ]);
  const windowPalette=Uint8Array.from(meta.windowPalette),items=new Map(),text=hudFont(font);
  const rgb=index=>'rgb('+windowPalette.subarray(index*3,index*3+3).join(',')+')';
  const style=prefix.split('/').filter(Boolean).pop();
  const tiles=await Promise.all([0,1].map(lit=>Promise.all(Array.from({length:64},(_,id)=>image('art/map-'+style+'-'+id+'-'+lit+'.png')))));
  const tile=(id,lit)=>tiles[Number(!!lit)][id];
  const indicators=await Promise.all(['VertLine','HorizLine','Rotations'].map((name,i)=>Promise.all(Array.from({length:i===2?4:1},(_,j)=>image('art/'+name+j+'.png')))));
  const [mia,exitSprite]=await Promise.all(['Rip','Exit'].map(n=>image('art/'+n+'.png')));
  const icons=await Promise.all([1,2,3,4].map(n=>image('art/hud-Icon'+n+'.png')));
  const fire=await fireSprites(image,meta.fire);
  const warnings={},claws={};
  await Promise.all(['Locked','Locked2','Using','TooHeavy','NoRoom','Drowning','Poisoned','Invalid'].map(async n=>warnings[n]=await image('art/hud-'+n+'.png')));
  await Promise.all(['Claws','BigClaws'].map(async n=>claws[n]=await image('art/'+n+'.png')));
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
  async function preload(players) {
    await Promise.all(players.map(async p=>faces.set(p.character.id,await Promise.all([0,1].map(i=>image('art/figure'+p.character.id+'-face'+i+'.png'))))));
    await Promise.all([...new Set(equipment.items.filter(Boolean).map(item=>item.image))].map(async id=>{
      items.set(id,await image('art/item'+id+'.png'));
    }));
  }
  function draw(ctx,scene,p,mode,index,weight,panel,playerIndex,warningClock) {
    ctx.clearRect(0,0,160,103);
    if(!p.fitness) {
      ctx.fillStyle=rgb(5);ctx.fillRect(0,0,160,103);
      ctx.drawImage(mia,23+meta.Rip.x,22+meta.Rip.y);return;
    }
    if(p.exited) {
      ctx.fillStyle=rgb(5);ctx.fillRect(0,0,160,103);
      ctx.drawImage(exitSprite,meta.Exit.x,22+meta.Exit.y);
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
          const width=[...line].reduce((w,c)=>w+(font.widths[c.charCodeAt(0)-32]??0),0);
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
  return {preload,draw,drawStatic,text,width:value=>[...value].reduce((w,c)=>w+(font.widths[c.charCodeAt(0)-32]??0),0)};
}
