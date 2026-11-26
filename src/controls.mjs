const directions=[[0,-1],[1,0],[0,1],[-1,0]];
export function keyAction(key,shift,mode) {
  return (shift && mode===0 && {ArrowLeft:'Strafe left',ArrowRight:'Strafe right',ArrowDown:'Pull',ArrowUp:'Throw power'}[key]) ||
    {' ':'Fire',e:'Use',p:'Pull',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Forward',ArrowDown:'Back'}[key];
}
export function fieldAction({level,inventory,machines,battle,equipment,sound,bank,notice},who,panel,action,mouse=false,automatic=false){
  const players=inventory.players,p=players[who];
  if(action==='Throw power'){
    if(p.held && equipment.items[p.held.id].category===21){
      panel.throwPower=((panel.throwPower??3)+1)%4;
    }
    return;
  }
  if(action==='Fire'){
    const grenade=p.held && equipment.items[p.held.id].category===21;
    return !!(grenade?battle.throwGrenade(p,panel.throwPower):battle.use(p,panel.index));
  }
  if(action==='Pull'){
    const [dx,dy]=directions[p.dir],x=p.x+dx,y=p.y+dy;
    if(x>=0 && y>=0 && x<level.width && y<level.depth && (level.cell(x,y,p.floor).terrain&256)) machines.shove(p,dx,dy,true);
    else if(inventory.reload(p)===null) sound('reload',380,who%2);
    return true;
  }
  if(action==='Use'){
    const [dx,dy]=directions[p.dir],x=p.x+dx,y=p.y+dy;
    if(x>=0 && x<level.width && y>=0 && y<level.depth) {
      const front=level.cell(x,y,p.floor).terrain;
      if(front&(256|8)) {
        if(front&256) machines.shove(p,dx,dy);
        else machines.panel(x,y,p.floor);
        return true;
      }
    }
    const useHeld=!mouse || !p.held || equipment.items[p.held.id].category!==21;
    return !!(useHeld && battle.use(p,panel.index));
  }
  if(action==='Left' || action==='Right') {p.shot=null;p.lockFrames=0;}
  if(action==='Left') p.dir=(p.dir+3)%4;
  if(action==='Right') p.dir=(p.dir+1)%4;
  if(['Forward','Back','Strafe right','Strafe left'].includes(action)){
    const dir=(p.dir+({'Forward':0,'Back':2,'Strafe right':1,'Strafe left':3})[action])%4;
    const [dx,dy]=directions[dir],x=p.x+dx,y=p.y+dy;
    if(x<0 || y<0 || x>=level.width || y>=level.depth) {return false;}
    const here=level.cell(p.x,p.y,p.floor),below=p.floor?level.cell(p.x,p.y,p.floor-1):null;
    const tree=p.floor>=2 && level.cell(p.x,p.y,p.floor-2).blockType===4;
    const supported=players.some(q=>q!==p && !q.exited && q.fitness && q.x===p.x && q.y===p.y && q.floor===p.floor-1);
    if(here.floorType===null && below?.blockType==null && !tree && !supported && !((here.terrain&4) && ((here.terrain>>>17)&3)>=2)) {return false;}
    let z=p.floor;
    if((here.terrain&32) && (here.terrain>>>28)===8+dir) {
      if(z+1>=level.height || (level.cell(p.x,p.y,z+1).terrain&67)) {return false;}
      z++;
    } else if(below?.blockType===[18,19,16,17][dir] && level.cell(x,y,z).floorType===null && !(level.cell(x,y,z-1).terrain&66)) z--;
    const destination=level.cell(x,y,z);
    const occupied=players.find(other=>other!==p && other.fitness && !other.exited && other.x===x && other.y===y && other.floor===z);
    if(automatic && (occupied || battle.at(x,y,z) || destination.blockType!==null || (destination.floorType===null && (!z || !(level.cell(x,y,z-1).terrain&66))))) return;
    if(destination.blockType===3) {
      p.exited=true;sound('Teleport',683,who%2);
      return true;
    }
    if(occupied && z===p.floor && !(destination.terrain&66)) {
      // All four squad members share the browser's control method (swap_players).
      Object.assign(occupied,{x:p.x,y:p.y});Object.assign(p,{x,y});
      if(!(destination.terrain&4)) bank(who);
      sound('step',p.character.stepPeriod,who%2);return true;
    }
    if(!occupied && !battle.at(x,y,z) && !(destination.terrain&66)){
      machines.pad(p.x,p.y,p.floor,true);
      p.x=x; p.y=y;p.floor=z;
      machines.pad(x,y,p.floor,false);
      sound('step',p.character.stepPeriod,who%2);
    } else {
      if(occupied) bank(who);
      if(destination.blockType===6 && destination.contents%4===0 && destination.contents/4<level.width*level.depth*level.height) {
        const k=destination.contents/4,tx=k%level.width,ty=Math.floor(k/level.width)%level.depth,tz=Math.floor(k/(level.width*level.depth));
        if(level.cell(tx,ty,tz).blockType===null && !players.some(q=>q.fitness && !q.exited && q.x===tx && q.y===ty && q.floor===tz)) {
          machines.pad(p.x,p.y,p.floor,true);
          Object.assign(p,{x:tx,y:ty,floor:tz});machines.pad(tx,ty,tz,false);sound('Teleport',683,who%2);
          return true;
        }
      }
      if(destination.blockType===2) p.fitness=Math.min(65535,p.fitness+(destination.contents&65535));
      else {
        machines.bump(x,y,z,p);
        if(p.lockFrames) {
          const {key,used}=p.lockNotice;
          notice(key?(used?'Used ':'Requires ')+equipment.items[key].name:'Locked.');
        }
      }
      sound('bump',428,who%2);
      return false;
    }
  }
  return true;
}

export function followLeader(players,leader,mode,act){
  const guide=players[leader];
  if(!guide?.fitness || guide.exited) return;
  for(const [i,p] of players.entries()){
    if(i===leader || !p.inTeam || !p.fitness || p.exited || mode(i)!==0) continue;
    for(const cell of [...(guide.path??[])].reverse()){
      const dx=cell.x-p.x,dy=cell.y-p.y;
      if(Math.abs(cell.floor-p.floor)>1 || Math.abs(dx)+Math.abs(dy)>1) continue;
      if(dx || dy){
        const dir=dx>0?1:dx<0?3:dy>0?2:0;
        act(i,dir===p.dir?'Forward':(dir-p.dir+4)%4===1?'Right':'Left');
      }
      break;
    }
  }
}
