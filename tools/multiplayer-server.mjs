import {roomSections} from '../src/room-wire.mjs';
import {advanceEffects,activeEffects} from '../src/effects.mjs';
import {agePowers} from '../src/psionics.mjs';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { readLevel } from '../src/level.mjs';

import { combat } from '../src/combat.mjs';
import {chatter} from '../src/chatter.mjs';
import {scrollMap} from '../src/dts.mjs';
import {fieldAction,followLeader} from '../src/controls.mjs';
import {machinery} from '../src/machinery.mjs';
import { inventorySession } from '../src/inventory.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../build/preview');
const catalog=JSON.parse(await readFile(join(root,'levels.json'),'utf8'));
const originId=catalog.find(m=>m.locationType===2).id;
const maps=new Map(await Promise.all(catalog.filter(m=>['Campaign','Training'].includes(m.group)).map(async m=>[m.id,await readFile(join(root,'maps',m.id+'.map'))])));
const equipment = JSON.parse(await readFile(join(root, 'equipment.json'), 'utf8'));
const chatterData=JSON.parse(await readFile(join(root,'chatter.json'),'utf8'));
const radioFont=await readFile(join(root,'hud-font.bin'));
const rooms = new Map();
const publicOrigin = process.env.PUBLIC_ORIGIN && new URL(process.env.PUBLIC_ORIGIN).origin;

const moves = new Map([['Forward',0],['Back',2],['Strafe left',3],['Strafe right',1]]);
const types = {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg'};
const assets = /^\/(?:[\w-]+\.(?:mjs|json|bin|pcm|8svx|mp3)|(?:index|isometric)\.html|(?:art|maps|styles|atmos|vendor|isometric-textures)\/(?:[\w-]+\/)*[\w.-]+)$/;

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if(req.method==='GET' && /^\/rooms\/[0-9a-f]{24}$/.test(url.pathname)){
      const room=rooms.get(url.pathname.slice(7));
      if(!room){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ids:room.ids,map:room.map,generation:room.generation}));return;
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!assets.test(path) || !['HEAD','GET'].includes(req.method)) {
      res.writeHead(404).end(); return;
    }
    const file = join(root,path);
    const info = await stat(file);
    if (!info.isFile()) throw Error();
    res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','Content-Length':info.size});
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});

