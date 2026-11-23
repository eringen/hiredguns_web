// Front.s stores sprite positions in field lines and draws text in interlaced pixels.
export async function openingCards(front, focusMenu) {
  const canvas=front.querySelector('canvas'), ctx=canvas.getContext('2d');
  const atlas=new Image();
  atlas.src='art/front-cards.png';
  const [colors]=await Promise.all([fetch('art/front-colors.json').then(r=>r.json()),atlas.decode()]);
  const {width,height}=canvas;
  const scratch=document.createElement('canvas');
  scratch.width=width;scratch.height=height;
  const source=scratch.getContext('2d',{willReadFrequently:true});
  const cards=[];
  for(let y=0;y<atlas.height;y+=height) {
    source.drawImage(atlas,0,y,width,height,0,0,width,height);
    const rgba=source.getImageData(0,0,width,height).data;
    const indices=new Uint8Array(width*height);
    for(let i=0;i<indices.length;i++) indices[i]=rgba[i*4];
    cards.push(indices);
  }
  const lookup=([r,g,b])=>Uint8ClampedArray.from(colors.palette,(v,i)=>{
    if(i<48) return v;
    return (Math.min(15,(v>>4)+[r,g,b][i%3])<<4)|(v&15);
  });
  const normal=lookup([0,0,0]), bands=colors.bands.map(lookup);
  const pixels=ctx.createImageData(width,height);
  const waits=[5,9,13,16,19,22,24,26,28,30,31,32,33,34,35,36];
  let card=2,target=2,timer,frame,afterScan,scanning=false;
  function paint(stops=[],erased=0) {
    let band=-1;
    for(let y=0;y<height;y++) {
      while(band+1<stops.length && y>=(stops[band+1]-40)*2) band++;
      const palette=bands[band]??normal;
      const indices=y>=80 && y<erased?cards[0]:cards[card];
      for(let i=y*width,end=i+width;i<end;i++) {
        const color=indices[i]*3,at=i*4;
        pixels.data[at]=palette[color];pixels.data[at+1]=palette[color+1];
        pixels.data[at+2]=palette[color+2];pixels.data[at+3]=255;
      }
    }
    ctx.putImageData(pixels,0,0);
  }
  function display(next) {
    card=next;target=next;scanning=false;
    front.classList.remove('scanning');
    front.classList.toggle('credits',card>=2);
    paint();
    if(card===1) focusMenu();
    else if(card>=2) timer=setTimeout(()=>scan(card+1===cards.length?2:card+1),card===3?8020:4020);
  }
  function scan(next) {
    clearTimeout(timer);
    target=next;
    if(scanning) return;
    scanning=true;front.classList.add('scanning');
    const stops=waits.map(v=>58+v);
    let speed=17,erased=80,ticks=0;
    const start=performance.now();
    function step(now) {
      while(ticks<=Math.floor((now-start)/20)) {
        if(stops[0]>=244) {
          display(target);
          const complete=afterScan;afterScan=null;complete?.();
          return;
        }
        for(let i=0;i<stops.length;i++) if(stops[i]<244) stops[i]+=speed;
        erased+=2*speed;speed=Math.max(2,speed-1);ticks++;
      }
      paint(stops,erased);
      frame=requestAnimationFrame(step);
    }
    step(start);
  }
  canvas.hidden=false;
  display(2);
  return {
    skip(){if(card>=2) scan(1);},
    leave(next){afterScan=next;scan(0);},
    menu(){clearTimeout(timer);cancelAnimationFrame(frame);card=0;scanning=false;scan(1);}
  };
}
