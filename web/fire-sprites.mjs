// Hardware sprite graphics are converted to palette-exact PNGs during the build.
export async function fireSprites(image,keys) {
  const sprites=new Map();
  const names=[...keys.flatMap(key=>Array.from({length:10},(_,i)=>`fire-${key}-${i>>1}-${i&1}`)),...Array.from({length:36},(_,i)=>'impact-'+i),'health-0','health-1'];
  await Promise.all(names.map(async name=>sprites.set(name,await image('art/'+name+'.png'))));
  function muzzle(ctx,shot,def) {
    const key=def.animation+'-'+def.animColor;
    for(let n=0;n<2;n++) ctx.drawImage(sprites.get(`fire-${key}-${shot.frame}-${n}`),41+shot.x+32*n,58+shot.y);
    if(shot.dist>=4 || def.burst>=128) return;
    const side=v=>v<=-8?0:v>=8?2:1;
    const col=side(shot.x),row=side(shot.y);
    const impact=[[7,0,1],[6,8,2],[5,4,3]][row][col]+shot.dist*9;
    ctx.drawImage(sprites.get('impact-'+impact),73+shot.x-16+8*col,57+shot.y-16+8*row);
  }
  function health(ctx) {for(let n=0;n<2;n++) ctx.drawImage(sprites.get('health-'+n),112+n*16,-2);}
  return {muzzle,health};
}