function deploy(room,map,members){
  const level=readLevel(maps.get(map)),events=[];
  const sound=(name,period,channel=0,volume=63)=>events.push({name,period,channel,volume});
  const shake=power=>events.push({shake:power});
  const inventory=inventorySession(level,equipment,room.ids,sound);
  const panels=inventory.players.map(()=>({revealed:[]}));
  const battle=combat(level,equipment,inventory,(sample,period)=>events.push({sample,period}),sound,p=>{
    const floors=panels[inventory.players.indexOf(p)].revealed;
    if(!floors.includes(p.floor)) floors.push(p.floor);
  },(p,x,y,floor)=>{
    machines.pad(p.x,p.y,p.floor,true);Object.assign(p,{x,y,floor});
    machines.pad(x,y,floor,false);sound('Teleport',683,inventory.players.indexOf(p)%2);
  },shake);
  const machines=machinery(level,inventory.players,(name,period,key)=>{if(name!=='DoorOpening') events.push({name,period,key});},battle.at,inventory.moveCargo,battle.hatchAt,shake);
  inventory.players.forEach((p,i)=>Object.assign(p,{mode:0,index:0},members?.[i]));
  Object.assign(room,{map,chart:null,level,events,sound,inventory,battle,machines,squad:inventory.players,phase:'play',clock:0,leader:-1,panels,radio:chatter(level,inventory.players,chatterData),line:null,lastCore:0});
  battle.start();
}
function reachable(current,map){
  return catalog.some(m=>m.id===map && m.group==='Campaign') && (current===map || catalog.find(m=>m.id===current)?.routes.includes(map));
}
function apply(room,slot,action,mouse) {
  const p=room.squad[slot];
  if(typeof action!=='string') return false;
  if(action==='Pause' && room.phase==='play'){room.phase='paused';return true;}
  if(action==='Resume' && room.phase==='paused'){room.phase='play';return true;}
  if(room.phase==='map' && slot===0){
    const match=/^(Deploy|Travel) ([0-9]+)$/.exec(action);
    if(!match || !reachable(room.campaign.current,Number(match[2]))) return false;
    const map=Number(match[2]);
    if(match[1]==='Travel'){
      if(!room.campaign.completed.includes(map)) return false;
      room.campaign.current=map;room.chart=null;return true;
    }
    deploy(room,map,room.squad.map(({fitness,held,pack,psiExperience})=>({fitness,held,pack,psiExperience})));
    room.generation++;
    return true;
  }
  if(room.phase!=='play' || !p.fitness) return false;
  if(p.exited){
    if(action!=='Return' || room.battle.at(p.x,p.y,p.floor) || room.squad.some(q=>q!==p && !q.exited && q.fitness && q.x===p.x && q.y===p.y && q.floor===p.floor)) return false;
    p.exited=false;return true;
  }
  if(action==='Pickup hands' || action==='Pickup pack') room.inventory.pickup(p,action==='Pickup hands',p.index);
  else if(action==='Drop') room.inventory.drop(p);
  else if(action==='Follow'){p.inTeam=!p.inTeam;room.leader=-1;}
  else if(action==='Item info' && p.held) p.mode=6;
  else if(action==='Use held' && p.mode===1) room.battle.use(p,p.index);
  else if (['View','Store','DTS','Stats'].includes(action)) {
    p.mode = ['View','Store','DTS','Stats'].indexOf(action);
    if(p.mode===2) scrollMap(room.panels[slot],p.x,p.y);
  } else if (p.mode === 1) {
    if (action==='Forward') p.index=Math.max(0,p.index-1);
    else if (action==='Back') p.index=Math.min(p.index+1,p.pack.length-1);
    else if (action==='Right') room.inventory.equip(p,p.index);
    else if (action==='Left') room.inventory.stow(p,p.index);
    else return false;
    p.index=Math.max(0,Math.min(p.index,p.pack.length-1));
  } else if(p.mode===2){
    const panel=room.panels[slot];
    if(action==='Center map') scrollMap(panel,p.x,p.y);
    else if(['Left','Right','Forward','Back'].includes(action)) scrollMap(panel,panel.x+(action==='Right')-(action==='Left'),panel.y+(action==='Back')-(action==='Forward'));
    else return false;
  } else if (p.mode !== 0) return false;
  else if(/^Throw [0-3]$/.test(action)) room.battle.throwGrenade(p,Number(action.slice(-1)));
  else if(['Fire','Use','Pull','Throw power','Left','Right',...moves.keys()].includes(action)){
    if(p.inTeam && room.leader!==slot && !['Use','Pull','Fire','Throw power'].includes(action)){
      room.leader=slot;room.radio.bank(21+slot);
    }
    const beforeEvents=room.events.length;
    const worldChanged=fieldAction({...room,equipment,bank:room.radio.bank,notice:()=>{}},slot,p,action,mouse);
    if(action==='Fire' && !worldChanged && p.held && [0,15,16].includes(equipment.items[p.held.id].category)){
      if(beforeEvents===room.events.length) return false;
      return 'hud';
    }
  } else return false;
  return true;
}

