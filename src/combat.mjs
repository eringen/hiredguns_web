import {castAmp} from './psionics.mjs';
import {extraSamples,variedPeriod} from './samples.mjs';
const vectors=[[0,-1],[1,0],[0,1],[-1,0]];
export function combat(level,equipment,inventory,play,sound=()=>{},onReveal=()=>{},onTeleport=(p,x,y,floor)=>Object.assign(p,{x,y,floor}),onShake=()=>{}) {
  const {players}=inventory, actors=[], eggs=[], flames=[], grenades=[];
  let ticks=0;
  const living=p=>p.fitness>0 && !p.exited;
  const at=(x,y,z)=>actors.find(m=>m.x===x && m.y===y && m.floor===z);
  const playerAt=(x,y,z)=>players.find(p=>living(p) && p.x===x && p.y===y && p.floor===z);
  const inside=(x,y)=>x>=0 && x<level.width && y>=0 && y<level.depth;
  for(let z=0;z<level.height;z++) for(let y=0;y<level.depth;y++) for(let x=0;x<level.width;x++) {
    const c=level.cell(x,y,z);
    if((c.terrain&32) && !(c.terrain>>>28)) eggs.push({x,y,floor:z,type:(c.automap>>>12)&255,time:c.automap>>>20});
  }
  const graphics=type=>equipment.monsters[type]?.graphics===20?level.firstMonster:equipment.monsters[type]?.graphics;
  const species=[...new Set([level.firstMonster,level.secondMonster,...eggs.map(e=>graphics(e.type))].filter(n=>n>=1 && n<=19))];
  function hatch(e,shot=false) {
    const {x,y,floor}=e,c=level.cell(x,y,floor);
    if(e.open || e.time===4093 || !(c.terrain&32) || (c.terrain>>>28)!==0 || c.blockType!==null || at(x,y,floor) || actors.length>=32) return false;
    if(e.time!==4093 && equipment.monsters[e.type]) {
      actors.push({x,y,floor,type:e.type,dir:0,fitness:65535,wait:equipment.monsters[e.type].speed});
    } else if(!shot) return false;
    e.open=true;
    const opened=shot || !(c.contents&(1<<28));
    level.setTerrain((floor*level.depth+y)*level.width+x,(c.terrain&~32)|(opened?((1<<28)|32):0));
    if(opened && !shot) play(5,360);
    return true;
  }
  function hatchAt(x,y,z) {
    const egg=eggs.find(e=>e.x===x && e.y===y && e.floor===z);
    return !!egg && hatch(egg);
  }
  function start(){for(const egg of eggs) if(!egg.time) hatch(egg);}
  function hurtMonster(m,impact) {
    const def=equipment.monsters[m.type],damage=Math.floor(impact/def.physique)*100;
    m.fitness-=damage;
    if(damage>0) m.hitFlash=2;
    if(m.fitness<0) {
      actors.splice(actors.indexOf(m),1);
      const c=level.cell(m.x,m.y,m.floor);
      const below=m.floor?level.cell(m.x,m.y,m.floor-1).blockType:null;
      if(!(c.terrain&32) && (c.floorType!==null || below===0 || below===1)) {
        const slot=graphics(m.type)===level.firstMonster?14:15;
        level.setTerrain((m.floor*level.depth+m.y)*level.width+m.x,(c.terrain&0x0fffffff)|32|(slot<<28));
      }
    }
    else if(def.stun) m.wait+=Math.min(127,Math.floor(damage/5000));
  }
  function fireHit(f) {
    const p=playerAt(f.x,f.y,f.floor),m=at(f.x,f.y,f.floor);
    if(p) inventory.hit(p,f.density*4000,true,'fire');
    if(m) hurtMonster(m,f.density*7000);
    const e=eggs.find(e=>!e.open && e.x===f.x && e.y===f.y && e.floor===f.floor);
    if(e && level.style!==4) hatch(e,true);
  }
  function flight(f,dir) {
    const [dx,dy]=vectors[dir]??[0,0],x=f.x+dx,y=f.y+dy;
    const floor=f.floor+(dir===4?1:dir===5?-1:0);
    if(!inside(x,y) || floor<0 || floor>=level.height) return false;
    const c=level.cell(x,y,floor);
    if((c.terrain&64) || (dir===4 && c.floorType!==null) ||
       (dir===5 && level.cell(f.x,f.y,f.floor).floorType!==null) ||
       (c.blockType>=16 && c.blockType<=21) || (c.blockType===4 && ![0,2].includes(level.style))) return false;
    Object.assign(f,{x,y,floor});return true;
  }
  function launch(m,dir,density,speed,decay) {
    if(!density || flames.length>=32) return;
    const f={x:m.x,y:m.y,floor:m.floor,dir,density,speed,decay,flip:Math.random()<0.5,wait:speed,reverse:(dir+2)%4};
    if(dir<4) flight(f,dir);
    flames.push(f);fireHit(f);
  }
  function ranged(m,def,dir=m.dir) {
    if(!def.fireballDensity) return false;
    let x=m.x,y=m.y;
    const [dx,dy]=vectors[dir];
    for(let n=0;n<=def.range;n++) {
      x+=dx;y+=dy;if(!inside(x,y)) return false;
      if(playerAt(x,y,m.floor)) {
        const volume=Math.max(...players.map(p=>{
          const dx=Math.abs(p.x-m.x),dy=Math.abs(p.y-m.y),dz=Math.abs(p.floor-m.floor);
          return Math.max(dx,dy,dz)<12?equipment.audioDistance[dz*144+dy*12+dx]:0;
        }));
        if(volume) sound('Gun',95,1,volume);
        m.dir=dir;
        launch(m,dir,def.fireballDensity,def.projectileSpeed,def.decay);return true;
      }
      const b=level.cell(x,y,m.floor).blockType;
      if(at(x,y,m.floor) || (b!==null && b!==5 && b!==7 && !(b===4 && [0,2].includes(level.style)))) return false;
    }
    return false;
  }
  const grenadeAt=(x,y,z)=>grenades.find(g=>g.x===x && g.y===y && g.floor===z);
  function throwGrenade(p,strength=3) {
    if(!p.held?.ammo || grenades.length>=32) return false;
    const def=equipment.items[p.held.id],launcher=def.category===20;
    if(!launcher && def.category!==21) return false;
    const id=launcher?def.clips[0]:p.held.id;
    const [dx,dy]=vectors[p.dir];
    let x=p.x+dx,y=p.y+dy;
    if(!inside(x,y) || (level.cell(x,y,p.floor).terrain&64)) {x=p.x;y=p.y;}
    if(grenadeAt(x,y,p.floor)) return false;
    grenades.push({id,x,y,floor:p.floor,dir:p.dir,horizontal:launcher?-1:strength,
      velocity:launcher?-1000:[-5,-20,-16,-9][strength],height:25});
    p.held.ammo--;
    if(!p.held.ammo && !launcher) p.held=null;
    if(launcher) {startShot(p,def);play(def.sample,def.period);}
    return true;
  }
  function detonate(g) {
    grenades.splice(grenades.indexOf(g),1);
    const data=equipment.items[g.id].grenade;
    if(!data) return;
    data.fire.forEach((density,dir)=>{if(density) launch(g,[0,1,2,3,5,4][dir],density,1,2);});
    if(!data.type) {
      for(const actor of [...actors,...players.filter(living)]) {
        const dx=Math.abs(g.x-actor.x),dy=Math.abs(g.y-actor.y),dz=Math.abs(g.floor-actor.floor);
        if(Math.max(dx,dy,dz)>1) continue;
        const impact=[240000,160000,100000,60000][dx+dy+dz];
        if(actor.character) inventory.hit(actor,impact/2,false);
        else hurtMonster(actor,impact);
      }
    }
    // Main.s starts stun grenades three fields into the explosion envelope.
    onShake(data.type?20:17);
    play(7,550);
  }
  function advanceGrenade(g) {
    const current=level.cell(g.x,g.y,g.floor);
    if(current.blockType!==null || (current.terrain&64) || playerAt(g.x,g.y,g.floor) || at(g.x,g.y,g.floor)) {detonate(g);return;}
    const [dx,dy]=g.horizontal?vectors[g.dir]:[0,0];
    const x=g.x+dx,y=g.y+dy;
    let z=g.floor;
    if(g.horizontal) g.horizontal--;
    while(g.height<0) {
      if(current.floorType!==null || !z) {detonate(g);return;}
      z--;g.height+=32;
    }
    if(!inside(x,y)) {detonate(g);return;}
    const next=level.cell(x,y,z);
    if((next.terrain&64) || (next.blockType>=16 && next.blockType<=21)) {detonate(g);return;}
    Object.assign(g,{x,y,floor:z,drawHeight:g.height&31});
    if(next.blockType!==null || playerAt(x,y,z) || at(x,y,z)) {detonate(g);return;}
    if(level.style!==4 && g.drawHeight<=16 && (next.terrain&32) && (next.terrain>>>28)===0) {
      level.setTerrain((z*level.depth+y)*level.width+x,next.terrain|(1<<28));
      detonate(g);return;
    }
    if(g.velocity!==-1000) {g.height+=g.velocity;g.velocity=Math.max(-16,g.velocity-8);}
  }
  // Build one shortest-path field per occupied floor and movement type per AI tick.
  // Multiple living characters are destinations, so an inaccessible squad member
  // cannot lure every monster into the same dead end.
  function pursuitField(floor,waterOnly){
    const width=level.width,size=width*level.depth;
    const distances=new Int16Array(size).fill(-1),queue=new Uint16Array(size);
    let head=0,tail=0;
    for(const p of players){
      const k=p.y*width+p.x;
      if(living(p) && p.floor===floor && distances[k]===-1){distances[k]=0;queue[tail++]=k;}
    }
    while(head<tail){
      const k=queue[head++],x=k%width,y=Math.floor(k/width);
      for(const [dx,dy] of vectors){
        const nx=x+dx,ny=y+dy,next=ny*width+nx;
        if(!inside(nx,ny) || distances[next]!==-1) continue;
        const c=level.cell(nx,ny,floor);
        distances[next]=-2;
        if(c.blockType!==null || (waterOnly && !(c.terrain&4))) continue;
        if(c.floorType===null && !(c.terrain&4) && (!floor || level.cell(nx,ny,floor-1).blockType===null)) continue;
        distances[next]=distances[k]+1;queue[tail++]=next;
      }
    }
    return distances;
  }
  function tick() {
    ticks++;
    let changed=grenades.length>0;
    for(const m of actors) if(m.hitFlash && --m.hitFlash===0) changed=true;
    for(const g of [...grenades]) advanceGrenade(g);
    for(const e of eggs) {
      if(e.open || e.time===4093 || e.time===4095) continue;
      const limit=e.time===4094?Math.floor(Math.random()*4096):e.time;
      if((ticks*10&65535)>=(limit*1000&65535)) changed=hatch(e)||changed;
    }
    for(const f of [...flames]) {
      if(f.wait-->0) continue;
      f.wait=Math.max(0,f.speed-1);
      if(!flight(f,f.dir)) {
        f.dir=Math.floor(Math.random()*8);if(f.dir>5) f.dir>>=1;
        if(f.decay && f.dir===f.reverse) f.dir=(f.dir+2)%4;
        if(f.decay===2 || (f.decay===1 && --f.density<=0)) {flames.splice(flames.indexOf(f),1);changed=true;continue;}
      }
      f.flip=Math.random()<0.5;fireHit(f);changed=true;
    }
    for(const p of players) {
      if(!living(p) || !p.poison) continue;
      p.poisonCount-=10;
      if(p.poisonCount<0) {
        p.poisonCount+=p.character.physique+1;
        inventory.loseFitness(p,p.poison>>>1);
        changed=true;
      }
    }
    const fields=new Map();
    for(const m of [...actors]) {
      if(!actors.includes(m)) continue;
      const def=equipment.monsters[m.type];
      if(--m.wait>0) continue;
      m.wait=Math.max(1,def.speed);
      const distance=p=>Math.abs(p.x-m.x)+Math.abs(p.y-m.y);
      const target=players.filter(p=>living(p) && p.floor===m.floor).sort((a,b)=>distance(a)-distance(b))[0];
      if(!target) continue;
      if((def.speed<0 || distance(target)>1) && ranged(m,def)) {changed=true;continue;}
      if(def.speed<0) {
        m.dir=(m.dir+1)%4;changed=true;continue;
      }
      if(distance(target)>1 && def.fireballDensity){
        const aim=players.find(p=>living(p) && p.floor===m.floor && (p.x===m.x || p.y===m.y) &&
          distance(p)<=def.range+1);
        if(aim){
          const dir=aim.x!==m.x?(aim.x>m.x?1:3):(aim.y>m.y?2:0);
          if(dir!==m.dir && ranged(m,def,dir)){changed=true;continue;}
        }
      }
      const key=m.floor*2+Number(!!def.waterOnly);
      if(!fields.has(key)) fields.set(key,pursuitField(m.floor,def.waterOnly));
      const field=fields.get(key),here=field[m.y*level.width+m.x];
      const retreat=m.fitness<def.bravery && distance(target)>1;
      let best=null,bestScore=-Infinity;
      for(let n=0;n<4;n++){
        const dir=(m.dir+n)%4,x=m.x+vectors[dir][0],y=m.y+vectors[dir][1];
        if(!inside(x,y) || at(x,y,m.floor)) continue;
        const steps=field[y*level.width+x];
        if(steps<0 || (here>=0 && (retreat?steps<=here:steps>=here))) continue;
        const score=retreat?steps:-steps;
        if(score>bestScore){best={dir,x,y};bestScore=score;}
      }
      if(best){
        const {dir,x,y}=best;
        const p=playerAt(x,y,m.floor);
        if(p) {
          if(def.sample) sound(extraSamples[def.sample],variedPeriod(def.period),players.indexOf(p)%2);
          if(def.poison && p.character.gender<=1 && def.poison*655>(p.poison??0) && Math.floor(Math.random()*16)<=def.poison) {
            p.poison=def.poison*655;p.poisonCount=p.character.physique;
          }
          p.monsterAttackFrames=25;
          inventory.hit(p,(def.weaponModifier<<5)&65535,false,'melee');m.dir=dir;changed=true;continue;}
        m.dir=dir;m.x=x;m.y=y;changed=true;
      }
    }
    return changed;
  }
  function startShot(p,def) {
    if(def.animation) p.shot={id:p.held.id,frame:1,remaining:def.burst>=128?1:def.burst,dist:4,x:0,y:0};
    if(def.flash) {p.flashColor=def.flash;p.flashFrames=5;}
  }
  function blast(x,y,z,impact) {
    const player=playerAt(x,y,z),monster=at(x,y,z);
    if(player) inventory.hit(player,impact,false,'bullet');
    else if(monster) hurtMonster(monster,impact);
    else if(level.style!==4) {
      const egg=eggs.find(e=>!e.open && e.x===x && e.y===y && e.floor===z);
      if(egg) hatch(egg,true);
    }
  }
  // Return true when a weapon or device can change what the squad sees in the world.
  function use(p,index=0) {
    if(!p.held) return;
    const def=equipment.items[p.held.id];
    if(def.category===12) {
      if(p.psiFlash>3) return;
      if(castAmp(p,index,{level,inventory,launch,blast,occupied:(x,y,z)=>playerAt(x,y,z)||at(x,y,z),seen:onReveal,teleport:onTeleport})) {
        p.psiFlash=5;p.flashFrames=5;p.flashColor=def.flash;play(def.sample,def.period);
        return true;
      } else p.invalidFrames=150;
      return;
    }
    if(def.category===5 || def.category===19) {
      if([1,4].includes(p.character.race)===(def.category===19)) {
        if(p.held.id===64) p.poison=0;
        p.fitness=Math.min(65535,p.fitness+def.fitnessBoost);p.held=null;
        p.flashFrames=5;p.flashColor=def.flash;play(def.sample,def.period);
        return true;
      }
      return;
    }
    if(def.category===20 || def.category===21) return throwGrenade(p);
    if(![0,15,16].includes(def.category)) return;
    if(!p.held.ammo) {play(3,360);return;}
    if(ticks<(p.nextShot??0)) return;
    p.nextShot=ticks+Math.max(1,Math.ceil(def.burst/10));
    p.held.ammo-=Math.min(p.held.ammo,def.burst || 1);
    startShot(p,def);
    play(def.sample,def.period);
    if(def.category===15 || def.category===16) {
      const dirs=[p.dir,(p.dir+2)%4,(p.dir+1)%4,(p.dir+3)%4,5,4];
      def.fireDirections.forEach((density,i)=>launch(p,dirs[i],density,1,1));
      if(def.category===15) return true;
    }
    const impact=def.damagePerHit*def.burst*512;
    const [dx,dy]=vectors[p.dir];
    for(let x=p.x+dx,y=p.y+dy;inside(x,y);x+=dx,y+=dy) {
      const c=level.cell(x,y,p.floor),other=playerAt(x,y,p.floor),m=at(x,y,p.floor);
      const dist=Math.abs(x-p.x)+Math.abs(y-p.y)-1;
      if(p.shot && (other || m || c.blockType!==null || (c.terrain&64) || ((c.terrain&32) && !(c.terrain>>>28) && level.style!==4)) &&
         !([20,21].includes(c.blockType) && ((c.terrain>>>23)&31)>=5)) p.shot.dist=dist;
      if(other) {inventory.hit(other,impact,true,'bullet');return true;}
      if(m) {
        hurtMonster(m,impact);
        return true;
      }
      const egg=eggs.find(e=>!e.open && e.x===x && e.y===y && e.floor===p.floor);
      if(egg && level.style!==4) return hatch(egg,true) || def.category===16;
      if([20,21].includes(c.blockType) && ((c.terrain>>>23)&31)>=5) continue;
      if(c.blockType!==null || (c.terrain&64)) break;
    }
    return def.category===16;
  }
  function snapshot() {return {actors,flames,grenades,ticks,opened:eggs.map(e=>!!e.open)};}
  function restore(saved) {
    if(!saved) return;
    grenades.splice(0,grenades.length,...(saved.grenades??[]));
    flames.splice(0,flames.length,...(saved.flames??[]));actors.splice(0,actors.length,...saved.actors);ticks=saved.ticks;
    saved.opened.forEach((open,i)=>{eggs[i].open=open;});
  }
  return {start,at,graphics,hatchAt,grenadeAt,throwGrenade,flameAt:(x,y,z)=>flames.find(f=>f.x===x && f.y===y && f.floor===z),tick,use,species,snapshot,restore};
}
