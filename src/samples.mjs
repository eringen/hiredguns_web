// PAL Paula playback rate = audio clock / period. BODY data is signed 8-bit PCM.
export const extraSamples=['','Bark','Bat','Grumble','Drip','DTS','EchoScream','FemaleGrunt','Gun','Lift','MaleGrunt','MetalClang','Roar','Swipe','Swish','Voice','Thunder','Unlock'];
export function variedPeriod(period) {
  return Math.max(90,period-64+Math.floor(Math.random()*128));
}
export function movementAudio(samplesByName) {
  let context;
  const buffers = new Map();
  function play(kind, period, channel, volume=63) {
    if (!window.AudioContext || !period || volume<=0) return;
    play.unlock();
    if (!buffers.has(kind)) {
      const raw = samplesByName[kind];
      const buffer = context.createBuffer(1, raw.length, 22050);
      const samples = new Int8Array(raw.buffer, raw.byteOffset, raw.length);
      buffer.getChannelData(0).set(Float32Array.from(samples, value=>value/128));
      buffers.set(kind,buffer);
    }
    const voice = context.createBufferSource();
    voice.buffer=buffers.get(kind);
    voice.playbackRate.value=3546895/(period*22050);
    const gain=context.createGain();
    gain.gain.value=volume/63;
    voice.connect(gain);gain.connect(context.destination);
    voice.onended=()=>{voice.disconnect();gain.disconnect();};
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
  const buffers=new Map();
  function buffer(name) {
    if(buffers.has(name)) return buffers.get(name);
    const bytes=files[name],view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let start,end,audio;
    for(let offset=12;offset+8<=bytes.length;) {
      const id=String.fromCharCode(...bytes.subarray(offset,offset+4)),size=view.getUint32(offset+4),body=offset+8;
      if(id==='VHDR') {start=view.getUint32(body);end=start+view.getUint32(body+4);}
      if(id==='BODY') {
        audio=context.createBuffer(1,size,22050);
        audio.getChannelData(0).set(Float32Array.from(new Int8Array(bytes.buffer,bytes.byteOffset+body,size),s=>s/128));
      }
      offset=body+size+(size&1);
    }
    const result={audio,start:start/22050,end:end/22050};
    buffers.set(name,result);return result;
  }
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
    const signature=spec.name+':'+spec.period,entry=voices.get(slot);
    if(entry?.signature===signature){
      if(entry.volume!==spec.volume){
        entry.gain.gain.setTargetAtTime(spec.volume/63,context.currentTime,0.04);
        entry.volume=spec.volume;
      }
      return;
    }
    stop(slot);
    const {audio,start,end}=buffer(spec.name);
    const voice=context.createBufferSource();voice.buffer=audio;voice.loop=true;
    voice.loopStart=start;voice.loopEnd=end;voice.playbackRate.value=3546895/(22050*spec.period);
    const gain=context.createGain();gain.gain.value=spec.volume/63;
    voice.connect(gain);gain.connect(context.destination);voice.start();
    voice.onended=()=>{voice.disconnect();gain.disconnect();};
    voices.set(slot,{voice,gain,volume:spec.volume,signature});
  }
  return {unlock,update,stop};
}
