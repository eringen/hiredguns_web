export function machinery(level,players,play=()=>{},monsterAt=()=>false,moveCargo=()=>{},hatchAt=()=>{},onShake=()=>{}) {
  const plane=level.width*level.depth;
  const blockMask=(63<<11)|2, floorMask=(3<<9)|1, variant=31<<23;
  const key=(x,y,z)=>(z*level.depth+y)*level.width+x;
  function cell(k) {return level.cell(k%level.width,Math.floor(k/level.width)%level.depth,Math.floor(k/plane));}
  const occupants=k=>players.filter(p=>p.fitness && !p.exited && key(p.x,p.y,p.floor)===k);
  function trigger(index,release) {
    const button=level.buttons[index];
    if(!button?.used) return;
    const n=release?1:0, op=button.actions[n], target=button.targets[n];
    if(op>=1 && op<=6) {
      const k=(target-level.terrainOffset)/4;
      if(!Number.isInteger(k) || k<0 || k>=plane*level.height) return;
      const c=cell(k);
      let value=c.terrain;
      if(op<=3) {
        if(c.floorType===null && op!==2) value|=1;
        else if(c.floorType!==null && c.floorType!==2 && op!==1) value&=~(1|32|(15<<28));
      } else if(c.blockType!==1 && (c.blockType===null || c.blockType<=6)) {
        if(op===4 || (op===6 && c.blockType===null)) value=(value&~blockMask)|66;
        else if(c.blockType!==null) value&=~(blockMask|64|8|(3<<19));
      }
      if(value!==c.terrain) {level.setTerrain(k,value);level.questions.add(k);}
    } else if(op===7) {
      const k=(target-level.terrainOffset)/4;
      if(Number.isInteger(k) && k>=0 && k<plane*level.height) hatchAt(k%level.width,Math.floor(k/level.width)%level.depth,Math.floor(k/plane));
    } else if(op>=9 && op<=12) {
      const lift=level.lifts[(target-(9836-542))/10];
      if(!lift?.key) return;
      lift.dir=op===9?1:op===10?2:op===11?0:
        lift.dir===0?(lift.height===lift.min?1:2):lift.dir===1?2:1;
    } else if(op>=14 && op<=18) {
      const door=level.doors[(target-(10158-542))/12];
      if(!door?.key) return;
      door.trig=op===16?(door.dir===1?2:1):({14:1,15:2,17:3,18:4})[op];
    }
  }
  function panel(x,y,z) {
    const {terrain}=level.cell(x,y,z);
    const state=(terrain>>>19)&3;
    if(!(terrain&8) || (state!==1 && state!==2)) return;
    trigger((terrain>>>23)&31,state===1);
    play('Button',182,key(x,y,z));
    level.setTerrain(key(x,y,z),(terrain&~(3<<19))|((3-state)<<19));
  }
  function pad(x,y,z,release) {
    if(z && level.cell(x,y,z).floorType===1) trigger((level.cell(x,y,z-1).terrain>>>23)&31,release);
  }
  function bump(x,y,z,p) {
    const door=level.doors.find(d=>d.key && d.key===key(x,y,z));
    if(!door) return;
    function lock(key,used=false) {p.lockNotice={key,used};p.lockFrames=100;}
    if(door.buttonOnly) {lock(0);return;}
    if(door.dir===3) {
      if(!door.lock) {lock(0);return;}
      if(p.held?.id===door.lock) p.held=null;
      else {
        const i=p.pack.findIndex(item=>item.id===door.lock);
        if(i<0) {lock(door.lock);return;}
        p.pack.splice(i,1);
      }
      lock(door.lock,true);play('Unlock',136,door.key);door.dir=0;
    }
    door.trig=1;
  }
  function doorsTick() {
    let changed=false;
    for(const d of level.doors) {
      if(!d.key) continue;
      const c=cell(d.key);
      if(d.delay>=0 && c.blockType===null && ++d.count>=d.delay) {d.count=0;d.trig=2;}
      const starting=(d.trig===1 || d.trig===2) && d.dir!==d.trig && d.dir!==3;
      if(d.trig===1 || d.trig===2) {if(d.dir!==3) d.dir=d.trig;d.trig=0;}
      if(d.trig===3 && d.dir===0) {d.dir=3;d.trig=0;}
      if(d.trig===4 && d.dir===3) {d.dir=0;d.trig=0;}
      if(d.dir!==1 && d.dir!==2) continue;
      if(occupants(d.key).length || (c.blockType!==null && ![20,21].includes(c.blockType))) {d.dir=0;continue;}
      const frame=(c.terrain>>>23)&31;
      let value=c.terrain;
      if(d.dir===1) {
        if(c.blockType===null) continue;
        if(frame>=10) {value&=~blockMask;d.dir=d.count=0;play('DoorClosed',568,d.key);}
        else value=(value&~variant)|((frame+1)<<23);
      } else {
        if(c.blockType!==null && frame===0) {d.dir=0;play('DoorClosed',568,d.key);continue;}
        value=(value&~(blockMask|variant))|d.type|(((c.blockType===null?10:frame)-1)<<23);
      }
      if(starting) play('DoorOpening',428,d.key);
      level.setTerrain(d.key,value);
      changed=true;
    }
    return changed;
  }
  const movingLifts=new Set();
  function liftsTick() {
    movingLifts.clear();
    let changed=false;
    for(const lift of level.lifts) {
      if(!lift.key) continue;
      const c=cell(lift.key), riders=occupants(lift.key);
      const loaded=!!riders.length || c.blockType!==null;
      if(lift.dir===3 || lift.dir===4) lift.dir=loaded?lift.dir-2:0;
      if(!lift.dir) {
        if(loaded && lift.height===lift.min && (lift.auto&1)) lift.dir=1;
        else if(loaded && lift.height===lift.max && (lift.auto&2)) lift.dir=2;
        continue;
      }
      const delta=lift.dir===1?1:-1;
      if(delta>0?lift.height>=lift.max:lift.height<=lift.min) {lift.dir=delta>0?lift.up:lift.down;continue;}
      const next=lift.key+delta*plane;
      if(next<0 || next>=level.height*plane) continue;
      const dest=cell(next);
      if((loaded && !lift.weight) || occupants(next).length || dest.floorType!==null ||
          (dest.blockType!==null && !(delta<0 && dest.blockType===7))) continue;
      const x=lift.key%level.width,y=Math.floor(lift.key/level.width)%level.depth;
      moveCargo([x,y,lift.height],[x,y,lift.height+delta],true);
      const payload=c.terrain & (floorMask|blockMask|32|(15<<28)|256|variant);
      level.setTerrain(lift.key,(c.terrain&~payload)|(delta>0?(7<<11)|2:0));
      level.setTerrain(next,(dest.terrain&~(floorMask|blockMask))|payload);
      const block=level.pushables.find(b=>b.key===lift.key);if(block) block.key=next;
      lift.height+=delta;lift.key=next;
      movingLifts.add(lift);
      riders.forEach(p=>{p.floor+=delta;});
      changed=true;
    }
    return changed;
  }
  function moveBlock(b,to) {
    const from=b.key,src=cell(from),dest=cell(to);
    const mask=blockMask|8|(3<<19)|64|256;
    const payload=src.terrain & (mask|variant);
    const coords=k=>[k%level.width,Math.floor(k/level.width)%level.depth,Math.floor(k/plane)];
    pad(...coords(from),true);pad(...coords(to),false);
    level.setTerrain(from,cell(from).terrain&~mask);
    level.setTerrain(to,(cell(to).terrain&~(mask|variant))|payload);
    if(from+plane<plane*level.height && to+plane<plane*level.height && cell(from+plane).floorType===null)
      moveCargo(coords(from+plane),coords(to+plane));
    if(src.blockType!==1 && !(src.contents&(1<<30))) level.questions.add(from);
    b.key=to;
  }
  function shove(p,dx,dy,pull=false) {
    const row=[],z=p.floor;
    let x=p.x+dx,y=p.y+dy;
    const inside=()=>x>=0 && y>=0 && x<level.width && y<level.depth;
    while(inside() && (cell(key(x,y,z)).terrain&256)) {
      const block=level.pushables.find(b=>b.key===key(x,y,z));
      if(!block) return false;
      row.push(block);
      if(pull) {x=p.x-dx;y=p.y-dy;break;}
      x+=dx;y+=dy;
    }
    if(!row.length || !inside()) return false;
    const dest=cell(key(x,y,z));
    if(dest.blockType!==null || occupants(key(x,y,z)).length || monsterAt(x,y,z)) return false;
    const aux=pull?cell(key(p.x,p.y,z)).terrain:dest.terrain;
    if((aux&32) && (aux>>>28)!==1 && (aux>>>28)<=7) return false;
    const delta=dx+dy*level.width;
    for(const block of row.reverse()) moveBlock(block,block.key+(pull?-delta:delta));
    if(!pull) pad(p.x,p.y,z,true);
    p.x+=pull?-dx:dx;p.y+=pull?-dy:dy;
    pad(p.x,p.y,z,false);play('BlockSlide',452,key(p.x,p.y,z));return true;
  }
  function blocksTick() {
    let moved=false;
    for(const b of level.pushables) {
      const below=b.key-plane;
      if(below<0 || cell(b.key).floorType!==null || cell(below).blockType!==null || occupants(below).length) continue;
      if(monsterAt(below%level.width,Math.floor(below/level.width)%level.depth,Math.floor(below/plane))) continue;
      // Main.s sounds and shakes on the field in which a falling block lands,
      // rather than on every downward step. Keep the support cell before moving.
      const destination=cell(below),support=below>=plane?cell(below-plane):null;
      const type=support?.blockType;
      const lands=destination.floorType!==null || !!(support?.terrain&64) ||
        (type!==null && type!==undefined && (type<8 || type>47 || (type>=16 && type<=21) || (type>=28 && type<=31)));
      moveBlock(b,below);moved=true;
      if(lands) onShake(1);
    }
    return moved;
  }
  const water=level.water, flow=Array.from({length:level.height},()=>[]);
  if(water.speed) for(let k=0;k<plane*level.height;k++) if(cell(k).automap&2048) flow[Math.floor(k/plane)].push(k);
  function waterTick() {
    if(!water.speed) return false;
    if(water.position===water.low) water.up=true;
    if(water.position===water.high) water.up=false;
    water.position+=water.up?1:-1;
    const floor=Math.floor(water.position/4),depth=water.position&3,mask=4|(3<<17);
    for(const k of flow[floor]??[]) {
      if(level.drained.has(k)) continue;
      level.setTerrain(k,(cell(k).terrain&~mask)|4|(depth<<17));
      if(!water.up && depth===3 && floor+1<level.height) level.setTerrain(k+plane,cell(k+plane).terrain&~mask);
    }
    return !!flow[floor]?.length;
  }
  // Main.s primes the hatch and water simulations together at mission load.
  if(water.speed) for(let i=0;i<438;i++) waterTick();
  function snapshot() {return {drained:[...level.drained],water:{...water},pushables:level.pushables.map(b=>b.key),changes:[...level.changes],questions:[...level.questions],doors:level.doors,lifts:level.lifts};}
  function restore(saved) {
    if(!saved) return;
    for(const k of saved.drained??[]) level.drained.add(k);
    Object.assign(water,saved.water);saved.pushables?.forEach((k,i)=>{level.pushables[i].key=k;});
    for(const [k,v] of saved.changes) level.setTerrain(k,v);
    for(const k of saved.questions??[]) level.questions.add(k);
    saved.doors.forEach((v,i)=>Object.assign(level.doors[i],v));
    saved.lifts.forEach((v,i)=>Object.assign(level.lifts[i],v));
  }
  return {movingLifts,shove,blocksTick,waterTick,panel,pad,bump,doorsTick,liftsTick,snapshot,restore};
}
