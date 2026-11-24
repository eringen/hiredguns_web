// WAV samples retain the original sample count at a nominal 22050 Hz.
export const extraSamples=['','Bark','Bat','Grumble','Drip','DTS','EchoScream','FemaleGrunt','Gun','Lift','MaleGrunt','MetalClang','Roar','Swipe','Swish','Voice','Thunder','Unlock'];
export function variedPeriod(period) {
  return Math.max(90,period-64+Math.floor(Math.random()*128));
}
export async function loadAudio(names) {
  const context=new OfflineAudioContext(1,1,22050);
  const response=await fetch('art/audio/loops.json');
  if(!response.ok) throw new Error('Could not load audio loop metadata');
  const loops=await response.json();
  const entries=await Promise.all(names.map(async name=>{
    const response=await fetch('art/audio/'+name+'.wav');
    if(!response.ok) throw new Error('Could not load audio '+name);
    const audio=await context.decodeAudioData(await response.arrayBuffer());
    return [name,{audio,...loops[name]}];
  }));
  return Object.fromEntries(entries);
}
export function movementAudio(samplesByName) {
  let context;
  function play(kind, period, channel, volume=63, pan=0) {
    if (!window.AudioContext || !period || volume<=0) return;
    play.unlock();
    const voice = context.createBufferSource();
    voice.buffer=samplesByName[kind].audio;
    voice.playbackRate.value=3546895/(period*22050);
    const gain=context.createGain();
    gain.gain.value=volume/63;
    const panner=context.createStereoPanner();panner.pan.value=pan;
    voice.connect(gain);gain.connect(panner);panner.connect(context.destination);
    voice.onended=()=>{voice.disconnect();gain.disconnect();panner.disconnect();};
    voice.start();
  }
  play.unlock=()=>{
    if (!window.AudioContext) return;
    context ??= new AudioContext();
    if (context.state === 'suspended' || context.state === 'interrupted') context.resume().catch(()=>{});
  };
  play.ready=()=>context?.state==='running';
  return play;
}

// Main.s update_background_sfx uses one looping Paula channel for the squad.
export function environmentSound(level,players,atmos) {
  for(const p of players) {
    if(!p.fitness || p.exited) continue;
    const {terrain}=level.cell(p.x,p.y,p.floor);
    if(terrain&4) return {name:'Water',period:284+32*((terrain>>>17)&3),volume:63};
  }
  const [period,volume]=[[360,63],[1100,20],[360,63],[180,63],[325,40],[369,40],[856,30],[713,30]][atmos]??[360,63];
  return {name:'Atmos'+String(atmos).padStart(2,'0'),period,volume};
}

export function ambientAudio(files) {
  let context;
  const voices=new Map();
  function stop(slot) {
    if(slot===undefined){for(const key of voices.keys()) stop(key);return;}
    const entry=voices.get(slot);
    if(entry) {entry.voice.stop();voices.delete(slot);}
  }
  function unlock() {
    if(!window.AudioContext) return;
    context??=new AudioContext();
    if(context.state==='suspended') context.resume().catch(()=>{});
  }
  function update(spec,slot='ambient') {
    if(!context || context.state!=='running') return;
    if(!spec.volume){stop(slot);return;}
    const pan=spec.pan??0;
    const signature=spec.name+':'+spec.period,entry=voices.get(slot);
    if(entry?.signature===signature){
      if(entry.pan!==pan){
        entry.panner.pan.setTargetAtTime(pan,context.currentTime,0.04);
        entry.pan=pan;
      }
      if(entry.volume!==spec.volume){
        entry.gain.gain.setTargetAtTime(spec.volume/63,context.currentTime,0.04);
        entry.volume=spec.volume;
      }
      return;
    }
    stop(slot);
    const {audio,start,end}=files[spec.name];
    const voice=context.createBufferSource();voice.buffer=audio;voice.loop=true;
    voice.loopStart=start;voice.loopEnd=end;voice.playbackRate.value=3546895/(22050*spec.period);
    const gain=context.createGain();gain.gain.value=spec.volume/63;
    const panner=context.createStereoPanner();panner.pan.value=pan;
    voice.connect(gain);gain.connect(panner);panner.connect(context.destination);voice.start();
    voice.onended=()=>{voice.disconnect();gain.disconnect();panner.disconnect();};
    voices.set(slot,{voice,gain,panner,pan,volume:spec.volume,signature});
  }
  return {unlock,update,stop};
}

export function sourcePan(listener,x,y,floor) {
  const dx=x-listener.x,dy=y-listener.y,dz=floor-listener.floor;
  const distance=Math.hypot(dx,dy,dz);
  const right=[[1,0],[0,1],[-1,0],[0,-1]][listener.dir];
  return distance ? (dx*right[0]+dy*right[1])/distance : 0;
}
