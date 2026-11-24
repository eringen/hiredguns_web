// Mission sky composites are baked with the original Copper palettes.
export async function missionSky(load,level) {
  const [skyBytes,atlas]=await Promise.all([load('sky.json'),(async()=>{
    const image=new Image();image.src='art/sky-'+(level.artId??level.number)+'.png';await image.decode();return image;
  })()]);
  const tables=JSON.parse(new TextDecoder().decode(skyBytes));
  const views=Array.from({length:4},(_,dir)=>{
    const canvas=document.createElement('canvas');canvas.width=144;canvas.height=84;
    canvas.getContext('2d').drawImage(atlas,0,dir*84,144,84,0,0,144,84);return canvas;
  });
  const first=44*level.sky;
  return {views,mist:tables.scotch_mist.slice(first,first+44),planet:tables.nosky_planet.slice(first,first+44)};
}
