import {characterAudio} from './isometric-audio.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function addSoldier({scene,level,getCamera,controls}){
 const gltf=await new GLTFLoader().loadAsync('./isometric-textures/models/soldier.glb');
 const actor=new THREE.Group(),visual=gltf.scene;actor.add(visual);scene.add(actor);visual.traverse(object=>{if(object.isMesh){object.layers.enable(1);object.castShadow=true;object.receiveShadow=true;}});
 const bounds=new THREE.Box3().setFromObject(visual),size=bounds.getSize(new THREE.Vector3());
 visual.scale.setScalar(.85/size.y);visual.position.y=-bounds.min.y*visual.scale.x;
 const start=level.starts[0];actor.position.set(start.x,start.floor+.05,start.y);
 const mixer=new THREE.AnimationMixer(visual),actions={};
 for(const clip of gltf.animations){const c=clip.clone();for(const track of c.tracks)if(track.name.endsWith('.position')){for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}}actions[c.name.toLowerCase()]=mixer.clipAction(c);}
 let active=actions.walking??Object.values(actions)[0];
 const keys=new Set();const relevant=new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight']);
 addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||!relevant.has(e.code))return;e.preventDefault();keys.add(e.code);});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
 const audio=await characterAudio();
 const feet=[];visual.traverse(o=>{if(/(?:Left|Right)Foot$/.test(o.name))feet.push(o);});
 const footPosition=new THREE.Vector3(),contacts=new Map();let footfalls=0;
 // Each supplied clip is one stride: sample one lowest contact per foot,
 // rather than interpreting every small vertical wobble as another impact.
 for(const action of Object.values(actions)){
  mixer.stopAllAction();action.reset().play();const duration=action.getClip().duration,samples=120;
  const minima=feet.map(()=>({height:Infinity,time:0}));
  for(let i=0;i<samples;i++){action.time=i*duration/samples;mixer.update(0);actor.updateMatrixWorld(true);feet.forEach((bone,j)=>{bone.getWorldPosition(footPosition);if(footPosition.y<minima[j].height)minima[j]={height:footPosition.y,time:action.time};});}
  contacts.set(action,minima.map(m=>m.time));
 }
 mixer.stopAllAction();if(active){active.reset().play();active.paused=true;}mixer.update(0);
 const motion=new THREE.Vector3();
 function allowed(x,y){for(const [ox,oy]of [[-.13,-.13],[.13,-.13],[-.13,.13],[.13,.13]]){const cx=Math.floor(x+ox+.5),cy=Math.floor(y+oy+.5),z=start.floor;if(cx<0||cy<0||cx>=23||cy>=23)return false;const c=level.cell(cx,cy,z),below=z?level.cell(cx,cy,z-1):null;if(c.blockType===0||c.blockType===1||[20,21].includes(c.blockType))return false;if(c.floorType===null&&![0,1].includes(below?.blockType))return false;}return true;}
 function update(dt){const camera=getCamera();
 const turn=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
 actor.rotation.y+=turn*2.2*dt;
 const travel=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
 motion.set(Math.sin(actor.rotation.y)*travel,0,Math.cos(actor.rotation.y)*travel);
 const run=keys.has('ShiftLeft')||keys.has('ShiftRight'),speed=travel<0?.85:run?3.6:1.3;const old=actor.position.clone();if(motion.lengthSq()){motion.normalize();const nx=actor.position.x+motion.x*speed*dt;if(allowed(nx,actor.position.z))actor.position.x=nx;const nz=actor.position.z+motion.z*speed*dt;if(allowed(actor.position.x,nz))actor.position.z=nz;}
 const moving=old.distanceToSquared(actor.position)>1e-8,next=run&&travel>0?(actions.running??actions.walking):actions.walking;
 if(next&&active!==next){active?.fadeOut(.15);next.reset().fadeIn(.15).play();active=next;}if(active){active.paused=!moving;active.timeScale=travel<0?-.7:run?1.25:1;}
 const previousTime=active?.time??0;
 mixer.update(dt);actor.updateMatrixWorld(true);
 const terrain=level.cell(Math.floor(actor.position.x+.5),Math.floor(actor.position.z+.5),start.floor),dirt=terrain.floorType===0;
 if(moving&&active){const duration=active.getClip().duration,advance=dt*active.getEffectiveTimeScale();
  for(const contact of contacts.get(active)??[]){const distance=advance>=0?(contact-previousTime+duration)%duration:(previousTime-contact+duration)%duration;
   if(distance>1e-6&&distance<=Math.abs(advance)+1e-6){audio.step(dirt);footfalls++;}
  }
 }
 audio.update(dt,dirt&&level.cell(Math.floor(actor.position.x+.5),Math.floor(actor.position.z+.5),Math.min(19,start.floor+1)).blockType!==0);
 const delta=actor.position.clone().sub(old);camera.position.add(delta);controls.target.add(delta);
 actor.visible=Math.abs(+$('floor').value-start.floor)<.6||!$('single').checked;
 }
 function $(id){return document.getElementById(id);}
 return {actor,update,get footfalls(){return footfalls;},contacts:[...contacts].map(([a,t])=>({name:a.getClip().name,times:t})),animations:Object.keys(actions)};
}
