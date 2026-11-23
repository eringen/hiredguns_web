// ColdStartup.s programs pairs of 32-pixel CD32 sprites, with two planes per row.
export function fireSprites(bytes) {
  const cache=new Map();
  function sprite(start,height,colors) {
    const key=start+':'+colors.join(',');
    if(cache.has(key)) return cache.get(key);
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=height;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(32,height);
    for(let y=0;y<height;y++) for(let x=0;x<32;x++) {
      const pos=start+8+y*8+(x>>3),bit=128>>(x&7);
      const index=Number(!!(bytes[pos]&bit))+2*Number(!!(bytes[pos+4]&bit));
      if(!index) continue;
      const rgb=colors[index-1],i=(32*y+x)*4;
      pixels.data.set([rgb>>16,(rgb>>8)&255,rgb&255,255],i);
    }
    ctx.putImageData(pixels,0,0);cache.set(key,canvas);return canvas;
  }
  function muzzle(ctx,shot,def) {
    const rgb=(boost)=>[8,4,0].reduce((v,shift)=>{
      const c=(def.animColor>>shift)&15;
      return (v<<8)+17*Math.min(15,c?c+boost:0);
    },0);
    const colors=[0xf1fff3,rgb(3),rgb(0)];
    const base=200+(def.animation-1)*3360+shot.frame*672;
    for(let n=0;n<2;n++) ctx.drawImage(sprite(base+336*n,40,colors),41+shot.x+32*n,58+shot.y);
    if(shot.dist>=4 || def.burst>=128) return;
    const side=v=>v<=-8?0:v>=8?2:1;
    const col=side(shot.x),row=side(shot.y);
    const impact=[[7,0,1],[6,8,2],[5,4,3]][row][col]+shot.dist*9;
    ctx.drawImage(sprite(10280+144*impact,16,[0xffffff,0x000000,0xffb9ab]),73+shot.x-16+8*col,57+shot.y-16+8*row);
  }
  function health(ctx) {
    for(let n=0;n<2;n++) ctx.drawImage(sprite(15464+n*152,17,[0xffffff,0xffffff,0xffe1ff]),112+n*16,-2);
  }
  return {muzzle,health};
}
