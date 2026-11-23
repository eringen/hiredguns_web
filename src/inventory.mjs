import {physique} from './psionics.mjs';
import {variedPeriod} from './samples.mjs';
// Controls&Movement.s: add_weight, pick_up_into_inven and drop_item.
export function inventorySession(level, equipment, squad = [0,1,2,3], sound=()=>{}) {
  const {items, characters} = equipment;
  const ground = new Map();
  const bodies=new Map();
  let armed=0;
  const players = level.starts.slice(0,squad.length).map((position, index) => {
    const character = characters[squad[index]];
    const pack = character.pack.map(item => ({...item}));
    return {...position, dir:0, character, pack, held:null, fitness:character.fitness, fallDamage:0, waterFall:0};
  });
  const key = (x,y,z) => (z * level.depth + y) * level.width + x;
  function at(x,y,z) {
    const location = key(x,y,z);
    const owner=bodyOwner(x,y,z);
    if(owner) return owner.held??owner.pack[0]??null;
    if (ground.has(location)) return ground.get(location);
    const {terrain, contents} = level.cell(x,y,z);
    const container = terrain >>> 28;
    const id = contents & 255;
    if (!(terrain & 32) || container < 2 || container > 6 || !items[id]) return null;
    return {id, damage:(contents >>> 8) & 255, ammo:(contents >>> 16) & 255};
  }
  function bodyOwner(x,y,z) {
    const c=level.cell(x,y,z);
    if(!(c.terrain&32) || (c.terrain>>>28)!==7) return;
    return players[bodies.get(key(x,y,z))??((c.automap>>>12)&255)];
  }
  function placeBody(p) {
    let {x,y,floor:z}=p;
    const visited=new Set();
    const solid=b=>b!==null && b<=6;
    while(x>=0 && y>=0 && z>=0 && x<level.width && y<level.depth) {
      const k=key(x,y,z);
      if(visited.has(k)) return;
      visited.add(k);
      const c=level.cell(x,y,z),below=z?level.cell(x,y,z-1).blockType:null;
      const aux=(c.terrain&32)?c.terrain>>>28:null;
      let stair=below>=16 && below<=19?below-16:null;
      if(stair===null && !solid(below) && c.floorType===null) {z--;continue;}
      if(stair===null && aux>=8 && aux<=11) stair=aux-8;
      if(stair!==null || aux===12 || aux===13) {
        const choices=stair!==null?[[[0,1],[-1,0],[0,-1],[1,0]][stair]]:aux===12?[[0,-1],[0,1]]:[[-1,0],[1,0]];
        const next=choices.find(([dx,dy])=>x+dx>=0 && y+dy>=0 && x+dx<level.width && y+dy<level.depth && !solid(level.cell(x+dx,y+dy,z).blockType));
        if(!next) return;
        x+=next[0];y+=next[1];continue;
      }
      ground.delete(k);
      bodies.set(k,players.indexOf(p));
      level.setTerrain(k,(c.terrain&0x0fffffff)|32|(7<<28));return;
    }
  }
  function moveCargo(from,to,onLift=false) {
    const owner=bodyOwner(...from),item=at(...from);
    if(!owner && !item) return;
    const src=level.cell(...from),dest=level.cell(...to);
    if(!onLift && (dest.floorType!==null || (dest.terrain&32) || at(...to))) return;
    const srcKey=key(...from),destKey=key(...to);
    ground.set(srcKey,null);bodies.delete(srcKey);
    level.setTerrain(srcKey,src.terrain&~(32|(15<<28)));
    const aux=owner?7:items[item.id].container;
    level.setTerrain(destKey,(dest.terrain&0x0fffffff)|32|(aux<<28));
    if(owner) bodies.set(destKey,players.indexOf(owner));
    else ground.set(destKey,item);
  }
  function weight(p) {
    if(p.powers?.wings) return 0;
    return [...p.pack,p.held].reduce((total,item) => {
      if (!item) return total;
      const def = items[item.id];
      return total + def.weight * ([4,21,23].includes(def.category) ? item.ammo : 1);
    },0);
  }
  function noRoom(p,message) {
    p.noRoomFrames=150;
    return message;
  }
  function pickup(p,intoHands=false,index=0) {
    const item = at(p.x,p.y,p.floor);
    if (!item) return 'Nothing to pick up.';
    if (Math.floor(weight(p)/140) > physique(p)) return 'Too heavy.';
    if (p.pack.length >= 30 && (!intoHands || p.held)) return noRoom(p,'Pack full.');
    const owner=bodyOwner(p.x,p.y,p.floor);
    if(owner) {if(owner.held) owner.held=null;else owner.pack.shift();}
    if(intoHands) {if(p.held) p.pack.splice(index,0,p.held);p.held=item;}
    else p.pack.splice(index,0,item);
    if(owner) return 'Picked up '+items[item.id].name;
    const cell=level.cell(p.x,p.y,p.floor);
    if((cell.terrain&32) && cell.terrain>>>28>=2 && cell.terrain>>>28<=6)
      level.setTerrain(key(p.x,p.y,p.floor),cell.terrain&~(32|(15<<28)));
    ground.set(key(p.x,p.y,p.floor),null);
    return 'Picked up ' + items[item.id].name;
  }
  function drop(p) {
    if (!p.held) return 'Hands empty.';
    const {x,y,floor} = p;
    const location = key(x,y,floor);
    const cell = level.cell(x,y,floor);
    const owner=bodyOwner(x,y,floor);
    if(owner) {
      if(owner.pack.length<30) owner.pack.push(p.held);
      else if(!owner.held) owner.held=p.held;
      else return noRoom(p,'No room here.');
      p.held=null;return 'Item dropped.';
    }
    if(level.style===4 && (cell.terrain&32) && !(cell.terrain>>>28)) {
      const def=items[p.held.id];
      if(def.category!==22 || def.core!==((cell.automap>>>12)&255)) return noRoom(p,'Core does not fit.');
      level.setTerrain(location,cell.terrain|(1<<28));
      armed++;p.held=null;
      return 'Generator armed ('+armed+'/4).';
    }
    if (at(x,y,floor) || (cell.terrain & 32)) return noRoom(p,'No room here.');
    if (cell.floorType === null && (!floor || level.cell(x,y,floor-1).blockType === null)) return noRoom(p,'No supporting floor.');
    level.setTerrain(location,(cell.terrain&~(15<<28))|32|(items[p.held.id].container<<28));
    ground.set(location,p.held);
    p.held=null;
    return 'Item dropped.';
  }
  function equip(p,index) {
    if (!p.pack[index]) return;
    const old = p.held;
    p.held = p.pack[index];
    if (old) p.pack[index]=old;
    else p.pack.splice(index,1);
  }
  function stow(p,index=0) {
    if (!p.held) return 'Hands empty.';
    if (p.pack.length >= 30) return noRoom(p,'Pack full.');
    p.pack.splice(index,0,p.held);
    p.held = null;
    return 'Item stowed.';
  }
  // reload_item checks clip types in preference order and consumes one stack.
  function reload(p) {
    const gun=p.held && items[p.held.id];
    if (!gun || ![0,15,16,20].includes(gun.category)) return 'Equip a firearm first.';
    const room=gun.capacity-p.held.ammo;
    if (room<=0) return 'Already loaded.';
    for (const id of gun.clips) {
      if (!id) break;
      const index=p.pack.findIndex(item=>item.id===id);
      if (index<0) continue;
      const clip=p.pack[index];
      const rounds=Math.min(room,clip.ammo);
      p.held.ammo+=rounds;
      clip.ammo-=rounds;
      if (!clip.ammo) p.pack.splice(index,1);
      return null;
    }
    return 'No compatible ammunition.';
  }
  // Main.s players_fall runs once per six PAL fields. A player occupies one map cell.
  function gravityTick() {
    let changed = false;
    for (const p of players) {
      if (!p.fitness || p.exited) continue;
      const {x,y,floor} = p;
      const here = level.cell(x,y,floor);
      const water = here.terrain & 4 ? (here.terrain >>> 17) & 3 : -1;
      if (water >= 2) {
        p.fallDamage = 0;
        if (p.waterFall) { p.waterFall--; continue; }
        p.waterFall = 2;
      } else p.waterFall = 0;
      const below = floor ? level.cell(x,y,floor-1).blockType : null;
      const occupied = players.some(q=>q!==p && !q.exited && q.fitness && q.x===x && q.y===y && q.floor===floor-1);
      const tree = floor>=2 && level.cell(x,y,floor-2).blockType===4;
      if (floor && here.floorType===null && below===null && !tree && !occupied) {
        p.floor--;
        const impact = p.fallDamage || (Math.floor(weight(p)/p.character.agility)+physique(p))*32;
        p.fallDamage = Math.min(0x1000000,impact*2);
        changed = true;
      } else if (p.fallDamage) {
        const impact = water<0 ? p.fallDamage : water===0 ? p.fallDamage>>>2 : 0;
        if(impact) hit(p,impact,false);
        p.fallDamage=0;
        changed=true;
      }
    }
    return changed;
  }
  function damageItem(item,amount) {
    const def=items[item.id];
    if(!def.maxDamage) return;
    const damage=((item.damage<<8)+amount)&65535;
    if(damage>=def.maxDamage) item.id=def.container===6?52:def.container===5?111:22;
    else item.damage=damage>>>8;
  }
  function hit(p,impact,damagePack,kind) {
    const shield=p.powers?.shield?.id;
    const absorbed=shield===87 || (shield===86 && kind==='fire');
    const severity=Math.floor(impact/(absorbed?8:1)/physique(p));
    p.healthFrames=((p.healthFrames??0)+1+Math.floor(severity*100/512))&255;
    if(kind==='bullet') {p.flashFrames=5;p.flashColor=1;}
    if(kind==='melee' && severity) {
      const mark=Math.random()<0.5?'claws':'bigClaws';
      if(!p[mark]) p[mark]={frames:0,x:Math.floor(Math.random()*128)};
      p[mark].frames=Math.min(32767,p[mark].frames+severity);
    }
    loseFitness(p,severity*50);
    if(damagePack) {
      const carried=[...p.pack,p.held].filter(Boolean);
      for(const item of carried) damageItem(item,Math.floor(impact/(2*carried.length)));
    }
  }
  function loseFitness(p,amount) {
    if(!p.fitness) return;
    if(amount<=0) return;
    const gender=p.character.gender;
    if(p.gruntFrames>=100) {
      p.gruntFrames=0;
      sound(['MaleGrunt','FemaleGrunt'][gender]??'MetalClang',variedPeriod(gender<2?262:128),2);
    }
    p.fitness-=amount;
    if(p.fitness<655) {p.fitness=0;placeBody(p);if(gender===1) sound('EchoScream',180,players.indexOf(p)%2);}
  }
  function waterDamageTick() {
    let changed=false;
    for(const p of players) {
      if(!p.fitness || p.exited) continue;
      const {terrain}=level.cell(p.x,p.y,p.floor);
      if(!(terrain & 4) || ((terrain>>>17)&3)<2) {p.underwater=0;continue;}
      if(p.character.race!==1 && p.powers?.water?.id!==97) {
        p.underwater=(p.underwater??0)+1;
        if(p.underwater>Math.floor(physique(p)*p.fitness/655/400)) {
          p.drowningFrames=150;
          hit(p,p.underwater*200,false);changed=true;
        }
      }
      else p.underwater=0;
      if(p.powers?.water?.id===100) continue;
      for(const item of [...p.pack,p.held].filter(Boolean)) {
        const def=items[item.id];
        if(!def.waterDamage || !def.maxDamage) continue;
        damageItem(item,def.waterDamage<<8);
        changed=true;
      }
    }
    return changed;
  }
  function quench(p) {
    const c=level.cell(p.x,p.y,p.floor);
    if(!(c.terrain&4) || (c.terrain&32) || (c.floorType===null && (!p.floor || !(level.cell(p.x,p.y,p.floor-1).terrain&64)))) return false;
    const k=key(p.x,p.y,p.floor);
    ground.set(k,{id:56,ammo:0,damage:0});
    level.setTerrain(k,(c.terrain&0x0fffffff)|32|(items[56].container<<28));return true;
  }
  function snapshot() {
    return {armed,bodies:[...bodies],members:players.map(({x,y,floor,dir,held,pack,fitness,powers,inTeam,path,psiExperience,gruntFrames,poison,poisonCount,underwater,drowningFrames,exited,fallDamage,waterFall})=>({x,y,floor,dir,held,pack,fitness,powers,inTeam,path,psiExperience,gruntFrames,poison,poisonCount,underwater,drowningFrames,exited,fallDamage,waterFall})),ground:[...ground]};
  }
  function restore(state) {
    const validItem = item => item && items[item.id] && Number.isInteger(item.ammo) && Number.isInteger(item.damage);
    if (state.members.length !== players.length || !state.members.every(p=>
      Number.isInteger(p.dir) && p.dir>=0 && p.dir<4 && level.cell(p.x,p.y,p.floor) &&
      (!p.held || validItem(p.held)) && p.pack.every(validItem)) ||
      !state.ground.every(([key,item])=>Number.isInteger(key) && (!item || validItem(item)))) {
      throw new Error('Invalid saved inventory.');
    }
    state.members.forEach(({x,y,floor,dir,held,pack,fitness,powers,inTeam,path,psiExperience,gruntFrames,poison,poisonCount,underwater,drowningFrames,exited,fallDamage,waterFall},i)=>Object.assign(players[i],{x,y,floor,dir,held,pack,powers:powers??{},inTeam:!!inTeam,path:path??[],psiExperience:psiExperience??0,gruntFrames:gruntFrames??0,poison:poison??0,poisonCount:poisonCount??0,underwater:underwater??0,drowningFrames:drowningFrames??0,exited:!!exited,fitness:fitness??players[i].character.fitness,fallDamage:fallDamage??0,waterFall:waterFall??0}));
    armed=state.armed??0;
    bodies.clear();for(const [k,owner] of state.bodies??[]) bodies.set(k,owner);
    ground.clear();
    for(const [k,item] of state.ground) {
      ground.set(k,item);
      if(!item) continue;
      const c=level.cell(k%level.width,Math.floor(k/level.width)%level.depth,Math.floor(k/(level.width*level.depth)));
      if(!(c.terrain&32)) level.setTerrain(k,c.terrain|32|(items[item.id].container<<28));
    }
  }
  return {players,quench,loseFitness,moveCargo,get armed(){return armed;}, hit, waterDamageTick, gravityTick, snapshot, restore, at, weight, pickup, drop, equip, stow, reload};
}
