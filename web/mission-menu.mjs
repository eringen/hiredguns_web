import {hudFont} from './hud.mjs';
import {worldMap} from './world-map.mjs';
// Draw the mission screens at the CD32 front-end resolution. Transparent buttons
// give the bitmap controls keyboard, touch and screen-reader input.
export async function missionMenu(dialog,load,state) {
  const get=id=>document.getElementById(id),canvas=get('mission-screen'),ctx=canvas.getContext('2d');
  async function art(name) {const image=new Image();image.src='art/'+name+'.png';await image.decode();return image;}
  const [rock,rosterRock,cursor,map,panel,flag,cross,strip,dimStrip,empty,faces,font,big,worldFont,colors,gameFont,fill,viewPalette]=await Promise.all([
    ...['front-rock','roster-rock0','front-cursor','world','map-panel0','map-flag0','map-cross0','face-strip0','face-strip-dim0','empty-face0'].map(art),
    Promise.all(Array.from({length:12},(_,i)=>art('portrait'+i))),load('menu-font.bin'),load('menu-title.bin'),load('world-font.bin'),
    fetch('art/front-colors.json').then(r=>r.json()),load('hud-font.bin'),load('Fill.bin'),load('view-palette.bin')
  ]);
  function letters(data,worldText=false,target=ctx) {
    const v=new DataView(data.buffer),start=v.getUint32(0),w=v.getUint16(4),h=v.getUint16(6),mask=v.getUint16(8),planes=v.getUint16(10),stride=w*h/8;
    const sheet=document.createElement('canvas');sheet.width=96*w;sheet.height=h;
    const gc=sheet.getContext('2d'),rgba=gc.createImageData(sheet.width,h);
    for(let g=0;g<96;g++) for(let i=0;i<w*h;i++) {
      const pos=start+g*stride*planes+(i>>3),bit=128>>(i&7);
      if(!(data[pos+mask*stride]&bit)) continue;
      let color=0;for(let n=0;n<(worldText?2:3);n++) if(data[pos+n*stride]&bit) color|=1<<n;
      const off=(Math.floor(i/w)*sheet.width+g*w+i%w)*4;
      rgba.data.set(worldText?[[0,0,0],[255,255,255],[170,170,170],[102,102,102]][color]:colors.palette.slice(color*3,color*3+3),off);rgba.data[off+3]=255;
    }
    gc.putImageData(rgba,0,0);
    return (str,cx,y,scale,max=628,left=false,yscale=scale)=>{
      const glyphs=[...str].map(c=>Math.min(95,Math.max(0,c.charCodeAt(0)-32)));
      const width=glyphs.reduce((n,g)=>n+data[20+g],0);scale=Math.min(scale,max/(width||1));
      let x=left?cx:cx-width*scale/2;
      for(const g of glyphs){target.drawImage(sheet,g*w,0,w,h,Math.round(x),y,w*scale,h*yscale);x+=data[20+g]*scale;}
    };
  }
  const gameText=hudFont(gameFont);
  const fillLine=document.createElement('canvas');fillLine.width=320;fillLine.height=2;
  const lineCtx=fillLine.getContext('2d'),line=lineCtx.createImageData(320,2);
  for(let i=0;i<640;i++){
    let ink=0;
    for(let p=0;p<5;p++) ink|=((fill[32+p*80+(i>>3)]>>(7-i%8))&1)<<p;
    line.data.set(viewPalette.subarray(3*ink,3*ink+3),4*i);line.data[4*i+3]=255;
  }
  lineCtx.putImageData(line,0,0);
  function fileText(value,x,y,pen=1){
    if(x===null) x=160-Math.floor([...value].reduce((w,c)=>w+(gameFont[20+c.charCodeAt(0)-32] || 0),0)/2);
    gameText(ctx,value,x,y,'rgb('+viewPalette.subarray(3*pen,3*pen+3).join(',')+')');
  }
  const write=letters(font),title=letters(big),legend=letters(worldFont,true);
  const multiplayerLabel=get('multiplayer').querySelector('canvas').getContext('2d');
  letters(font,false,multiplayerLabel)('Multiplayer',224,0,0.85,440);
  let capacity=2,group='Campaign';
  get('room-game').onclick=()=>{group=group==='Campaign'?'Training':'Campaign';draw();};
  const changeCapacity=step=>{capacity=2+(capacity-2+step+3)%3;draw();};
  get('room-size').onclick=()=>changeCapacity(1);
  get('create-room').onclick=()=>state().chooseSquad(capacity,group);
  let screen='maps',person=0,faceX=0,faceTarget=0,notice='';
  const slotIds=Array.from({length:5},(_,i)=>'slot-'+(i+1));
  for(const id of slotIds){
    const b=document.createElement('button');b.id=id;b.hidden=true;dialog.append(b);
  }
  let browser=null,editing=0;
  const nameField=get('save-name');
  function choose(position){
    if(!browser || editing) return;
    const slot=browser.slots[position-1];
    if(browser.saving){
      editing=position;nameField.value=slot || browser.defaultName;
      draw();nameField.focus();nameField.select();
    } else if(slot) browser.select(position);
  }
  slotIds.forEach((id,i)=>get(id).onclick=()=>choose(i+1));
  get('write-slot').onclick=()=>{if(editing) browser.select(editing,nameField.value.trim() || browser.defaultName);};
  get('cancel-slots').onclick=()=>{
    if(editing){editing=0;draw();dialog.focus();}
    else browser.cancel();
  };
  const controls=['room-size','room-game','create-room',...slotIds,'write-slot','cancel-slots','load-slot','prev-map','next-map','squad-control','toggle-person','mission-music','back','save','resume','deploy','travel'];
  function button(id,x,y,w,h,label) {
    const b=get(id);b.hidden=false;b.style.left=x/6.4+'%';b.style.top=y/4+'%';b.style.width=w/6.4+'%';b.style.height=h/4+'%';
    b.setAttribute('aria-label',label);
    if(document.activeElement===b) ctx.drawImage(cursor,x,y,w,h);
    if(id==='prev-map' || id==='next-map') {
      const direction=id==='prev-map'?-1:1,cx=x+w/2,cy=y+h/2;
      ctx.fillStyle='#eeddcc';
      for(let row=-8;row<=8;row+=2) {
        const n=10-Math.abs(row);
        ctx.fillRect(direction<0?cx-n:cx,cy+row,n,2);
      }
    } else write(label,x+w/2,y+Math.max(1,(h-29)/2),0.66,w-8);
  }
  const sel=get('level'),world=get('world');
  const chart=worldMap(map,flag,cross,world,state,sel);
  let lastChart='';
  const isChart=()=>screen==='maps' && state().campaignMode;
  function move(dir){
    if(screen==='roster') faceTarget=Math.max(0,Math.min(1760,faceTarget+160*dir));
    else {
      const list=[...sel.options].filter(o=>!o.disabled),i=list.findIndex(o=>o.selected);
      sel.value=list[(i+dir+list.length)%list.length].value;sel.onchange();
    }
    notice='';draw();
  }
  get('prev-map').onclick=()=>move(-1);get('next-map').onclick=()=>move(1);
  function rosterAction(){
    const {draft}=state();
    if(draft.length===state().size) {screen='maps';notice='';draw();dialog.dispatchEvent(new Event('menuchange'));dialog.focus({preventScroll:true});}
    else if(!draft.includes(person)) {draft.push(person);draw();}
  }
  get('toggle-person').onclick=rosterAction;
  get('squad-control').onclick=rosterAction;
  function removeLast(){state().draft.pop();draw();}
  dialog.addEventListener('pointerdown',e=>{
    if(screen!=='roster' || e.button!==0 || e.target!==canvas) return;
    const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*640/r.width,y=(e.clientY-r.top)*400/r.height;
    if(x>=458 && x<=602 && y>=223 && y<=385) removeLast();
  });
  dialog.addEventListener('contextmenu',e=>{if(screen==='roster'){e.preventDefault();removeLast();}});
  get('mission-music').onclick=()=>{get('music').click();draw();};
  function confirmMap(){
    if(get('deploy').disabled) return;
    if(state().campaign.completed.includes(Number(sel.value))) {
      notice='Replay this location?';draw();return;
    }
    get('deploy').click();
  }
  world.addEventListener('click',e=>{
    if(state().watchChart) return;
    const id=e.target.closest('button')?.dataset.location;
    if(id) chart.aim(state().catalog.find(loc=>loc.id===Number(id)));
    draw();confirmMap();
  });
  const arrows=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
  dialog.addEventListener('keydown',e=>{
    if(isChart() && state().watchChart){e.preventDefault();e.stopImmediatePropagation();return;}
    if(screen==='multiplayer'){
      if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
        e.preventDefault();changeCapacity(e.key==='ArrowLeft'?-1:1);
      } else if(e.key==='ArrowUp' || e.key==='ArrowDown'){
        e.preventDefault();
        const buttons=['room-size','room-game','create-room','back'];
        get(buttons[(buttons.indexOf(document.activeElement.id)+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]).focus();
      }
      return;
    }
    if(screen==='files'){
      if(e.key==='Escape'){e.preventDefault();get('cancel-slots').click();}
      else if(!editing && /^F[1-5]$/.test(e.key)){e.preventDefault();if(!e.repeat) choose(Number(e.key[1]));}
      else if(editing && e.target===nameField && e.key==='Enter'){e.preventDefault();get('write-slot').click();}
      return;
    }
    if(isChart() && arrows.includes(e.key)){
      e.preventDefault();if(!chart.keys.has(e.key)){chart.keys.add(e.key);chart.step();draw();}return;
    }
    if(screen==='roster' && ['Backspace','Delete'].includes(e.key)){e.preventDefault();removeLast();return;}
    if((screen==='roster' || isChart()) && ['Enter',' '].includes(e.key)){
      e.preventDefault();if(e.repeat) return;
      if(screen==='roster') rosterAction();else if(!notice) confirmMap();else get('deploy').click();return;
    }
    if(isChart() && notice && ['F1','F2'].includes(e.key)){
      e.preventDefault();if(e.key==='F1') get('deploy').click();else {get('travel').click();notice='';draw();}return;
    }
    if(screen==='pause' || screen==='online-pause' || screen==='result' || !arrows.includes(e.key)) return;
    e.preventDefault();move(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);
    if(screen==='maps') get('deploy').focus({preventScroll:true});
  });
  window.addEventListener('keyup',e=>chart.keys.delete(e.key));
  window.addEventListener('blur',()=>chart.keys.clear());
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape' && screen!=='pause' && screen!=='online-pause' && screen!=='files'){e.preventDefault();get('back').click();}});
  function hotspot(id,x,y,w,h,label){
    const b=get(id);b.dataset.drawn='1';b.hidden=false;
    Object.assign(b.style,{left:x/6.4+'%',top:y/4+'%',width:w/6.4+'%',height:h/4+'%'});
    b.setAttribute('aria-label',label);
  }
  dialog.addEventListener('focusin',()=>{if(dialog.open) draw();});
  function draw() {
    if(!dialog.open) return;
    const {draft,characters,catalog,campaign,campaignMode,locked}=state(),m=catalog.find(m=>m.id===Number(sel.value));
    ctx.imageSmoothingEnabled=false;ctx.drawImage(rock,0,0);
    // Keep focus while updating an existing button, including after an arrow press.
    for(const id of controls) get(id).dataset.drawn='0';
    function action(...args){get(args[0]).dataset.drawn='1';button(...args);}
    world.hidden=!isChart();chart.setActive(!world.hidden);
    nameField.hidden=screen!=='files' || !editing;
    if(screen==='files'){
      const verb=browser.saving?'SAVE':'LOAD';
      ctx.save();ctx.scale(2,2);ctx.fillStyle='black';ctx.fillRect(0,0,320,200);
      for(const start of [14,119]) for(let y=start;y<=start+80;y+=2) ctx.drawImage(fillLine,0,y);
      fileText('*** '+verb+' GAME ***',null,4);
      const instructions=browser.saving?[
        'THERE ARE 5 POSITIONS IN WHICH YOU CAN SAVE A GAME.',
        'PRESS F1-F5 TO SELECT A POSITION. YOU CAN ENTER A SHORT',
        'DESCRIPTION TO HELP IDENTIFY EACH SAVED GAME.',
        '( SELECTING A USED POSITION WILL OVERWRITE',
        'WHATEVER WAS THERE BEFORE. )'
      ]:['THERE ARE 5 POSITIONS FROM WHICH YOU CAN LOAD A GAME.','PRESS F1-F5 TO SELECT A POSITION.'];
      instructions.forEach((text,i)=>fileText(text,null,33+i*10,i<3?1:2));
      for(let i=0;i<5;i++){
        const y=128+i*10,title=browser.slots[i] || 'EMPTY';
        fileText('F'+(i+1),32,y,9);fileText('POSITION '+(i+1),57,y,2);
        if(editing!==i+1) fileText(title,112,y);
        if(!editing){
          hotspot(slotIds[i],60,y*2-4,550,20,'F'+(i+1)+' POSITION '+(i+1)+' '+title);
          get(slotIds[i]).disabled=!browser.saving && !browser.slots[i];
        }
      }
      if(editing){
        nameField.style.top=(128+(editing-1)*10-2)/2+'%';
        fileText('ENTER    SAVE GAME',179,188);
        hotspot('write-slot',350,365,260,34,'Save game');
      }
      fileText('ESC',32,188,9);fileText('ABORT '+verb,57,188,2);
      hotspot('cancel-slots',54,366,242,34,'ESC ABORT '+verb);
      if(notice) fileText(notice,null,102);
      ctx.restore();
    } else if(screen==='online-pause'){
      write('*** GAME PAUSED ***',320,50,1);
      action('resume',112,150,416,52,'Resume current mission');
      action('back',112,224,416,52,'Leave room');
    } else if(screen==='result'){
      title(notice,320,85,0.9);
      action('back',112,225,416,52,'Return to main menu');
    } else if(screen==='multiplayer'){
      title('Multiplayer',320,48,0.9);
      action('room-size',112,98,416,52,capacity+' players');
      action('room-game',112,155,416,52,group);
      action('create-room',112,212,416,52,'Choose characters');
      action('back',112,266,416,52,'Return to main menu');
    } else if(screen==='pause'){
      write(get('menu-title').textContent,320,50,1);
      if(get('menu-title').textContent==='*** GAME PAUSED ***'){
        action('resume',112,135,416,52,'Resume current mission');
        action('save',112,195,416,52,'Save current game');
      }
      action('load-slot',112,249,416,46,'Load saved game');
      action('back',112,301,416,46,'Return to main menu');
      if(notice) write(notice,320,326,0.65);
    } else {
      const list=[...sel.options].filter(o=>!o.disabled);
      if(screen==='roster'){
        // MIN_FACES_X*2 is the initial CD32 scroll. The stationary fifth plane
        // selects the dim palette outside the 160-pixel selection window.
        const offset=142+faceX;
        ctx.drawImage(dimStrip,offset,0,640,226,0,0,640,208);
        ctx.drawImage(strip,offset+98,0,160,226,98,0,160,208);
        for(let i=0;i<5;i++) ctx.drawImage(rosterRock,0,208+i*39,640,39);
        const p=characters[person];
        if(draft.length<state().size) p.profile.forEach((line,i)=>write(line,42,208+[14,50,101,138][i],0.83,398,true));
        else write('Your team is complete',50,254,0.92,390,true);
        for(let i=0;i<state().size;i++) ctx.drawImage(faces[draft[i]]??empty,458+(i%2)*80,223+(i>>1)*88,64,74);
        hotspot('prev-map',0,0,98,208,'Previous character');
        hotspot('next-map',258,0,382,208,'Next character');
        hotspot('toggle-person',98,0,160,208,'Select '+p.name);
        hotspot('squad-control',0,208,448,192,draft.length===state().size?'Continue to mission map':'Select '+p.name);
      } else if(campaignMode){
        const hit=chart.draw(ctx);
        ctx.drawImage(panel,0,320,640,80);
        const canDeploy=hit && [...sel.options].some(o=>o.value===String(hit.id) && !o.disabled) && draft.length===state().size;
        get('deploy').disabled=!canDeploy;
        if(notice && (!hit || !campaign.completed.includes(hit.id))) notice='';
        if(state().shareChart){
          const view={...chart.snapshot(),replay:!!notice};
          const serialized=JSON.stringify(view);
          if(serialized!==lastChart){lastChart=serialized;state().shareChart(view);}
        }
        if(notice){
          legend('You have been here already, do you wish to explore again?',10,325,0.9,615,true,1.7);
          legend('F1  Yes, explore the location.',50,345,0.95,560,true,1.7);
          legend('F2  No, just move there.',50,370,0.95,560,true,1.7);
          hotspot('deploy',0,343,640,23,'Replay mission');hotspot('travel',0,367,640,30,'Travel to location');
        } else if(hit){
          hit.legend.slice(0,3).forEach((line,i)=>legend(line,i?60:10,325+i*16,1,i?575:625,true,1.55));
          legend(campaign.completed.includes(hit.id)?'*** AREA COMPROMISED ***':'*** AREA HAS NOT BEEN COMPROMISED ***',10,378,1,625,true,1.55);
        }
      } else {
        const group=m.group,titleText={Training:'42!).).\'',Action:'!#4)/.',Development:'-!03',Campaign:'-!03'}[group];
        title(titleText,320,17,1);
        const current=list.findIndex(o=>o.selected),first=Math.floor(current/5)*5;
        list.slice(first,first+5).forEach((o,i)=>{
          const loc=catalog.find(n=>n.id===Number(o.value)),y=106+i*44;
          if(o.selected) ctx.drawImage(cursor,100,y,440,44);
          write(loc.menuName,320,y,0.94,424);
        });
      }
      if(screen==='maps' && !campaignMode){
      if(notice) write(notice,320,322,0.55);
      action('prev-map',8,294,86,44,'<');action('next-map',546,294,86,44,'>');
      get('prev-map').setAttribute('aria-label',screen==='roster'?'Previous character':'Previous map');
      get('next-map').setAttribute('aria-label',screen==='roster'?'Next character':'Next map');
      action('back',2,351,116,45,'Back');
      
      action('mission-music',273,351,157,45,get('music').checked?'Music on':'Music off');
      action('deploy',430,351,207,45,state().online?'Create room':'Start mission');get('deploy').disabled=draft.length!==state().size;
      }
    }
    for(const id of controls) if(get(id).dataset.drawn==='0') get(id).hidden=true;
  }
  let anim,lastTick=0;
  dialog.addEventListener('close',()=>{cancelAnimationFrame(anim);chart.keys.clear();});
  function animate(now){
    if(!dialog.open) return;
    const steps=Math.min(5,Math.floor((now-lastTick)/20));
    if(steps>0) {
      lastTick=now-(now-lastTick)%20;
      if(isChart()){for(let i=0;i<steps;i++) chart.step();draw();}
      if(screen==='roster' && faceX!==faceTarget){
        faceX+=Math.sign(faceTarget-faceX)*Math.min(Math.abs(faceTarget-faceX),8*steps);
        person=Math.round(faceX/160);draw();
      }
    }
    anim=requestAnimationFrame(animate);
  }
  return {draw,restoreChart(view){
    if(!isChart() || !view) return;
    chart.restore(view);notice=view.replay?'Replay this location?':'';
    lastChart=JSON.stringify(view);draw();
  },onlinePause(){screen='online-pause';draw();get('resume').focus();},result(message){screen='result';notice=message;draw();get('back').focus();},multiplayer(){
    screen='multiplayer';capacity=2;
    dialog.showModal();draw();get('room-size').focus();
  },files(options){
    browser=options;screen='files';editing=0;notice='';
    if(!dialog.open) dialog.showModal();
    draw();dialog.focus();
  },get inMultiplayerSetup(){return screen==='multiplayer';},get inRoster(){return screen==='roster';},open(paused,roster=false){
    lastChart='';screen=paused?'pause':roster?'roster':'maps';person=0;faceX=faceTarget=0;notice='';
    if(isChart()) chart.reset();draw();dialog.focus({preventScroll:true});cancelAnimationFrame(anim);lastTick=performance.now();anim=requestAnimationFrame(animate);
  },message(value){notice=value;draw();}};
}
