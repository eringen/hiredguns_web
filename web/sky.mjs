// Drawviews.s composes two map silhouettes over the Copper sky before drawing terrain.
export async function missionSky(load,level) {
  const [skyBytes,planet]=await Promise.all(['sky.json','Planet.bin'].map(load));
  const tables=JSON.parse(new TextDecoder().decode(skyBytes));
  const planetStart=new DataView(planet.buffer,planet.byteOffset).getUint32(28);
  const bit=(bytes,start,index)=>bytes[start+(index>>3)]&(128>>(index&7));
  const black=[0,0,0]; // Main.s game_palette entry 0.
  const views=Array.from({length:4},(_,dir)=>{
    const canvas=document.createElement('canvas');canvas.width=144;canvas.height=84;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.createImageData(144,84);
    for(let y=0;y<84;y++) for(let x=0;x<144;x++) {
      const line=44*level.sky+Math.min(43,y+2);
      let color=y<42?tables.nosky[line]:black;
      if(dir===2 && x>=20 && x<116 && y<42 && bit(planet,planetStart,y*96+x-20)) color=tables.nosky_planet[line];
      if(y>=10 && y<42) {
        const k=(y-10)*144+x;
        if(bit(level.horizons,576*((dir+2)%4),k)) color=tables.scotch_mist[line];
        if(bit(level.horizons,576*dir,k)) color=black;
      }
      const i=(144*y+x)*4;
      image.data.set(color,i);image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);return canvas;
  });
  const first=44*level.sky;
  return {views,mist:tables.scotch_mist.slice(first,first+44),planet:tables.nosky_planet.slice(first,first+44)};
}