function publish(room,worldChanged=true) {
  if(room.phase==='play'){
    if(room.squad.every(p=>!p.fitness)) room.phase='over';
    else if(room.squad.every(p=>p.exited || !p.fitness)){
      room.phase=room.campaign && room.inventory.armed!==4?'map':'over';
      if(room.campaign){
        room.campaign.current=room.map;
        if(!room.campaign.completed.includes(room.map)) room.campaign.completed.push(room.map);
      }
    }
  }
  room.radio.observe();
  if(room.inventory.armed===4 && room.lastCore!==4) room.radio.armed();
  room.lastCore=room.inventory.armed;
  for(const p of room.squad){
    const path=p.path??=[],last=path.at(-1);
    if(!last || last.x!==p.x || last.y!==p.y || last.floor!==p.floor){
      path.push({x:p.x,y:p.y,floor:p.floor});if(path.length>20) path.shift();p.path=path;
    }
  }
  const squad=room.squad.map(({x,y,floor,dir,mode,index,pack,held,fitness,throwPower})=>({x,y,floor,dir,mode,index,pack,held,fitness,throwPower}));
  const state={room:room.id, tick:room.clock,worldChanged,line:room.line,maps:room.panels,effects:room.squad.map(activeEffects),movingLifts:[...room.machines.movingLifts].map(l=>room.level.lifts.indexOf(l)),map:room.map,generation:room.generation,phase:room.phase,chart:room.chart,campaign:room.campaign,squad, events:room.events, battle:room.battle.snapshot(), machines:room.machines.snapshot(),inventory:room.inventory.snapshot(), occupied:room.peers.map(Boolean)};
  let sections,delta;
  if(room.peers.some(peer=>peer?.compact)){
    sections=roomSections(state);delta={};
    room.wireBaseline??={};
    for(const [key,value] of Object.entries(sections)){
      const encoded=JSON.stringify(value);
      if(room.wireBaseline[key]!==encoded){
        delta[key]=value;room.wireBaseline[key]=encoded;
      }
    }
  }
  room.peers.forEach((socket,slot)=>{
    if(socket?.readyState!==WebSocket.OPEN) return;
    const identity={slot,token:room.tokens[slot]};
    if(!socket.compact){socket.send(JSON.stringify({...state,...identity}));return;}
    socket.send(JSON.stringify({...identity,tick:room.clock,worldChanged,events:room.events,
      sections:socket.initialized?delta:sections}));
    socket.initialized=true;
  });
  room.events.length=0;
}

