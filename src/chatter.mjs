// Message nodes in Messages.dat and the map text bank use ESC speaker tokens.
export function chatter(level,players,data,random=Math.random) {
  const queue=[],fired=new Set();
  let idle=0;
  const band=p=>Math.floor(p.fitness/6000);
  let bands=players.map(band);
  function add(raw,triggerPlayer) {
    if(!raw || queue.some(m=>m.raw===raw)) return;
    const alive=players.filter(p=>p.fitness && !p.exited);
    if((raw.match(/\x1b/g)?.length??0)+1>alive.length) return;
    const text=raw.replace(/\x1b(p?)([1-6])/g,(_,direct,n)=>{
      const i=Number(n)-1;
      const speaker=i===5 ? players[triggerPlayer] : direct ? players[i] : i===4?alive[Math.floor(random()*alive.length)]:alive[i===5?triggerPlayer:i];
      return speaker?.character.name??'';
    }).replace(/[\x00-\x1f]/g,'').trim();
    if(text) queue.push({raw,text});
  }
  function bank(n) {const choices=data.banks[n];add(choices[Math.floor(random()*choices.length)]);}
  function observe() {
    players.forEach((p,i)=>{
      const current=band(p);
      if(current!==bands[i] && current<=3 && !(level.cell(p.x,p.y,p.floor).terrain&4)) bank(5+4*i+current);
      bands[i]=current;
      if(!p.fitness || p.exited) return;
      const k=(p.floor*level.depth+p.y)*level.width+p.x;
      level.triggers.forEach((trigger,j)=>{
        if(fired.has(j) || trigger.key!==k) return;
        const requirement=trigger.text[4];
        if(requirement>='1' && requirement<='4' && Number(requirement)!==i+1) return;
        fired.add(j);add(trigger.text,i);
      });
    });
  }
  function second() {
    if(++idle>=50) {idle=0;if(players.filter(p=>p.fitness && !p.exited).length>1) bank(4);}
  }
  function snapshot(){return {queue:[...queue],fired:[...fired],idle,bands:[...bands]};}
  function restore(state){
    if(!state) return;
    queue.splice(0,queue.length,...state.queue);
    fired.clear();for(const n of state.fired) fired.add(n);
    idle=state.idle;bands=[...state.bands];
  }
  add(level.intro);
  return {observe,second,bank,armed:()=>add(data.armed),take:()=>queue.shift()?.text,snapshot,restore};
}
