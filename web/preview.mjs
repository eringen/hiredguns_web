import {advanceEffects,syncEffects} from './effects.mjs';
import {fieldAction,keyAction,followLeader} from './controls.mjs';
import {agePowers} from './psionics.mjs';
import {fieldAnimation,fieldInk} from './field.mjs';
import {missionMenu} from './mission-menu.mjs';
import {openingCards} from './front.mjs';
import {missionSky} from './sky.mjs';
import {chatter} from './chatter.mjs';
import {combat} from './combat.mjs';
import {machinery} from './machinery.mjs';
import {scanTerrain,scrollMap,scannerType} from './dts.mjs';
import {hudGraphics} from './hud.mjs';
import {inventorySession} from './inventory.mjs';
import {extraSamples,movementAudio,ambientAudio,environmentSound} from './samples.mjs';
import {readLevel} from './level.mjs';

const handheld=/iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.userAgentData?.mobile ||
  (/Android/i.test(navigator.userAgent) && matchMedia('(any-pointer: coarse)').matches) ||
  (navigator.platform==='MacIntel' && /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints>1);
const portrait=matchMedia('(orientation: portrait)');
if(handheld){
  document.documentElement.classList.add('handheld');
  document.querySelector('meta[name="viewport"]').content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=contain';
  const viewport=window.visualViewport;
  if(viewport){
    const style=document.documentElement.style;
    function fitViewport(){
      style.setProperty('--screen-height',viewport.height+'px');
      style.setProperty('--visible-width',viewport.width+'px');
      style.setProperty('--visible-left',viewport.offsetLeft+'px');
      style.setProperty('--visible-top',viewport.offsetTop+'px');
    }
    fitViewport();
    viewport.addEventListener('resize',fitViewport);
    viewport.addEventListener('scroll',fitViewport);
  }
  for(const type of ['gesturestart','gesturechange','gestureend'])
    document.addEventListener(type,e=>e.preventDefault(),{passive:false});
  document.addEventListener('keydown',e=>{if(portrait.matches){e.preventDefault();e.stopImmediatePropagation();}},true);
}

// Evaluating the bare name in the developer console reveals the HTML controls.
Object.defineProperty(window,'details',{get(){
  document.documentElement.classList.add('show-details');
  return 'Gameplay details shown';
}});

async function load(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Could not load ' + path);
  return new Uint8Array(await response.arrayBuffer());
}

// Each projected sprite has four colour planes followed by the blitter mask.
function spriteSheet(bytes, palette, water=false, count=67, planes=[0,1,2,3]) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const images = new Map();
  return Array.from({length:count}, (_, i) => {
    const offset = 18 + i * 14;
    const [w,h,x,y,control] = Array.from({length:5}, (_, j) => data.getInt16(offset+2*j));
    if (!w || !h || control === 3) return null;
    const start = data.getUint32(offset+10);
    const key = [start,w,h].join(',');
    if (images.has(key)) return {canvas:images.get(key),x,y,control};
    const stride = w*h/8;
    const canvas = document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    // The scene compositor reads these pixels for palette masks. Keep its sprite sources in CPU-backed canvases.
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    const pixels = ctx.createImageData(w,h);
    for (let p=0;p<w*h;p++) {
      const byte=start+(p>>3), bit=7-(p&7);
      if (!(bytes[byte+(water?0:planes.length*stride)] & (1<<bit))) continue;
      let index=0;
      for (let plane=0;plane<planes.length;plane++) index |= ((bytes[byte+plane*stride]>>bit)&1)<<planes[plane];
      if(water==='field') {pixels.data.set(fieldInk,4*p);pixels.data[4*p+3]=255;}
      else if(water==='foam') {
        pixels.data.set(palette.subarray(51,54),4*p);pixels.data[4*p+3]=255;
      } else if(water) pixels.data[4*p+3]=255;
      else {
        pixels.data.set(palette.subarray(3*index,3*index+3),4*p);
        pixels.data[4*p+3]=255;
      }
    }
    ctx.putImageData(pixels,0,0);
    if(!water && palette.length===192 && planes.length===4) {
      let lit;
      canvas.illuminated=()=>{
        if(lit) return lit;
        lit=document.createElement('canvas');lit.width=w;lit.height=h;
        for(let p=0;p<w*h;p++) {
          if(!pixels.data[4*p+3]) continue;
          let idx=32;
          for(let n=0;n<4;n++) idx|=((bytes[start+(p>>3)+n*stride]>>(7-(p&7)))&1)<<n;
          pixels.data.set(palette.subarray(idx*3,idx*3+3),4*p);
        }
        lit.getContext('2d',{willReadFrequently:true}).putImageData(pixels,0,0);return lit;
      };
    }
    if(water===true) canvas.waterMask=pixels.data;
    images.set(key,canvas);
    return {canvas,x,y,control};
  });
}

// Tables.s paints each row from its outside edges towards its centre.
function slots() {
  const rows = [[4,0,46,21,2,3],[3,5,51,28,2,3],[2,10,56,35,2,2],
                [1,15,61,40,1,1],[0,18,64,43,1,1]];
  const result=[];
  for (const [depth,upper,lower,middle,radius,eyeRadius] of rows) {
    for (const [dz,base,r] of [[1,upper,radius],[-1,lower,radius],[0,middle,eyeRadius]]) {
      for(let n=r;n>=0;n--) for(const side of n ? [-n,n] : [0]) {
        result.push({depth,dz,side,index:base+r+side});
      }
    }
  }
  return result;
}

