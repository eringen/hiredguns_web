// Front.s stores sprite positions in field lines and draws text in interlaced pixels.
export async function openingCards(front, focusMenu) {
  const canvas=front.querySelector('canvas'), ctx=canvas.getContext('2d');
  const cards=await Promise.all(Array.from({length:16},async (_,i)=>{
    const image=new Image();image.src='art/front-cards-'+i+'.png';await image.decode();return image;
  }));
  const {width,height}=canvas;
  const cardCount=cards[0].height/height;
  const waits=[5,9,13,16,19,22,24,26,28,30,31,32,33,34,35,36];
  let card=2,target=2,timer,frame,afterScan,scanning=false;
  function paint(stops=[],erased=0) {
    let band=-1;
    for(let y=0;y<height;y++) {
      while(band+1<stops.length && y>=(stops[band+1]-40)*2) band++;
      const atlas=cards[band+1]??cards[0];
      const index=y>=80 && y<erased?0:card;
      ctx.drawImage(atlas,0,index*height+y,width,1,0,y,width,1);
    }
  }

  function display(next) {
    card=next;target=next;scanning=false;
    front.classList.remove('scanning');
    front.classList.toggle('credits',card>=2);
    paint();
    if(card===1) focusMenu();
    else if(card>=2) timer=setTimeout(()=>scan(card+1===cardCount?2:card+1),card===3?8020:4020);
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
