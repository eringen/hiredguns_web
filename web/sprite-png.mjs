// PNG sources remain CPU backed because water and light read their pixels.
export async function loadSpriteSheet(path) {
  if(!path.includes('/')) path='art/world/'+path;
  const response=await fetch(path+'.json');
  if(!response.ok) throw new Error('Could not load '+path+'.json');
  const meta=await response.json();
  async function atlas(suffix) {
    const image=new Image();image.src=path+suffix+'.png';await image.decode();return image;
  }
  const [normal,lit,indices]=await Promise.all([atlas(''),meta.lit?atlas('-lit'):null,atlas('-indices')]);
  function crop(source,[x,y,w,h]) {
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d',{willReadFrequently:true}).drawImage(source,x,y,w,h,0,0,w,h);return canvas;
  }
  const images=meta.boxes.map(box=>{
    const canvas=crop(normal,box),indexCanvas=crop(indices,box);
    canvas.colorIndices=indexCanvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    if(lit) {let bright;canvas.illuminated=()=>bright??=crop(lit,box);}
    if(meta.mask) canvas.waterMask=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return canvas;
  });
  return meta.sprites.map(sprite=>sprite?{canvas:images[sprite.image],x:sprite.x,y:sprite.y,control:sprite.control}:null);
}

// Keep replacement art at source resolution; only the scene projection scales it.
let cheuleViews;
async function customCheuleViews() {
  return cheuleViews??=(async()=>{
    const image=new Image();image.src='art/custom/cheule.png';await image.decode();
    const sheet=document.createElement('canvas');sheet.width=image.width;sheet.height=image.height;
    const ctx=sheet.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,image.width,image.height).data;
    // Flood-fill silhouettes: extended arms overlap neighbouring column bounds.
    const labels=new Int32Array(image.width*image.height),components=[];
    const queue=new Int32Array(labels.length);
    for(let seed=0;seed<labels.length;seed++) {
      if(labels[seed] || pixels[4*seed+3]<=16) continue;
      const id=components.length+1;
      let head=0,tail=1,left=image.width,right=0,top=image.height,bottom=0;
      queue[0]=seed;labels[seed]=id;
      while(head<tail) {
        const point=queue[head++],x=point%image.width,y=Math.floor(point/image.width);
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
          const nx=x+dx,ny=y+dy,next=ny*image.width+nx;
          if(nx<0 || nx>=image.width || ny<0 || ny>=image.height || labels[next] || pixels[4*next+3]<=16) continue;
          labels[next]=id;queue[tail++]=next;
        }
      }
      components.push({id,left,right,top,bottom,size:tail});
    }
    const figures=components.sort((a,b)=>b.size-a.size).slice(0,4).sort((a,b)=>(a.left+a.right)-(b.left+b.right));
    if(figures.length!==4) throw new Error('Cheule artwork requires four separate silhouettes');
    return figures.map(({id,left,right,top,bottom})=>{
      left=Math.max(0,left-2);right=Math.min(image.width-1,right+2);
      top=Math.max(0,top-2);bottom=Math.min(image.height-1,bottom+2);
      const canvas=document.createElement('canvas');canvas.width=right-left+1;canvas.height=bottom-top+1;
      const out=canvas.getContext('2d'),frame=out.createImageData(canvas.width,canvas.height);
      for(let y=top;y<=bottom;y++) for(let x=left;x<=right;x++) {
        const at=y*image.width+x;
        let belongs=labels[at]===id;
        // Preserve soft antialiased fringe without including an overlapping neighbour.
        if(!belongs && pixels[4*at+3] && pixels[4*at+3]<=16) {
          for(let dy=-2;dy<=2 && !belongs;dy++) for(let dx=-2;dx<=2;dx++) {
            const nx=x+dx,ny=y+dy;
            if(nx>=0 && nx<image.width && ny>=0 && ny<image.height && labels[ny*image.width+nx]===id) {belongs=true;break;}
          }
        }
        if(belongs) frame.data.set(pixels.subarray(4*at,4*at+4),4*((y-top)*canvas.width+x-left));
      }
      out.putImageData(frame,0,0);
      return canvas;
    });
  })();
}

export async function replaceCheuleSprites(sprites,direction) {
  // Original figure slots: right, left, back, front. Custom sheet: front, back, right, left.
  const source=(await customCheuleViews())[[2,3,1,0][direction]];
  return sprites.map(sprite=>{
    if(!sprite) return null;
    const {canvas}=sprite,w=canvas.width,h=canvas.height;
    const pixels=canvas.getContext('2d').getImageData(0,0,w,h).data;
    let left=w,right=-1,top=h,bottom=-1;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(pixels[4*(y*w+x)+3]){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(bottom<top) return sprite;
    const height=bottom-top+1,width=source.width*height/source.height;
    // Match the old feet and horizontal centre while preserving the new aspect ratio.
    return {...sprite,canvas:source,width,height,x:sprite.x+(left+right+1-width)/2,y:sprite.y+top,highResolution:true};
  });
}
