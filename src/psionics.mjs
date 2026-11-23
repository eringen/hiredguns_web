// ItemUsage.s psi_table. Timed powers replace the existing power in the same slot.
export function physique(p) {
  const base=p.character.physique,id=p.powers?.strength?.id;
  return base+(id===88?base>>1:id===89?base:0);
}
export function agePowers(p) {
  let changed=false;
  for(const [slot,power] of Object.entries(p.powers??{})) {
    if(--power.frames<=0) {delete p.powers[slot];changed=true;}
  }
  return changed;
}
export function castAmp(p,index,{level,inventory,launch,blast,occupied,seen,teleport}) {
  const held=p.held;
  if(!held.ammo) {p.held=null;return false;}
  const id=held.id===110?82+Math.floor(Math.random()*28):held.id;
  const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][p.dir];
  const z=p.floor,inside=(x,y)=>x>=0 && y>=0 && x<level.width && y<level.depth;
  let x=p.x+dx,y=p.y+dy;
  const front=inside(x,y)?level.cell(x,y,z):null;
  const key=(x,y,z)=>(z*level.depth+y)*level.width+x;
  const setFront=word=>level.setTerrain(key(x,y,z),word);
  function power(slot,frames){(p.powers??={})[slot]={id,frames};}
  switch(id) {
    case 82: case 83: case 84: case 85:{
      const dirs=id<84?[p.dir]:[0,1,2,3];
      for(const dir of dirs) launch(p,dir,id%2?3:1,0,id===85?0:1);
      break;
    }
    case 86: case 87: power('shield',3000);break;
    case 88: case 89: power('strength',3000);break;
    case 90:
      if(!front || front.blockType!==null || occupied(x,y,z)) return false;
      setFront((front.terrain&~(63<<11))|2|(5<<11));break;
    case 91:
      if(front?.blockType!==5) return false;
      setFront(front.terrain&~(2|(63<<11)));break;
    case 92:
      if(!front || front.floorType!==null || (z && level.cell(x,y,z-1).terrain&64)) return false;
      setFront((front.terrain&~(3<<9))|1|(2<<9));break;
    // The unused Float and Shift entries fall through in the original jump table.
    case 93: case 94: power('wings',12000);break;
    case 95: case 96:
      for(let dz=-3;dz<=3;dz++) for(let sy=-3;sy<=3;sy++) for(let sx=-3;sx<=3;sx++) {
        if((sx||sy||dz) && z+dz>=0 && z+dz<level.height && inside(p.x+sx,p.y+sy))
          blast(p.x+sx,p.y+sy,z+dz,id===95?20000:40000);
      }
      break;
    case 97: case 100: power('water',12000);break;
    case 98:{
      let changed=false;
      for(let n=0,x=p.x,y=p.y;inside(x,y);x+=dx,y+=dy,n++) {
        if(!(level.cell(x,y,z).terrain&4)) {if(n) break;continue;}
        for(let h=z;h<level.height;h++){
          const c=level.cell(x,y,h),k=key(x,y,h);
          if(!(c.terrain&4) && !(c.automap&2048)) break;
          level.drained.add(k);level.setTerrain(k,c.terrain&~(4|(3<<17)));changed=true;
        }
      }
      if(!changed) return false;
      break;
    }
    case 99:
      if(!inventory.quench(p)) return false;
      break;
    case 101: case 102: case 103:
      while(inside(x,y)){
        const c=level.cell(x,y,z);
        if(occupied(x,y,z) || ((c.terrain&32) && !(c.terrain>>>28) && level.style!==4)) {blast(x,y,z,[10000,30000,60000][id-101]);break;}
        if((c.terrain&66) && !([20,21].includes(c.blockType) && ((c.terrain>>>23)&31)>=5)) break;
        x+=dx;y+=dy;
      }
      break;
    case 104: seen(p);break;
    case 105:{
      let found=false;
      for(let n=0;n<=100;n++){
        x=Math.floor(Math.random()*level.width);y=Math.floor(Math.random()*level.depth);
        const floor=Math.floor(Math.random()*level.height),c=level.cell(x,y,floor);
        if((c.terrain&66) || occupied(x,y,floor) || (c.floorType===null && (!floor || !(level.cell(x,y,floor-1).terrain&66)))) continue;
        teleport(p,x,y,floor);found=true;break;
      }
      if(!found) return false;
      break;
    }
    case 106: case 107: case 108:
      p.poison=0;p.poisonCount=0;if(id===108) p.fitness=65535;break;
    case 109:
      if(!p.pack[index]) return false;
      p.pack[index]={id:54+Math.floor(Math.random()*11),damage:0,ammo:0};break;
    default:return false;
  }
  if(!--held.ammo) p.held=null;
  p.psiExperience=Math.min(60000-p.character.experience,(p.psiExperience??0)+5);
  return true;
}
