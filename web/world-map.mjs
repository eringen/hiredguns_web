// WorldMap.s stores cursor x in low-resolution units, while HAM8 map x is doubled.
export function worldMap(map,flag,cross,world,state,selector){
  const width=516,height=162,keys=new Set();
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const follow=(a,b,step)=>a+clamp(b-a,-step,step);
  let x,y,sx,sy,current,hit,active=false;
  function reset(){
    const {catalog,campaign}=state(),start=catalog.find(loc=>loc.id===campaign.current);
    current=start.id;x=start.x;y=start.y;
    sx=map.width/2-256;sy=map.height/4-80;keys.clear();
    scan();
  }
  function scan(){
    hit=state().catalog.find(loc=>loc.id<=21 && loc.locationType!==1 &&
      Math.abs(loc.x-x)<=loc.hitWidth && Math.abs(loc.y-y)<=loc.hitHeight);
    selector.value=hit?.id??'';
    for(const marker of world.children) marker.setAttribute('aria-pressed',String(Number(marker.dataset.location)===hit?.id));
  }
  function step(){
    if(!active) return;
    x=clamp(x+4*(keys.has('ArrowRight')-keys.has('ArrowLeft')),4,map.width-32);
    y=clamp(y+2*(keys.has('ArrowDown')-keys.has('ArrowUp')),0,map.height-1);
    sx=clamp(follow(sx,x-256,4),0,map.width-width);
    sy=clamp(follow(sy,y-80,2),0,map.height-height);
    scan();
  }
  function point(e){
    const r=world.getBoundingClientRect();
    x=clamp(Math.round(sx+(e.clientX-r.left)*width/r.width),0,map.width-1);
    y=clamp(Math.round(sy+(e.clientY-r.top)*height/r.height),0,map.height-1);
    scan();
  }
  function aim(loc){x=loc.x;y=loc.y;scan();}
  world.addEventListener('pointerdown',e=>{if(e.target===world){point(e);world.setPointerCapture(e.pointerId);}});
  world.addEventListener('pointermove',e=>{if(world.hasPointerCapture(e.pointerId)) point(e);});
  function draw(ctx){
    if(current!==state().campaign.current || x===undefined) reset();
    const {catalog,campaign}=state(),px=v=>Math.round((v-sx)*640/width),py=v=>Math.round((v-sy)*320/height);
    ctx.save();ctx.beginPath();ctx.rect(0,0,640,320);ctx.clip();
    ctx.drawImage(map,sx,sy,width,height,0,0,640,320);
    for(const b of world.children){
      const loc=catalog.find(m=>m.id===Number(b.dataset.location)),cx=px(loc.x),cy=py(loc.y);
      b.style.left=cx/6.4+'%';b.style.top=cy/3.2+'%';
      b.style.width=loc.hitWidth*200/width+'%';b.style.height=loc.hitHeight*200/height+'%';
      ctx.fillStyle=campaign.completed.includes(loc.id)?'#22ff22':'#ff2222';
      ctx.fillRect(px(loc.x-4),py(loc.y-2),12,10);
    }
    const loc=catalog.find(m=>m.id===current);
    ctx.drawImage(flag,0,16*(Math.floor(performance.now()/40)%10),16,16,px(loc.x)-12,py(loc.y)-14,40,32);
    const cx=px(x),cy=py(y);
    ctx.fillStyle='#ff3333';ctx.fillRect(0,cy,640,2);
    ctx.drawImage(cross,cx-20,cy-332,40,666);
    ctx.restore();
    return hit;
  }
  return {reset,draw,step,aim,keys,setActive(value){if(value && !active) reset();active=value;if(!value) keys.clear();}};
}