async function start() {
  if(handheld && portrait.matches) await new Promise(resolve=>portrait.addEventListener('change',resolve,{once:true}));
  const room=new URLSearchParams(location.search).get('room');
  let onlineCommand,watchChart=false,shareChart;
  if(!room && performance.getEntriesByType('navigation')[0]?.type==='reload') {
    history.replaceState(null,'',location.pathname);
    sessionStorage.removeItem('hiredguns.frontVisited');
  }
  const catalog = JSON.parse(new TextDecoder().decode(await load('levels.json')));
  const query=new URLSearchParams(location.search);
  let roomConfig;
  if(room && !room.startsWith('new')){
    const response=await fetch('/rooms/'+encodeURIComponent(room),{cache:'no-store'});
    if(!response.ok){location.replace('/');return;}
    roomConfig=await response.json();
  }
  const id=roomConfig?.map ?? (Number(query.get('map')) || 43);
  const entry = catalog.find(m => m.id === id) ?? catalog.find(m => m.id === 43);
  const selector = document.querySelector('#level');
  for (const group of ['Training','Campaign','Action','Development']) {
    const options = document.createElement('optgroup');
    options.label = group;
    for (const m of catalog.filter(m => m.group === group)) {
      options.append(new Option(m.label, m.id, false, m.id === entry.id));
    }
    selector.append(options);
  }
  const equipment = JSON.parse(new TextDecoder().decode(await load('equipment.json')));
  const setup = document.querySelector('#setup');
  const menu = document.querySelector('#menu');
  const front = document.querySelector('#front');
  const back = document.querySelector('#back');
  const saveButton = document.querySelector('#save');
  // Keep existing single-position saves available in the first bank.
  const saveKey=position=>position===1?'hiredguns.mission.v1':'hiredguns.mission.v1.slot'+position;
  function readSave(position){return JSON.parse(localStorage.getItem(saveKey(position)));}
  const resume = document.querySelector('#resume');
  const deploy = document.querySelector('#deploy');
  let missionUI;
  const params = new URLSearchParams(location.search);
  let onlineSize=roomConfig?.ids.length || (room ? Number(room.split('-')[1] || 4) : 0);
  const campaignKey='hiredguns.campaign.v1';
  const origin=catalog.find(m=>m.locationType===2).id;
  const freshCampaign=()=>({current:origin,completed:[]});
  let campaign=(params.has('campaign') && JSON.parse(sessionStorage.getItem(campaignKey))) || freshCampaign();
  let campaignMode=params.has('campaign');
  const world=document.querySelector('#world');
  const reachable=m=>m.group==='Campaign' && (m.id===campaign.current || catalog.find(n=>n.id===campaign.current)?.routes.includes(m.id));
  function selectGroup(group,worldMap=group==='Campaign') {
    campaignMode=worldMap;
    const available=catalog.filter(m=>campaignMode?reachable(m):m.group===group);
    for(const option of selector.options) option.disabled=!available.some(m=>m.id===Number(option.value));
    selector.value=(available.find(m=>!campaign.completed.includes(m.id)) ?? available[0]).id;
    world.hidden=!campaignMode;
    world.replaceChildren();
    if(campaignMode) for(const m of catalog.filter(m=>m.group==='Campaign')) {
      const button=document.createElement('button');
      button.style.left=m.x/960*100+'%';button.style.top=m.y/384*100+'%';
      button.title=m.label+(campaign.completed.includes(m.id)?' (completed)':'');
      button.setAttribute('aria-label',button.title);button.disabled=!reachable(m);
      button.dataset.location=m.id;
      
      world.append(button);
    }
    if(campaignMode && campaign.squad) {draft=[...campaign.squad];updateRoster();}
    selector.onchange();
  }
  const ids = roomConfig?.ids ?? (room && !params.has('squad') ? [0,1,2,3].slice(0,onlineSize) : (params.get('squad') ?? '').split(',').map(Number));
  const deployed = ids.length === (onlineSize || 4) && new Set(ids).size === ids.length && ids.every(n=>equipment.characters[n]);
  const squad = deployed ? ids : campaignMode && campaign.squad ? campaign.squad : [0,1,2,3];
  if(!room && deployed && campaignMode && !reachable(entry)) {location.search='?campaign=1';return;}
  let draft = [...squad];
  const frontMusic=new Audio('front.mp3');
  frontMusic.loop=true;
  frontMusic.preload='none';
  const music = new Audio('chselect.mp3');
  music.loop = true;
  music.preload = 'none';
  const mapMusic=new Audio('world.mp3');mapMusic.loop=true;mapMusic.preload='none';
  const musicToggle = document.querySelector('#music');
  musicToggle.checked=sessionStorage.getItem('hiredguns.music')!=='off';
  const briefing=document.querySelector('#briefing');
  const showBriefing=!room && deployed && params.get('restore')!=='1';
  if(showBriefing){
    briefing.showModal();
    briefing.oncancel=e=>e.preventDefault();
    briefing.setAttribute('aria-label',entry.menuName+' mission briefing');
    const image=async name=>{
      const img=new Image();
      img.src='art/'+name+'.png';
      await img.decode();
      return img;
    };
    const [panel,picture]=await Promise.all([image('briefing-'+entry.id),entry.picture && image('static-'+entry.picture)]);
    const ctx=briefing.querySelector('canvas').getContext('2d');
    ctx.imageSmoothingEnabled=false;
    if(picture){
      const width=picture.width===640?640:picture.width*2;
      ctx.drawImage(picture,(640-width)/2,0,width,340);
    }
    ctx.drawImage(panel,0,298);
  }
  const loadingMusic=showBriefing && entry.music && musicToggle.checked
    ? new Audio('static-'+String(entry.music).padStart(2,'0')+'.mp3') : null;
  if(loadingMusic){
    loadingMusic.loop=true;
    const play=()=>{if(briefing.open) loadingMusic.play().catch(()=>{});};
    play();
    briefing.addEventListener('click',play);
    briefing.addEventListener('keydown',play);
    briefing.addEventListener('close',()=>loadingMusic.pause(),{once:true});
  }
  function syncMusic() {
    const training = catalog.find(m=>String(m.id)===selector.value)?.group === 'Training';
    const onFront=front.matches(':popover-open') || (setup.open && missionUI?.inMultiplayerSetup);
    if(onFront && musicToggle.checked) frontMusic.play().catch(()=>{});
    else frontMusic.pause();
    const canPlay=!onFront && !deployed && setup.open && musicToggle.checked && !training;
    if(canPlay && missionUI?.inRoster) music.play().catch(()=>{});else music.pause();
    if(canPlay && !world.hidden) mapMusic.play().catch(()=>{});else mapMusic.pause();
  }
  musicToggle.onchange=()=>{
    sessionStorage.setItem('hiredguns.music',musicToggle.checked?'on':'off');
    syncMusic();
  };
  selector.onchange = ()=>{
    missionUI?.draw();
    for(const marker of world.children) marker.setAttribute('aria-pressed',String(marker.dataset.location===selector.value));

    syncMusic();
  };
  document.querySelector('#travel').onclick=()=>{
    const m=catalog.find(m=>m.id===Number(selector.value));
    if(!reachable(m) || !campaign.completed.includes(m.id)) return;
    campaign.current=m.id;sessionStorage.setItem(campaignKey,JSON.stringify(campaign));selectGroup('Campaign');
  };
  setup.addEventListener('click',syncMusic);
  setup.addEventListener('close',syncMusic);
  setup.addEventListener('menuchange',syncMusic);
  function updateRoster() {missionUI?.draw();}
  missionUI=await missionMenu(setup,load,()=>({draft,watchChart,shareChart,size:onlineSize || 4,online:!!onlineSize,chooseSquad(size,group){
    onlineSize=size;draft=[];campaign=freshCampaign();selectGroup(group);missionUI.open(false,true);syncMusic();
  },characters:equipment.characters,catalog,campaign,campaignMode,locked:!!(campaignMode && campaign.squad)}));
  function browseSaves(saving,cancel){
    const slots=Array.from({length:5},(_,i)=>{
      try{
        const s=readSave(i+1);
        return s && (s.name || catalog.find(m=>m.id===s.map)?.menuName || 'Saved mission');
      }catch{return null;}
    });
    missionUI.files({saving,slots,defaultName:(entry.menuName || entry.label).slice(0,30),cancel,
      select(position,name){
        try{
          if(saving){saveMission(position,name);return;}
          const saved=readSave(position);
          if(!saved) throw new Error();
          if(saved.campaign) sessionStorage.setItem(campaignKey,JSON.stringify(saved.progress ??
            {current:saved.map,completed:[],squad:saved.squad}));
          location.search=new URLSearchParams({map:saved.map,squad:saved.squad.join(','),restore:'1',slot:position,...(saved.campaign?{campaign:'1'}:{})});
        }catch{missionUI.message(saving?'Unable to save this mission.':'Unable to load this position.');}
      }});
  }
  deploy.onclick = () => {
    if(onlineSize && !room){
      if(draft.length!==onlineSize || !selector.value || selector.selectedOptions[0]?.disabled) return;
      location.search=new URLSearchParams({room:'new-'+onlineSize,map:selector.value,squad:draft.join(',')});
      return;
    }
    const destination = new URL(location.href);
    destination.searchParams.delete('restore');destination.searchParams.delete('result');
    if(campaignMode) {
      if(!reachable(catalog.find(m=>m.id===Number(selector.value)))) return;
      destination.searchParams.set('campaign','1');
    } else destination.searchParams.delete('campaign');
    destination.searchParams.set('map',selector.value);
    destination.searchParams.set('squad',draft.join(','));
    if (destination.href === location.href) location.reload();
    else location.assign(destination);
  };
  function openMenu(group) {
    onlineSize=0;
    selector.value = entry.id;
    draft = group==='Training'?[1,2,6,7]:typeof group==='string'?[]:[...squad];
    if(typeof group==='string') selectGroup(group);
    updateRoster();
    setup.classList.toggle('paused',deployed);
    document.querySelector('#menu-title').textContent=campaignMode && campaign.finished && !deployed?'Campaign complete':deployed?'*** GAME PAUSED ***':'Mission menu';
    setup.showModal();missionUI.open(deployed,typeof group==='string' && group!=='Training' && !(campaignMode && campaign.squad));
    syncMusic();
  }
  setup.oncancel = e => { if (!deployed) e.preventDefault(); };
  resume.onclick = () => setup.close();
  if (!deployed) {
    document.querySelector('#status').textContent = '';
    const choices = Array.from(front.querySelectorAll('button'));
    let opening;
    for(const event of ['pointerdown','keydown','click']) front.addEventListener(event,syncMusic);
    async function showFront() {
      opening??=await openingCards(front,()=>choices[0].focus());
      front.showPopover();
      opening.menu();
      syncMusic();
    }
    for (const choice of choices) {
      choice.onpointerenter = () => choice.focus();
      choice.onclick = () => {
        if(choice.id==='multiplayer'){
          opening.leave(()=>{front.hidePopover();missionUI.multiplayer();syncMusic();});
          return;
        }
        if (!choice.dataset.group) {
          front.hidePopover();browseSaves(false,()=>{setup.close();front.showPopover();choices[3].focus();});
          return;
        }
        const choose=()=>{
          front.hidePopover();
          campaign=freshCampaign();sessionStorage.removeItem(campaignKey);
          openMenu(choice.dataset.group);
        };
        if(opening) opening.leave(choose);else choose();
      };
    }
    front.onkeydown = e => {
      if(front.classList.contains('credits')) {
        if(['Enter',' ','Escape'].includes(e.key)) {e.preventDefault();opening?.skip();}
        return;
      }
      const change = {ArrowUp:-1,ArrowDown:1}[e.key];
      if (change) {
        e.preventDefault();
        choices[Math.max(0,Math.min(choices.length-1,choices.indexOf(document.activeElement)+change))].focus();
      }
    };
    back.hidden = false;
    back.onclick = () => { setup.close(); showFront(); };
    if(campaignMode) {openMenu();selectGroup('Campaign');}
    else if (params.has('map')) {openMenu();selectGroup(entry.group,false);selector.value=entry.id;selector.onchange();missionUI.message(params.get('result')??'');}
    else {
      front.classList.add('credits');
      front.tabIndex = -1;
      opening=await openingCards(front,()=>choices[0].focus());
      front.showPopover();
      if(sessionStorage.getItem('hiredguns.frontVisited')) opening.menu();
      else {front.focus();sessionStorage.setItem('hiredguns.frontVisited','1');}
      syncMusic();
      front.addEventListener('click',()=>opening.skip());

    }
    return;
  }
  resume.hidden = false;
  menu.onclick = openMenu;
  const prefix = 'styles/' + entry.style + '/';
  const [map,palette,stone,grass,bank,manifest] = await Promise.all([
    'maps/' + entry.id + '.map', 'view-palette.bin', prefix+'Stone.bin', prefix+'Grass.bin',prefix+'terrain.bin',prefix+'terrain.json'
  ].map(load));
  const level=readLevel(map);
  const skies=await missionSky(load,level);
  const wetColors=new Map(),litColors=new Map();
  for(let i=63;i>=0;i--) {
    const [r,g,b]=palette.subarray(i*3,i*3+3);
    litColors.set(r*65536+g*256+b,i|32);
    wetColors.set(r*65536+g*256+b,i|16);
  }
  const inks=Array.from({length:64},(_,i)=>palette.subarray(i*3,i*3+3));
  // Keep these register numbers intact until all water and lighting masks
  // have been composited. A submerged pen 29 and a dry pen 3 both show $654.
  const deferredInks=new Map([22,29,54].map(i=>[i,[1,0,i]]));
  for(const [i] of deferredInks){
    wetColors.set(65536+i,i|16);litColors.set(65536+i,i|32);
  }
  function resolveWaterInks(ctx){
    const image=ctx.getImageData(0,0,144,84),pixels=image.data;
    for(let y=0;y<84;y++){
      const line=Math.min(43,y+2);
      const mist=line<=12 && line%4===0?inks[22]:skies.mist[line];
      for(let i=y*144*4,end=i+144*4;i<end;i+=4){
        if(pixels[i]!==1 || pixels[i+1]!==0) continue;
        const ink=pixels[i+2];
        if(ink===22 || ink===29 || ink===54) pixels.set(ink===22?mist:ink===54?skies.planet[line]:inks[29],i);
      }
    }
    ctx.putImageData(image,0,0);
  }
  function drawPaletteMask(ctx,{canvas,x,y,control},colors,background) {
    const h=canvas.height,w=canvas.width;
    const left=Math.max(0,x),top=Math.max(0,y),right=Math.min(ctx.canvas.width,x+w);
    const bottom=Math.min(ctx.canvas.height,y+h*(control===2?2:1));
    if(left>=right || top>=bottom) return;
    const image=ctx.getImageData(left,top,right-left,bottom-top),pixels=image.data;
    let deferred=false;
    for(let row=top;row<bottom;row++) {
      const sy=row-y,maskY=control===1?h-1-sy:sy>=h?2*h-1-sy:sy;
      for(let col=left;col<right;col++) {
        if(!canvas.waterMask[4*(maskY*w+col-x)+3]) continue;
        const at=4*((row-top)*image.width+col-left);
        const color=pixels[at]*65536+pixels[at+1]*256+pixels[at+2];
        const ink=pixels[at+3] ? colors.get(color)??background : background;
        const marker=deferredInks.get(ink);
        if(marker) deferred=true;
        pixels.set(marker??inks[ink],at);
        pixels[at+3]=255;
      }
    }
    ctx.putImageData(image,left,top);
    return deferred;
  }
  const walls=spriteSheet(stone,palette), floors=spriteSheet(grass,palette);
  const terrain = {};
  let nearSign;
  for (const [name,[offset,size]] of Object.entries(JSON.parse(new TextDecoder().decode(manifest)))) {
    const sheet=bank.subarray(offset,offset+size);
    terrain[name] = spriteSheet(sheet,palette,name==='field'?'field':false);
    if(name==='text'){
      const view=new DataView(sheet.buffer,sheet.byteOffset,sheet.byteLength),header=18+41*14;
      nearSign={bytes:sheet,start:view.getUint32(header+10),sprite:terrain.text[41]};
    }
  }
  const floorSheets = [floors,null,terrain.lift,terrain.puddle];
  const blocks = [walls,terrain.push,terrain.field,terrain.field,terrain.tree,terrain.field,terrain.field,terrain.hydraulic];
  // Drawviews.s block_rotations and aux_rotations use the same stair orientation table.
  const stairs = [[0,1,3,2],[2,0,1,3],[3,2,0,1],[1,3,2,0]];
  function structure(type, dir, first, family) {
    if (type>=first && type<first+4) {
      const facing = ['out','right','left','in'][stairs[dir][type-first]];
      return terrain[family+facing];
    }
    if (type===first+4 || type===first+5) {
      const side = (type-first-4) ^ (dir%2);
      return terrain[(first===8?'door1open':'door1')+(side?'side':'front')];
    }
  }
  const [step,bump,reload] = await Promise.all(['Footstep.pcm','Bump.pcm','GunReload.pcm'].map(load));
  const boxes = Array.from({length:5},(_,i)=>terrain['container'+(i+1)]);
  const [figureBytes,hud] = await Promise.all([
    Promise.all(squad.map(id=>load('figure'+id+'.bin'))),hudGraphics(load,palette,equipment,level,prefix)
  ]);
  const figures = figureBytes.map(bytes=>Array.from({length:4},(_,dir)=>spriteSheet(bytes.subarray(dir*3556,(dir+1)*3556),palette)));
  const effects=['','NewGun1','NewGun2','GunEmpty','GunReload','EggHatch','','Explosion','LaserCrack','Arc','Cast'];
  const samples={step,bump,reload};
  await Promise.all([...effects,...extraSamples].filter(Boolean).map(async name=>{samples[name]=await load(name+'.pcm');}));
  for(const name of ['DoorOpening','DoorClosed','Button','BlockSlide','Teleport']) samples[name]=await load(name+'.pcm');
  const sound=movementAudio(samples);
  const inventory = inventorySession(level,equipment,squad,sound);
  const players = inventory.players;
  if(campaignMode && campaign.squad?.join(',')===squad.join(',')) {
    campaign.members?.forEach((member,i)=>Object.assign(players[i],member));
  }

  await hud.preload(players,figureBytes);
  const motor=ambientAudio({DoorOpening:await load('DoorOpening.8svx'),Lift:await load('Lift.8svx')});
  function machineryVolume(key,base){
    const x=key%level.width,y=Math.floor(key/level.width)%level.depth,z=Math.floor(key/(level.width*level.depth));
    let distance=10;
    for(const p of players) if(p.fitness && !p.exited)
      distance=Math.min(distance,Math.abs(x-p.x)+Math.abs(y-p.y)+Math.abs(z-p.floor));
    return Math.round(base*(10-distance)/10);
  }
  const machines=machinery(level,players,(name,period,key)=>{if(name!=='DoorOpening') sound(name,period,2,machineryVolume(key,63));},(...pos)=>battle.at(...pos),inventory.moveCargo,(...pos)=>battle.hatchAt(...pos));
  const atmosName='Atmos'+String(entry.atmos).padStart(2,'0');
  const ambient=ambientAudio(Object.fromEntries(await Promise.all([atmosName,'Water'].map(async n=>[n,await load('atmos/'+n+'.sfx')]))));
  const death=document.querySelector('#death');
  const paused=()=>(handheld && portrait.matches) || setup.open || death.open || document.hidden;
  const syncAtmos=()=>{
    if(paused() || briefing.open) {ambient.stop();motor.stop();return;}
    ambient.update(environmentSound(level,players,entry.atmos));
    for(const lift of level.lifts){
      if(machines.movingLifts.has(lift)) motor.update({name:'Lift',period:412,volume:machineryVolume(lift.key,40)},lift);
      else motor.stop(lift);
    }
    for(const door of level.doors){
      if(!door.key) continue;
      if((door.dir===1 || door.dir===2) && level.cell(door.key%23,Math.floor(door.key/23)%23,Math.floor(door.key/529)).blockType!==null)
        motor.update({name:'DoorOpening',period:428,volume:machineryVolume(door.key,63)},door.key);
      else motor.stop(door.key);
    }
  };
  const unlock=()=>{sound.unlock();ambient.unlock();motor.unlock();syncAtmos();};
  document.addEventListener('pointerdown',unlock);
  document.addEventListener('keydown',unlock);
  document.addEventListener('visibilitychange',syncAtmos);
  setup.addEventListener('close',syncAtmos);
  new MutationObserver(syncAtmos).observe(setup,{attributes:true,attributeFilter:['open']});
  window.addEventListener('pagehide',()=>{ambient.stop();motor.stop();});
  const radio=chatter(level,players,JSON.parse(new TextDecoder().decode(await load('chatter.json'))));
  const waterSheets=await Promise.all([1,2,3,4].map(async n=>spriteSheet(await load('Water'+n+'.bin'),palette,true)));
  const foam=spriteSheet(await load('Foam.bin'),palette,'foam',4);
  const grenadeSheet=spriteSheet(await load('Grenade.bin'),palette);
  const explosionPalette=await load('explosion-palette.bin');
  const flameSheets=await Promise.all([1,2,3,4].map(async n=>spriteSheet(await load('expl'+n+'.bin'),explosionPalette,false,67,[0,3,5])));
  let outcome='';
  let radioLine='',radioX=320,lastCore=0;
  const ticker=document.querySelector('#ticker'),ribbon=ticker.querySelector('canvas');
  let scrollAnimation=null;
  function syncScroll(){
    if(!scrollAnimation) return;
    if(paused()) scrollAnimation.pause();else scrollAnimation.play();
  }
  setup.addEventListener('close',syncScroll);
  new MutationObserver(syncScroll).observe(setup,{attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',syncScroll);
  function scrollChatter(){
    if(scrollAnimation) return;
    if(room && !radioLine) return;
    if(!radioLine){radioLine=radio.take()??'';radioX=320;}
    if(!radioLine) return;
    ticker.setAttribute('aria-label',radioLine);
    const width=Math.max(1,hud.width(radioLine)+2);
    ribbon.width=width;ribbon.style.width=100*width/320+'%';
    hud.text(ribbon.getContext('2d'),radioLine,0,1);
    scrollAnimation=ribbon.animate([{transform:'translateX('+100*radioX/width+'%)'},{transform:'translateX(-100%)'}],
      {duration:Math.max(1,(radioX+width)*20),fill:'both',easing:'linear'});
    scrollAnimation.onfinish=()=>{
      scrollAnimation.cancel();scrollAnimation=null;radioLine='';
      ribbon.getContext('2d').clearRect(0,0,width,8);
    };
  }
  const battle=combat(level,equipment,inventory,(id,period)=>{if(effects[id]) sound(effects[id],period,0);},sound,p=>{
    const seen=panels[players.indexOf(p)].seen,start=p.floor*level.width*level.depth;
    for(let i=0;i<level.width*level.depth;i++) seen.add(start+i);
  },(p,x,y,floor)=>{
    machines.pad(p.x,p.y,p.floor,true);Object.assign(p,{x,y,floor});
    machines.pad(x,y,floor,false);sound('Teleport',683,players.indexOf(p)%2);
  });
  const skeleton=spriteSheet(await load('Skeleton.bin'),palette);
  const remains=new Map(),monsterFigures=new Map(),attackFigures=new Map();
  await Promise.all(battle.species.map(async id=>{
    const bytes=await load('Monster'+String(id).padStart(2,'0')+'.bin');
    attackFigures.set(id,spriteSheet(bytes.subarray(16710),palette,false,1)[0]);
    remains.set(id,spriteSheet(bytes.subarray(14224,16710),palette));
    monsterFigures.set(id,Array.from({length:4},(_,dir)=>spriteSheet(bytes.subarray(dir*3556,(dir+1)*3556),palette)));
  }));
  const pack = document.querySelector('#pack');
  const feedback = document.querySelector('#feedback');
  function itemName(item) {
    const name = equipment.items[item.id].name;
    return item.ammo ? name + ' (' + item.ammo + ')' : name;
  }
  const directions=[[0,-1],[1,0],[0,1],[-1,0]], projection=slots();
  const lightNeighbors=JSON.parse(new TextDecoder().decode(await load('light-neighbors.json')));
  const lightMasks=await Promise.all([1,2,3].map(async n=>spriteSheet(await load('Light'+n+'.bin'),palette,true)));
  const litBlack=32,wetBlack=16;
  const visibility=JSON.parse(new TextDecoder().decode(await load('visibility.json')));
  const panels=players.map(()=>({mode:0,index:0,seen:new Set()}));
  let selected=0,leader=-1,restoredBattle=false;
  if (params.get('restore')==='1') {
    const saved=readSave(Number(params.get('slot')) || 1);
    if (!saved || saved.map!==entry.id || saved.squad.join(',')!==squad.join(',')) throw new Error('Saved mission unavailable.');
    machines.restore(saved.machines);inventory.restore(saved.state);
    battle.restore(saved.battle);restoredBattle=!!saved.battle;radio.restore(saved.radio);
    radioLine=saved.radioLine??'';radioX=saved.radioX??320;lastCore=inventory.armed;
    saved.seen?.forEach((cells,i)=>{panels[i].seen=new Set(cells);});
    selected=saved.selected;leader=saved.leader??-1;
    params.delete('restore');params.delete('slot');
    history.replaceState(null,'','?'+params);
  }
  saveButton.hidden = false;
  document.querySelector('#load-slot').onclick=()=>browseSaves(false,()=>missionUI.open(true));
  saveButton.onclick=()=>browseSaves(true,()=>missionUI.open(true));
  function saveMission(position,name){
      localStorage.setItem(saveKey(position),JSON.stringify({name,map:entry.id,campaign:campaignMode,progress:campaignMode?campaign:undefined,squad,selected,leader,radio:radio.snapshot(),radioLine,radioX:radioX-(scrollAnimation?.currentTime??0)/20,battle:battle.snapshot(),machines:machines.snapshot(),seen:panels.map(panel=>[...panel.seen]),state:inventory.snapshot()}));
      setup.close();
      feedback.textContent='Mission saved.';
  }
  back.hidden = false;
  back.onclick = () => location.assign(location.pathname);

  const scenes=players.map(()=>{const c=document.createElement('canvas');c.width=144;c.height=84;return c;});
  const panelNames=['View','Store','DTS','Stats','','','Item information'];
  function tab(i,mode) {
    if(mode===2 && panels[i].mode!==2 && (!room || i===selected)){
      // DTS.8svx specifies 9943 Hz in its VHDR.
      sound('DTS',3546895/9943,i%2);
    }
    panels[i].mode=mode;
    if(mode===2) scrollMap(panels[i],players[i].x,players[i].y);
    document.querySelector('#equipment').open=mode===1 || mode===6;
  }
  const mouseZones=JSON.parse(new TextDecoder().decode(await load('mouse.json')));
  const actions={1:'Forward',2:'Back',3:'Left',4:'Right',5:'Use',6:'Pull',13:'Strafe right',14:'Strafe left'};
  const pad=document.querySelector('#touch-pad');
  if(handheld){pad.hidden=false;document.body.classList.add('touch-play');}
  const panelTouches=new Map();
  const buttons=players.map((p,i)=>{
    const button=document.createElement('button'), canvas=document.createElement('canvas');
    canvas.width=160; canvas.height=103;
    const caption=document.createElement('span');
    caption.className='caption';caption.textContent=p.character.name;
    button.append(canvas,caption);
    function region(e) {
      const rect=canvas.getBoundingClientRect();
      const x=Math.floor((e.clientX-rect.left)*160/rect.width),y=Math.floor((e.clientY-rect.top)*103/rect.height);
      const panel=panels[i];
      let table=panel.mode===6?'6_gadgets':panel.mode+'_gadgets';
      if(panel.mode===0) {
        table+=inventory.at(p.x,p.y,p.floor)?'_aux':'_no_aux';
        const [dx,dy]=directions[p.dir],x=p.x+dx,y=p.y+dy;
        const front=x>=0 && y>=0 && x<level.width && y<level.depth?level.cell(x,y,p.floor).terrain:0;
        if(p.held && equipment.items[p.held.id].category===21 && !(front&(256|8))) table+='_grenade';
      }
      return mouseZones[table]?.find(([l,t,r,b])=>x>=l && x<=r && y>=t && y<=b);
    }
    function moveCursor(e){
      if(e.pointerType==='touch' || 'identifier' in e) return;
      const zone=region(e);
      canvas.style.cursor='url(art/mouse'+(zone?.[4]??0)+'.png) 0 0, auto';
    }
    button.oncontextmenu=e=>e.preventDefault();
    function activate(e,code){
      if(paused()) return;
      if(room) {
        button.focus({preventScroll:true});
        const special={15:'Pickup hands',22:'Pickup pack',23:'Drop',16:'Follow',20:'Center map',17:'Use held',19:'Item info',21:'Store'};
        const action=code>=26 && code<=29 ? 'Throw '+(29-code) : special[code] ?? actions[code] ?? ['View','Store','DTS','Stats'][code-9];
        if(action) onlineCommand?.(i,action,true);
        return;
      }
      unlock();selected=i;
      const panel=panels[i];
      if(!p.fitness || p.exited) {draw();return;}
      if(code>=9 && code<=12) tab(i,code-9);
      else if(code===15 || code===22) feedback.textContent=inventory.pickup(p,code===15,panel.index);
      else if(code===23) feedback.textContent=inventory.drop(p);
      else if(code===16) {p.inTeam=!p.inTeam;leader=-1;}
      else if(code>=26 && code<=29) battle.throwGrenade(p,29-code);
      else if(code===17) {draw(!!battle.use(p,panel.index));moveCursor(e);return;}
      else if(code===19 && p.held) tab(i,6);
      else if(code===21) tab(i,1);
      else if(code===20) scrollMap(panel,p.x,p.y);
      else if(actions[code]) {act(actions[code],true);moveCursor(e);return;}
      draw();moveCursor(e);
    };
    function beginPanelTouch(point,time){
      if(handheld && !room && i!==selected){
        return end=>{if(end){selected=i;draw(false);}};
      }
      const zone=region(point),mode=panels[i].mode;
      return end=>{
        if(end && mode===panels[i].mode && zone===region(end.point)){
          const secondary=zone?.[6]===22 || (end.time-time>=450 && zone?.[6]);
          activate(end.point,zone?.[secondary?6:5]);
        }
      };
    }
    function beginHandheldTouch(point,time){
      const tap=beginPanelTouch(point,time);
      if(i!==selected || !p.fitness || p.exited) return {finish:tap};
      const panel=panels[i],mode=panel.mode,zone=region(point);
      const rect=canvas.getBoundingClientRect();
      const x=(point.clientX-rect.left)*160/rect.width,y=(point.clientY-rect.top)*103/rect.height;
      const active=()=>i===selected && panel.mode===mode && p.fitness && !p.exited && !paused() && !outcome;
      if(mode===0 && zone?.[5]>=26 && zone[5]<=29){
        const id=p.held.id,stepMs=250;
        panel.touchPower=0;draw(false);
        const timers=[1,2,3].map(n=>setTimeout(()=>{
          if(active() && p.held?.id===id){panel.touchPower=n;draw(false);}
        },n*stepMs));
        return {finish(end){
          timers.forEach(clearTimeout);
          delete panel.touchPower;
          if(end && active() && p.held?.id===id && region(end.point)?.[5]>=26 && region(end.point)?.[5]<=29){
            activate(end.point,29-Math.min(3,Math.floor((end.time-time)/stepMs)));
          }
          draw(false);
        }};
      }
      const store=mode===1 && x>=0 && x<66 && y>=18 && y<94;
      const map=mode===2 && scannerType(p) && x>=13 && x<141 && y>=16 && y<95;
      if(!store && !map) return {finish:tap};
      let lastX=point.clientX,lastY=point.clientY,dragged=false;
      function move(t){
        if(!active()) return;
        if(Math.hypot(t.clientX-point.clientX,t.clientY-point.clientY)>12) dragged=true;
        if(!dragged) return;
        const stepX=rect.width*16/160,stepY=rect.height*(store?14:16)/103;
        const dx=map?Math.trunc((t.clientX-lastX)/stepX):0,dy=Math.trunc((t.clientY-lastY)/stepY);
        lastX+=dx*stepX;lastY+=dy*stepY;
        function scroll(action,count){
          for(let n=0;n<Math.abs(count);n++){
            if(room) onlineCommand?.(i,action);else act(action,false,i);
          }
        }
        scroll(dx>0?'Left':'Right',dx);
        scroll(dy>0?'Forward':'Back',dy);
      }
      return {move,finish(end){
        if(end && active()){move(end.point);if(!dragged) tap(end);}
      }};
    }
    panelTouches.set(canvas,beginHandheldTouch);
    let contact;
    button.onpointerdown=e=>{
      if(e.button!==0 && e.button!==2) return;
      if(handheld && e.pointerType==='touch') return;
      e.preventDefault();
      if(e.pointerType!=='touch'){activate(e,region(e)?.[e.button===2?6:5]);return;}
      if(!e.isPrimary || paused()) return;
      contact={id:e.pointerId,x:e.clientX,y:e.clientY,finish:beginPanelTouch(e,e.timeStamp)};
      button.setPointerCapture(e.pointerId);
    };
    button.onpointermove=e=>{
      if(contact && contact.id===e.pointerId && Math.hypot(e.clientX-contact.x,e.clientY-contact.y)>12) contact=null;
      moveCursor(e);
    };
    button.onpointerup=e=>{
      if(contact?.id!==e.pointerId) return;
      contact.finish({point:e,time:e.timeStamp});contact=null;
    };
    button.onlostpointercapture=button.onpointercancel=()=>{contact=null;};
    button.onclick=e=>{if(!room && !e.detail){selected=i;draw();}};
    document.querySelector('main').append(button);
    return button;
  });
  const fieldViews=scenes.map(fieldAnimation),silhouettes=new WeakMap();
  let fieldClock=0;
  function silhouette(source,color) {
    let variants=silhouettes.get(source);
    if(!variants) {variants=new Map();silhouettes.set(source,variants);}
    if(!variants.has(color)){
      const mask=document.createElement('canvas');mask.width=source.width;mask.height=source.height;
      const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);ctx.globalCompositeOperation='source-in';
      ctx.fillStyle=color;ctx.fillRect(0,0,mask.width,mask.height);variants.set(color,mask);
    }
    return variants.get(color);
  }
  const colorIndices=new Map();
  for(let i=63;i>=0;i--) colorIndices.set(palette.slice(3*i,3*i+3).join(','),i);
  function drawSign(ctx,id) {
    // Two OR-blitted planes of 48 by 40 pixels, centered on the near wall panel.
    const image=ctx.getImageData(48,22,48,40);
    const {bytes,start,sprite}=nearSign,w=sprite.canvas.width,h=sprite.canvas.height,stride=w*h/8;
    for(let i=0;i<48*40;i++){
      const offset=id*480+(i>>3),mask=128>>(i&7);
      const ink=Number(!!(level.signs[offset]&mask))+2*Number(!!(level.signs[offset+240]&mask));
      if(ink) {
        const dest=i*4,x=48+i%48-sprite.x,y=22+Math.floor(i/48)-sprite.y;
        let base=colorIndices.get(image.data.subarray(dest,dest+3).join(','))??0;
        if(x>=0 && x<w && y>=0 && y<2*h){
          // Colors 0 and 5 both display as black. Only the original bitplanes
          // identify which color the 68k OR will produce underneath the ink.
          const pixel=(y<h?y:2*h-1-y)*w+x,at=start+(pixel>>3),bit=128>>(pixel&7);
          if(bytes[at+4*stride]&bit){
            base=0;
            for(let n=0;n<4;n++) if(bytes[at+n*stride]&bit) base|=1<<n;
          }
        }
        const index=base|ink;
        image.data.set(palette.subarray(3*index,3*index+3),dest);image.data[dest+3]=255;
      }
    }
    ctx.putImageData(image,48,22);
  }
  let warningClock=0;
  function finishMission() {
    if(outcome) return;
    if(players.every(p=>!p.fitness)){
      outcome='Game over';
      ambient.stop();motor.stop();
      death.showModal();death.focus();syncScroll();
      const theme=new Audio('death.mp3');
      if(musicToggle.checked){theme.loop=true;theme.play().catch(()=>{});}
      const leave=()=>{theme.pause();location.assign(location.pathname);};
      death.onkeydown=e=>{e.preventDefault();if(!e.repeat) leave();};
      death.onpointerdown=leave;
      death.oncancel=e=>{e.preventDefault();leave();};
      return;
    }
    if(!players.some(p=>p.fitness && p.exited)) return;
    const allOut=players.every(p=>p.exited || !p.fitness);
    if((campaignMode || map[8]===1) && !allOut) return;
    outcome=!campaignMode && map[8]===1 && players.some(p=>!p.fitness)?'Mission failed':'Mission complete';
    if(campaignMode){
      if(inventory.armed===4) campaign.finished=true;
      campaign.current=entry.id;campaign.squad=squad;
      campaign.members=players.map(({fitness,held,pack,psiExperience})=>({fitness,held,pack,psiExperience}));
      if(!campaign.completed.includes(entry.id)) campaign.completed.push(entry.id);
      sessionStorage.setItem(campaignKey,JSON.stringify(campaign));
    }
    // Leave the exit bitmap on screen briefly before switching back to selection.
    setTimeout(()=>location.assign(campaignMode?'?campaign=1':'?map='+entry.id+'&result='+encodeURIComponent(outcome)),650);
  }
  function renderScene(p,i,ctx){
    let hasField=false,deferredWater=false;
    ctx.clearRect(0,0,144,84);
    if((level.cell(p.x,p.y,p.floor).contents>>>(24+p.dir))&1) ctx.drawImage(skies.views[p.dir],0,0);
    const [dx,dy]=directions[p.dir];
    const cells=projection.map(({depth,dz,side})=>{
      const x=p.x+depth*dx-side*dy,y=p.y+depth*dy+side*dx,z=p.floor+dz;
      return x>=0 && x<level.width && y>=0 && y<level.depth && z>=0 && z<level.height?level.cell(x,y,z):null;
    });
    for(const [slot,{depth,dz,side,index}] of projection.entries()){
      const x=p.x+depth*dx-side*dy, y=p.y+depth*dy+side*dx, z=p.floor+dz;
      const c=cells[slot];
      if(!c) continue;
      const [,rear,lateral,below]=lightNeighbors[slot];
      const solid=cell=>cell?.blockType===0 || cell?.blockType===1;
      const lit=c.contents>>>31;
      const rearLight=lit && solid(cells[rear]) && lightMasks[1][index];
      const floorLight=dz<=0 && lit && ![0,2].includes(c.floorType) && solid(cells[below]) && lightMasks[2][index];
      const sideLight=solid(c) && (cells[lateral]?.contents>>>31) && lightMasks[0][index];
      const item = inventory.at(x,y,z);
      const box = item && ((c.terrain>>>28)!==7 || (depth===0 && side===0 && dz===0)) && boxes[equipment.items[item.id].container-2]?.[index];
      const auxType = c.terrain & 32 ? c.terrain >>> 28 : null;
      const aux = auxType===0 ? terrain.eggclosed : auxType===1 ? terrain.eggopen : auxType===7 ? (depth===0 && side===0 && dz===0?null:skeleton) : auxType===14?remains.get(level.firstMonster):auxType===15?remains.get(level.secondMonster):structure(auxType,p.dir,8,'stairs1');
      const block = blocks[c.blockType] ?? structure(c.blockType,p.dir,16,'stairs2');
      const other = players.findIndex(q=>q!==p && q.fitness && !q.exited && q.x===x && q.y===y && q.floor===z);
      const direction = other >= 0 ? (players[other].dir-p.dir+4)%4 : 0;
      const figure = other >= 0 && figures[other][[3,2,0,1][direction]][index];
      const monster=battle.at(x,y,z);
      const lunge=monster && p.monsterAttackFrames && depth===1 && !side && !dz && monster.dir===(p.dir+2)%4;
      const species=monster && battle.graphics(monster.type);
      const attack=lunge && (level.style===4 && species===level.firstMonster?monsterFigures.get(level.secondMonster)?.[0][0]:attackFigures.get(species));
      const monsterSprite=attack || monster && monsterFigures.get(battle.graphics(monster.type))?.[[3,2,0,1][(monster.dir-p.dir+4)%4]]?.[index];
      const grenade=battle.grenadeAt(x,y,z);
      const sprite=grenade && grenadeSheet[index];
      const projectile=sprite && {...sprite,y:sprite.y-Math.floor(((grenade.drawHeight??grenade.height)&31)*[62,62,38,26,18][depth]/31)};
      const flame=battle.flameAt(x,y,z);
      const panelSheet=c.terrain&8 ? [terrain.text,terrain.butin,terrain.butout][(c.terrain>>>19)&3] : null;
      // Drawviews.s substitutes the ceiling lamp on the underside of a solid block.
      const ceilingLamp=dz>0 && c.floorType===3 && c.blockType===0;
      const floorSprite=(ceilingLamp?terrain.light:floorSheets[c.floorType])?.[index];
      // Drawviews.s paints shallow water before opaque walls. The pickup at
      // the observer's feet has its own unlit blit before the deep-water pass.
      const pickup=depth===0 && !side && !dz && box;
      const water=(c.terrain&4) && waterSheets[(c.terrain>>>17)&3][index];
      const shallow=dz<=0 && ((c.terrain>>>17)&3)<3;
      for(const s of [rearLight,dz<=0 && floorSprite,floorLight,aux?.[index],!pickup && box,shallow && water,block?.[index],panelSheet?.[index],monsterSprite,figure,projectile,flame && flameSheets[flame.density-1]?.[index],pickup,!shallow && water,sideLight,dz>0 && floorSprite]){
        if(!s) continue;
        let {canvas,x,y}=s;
        if((c.contents>>>31) && canvas.illuminated && s!==pickup && s!==panelSheet?.[index] && !(ceilingLamp && s===floorSprite)) canvas=canvas.illuminated();
        if(s===terrain.field?.[index] || (s===figure && players[other].powers?.shield)) hasField=true;
        if(s===figure && (players[other].powers?.shield || players[other].psiFlash))
          canvas=silhouette(canvas,players[other].powers?.shield?'rgb(1,254,1)':'white');
        const control=s.control===-1?Number(!!flame?.flip):s.control;
        if(canvas.waterMask) {
          const lighting=s===rearLight || s===sideLight || s===floorLight;
          if(drawPaletteMask(ctx,s,lighting?litColors:wetColors,lighting?litBlack:wetBlack)) deferredWater=true;
          continue;
        }
        if(control>3) {
          // Drawviews.s blit_block mirrors the lower leaf and clips both leaves to the doorway.
          const frame=(c.terrain>>>23)&31,range=Math.min(4,Math.max(1,depth));
          const heights=[2,6,9,12,14,16,18,20,21,22,23];
          const rise=frame?Math.floor((range===4 && frame===9?16:heights[Math.min(frame,10)])*[0,23,13,10,6][range]/23):0;
          ctx.save();
          if(frame) {ctx.beginPath();ctx.rect(0,y,144,[0,52,30,22,14][range]);ctx.clip();}
          ctx.drawImage(canvas,x,y-rise);
          ctx.translate(x,y+control+rise+canvas.height);ctx.scale(1,-1);ctx.drawImage(canvas,0,0);
          ctx.restore();continue;
        }
        if(control!==1) ctx.drawImage(canvas,x,y);
        if(control===1||control===2){
          ctx.save(); ctx.translate(x,y+canvas.height*(control===2?2:1));
          ctx.scale(1,-1);ctx.drawImage(canvas,0,0);ctx.restore();
        }
        if(panelSheet===terrain.text && s===panelSheet?.[index] && depth===1 && !side && !dz) drawSign(ctx,(c.terrain>>>23)&31);
      }
    }
    if(deferredWater) resolveWaterInks(ctx);
    const localWater=level.cell(p.x,p.y,p.floor).terrain;
    const wave=(localWater&4) && foam[(localWater>>>17)&3];
    if(wave) ctx.drawImage(wave.canvas,wave.x,wave.y);
    fieldViews[i].capture(hasField);fieldViews[i].scroll(fieldClock);
  }
  function draw(worldChanged=true){
    if(!room) {radio.observe();syncAtmos();}
    if(inventory.armed===4 && lastCore!==4) radio.armed();
    lastCore=inventory.armed;
    players.forEach((p,i)=>{
      const path=p.path??=[],last=path.at(-1);
      if(!last || last.x!==p.x || last.y!==p.y || last.floor!==p.floor){
        path.push({x:p.x,y:p.y,floor:p.floor});if(path.length>20) path.shift();p.path=path;
      }
      const scene=scenes[i],button=buttons[i], ctx=scene.getContext('2d');
      const panel=panels[i];
      panel.index=Math.min(panel.index,Math.max(0,p.pack.length-1));
      if(worldChanged && p.fitness && (panel.mode===0 || panel.mode===2)) scanTerrain(level,p,projection,visibility,panel.seen);
      button.setAttribute('aria-pressed',String(i===selected));
      button.setAttribute('aria-label',p.character.name+' · '+(!p.fitness?'MIA':p.exited?'Exited':panelNames[panel.mode]));
      if(worldChanged && panel.mode===0 && p.fitness && !p.exited) renderScene(p,i,ctx);
      hud.draw(button.firstChild.getContext('2d'),scene,p,panel.mode,panel.index,inventory.weight(p),panel,i,warningClock);
    });
    const p = players[selected];
    const ground=inventory.at(p.x,p.y,p.floor);
    if(!pad.hidden) updatePad(ground);
    if(!room) finishMission();
    const previous = panels[selected].index;
    if(pack.length!==p.pack.length || p.pack.some((item,i)=>pack.options[i].text!==itemName(item)))
      pack.replaceChildren(...p.pack.map(item=>new Option(itemName(item))));
    pack.selectedIndex=Math.max(0,Math.min(previous,p.pack.length-1));
    document.querySelector('#equip').disabled=!p.pack.length;
    document.querySelector('#reload').disabled=!p.held || ![0,15,16,20].includes(equipment.items[p.held.id].category);
    document.querySelector('#drop').disabled=!p.held;
    document.querySelector('#stow').disabled=!p.held || p.pack.length>=30;
    inspect();
    document.querySelector('#hands').textContent=p.character.name+' · Held: '+(p.held?itemName(p.held):'nothing');
    document.querySelector('#pickup').disabled=!ground;
    document.querySelector('#ground').textContent='At your feet: '+(ground?itemName(ground):'nothing');
    document.querySelector('#status').textContent=p.character.name+(p.exited?' · Exited':'')+' · Floor '+p.floor+' · '+['North','East','South','West'][p.dir];
  }
  function inspect() {
    const p = players[selected];
    const item = p.pack[pack.selectedIndex] ?? p.held;
    const def = item && equipment.items[item.id];
    const image = document.querySelector('#item-art');
    image.hidden = !def;
    if (def && image.getAttribute('src')!=='art/item'+def.image+'.png') {
      image.src = 'art/item' + def.image + '.png';
      image.onload = () => { image.width = image.naturalWidth*2; };
    }
    document.querySelector('#description').textContent = def ? def.description+(def.maxDamage && item.damage?' · Damage '+Math.floor(item.damage*25600/def.maxDamage)+'%':'') : '';
  }
  pack.onchange = () => {panels[selected].index=pack.selectedIndex;draw();};
  document.querySelector('#stow').onclick=()=>{feedback.textContent=inventory.stow(players[selected],panels[selected].index);draw();};
  document.querySelector('#equip').onclick=()=>{inventory.equip(players[selected],pack.selectedIndex);feedback.textContent='';draw();};
  document.querySelector('#pickup').onclick=()=>{feedback.textContent=inventory.pickup(players[selected],false,panels[selected].index);draw();};
  document.querySelector('#reload').onclick=()=>{
    const reason=inventory.reload(players[selected]);
    feedback.textContent=reason ?? 'Reloaded.';
    if (!reason) sound('reload',380,selected%2);
    draw();
  };
  document.querySelector('#drop').onclick=()=>{feedback.textContent=inventory.drop(players[selected]);draw();};
  const padButtons=Object.fromEntries([...pad.querySelectorAll('button')].map(b=>[b.dataset.action,b]));
  const padButton=name=>padButtons[name];
  const labelPad=(b,label)=>{if(b.textContent!==label) b.textContent=label;};
  function updatePad(ground){
    const p=players[selected],mode=panels[selected].mode;
    const member=padButton('member');
    labelPad(member,p.character.name);member.disabled=!!room;
    const fire=padButton('primary');
    labelPad(fire,p.exited?'Return':mode===1?'Equip':'Fire');
    fire.disabled=!p.fitness || (!p.exited && mode!==0 && mode!==1);
    const pull=padButton('pull');
    labelPad(pull,mode===1?'Stow':'Pull / reload');
    pull.disabled=!p.fitness || p.exited || (mode!==0 && mode!==1);
    labelPad(padButton('Use'),mode===0 && ground?'Pick up':'Use');
    for(const name of ['Strafe left','Strafe right','Use']) padButton(name).disabled=mode!==0 || !p.fitness || p.exited;
    padButton('power').hidden=mode!==0 || equipment.items[p.held?.id]?.category!==21;
    labelPad(padButton('store'),mode===0?'Store':'View');
  }
  function touchAction(command){
    if(paused() || outcome) return;
    const p=players[selected],mode=panels[selected].mode;
    if(command==='member'){
      if(!room){selected=(selected+1)%players.length;draw(false);}
      return;
    }
    if(command==='menu'){if(room) onlineCommand?.(selected,'Pause');else openMenu();return;}
    if(command==='store'){
      if(room) onlineCommand?.(selected,mode===0?'Store':'View');
      else {tab(selected,mode===0?1:0);draw();}
      return;
    }
    if(p.exited && command==='primary'){
      if(room) onlineCommand?.(selected,'Return');else returnFromExit(selected);
      return;
    }
    if(command==='Pickup pack'){
      if(room) onlineCommand?.(selected,command);
      else {feedback.textContent=inventory.pickup(p,false,panels[selected].index);draw();}
      return;
    }
    if(['Use','Left','Right','Forward','Back','Strafe left','Strafe right'].includes(command)){
      if(room) onlineCommand?.(selected,command);else act(command);return;
    }
    const action=command==='primary'?(mode===1?'Right':'Fire'):command==='pull'?(mode===1?'Left':'Pull'):'Throw power';
    if(room) onlineCommand?.(selected,action);else act(action);
  }
  function returnFromExit(i){
    const p=players[i];
    if(!outcome && p.exited && !players.some(q=>q!==p && !q.exited && q.fitness && q.x===p.x && q.y===p.y && q.floor===p.floor) && !battle.at(p.x,p.y,p.floor)){
      p.exited=false;selected=i;draw();
    }
  }
  const movement=document.querySelector('#touch-movement');
  function padCommand(button){
    const action=button.dataset.action;
    const p=players[selected];
    if(action==='Use' && panels[selected].mode===0 && inventory.at(p.x,p.y,p.floor)) return 'Pickup pack';
    return action;
  }
  function beginPadPress(button){
    const owner=selected,mode=panels[owner].mode,action=padCommand(button);
    const fire=action==='primary' && mode===0 && !players[owner].exited;
    if(!fire && !movement.contains(button) && !action.startsWith('Strafe ')) return end=>{if(end && !button.disabled) touchAction(action);};
    touchAction(action);
    const timer=setInterval(()=>{
      if(paused() || outcome || selected!==owner || panels[owner].mode!==mode || button.disabled) clearInterval(timer);
      else touchAction(action);
    },fire?120:175);
    return ()=>clearInterval(timer);
  }
  const contacts=new Map();
  function finishContact(id,end){
    const press=contacts.get(id);
    if(!press) return;
    contacts.delete(id);
    press.finish(end);
  }
  function releaseControls(){
    for(const id of contacts.keys()) finishContact(id);
  }
  if(handheld){
    // iOS can retarget a finger contact to a nearby clickable element. Route
    // from the raw touch center against the painted layout, including gaps.
    function touchTarget(touch){
      const el=document.elementFromPoint(touch.clientX,touch.clientY);
      return el?.closest('#touch-pad button, main canvas');
    }
    document.addEventListener('touchstart',e=>{
      if(paused() || portrait.matches) return;
      for(const touch of e.changedTouches){
        const target=touchTarget(touch);
        const beginPanel=panelTouches.get(target);
        if(!beginPanel && !pad.contains(target)) continue;
        e.preventDefault();
        if(target.disabled || [...contacts.values()].some(press=>press.target===target)) continue;
        const gesture=beginPanel?beginPanel(touch,e.timeStamp):{finish:beginPadPress(target)};
        contacts.set(touch.identifier,{target,x:touch.clientX,y:touch.clientY,...gesture});
      }
    },{passive:false});
    function matchesPress(touch,press){
      return touchTarget(touch)===press.target && (press.move || !panelTouches.has(press.target) ||
        Math.hypot(touch.clientX-press.x,touch.clientY-press.y)<=12);
    }
    document.addEventListener('touchmove',e=>{
      for(const touch of e.changedTouches){
        const press=contacts.get(touch.identifier);
        if(press && !matchesPress(touch,press)) finishContact(touch.identifier);
        else press?.move?.(touch);
      }
    });
    for(const type of ['touchend','touchcancel']) document.addEventListener(type,e=>{
      for(const touch of e.changedTouches){
        const press=contacts.get(touch.identifier);
        if(press) finishContact(touch.identifier,type==='touchend' && matchesPress(touch,press) && {point:touch,time:e.timeStamp});
      }
    });
  }
  // Keep mouse, stylus and keyboard activation on hybrid tablets.
  pad.onpointerdown=e=>{
    const button=e.target.closest('button');
    if(e.pointerType==='touch' || e.button!==0 || !button || button.disabled || paused()) return;
    e.preventDefault();button.setPointerCapture(e.pointerId);
    contacts.set('pointer'+e.pointerId,{target:button,finish:beginPadPress(button)});
  };
  pad.onpointermove=pad.onpointerup=e=>{
    const id='pointer'+e.pointerId,press=contacts.get(id);
    if(!press) return;
    const inside=press.target.contains(document.elementFromPoint(e.clientX,e.clientY));
    if(!inside || e.type==='pointerup') finishContact(id,inside);
  };
  pad.onpointercancel=pad.onlostpointercapture=e=>finishContact('pointer'+e.pointerId);
  pad.onclick=e=>{const b=e.target.closest('button');if(b && !b.disabled && e.detail===0) touchAction(padCommand(b));};
  window.addEventListener('blur',releaseControls);
  document.addEventListener('visibilitychange',releaseControls);
  portrait.addEventListener('change',releaseControls);
  function act(action,mouse=false,who=selected,automatic=false){
    const p=players[who];
    if(!p.fitness || p.exited || outcome) return;
    const panel=panels[who];
    if(panel.mode===1) {
      if(action==='Forward') panel.index=Math.max(0,panel.index-1);
      if(action==='Back') panel.index=Math.min(p.pack.length-1,panel.index+1);
      if(action==='Left') feedback.textContent=inventory.stow(p,panel.index);
      if(action==='Right') inventory.equip(p,panel.index);
      draw();return;
    }
    if(panel.mode===3 || panel.mode===6) return;
    if(panel.mode===2) {
      const panel=panels[who];
      scrollMap(panel,panel.x+(action==='Right')-(action==='Left'),panel.y+(action==='Back')-(action==='Forward'));
      draw();return;
    }
    if(!automatic && p.inTeam && leader!==who && !['Use','Pull'].includes(action)){leader=who;radio.bank(21+who);}
    draw(fieldAction({level,inventory,machines,battle,equipment,sound,bank:n=>radio.bank(n),notice:text=>feedback.textContent=text},who,panel,action,mouse,automatic));
  }
  if(showBriefing){
    // Start the simulation and audio only after the visible briefing is dismissed.
    await new Promise(resolve=>setTimeout(resolve,3000));
    await new Promise(requestAnimationFrame);
    loadingMusic?.pause();
    briefing.close();
  }
  function animateHUD(){
    if(paused()) {ambient.stop();return;}
    warningClock=(warningClock+1)&63;fieldClock=(fieldClock+1)%90;
    let redrawWorld=false;
    players.forEach((p,i)=>{
      if(!room && p.fitness && !p.exited) p.gruntFrames=Math.min(100,(p.gruntFrames??0)+1);
      const worldEffect=p.psiFlash===1 || p.monsterAttackFrames===1;
      if((!room && agePowers(p)) || worldEffect) redrawWorld=true;
      const effectChanged=advanceEffects(p,equipment);
      const fieldChanged=panels[i].mode===0 && p.fitness && !p.exited && fieldViews[i].scroll(fieldClock);
      const repaint=effectChanged || fieldChanged || (p.poison && (warningClock&31)===0);
      const panel=panels[i];
      if(repaint) hud.draw(buttons[i].firstChild.getContext('2d'),scenes[i],p,panel.mode,panel.index,inventory.weight(p),panel,i,warningClock);
    });
    if(redrawWorld) draw();
    syncAtmos();
    scrollChatter();
  }
  setInterval(animateHUD,20);
  if(room) setInterval(()=>{
    if(paused()) return;
    panels.forEach((panel,i)=>{
      if(panel.mode===2 && players[i].fitness && !scannerType(players[i]))
        hud.drawStatic(buttons[i].firstChild.getContext('2d'),i,true);
    });
  },120);
  if(room) {
    const {connectRoom}=await import('./multiplayer.mjs');
    document.querySelector('main').dataset.players=String(players.length);
    document.body.classList.add('mission');
    for(const element of [menu,setup,document.querySelector('#equipment')]) element.inert=true;

    let radioStart=-1,sharedPause=false;
    const deadlines=players.map(()=>({}));
    onlineCommand=connectRoom(room,{map:id,ids},players.map(p=>p.character.name),state=>{
      selected=state.slot;
      if(state.map!==id || state.generation!==(roomConfig?.generation ?? 0)){location.reload();return;}
      battle.restore(state.battle);
      machines.restore(state.machines);
      machines.movingLifts.clear();
      for(const index of state.movingLifts) machines.movingLifts.add(level.lifts[index]);
      const drowning=players.map(p=>p.drowningFrames);
      inventory.restore(state.inventory);
      players.forEach((p,i)=>{
        p.drowningFrames=drowning[i];
        syncEffects(p,state.effects[i],state.tick,deadlines[i]);
      });
      state.squad.forEach(({x,y,floor,dir,mode,index,held,pack,fitness,throwPower},i)=>{
        const p=players[i];
        panels[i].throwPower=throwPower;
        Object.assign(p,{x,y,floor,dir,held,pack,fitness});
        panels[i].index=index;
        if(panels[i].mode!==mode) tab(i,mode);
        if(mode===2) scrollMap(panels[i],state.maps[i].x,state.maps[i].y);
        for(const floor of state.maps[i].revealed){
          const area=level.width*level.depth;
          for(let k=floor*area;k<(floor+1)*area;k++) panels[i].seen.add(k);
        }
      });
      if(state.phase==='paused' && !sharedPause){
        sharedPause=true;setup.inert=false;setup.showModal();missionUI.onlinePause();
        resume.onclick=()=>onlineCommand(selected,'Resume');
        back.onclick=()=>location.assign('/');
      }else if(sharedPause && state.phase==='play'){
        sharedPause=false;setup.close();setup.inert=true;
      }
      if(state.phase==='map' && (!setup.open || campaign.current!==state.campaign.current)){
        watchChart=selected!==0;shareChart=undefined;
        setup.oncancel=e=>e.preventDefault();
        campaign=state.campaign;campaignMode=true;
        draft=[...ids];selectGroup('Campaign');setup.inert=selected!==0;
        if(!setup.open) setup.showModal();missionUI.open(false,false);
        if(state.chart) missionUI.restoreChart(state.chart);
        if(!watchChart){shareChart=onlineCommand.chart;missionUI.draw();}
        deploy.onclick=()=>onlineCommand(selected,'Deploy '+selector.value);
        document.querySelector('#travel').onclick=()=>onlineCommand(selected,'Travel '+selector.value);
      }
      if(state.phase==='over' && !outcome){
        if(players.every(p=>!p.fitness)) finishMission();
        else {
          outcome=state.campaign?'Campaign complete':'Mission complete';
          setup.inert=false;
          setup.showModal();missionUI.result(outcome);
          back.onclick=()=>location.assign('/');
        }
      }

      if(state.line && state.line.start!==radioStart){
        radioStart=state.line.start;
        scrollAnimation?.cancel();scrollAnimation=null;
        radioLine=state.line.text;radioX=320-(state.tick-radioStart);
        scrollChatter();
      }
      draw(state.worldChanged);
      syncAtmos();
      if(!paused() && sound.ready()) for(const event of state.events){
        const name=event.name || effects[event.sample];
        if(name) sound(name,event.period,event.channel??0,event.key===undefined?event.volume??63:machineryVolume(event.key,63));
      }
    },view=>missionUI.restoreChart(view));
    return;
  }
  if(!restoredBattle) battle.start();
  for(const label of ['Left','Forward','Back','Right','Use','Pull']){
    const b=document.createElement('button');b.textContent=label;b.onclick=()=>act(label);
    document.querySelector('nav').append(b);
  }
  document.addEventListener('keydown',e=>{
    if (paused()) return;
    const fkey=['F1','F3','F2','F4'].indexOf(e.key);
    if(!outcome && fkey>=0 && players[fkey].exited) {
      e.preventDefault();returnFromExit(fkey);
      return;
    }
    if (e.key==='Escape') { e.preventDefault(); openMenu(); return; }
    if(e.target.tagName==='SELECT') return;
    const mode=['v','s','d','t'].indexOf(e.key.toLowerCase());
    if(mode>=0 && !e.ctrlKey && !e.metaKey && !e.altKey){tab(selected,mode);draw();return;}
    if(e.altKey || e.ctrlKey || e.metaKey) return;
    const action=keyAction(e.key,e.shiftKey,panels[selected].mode);
    if(action){
      e.preventDefault();
      if(!e.repeat || action==='Fire') act(action);
    }
    if(/^[1-4]$/.test(e.key)){selected=Number(e.key)-1;draw();}
  });
  setInterval(()=>{
    if(paused()) return;
    const blocksMoved=machines.blocksTick();
    const doorsMoved=machines.doorsTick();
    if(inventory.gravityTick() || blocksMoved || doorsMoved) draw();
    panels.forEach((panel,i)=>{
      const p=players[i];
      if(panel.mode===2 && p.fitness && !p.exited && !scannerType(p))
        hud.drawStatic(buttons[i].firstChild.getContext('2d'),i,true);
    });
  },120);
  setInterval(()=>{if(!paused()) {const moved=machines.liftsTick();if(inventory.waterDamageTick() || moved) draw();}},1000);
  setInterval(()=>{
    if(paused()) return;
    if(battle.tick()) draw();
    followLeader(players,leader,i=>panels[i].mode,(i,action)=>act(action,false,i,true));
  },200);
  setInterval(()=>{if(!paused()) radio.second();},1000);
  if(level.water.speed && level.water.speed!==99) setInterval(()=>{
    if(!paused() && machines.waterTick()) draw();
  },20*level.water.speed);
  document.body.classList.add('mission');
  menu.disabled = false;
  draw();
}
start().catch(error=>{document.querySelector('#briefing').close();document.querySelector('#status').textContent=error.message;});