const ws = new WebSocketServer({noServer:true,maxPayload:512});
server.on('upgrade',(req,socket,head)=>{
  let id,capacity,ids,map,token,compact;
  try {
    const origin = new URL(req.headers.origin);
    if (!['https:','http:'].includes(origin.protocol) || (origin.host !== req.headers.host && origin.origin !== publicOrigin)) throw Error();
    const url=new URL(req.url,'http://localhost');
    const match = /^\/rooms\/(new(?:-[234])?|[0-9a-f]{24})$/.exec(url.pathname);
    if (!match) throw Error();
    id = match[1];
    capacity=id.startsWith('new') ? Number(id.split('-')[1] ?? 4) : 0;
    token=url.searchParams.get('token');
    compact=url.searchParams.get('updates')==='1';
    if(capacity){
      ids=url.searchParams.has('squad')?url.searchParams.get('squad').split(',').map(Number):[0,1,2,3].slice(0,capacity);
      map=Number(url.searchParams.get('map') ?? 43);
      if(ids.length!==capacity || new Set(ids).size!==capacity || !ids.every(n=>Number.isInteger(n) && equipment.characters[n]) ||
        !maps.has(map) || !(catalog.find(m=>m.id===map).group==='Training' || reachable(originId,map))) throw Error();
    }
  } catch { socket.destroy(); return; }
  ws.handleUpgrade(req,socket,head,client=>{
    let room = rooms.get(id);
    if (capacity && rooms.size<128) {
      id = randomBytes(12).toString('hex');
      room={id,peers:Array(capacity).fill(null),ids,tokens:Array(capacity).fill(null),generation:0,
        campaign:catalog.find(m=>m.id===map).group==='Campaign'?{current:originId,completed:[]}:null};
      deploy(room,map);
      rooms.set(id,room);
    }
    const previous=token && room ? room.tokens.indexOf(token) : -1;
    const slot=previous>=0 ? previous : room?.peers.indexOf(null);
    if (!room || slot<0) { client.close(1008,room?'Room full':'Room unavailable'); return; }
    clearTimeout(room.expiry);
    room.peers[slot]?.close();
    client.compact=compact;
    room.peers[slot] = client;
    if(previous<0) room.tokens[slot]=randomBytes(16).toString('hex');
    let lastAction = -Infinity;
    client.on('error',()=>client.terminate());
    client.on('message',(bytes,binary)=>{
      let cmd;
      try { cmd=JSON.parse(bytes); } catch { return; }
      if (binary || room.peers[slot]!==client || cmd?.slot!==slot) return;
      if(cmd.chart){
        if(slot!==0 || room.phase!=='map') return;
        const {x,y,sx,sy,replay}=cmd.chart;
        if(![x,y,sx,sy].every(Number.isInteger) || x<0 || x>=960 || y<0 || y>=384 ||
          sx<0 || sx>960-516 || sy<0 || sy>384-162 || typeof replay!=='boolean') return;
        room.chart={x,y,sx,sy,replay};
        const packet=JSON.stringify({type:'chart',chart:room.chart});
        for(const peer of room.peers) if(peer!==client && peer?.compact && peer.readyState===WebSocket.OPEN) peer.send(packet);
        return;
      }
      const movement=room.squad[slot].mode===0 && (moves.has(cmd.action) || cmd.action==='Left' || cmd.action==='Right');
      if (movement && performance.now()-lastAction<90) return;
      const applied=apply(room,slot,cmd.action,cmd.mouse===true);
      if (applied) { if(movement) lastAction=performance.now(); publish(room,applied!=='hud'); }
    });
    client.on('close',()=>{
      if(room.peers[slot]!==client) return;
      room.peers[slot]=null;
      if (room.peers.some(Boolean)) publish(room);
      else room.expiry=setTimeout(()=>rooms.delete(id),120000).unref();
    });
    publish(room);
  });
});
setInterval(()=>{
  for(const room of rooms.values()) {
    if(!room.peers.some(Boolean) || room.phase!=='play') continue;
    const tick=++room.clock,{inventory,machines,battle}=room;
    let changed=false;
    for(const p of room.squad){
      if(p.fitness && !p.exited) p.gruntFrames=Math.min(100,(p.gruntFrames??0)+1);
      advanceEffects(p,equipment);
      if(agePowers(p)) changed=true;
    }
    if(tick%6===0){
      const blocks=machines.blocksTick(), doors=machines.doorsTick();
      changed=inventory.gravityTick() || blocks || doors || changed;
    }
    if(tick%10===0){
      changed=battle.tick() || changed;
      followLeader(room.squad,room.leader,i=>room.squad[i].mode,(i,action)=>{
        fieldAction({...room,equipment,bank:room.radio.bank,notice:()=>{}},i,room.squad[i],action,false,true);
        changed=true;
      });
    }
    if(tick%50===0) room.radio.second();
    if(!room.line || tick>=room.line.end){
      const text=room.radio.take();
      if(text){
        room.line={text,start:tick,end:tick+322+[...text].reduce((w,c)=>w+(radioFont[20+c.charCodeAt(0)-32]||0),0)};
        changed=true;
      }else room.line=null;
    }
    if(tick%50===0){
      const wereMoving=machines.movingLifts.size;
      const lifts=machines.liftsTick();
      changed=inventory.waterDamageTick() || lifts || wereMoving>0 || changed;
    }
    const speed=room.level.water.speed;
    if(speed && speed!==99 && tick%speed===0) changed=machines.waterTick() || changed;
    if(changed || room.events.length) publish(room);
  }
},20).unref();
server.listen(Number(process.env.PORT ?? 8013),'0.0.0.0',()=>{
  console.log('Multiplayer listening on 0.0.0.0:'+server.address().port);
});
