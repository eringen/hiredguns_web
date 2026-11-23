// CopperLists/GameCD32.s changes color 6 every four scanlines. Track its
// surviving pixels after occlusion so scrolling the palette needn't redraw a map.
export const fieldInk=[1,254,1];
const colors=Array.from({length:90},(_,i)=>{
  const n=(i%15)*17,m=255-n;
  return [[255,n,0],[m,255,0],[0,255,n],[0,m,255],[n,0,255],[255,0,m]][Math.floor(i/15)];
});
export function fieldAnimation(scene) {
  const ctx=scene.getContext('2d',{willReadFrequently:true});
  let frame,indices=[];
  function capture(hasField) {
    indices=[];
    if(!hasField) return;
    frame=ctx.getImageData(0,0,scene.width,scene.height);
    for(let i=0;i<frame.data.length;i+=4) if(frame.data[i]===1 && frame.data[i+1]===254 && frame.data[i+2]===1) indices.push(i);
  }
  function scroll(tick) {
    if(!indices.length) return false;
    for(const i of indices) {
      const row=Math.floor(i/(scene.width*4));
      frame.data.set(colors[(tick+(row>>2))%90],i);
    }
    ctx.putImageData(frame,0,0);return true;
  }
  return {capture,scroll};
}
