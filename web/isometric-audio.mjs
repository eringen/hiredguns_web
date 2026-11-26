// Animation-triggered footsteps and procedural foliage rustling.
export async function characterAudio(){
 let context,footstep,ready=false,nextRustle=4+Math.random()*8;
 const bytes=await (await fetch('./art/audio/Footstep.wav')).arrayBuffer();
 const enabled=()=>document.getElementById('ambient').checked&&!document.hidden;
 async function unlock(){if(!enabled())return;context??=new AudioContext();await context.resume();if(!footstep)footstep=await context.decodeAudioData(bytes.slice(0));ready=true;}
 addEventListener('pointerdown',()=>{unlock().catch(console.error)});addEventListener('keydown',()=>{unlock().catch(console.error)});
 function step(dirt){if(!ready||!enabled())return;const voice=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();voice.buffer=footstep;voice.playbackRate.value=3546895/(22050*(360+Math.random()*30));filter.type='lowpass';filter.frequency.value=dirt?1400:7000;gain.gain.value=dirt?.22:.32;voice.connect(filter).connect(gain).connect(context.destination);voice.onended=()=>{voice.disconnect();filter.disconnect();gain.disconnect();};voice.start();}
 function rustle(){const length=.7+Math.random()*.8,buffer=context.createBuffer(1,Math.floor(context.sampleRate*length),context.sampleRate),data=buffer.getChannelData(0);let smooth=0;for(let i=0;i<data.length;i++){smooth=.75*smooth+.25*(Math.random()*2-1);data[i]=smooth*(.4+.6*Math.sin(i/context.sampleRate*21)**2);}
 const voice=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),pan=context.createStereoPanner();voice.buffer=buffer;filter.type='bandpass';filter.frequency.value=1600;filter.Q.value=.5;pan.pan.value=(Math.random()*2-1)*.3;const now=context.currentTime;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.13,now+.18);gain.gain.linearRampToValueAtTime(0,now+length);voice.connect(filter).connect(gain).connect(pan).connect(context.destination);voice.onended=()=>{voice.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};voice.start();}
 return {step,update(dt,outdoors){if(!ready||!enabled())return;nextRustle-=dt;if(nextRustle<=0){if(outdoors)rustle();nextRustle=5+Math.random()*12;}}};
}
