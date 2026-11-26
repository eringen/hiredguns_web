import {loadAudio,ambientAudio,environmentSound} from './samples.mjs';
import {addSoldier} from './isometric-character.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {readLevel} from './level.mjs';
import {loadSpriteSheet} from './sprite-png.mjs';
const $=id=>document.getElementById(id);
try {
const catalog=await (await fetch('./levels.json')).json();
const requested=Number(new URLSearchParams(location.search).get('map')??7);
const entry=catalog.find(m=>m.id===requested)??catalog.find(m=>m.id===7);
const mapId=entry.id;
let ambience=null,audioGesture=false;
$('ambient').checked=localStorage.getItem('hiredguns.iso.ambient')!=='off';
loadAudio(['Atmos'+String(entry.atmos).padStart(2,'0')]).then(files=>{ambience=ambientAudio(files);if(audioGesture&&$('ambient').checked)ambience.unlock();}).catch(error=>{$('ambient').checked=false;$('ambient-status').textContent='Audio unavailable';console.error(error);});
function unlockAmbience(){audioGesture=true;if($('ambient').checked)ambience?.unlock();}
addEventListener('pointerdown',unlockAmbience);addEventListener('keydown',unlockAmbience);
$('ambient').onchange=()=>{localStorage.setItem('hiredguns.iso.ambient',$('ambient').checked?'on':'off');if($('ambient').checked)unlockAmbience();else ambience?.stop();};
addEventListener('pagehide',()=>ambience?.stop());
document.addEventListener('visibilitychange',()=>{if(document.hidden)ambience?.stop();});
function updateAmbience(){if(!ambience||!audioGesture||!$('ambient').checked||document.hidden)return;const spec=environmentSound(level,[],entry.atmos);ambience.update({...spec,volume:spec.volume*.65});$('ambient-status').textContent='';}

for(const groupName of [...new Set(catalog.map(m=>m.group))]){
 const group=document.createElement('optgroup');group.label=groupName;
 for(const m of catalog.filter(m=>m.group===groupName))group.append(new Option(m.label,m.id));
 $('level-select').append(group);
}
$('level-select').value=mapId;
$('level-select').onchange=()=>{const url=new URL(location.href);url.searchParams.set('map',$('level-select').value);location.assign(url);};
$('level-title').textContent=entry.label;document.title=entry.label+' · Isometric';
const response=await fetch(`./maps/${mapId}.map`);if(!response.ok)throw Error('Map unavailable');
const level=readLevel(new Uint8Array(await response.arrayBuffer()));
const scene=new THREE.Scene();scene.background=new THREE.Color('#0c141a');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.body.append(renderer.domElement);
let camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.05,200);
const controls=new OrbitControls(camera,renderer.domElement);controls.mouseButtons.LEFT=THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;
controls.touches.ONE=THREE.TOUCH.PAN;
controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
// Capture before OrbitControls handles pointerdown, so the second tap can rotate.
let lastTap=null,touchStart=null;
renderer.domElement.addEventListener('pointerdown',event=>{
 if(event.pointerType!=='touch')return;
 const now=performance.now();
 const doubleTap=lastTap&&now-lastTap.time<350&&Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<28;
 controls.touches.ONE=doubleTap?THREE.TOUCH.ROTATE:THREE.TOUCH.PAN;
 touchStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:now,doubleTap};
 if(doubleTap)lastTap=null;
},true);
renderer.domElement.addEventListener('pointerup',event=>{
 if(!touchStart||event.pointerId!==touchStart.id)return;
 const now=performance.now();
 if(!touchStart.doubleTap&&now-touchStart.time<280&&Math.hypot(event.clientX-touchStart.x,event.clientY-touchStart.y)<16)
  lastTap={time:now,x:event.clientX,y:event.clientY};
 touchStart=null;
},true);
renderer.domElement.addEventListener('pointercancel',()=>{touchStart=null;lastTap=null;},true);
controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minZoom=.35;controls.maxZoom=8;controls.minDistance=5;controls.maxDistance=80;
const ambient=new THREE.HemisphereLight(0x929fc2,0x303345,1.26);scene.add(ambient);
const sun=new THREE.DirectionalLight(0x8996c4,.65);sun.position.set(-15,30,10);sun.castShadow=true;
sun.shadow.camera.layers.set(1);sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:75});sun.shadow.bias=-.00015;sun.shadow.normalBias=.025;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
const rim=new THREE.DirectionalLight(0x7186b6,.25);rim.position.set(12,18,-18);scene.add(rim);
$('shadows').onchange=()=>{renderer.shadowMap.enabled=$('shadows').checked;scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});};
const prefix=`styles/${level.style}/`;
const [stone,grass,door]=await Promise.all(['Stone','Grass','terrain-door1front'].map(n=>loadSpriteSheet(prefix+n)));
function material(sheet,slot,color){const sprite=sheet[slot]??sheet.find(Boolean);const texture=new THREE.CanvasTexture(sprite.canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;return new THREE.MeshPhysicalMaterial({map:texture,color,roughness:.88,side:THREE.DoubleSide});}
const textureConfig=await (await fetch('./isometric-textures.json')).json();
const walls=material(stone,41,0xffffff),floors=material(grass,41,0xc6c7ae),doors=material(door,41,0xffffff);
const metal=new THREE.MeshPhysicalMaterial({color:0x64736d,roughness:.65,metalness:.5});const water=new THREE.MeshPhysicalMaterial({color:0x2f999f,transparent:true,opacity:.55,roughness:.2});const field=new THREE.MeshPhysicalMaterial({color:0x906cdb,emissive:0x462c88,transparent:true,opacity:.45});
const caps=metal.clone();
const elevator=metal.clone(),column=metal.clone(),ceiling=metal.clone();
const ground=floors.clone(),stairWalls=walls.clone(),stairTreads=metal.clone(),stairRisers=metal.clone(),landings=floors.clone();
for(const [name,mat] of Object.entries({walls,floors,doors,metal,water,field,ground,stairWalls,stairTreads,stairRisers,landings,elevator,column,ceiling,caps})){
 const cfg=textureConfig.levels?.[mapId]?.[name]??textureConfig[name];if(!cfg)continue;
 if(cfg.url){const tex=await new THREE.TextureLoader().loadAsync(cfg.url);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(...(cfg.repeat??[1,1]));
 if(cfg.region){const [x,y,w,h]=cfg.region;const image=tex.image;const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*w);canvas.height=Math.round(image.height*h);canvas.getContext('2d').drawImage(image,image.width*x,image.height*y,canvas.width,canvas.height,0,0,canvas.width,canvas.height);tex.image=canvas;tex.needsUpdate=true;}tex.anisotropy=renderer.capabilities.getMaxAnisotropy();mat.map=tex;mat.color.set(0xffffff);}
 for(const [key,property] of [['bump','bumpMap'],['specular','specularIntensityMap']])if(cfg[key]){const tex=await new THREE.TextureLoader().loadAsync(cfg[key]);tex.colorSpace=THREE.NoColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.copy(mat.map?.repeat??new THREE.Vector2(1,1));tex.anisotropy=renderer.capabilities.getMaxAnisotropy();mat[property]=tex;}
 if(cfg.weathering){
 mat.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 depotWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\ndepotWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
 varying vec3 depotWorld;
 float depotHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float depotNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(depotHash(i),depotHash(i+vec2(1,0)),f.x),mix(depotHash(i+vec2(0,1)),depotHash(i+vec2(1,1)),f.x),f.y);}
 `);
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 float broad=depotNoise(depotWorld.xz*.38+depotWorld.y*.17);
 float detail=depotNoise(depotWorld.xz*2.3+depotWorld.y*.31);
 float dirt=smoothstep(.42,.83,broad*.72+detail*.28);
 diffuseColor.rgb*=mix(vec3(1.06,1.03,.98),vec3(.49,.43,.34),dirt*.65);
 `);
 };
 mat.customProgramCacheKey=()=> 'depot-weathering-v1';
 }
 mat.bumpScale=cfg.bumpScale??.035;if(cfg.metalness!==undefined)mat.metalness=cfg.metalness;
 if(cfg.color)mat.color.set(cfg.color);if(cfg.roughness!==undefined)mat.roughness=cfg.roughness;mat.needsUpdate=true;
}
// Same six colour ramps and four-pixel bands as field.mjs / the CD32 copper effect.
const rainbowCanvas=document.createElement('canvas');rainbowCanvas.width=4;rainbowCanvas.height=84;
const rainbowContext=rainbowCanvas.getContext('2d');
const rainbowTexture=new THREE.CanvasTexture(rainbowCanvas);rainbowTexture.colorSpace=THREE.SRGBColorSpace;rainbowTexture.magFilter=THREE.NearestFilter;rainbowTexture.minFilter=THREE.NearestFilter;
const exitMaterial=new THREE.MeshBasicMaterial({map:rainbowTexture,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false});
let rainbowFrame=-1;
function animatePortals(time){const frame=Math.floor(time/20)%90;if(frame===rainbowFrame)return;rainbowFrame=frame;
 for(let row=0;row<84;row+=4){const i=(frame+(row>>2))%90,n=(i%15)*17,m=255-n;const rgb=[[255,n,0],[m,255,0],[0,255,n],[0,m,255],[n,0,255],[255,0,m]][Math.floor(i/15)];rainbowContext.fillStyle=`rgb(${rgb.join(',')})`;rainbowContext.fillRect(0,row,4,4);}rainbowTexture.needsUpdate=true;
}
const doorUpper=doors.clone(),doorLower=doors.clone();
if(textureConfig.levels?.[mapId]?.doors?.url){for(const [mat,offset] of [[doorUpper,.5],[doorLower,0]]){for(const key of ['map','bumpMap','specularIntensityMap'])if(doors[key]){mat[key]=doors[key].clone();mat[key].repeat.set(1,.5);mat[key].offset.set(0,offset);mat[key].needsUpdate=true;}}}
const liftDefs=level.lifts.filter(l=>l.key);
const liftKeys=new Set(liftDefs.map(l=>l.key));
const equipment=await (await fetch('./equipment.json')).json();
const lootMeshes=[],lootTextures=new Map();
const groups=[],wallMeshes=[],doorActors=[],ceilingMeshes=[],wallLamps=[];
const lampHousing=new THREE.MeshPhysicalMaterial({color:0x252b2c,metalness:.6,roughness:.7});
const lampGlow=new THREE.MeshBasicMaterial({color:0xd3e6ff});
function lampAt(group,x,y,z,dx=0,dz=1){
 box(group,x,y,z,dx?.10:.32,.13,dx?.32:.10,lampHousing);
 box(group,x+dx*.055,y,z+dz*.055,dx?.02:.24,.065,dx?.24:.02,lampGlow);
 wallLamps.push({position:new THREE.Vector3(x+dx*.22,y+group.position.y,z+dz*.22),floor:group.position.y});
}
// Keep the shader light/shadow counts constant. Retain nearby assignments and
// fade completely out before relocating a light, then fade in at its new fixture.
const lampSlots=Array.from({length:8},(_,i)=>{
 const light=new THREE.PointLight(0xc1d8ff,0,5,2);
 light.castShadow=false;light.shadow.mapSize.set(512,512);
 light.shadow.bias=-.0005;light.shadow.normalBias=.025;light.shadow.camera.near=.08;
 scene.add(light);return {light,lamp:null};
});
let lampSelectionTime=0,desiredLamps=new Set();
function updateWallLights(dt){
 lampSelectionTime-=dt;
 if(lampSelectionTime<=0){
  lampSelectionTime=.2;
  const floor=+$('floor').value,target=controls.target;
  const assigned=new Set(lampSlots.map(slot=>slot.lamp));
  const score=lamp=>lamp.position.distanceToSquared(target)*(assigned.has(lamp)?.7:1);
  desiredLamps=new Set(wallLamps.filter(l=>$('single').checked?l.floor===floor:l.floor<=floor+Number($('floors-above').value))
   .sort((a,b)=>score(a)-score(b)).slice(0,lampSlots.length));
 }
 const assigned=new Set(lampSlots.map(slot=>slot.lamp));
 for(const slot of lampSlots){
  const wanted=desiredLamps.has(slot.lamp);
  const step=7*dt/.45;
  slot.light.intensity=wanted?Math.min(7,slot.light.intensity+step):Math.max(0,slot.light.intensity-step);
  if(!wanted&&slot.light.intensity===0){
   assigned.delete(slot.lamp);
   slot.lamp=[...desiredLamps].find(lamp=>!assigned.has(lamp))??null;
   if(slot.lamp){assigned.add(slot.lamp);slot.light.position.copy(slot.lamp.position);}
  }
 }
}

let count=0;
const cube=new THREE.BoxGeometry(1,1,1);
function box(group,x,y,z,w,h,d,mat,kind){let geometry=cube;
 if(mat===ground||mat===caps){geometry=cube.clone();const uv=geometry.attributes.uv,position=geometry.attributes.position,normal=geometry.attributes.normal;for(let i=0;i<uv.count;i++)if(Math.abs(normal.getY(i))>.5)uv.setXY(i,(x+position.getX(i)*w)/3,(z+position.getZ(i)*d)/3);uv.needsUpdate=true;}
 const m=new THREE.Mesh(geometry,mat);m.userData.floorSurface=w>=.99&&d>=.99&&h<=.08;m.receiveShadow=true;m.castShadow=!(Array.isArray(mat)?mat.some(m=>m.transparent):mat.transparent);m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);if(kind==='wall')wallMeshes.push(m);count++;return m;}
function cell(x,y,z){return x<0||y<0||z<0||x>=23||y>=23||z>=20?null:level.cell(x,y,z);}
// Equates.i: stair directions N/E/S/W; high end points in that direction.
function stairsAt(group,x,y,direction){const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][direction];for(let step=0;step<5;step++){const h=(step+1)/5,offset=step/5-.4;box(group,x+dx*offset,h/2,y+dy*offset,dx?.2:1,h,dy?.2:1,[stairRisers,stairRisers,stairTreads,metal,stairRisers,stairRisers]);}}
for(let z=0;z<20;z++){
 const group=new THREE.Group();group.position.y=z;scene.add(group);groups.push(group);
 for(let y=0;y<23;y++)for(let x=0;x<23;x++){
  const c=cell(x,y,z),b=c.blockType;
  if(mapId===7&&b!==0&&cell(x,y,z+1)?.blockType===0){const roof=new THREE.Mesh(new THREE.PlaneGeometry(1,1),ceiling);roof.rotation.x=Math.PI/2;roof.position.set(x,.99,y);roof.visible=false;group.add(roof);ceilingMeshes.push(roof);}
  const nearStairs=mapId===7&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const n=cell(x+dx,y+dy,z);if(!n)return false;const a=(n.terrain&32)?n.terrain>>>28:null;return (n.blockType>=16&&n.blockType<=19)||(a>=8&&a<=11);});
  const wallMaterial=nearStairs?stairWalls:walls,paving=nearStairs?landings:floors;
  const container=c.terrain>>>28,itemId=c.contents&255;
  if((c.terrain&32)&&container>=2&&container<=6&&equipment.items[itemId]){
   const def=equipment.items[itemId];let tex=lootTextures.get(def.image);
   if(!tex){tex=await new THREE.TextureLoader().loadAsync(`./art/item${def.image}.png`);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;lootTextures.set(def.image,tex);}
   const icon=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true}));icon.position.set(x,.32,y);icon.scale.set(.5,.4,1);icon.userData={id:itemId,name:def.name,x,y,floor:z,ammo:(c.contents>>>16)&255,damage:(c.contents>>>8)&255};group.add(icon);lootMeshes.push(icon);
  }
  // Open cells can stand on the solid block below without a separate floor flag.
  const below=z?cell(x,y,z-1):null;
  if(c.floorType===null&&b!==0&&[0,1].includes(below?.blockType))box(group,x,-.015,y,1,.05,1,paving);
  // Solid bedrock is implicit: expose only its boundary against traversable cells.
  const exposed=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const n=cell(x+dx,y+dy,z);return n&&n.blockType!==0;});
  if(c.floorType!==null&&c.floorType!==1&&!liftKeys.has((z*23+y)*23+x))box(group,x,0,y,1,.08,1,c.floorType===2?metal:c.floorType===0?ground:paving);
  if(b===0&&exposed&&(x+y)%4===0){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=cell(x+dx,y+dy,z);if(n&&n.blockType!==0&&(n.floorType!==null||cell(x+dx,y+dy,z-1)?.blockType===0)){lampAt(group,x+dx*.52,.78,y+dy*.52,dx,dy);break;}}}
  if(b===0&&exposed)box(group,x,.5,y,1,1,1,[wallMaterial,wallMaterial,mapId===7?caps:metal,metal,wallMaterial,wallMaterial],'wall');
  else if(b===1)box(group,x,.4,y,.85,.8,.85,metal);
  else if(b===20||b===21){
   const assembly=new THREE.Group();assembly.position.set(x,0,y);if(b===21)assembly.rotation.y=Math.PI/2;group.add(assembly);
   // Stationary jambs and upper/lower ledges surround two retracting leaves.
   box(assembly,-.46,.5,0,.08,1,.24,metal);box(assembly,.46,.5,0,.08,1,.24,metal);
   box(assembly,0,.96,0,1,.08,.24,metal);box(assembly,0,.04,0,1,.08,.24,metal);
   const upper=box(assembly,0,.71,0,.84,.42,.14,doorUpper);
   const lower=box(assembly,0,.29,0,.84,.42,.14,doorLower);
   lampAt(group,x+(b===21?.55:0),.85,y+(b===20?.55:0),b===21?1:0,b===20?1:0);
   const key=(z*23+y)*23+x,def=level.doors.find(d=>d.key===key);
   doorActors.push({upper,lower,def,key,open:0});
  }
  else if(b>=16&&b<=19)stairsAt(group,x,y,b-16);
  else if(b===7)box(group,x,.5,y,.22,1,.22,column);
  else if(b===4){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.46,0),walls);rock.position.set(x,.48,y);rock.scale.y=1.7;group.add(rock);count++;}
  else if([2,3,5,6].includes(b))box(group,x,.5,y,.94,1,.94,b===3?exitMaterial:field);
  const aux=(c.terrain&32)?c.terrain>>>28:null;
  if(aux>=8&&aux<=11)stairsAt(group,x,y,aux-8);
  if(c.terrain&4)box(group,x,.08+((c.terrain>>>17)&3)*.2,y,.98,.035,.98,water);
  if(c.terrain&8)box(group,x,.65,y,.18,.22,.18,new THREE.MeshPhysicalMaterial({color:0xdac36f,emissive:0x554210}));
 }
}
const liftMaterial=elevator;
const liftActors=liftDefs.map((def,i)=>{
 const x=def.key%23,y=Math.floor(def.key/23)%23;
 const root=new THREE.Group();scene.add(root);
 const platform=box(root,x,def.height,y,.94,.12,.94,liftMaterial);
 for(const side of [-1,1])box(root,x+side*.4,def.height+.075,y,.045,.025,.88,new THREE.MeshPhysicalMaterial({color:0xffce63,emissive:0xa77513}));
 // Rails show the original shaft travel; the platform and its edge lights move together.
 const rails=new THREE.Group();scene.add(rails);
 for(const side of [-1,1])box(rails,x+side*.46,(def.min+def.max)/2,y+.45,.045,def.max-def.min+.2,.045,metal);
 const option=new Option(`${i+1}: floors ${def.min}–${def.max}`,i);$('lift-select').add(option);
 return {def,root,rails,x,y,height:def.height,direction:def.dir===2?-1:1,pause:0};
});
let focusedLift=null;
$('lift-focus').disabled=!liftActors.length;
$('lift-select').disabled=!liftActors.length;
$('lift-focus').onclick=()=>{focusedLift=liftActors[+$('lift-select').value];$('single').checked=false;$('floor').value=focusedLift.def.max;update();const {x,y,def}=focusedLift;controls.target.set(x,(def.min+def.max)/2,y);camera.position.copy(controls.target).add(new THREE.Vector3(12,12,12));camera.zoom=camera.isPerspectiveCamera?1:2.4;camera.updateProjectionMatrix();};
function liftVisibility(){const z=+$('floor').value;for(const a of liftActors){const servesFloor=z>=a.def.min&&z<=a.def.max;a.root.visible=$('single').checked?servesFloor:a.height<=z+Number($('floors-above').value)+.1;a.rails.visible=$('single').checked?servesFloor:a.def.min<=z+Number($('floors-above').value);}}
let lastTime=0;
function animateLifts(time){const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
 if($('animate-lifts').checked)for(const a of liftActors){if(a.pause>0){a.pause-=dt;continue;}a.height+=a.direction*dt*.65;if(a.height>=a.def.max||a.height<=a.def.min){a.height=THREE.MathUtils.clamp(a.height,a.def.min,a.def.max);a.direction*=-1;a.pause=1;}a.root.position.y=a.height-a.def.height;}
 liftVisibility();
}
const grid=new THREE.GridHelper(23,23,0x54756c,0x263c38);grid.position.set(11,-.12,11);scene.add(grid);
$('ceilings').onchange=()=>ceilingMeshes.forEach(m=>m.visible=$('ceilings').checked);
$('floor').value=level.starts[0].floor;
function update(){const z=+$('floor').value;$('value').value=z;$('floors-above-value').value=$('floors-above').value;lampSelectionTime=0;groups.forEach((g,i)=>g.visible=$('single').checked?i===z:i<=z+Number($('floors-above').value));wallMeshes.forEach(m=>{m.scale.y=$('cut').checked?Math.min(.32,+$('wall-height').value):+$('wall-height').value;m.position.y=m.scale.y/2;});$('wall-value').value=Number($('wall-height').value).toFixed(2);grid.position.y=$('single').checked?z-.12:-.12;controls.target.y=z;}
function reset(){const start=level.starts[0];$('floor').value=start.floor;update();controls.target.set(start.x,start.floor,start.y);const distance=camera.isPerspectiveCamera?4:23;camera.position.set(start.x+distance,start.floor+distance*1.45,start.y+distance);camera.zoom=camera.isPerspectiveCamera?1:controls.maxZoom;camera.updateProjectionMatrix();controls.update();}
for(const id of ['floor','floors-above','single','cut','wall-height'])$(id).addEventListener('input',update);$('home').onclick=reset;$('top').onclick=()=>{camera.position.set(11,+$('floor').value+40,11.01);controls.target.set(11,+$('floor').value,11);controls.update();};
function resize(){const aspect=innerWidth/innerHeight;if(camera.isPerspectiveCamera)camera.aspect=aspect;else{camera.left=-16*aspect;camera.right=16*aspect;camera.top=16;camera.bottom=-16;}camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);resize();update();reset();
$('projection').onchange=()=>{
 const perspective=$('projection').value==='perspective';
 const direction=camera.position.clone().sub(controls.target).normalize();
 const span=camera.isPerspectiveCamera?2*camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)):32/camera.zoom;
 camera=perspective?new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.05,200):new THREE.OrthographicCamera(-18,18,18,-18,.05,200);
 camera.position.copy(controls.target).addScaledVector(direction,perspective?span/(2*Math.tan(THREE.MathUtils.degToRad(20))):40);
 camera.zoom=perspective?1:32/span;controls.object=camera;resize();controls.update();
};
$('status').textContent=`Original map ${mapId} · 23 × 23 × 20 cells · Style ${level.style+1}`;
let selectedLoot=null,clickStart=null;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',e=>{clickStart={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{
 if(!clickStart||Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)>6)return;
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
 const hit=raycaster.intersectObjects(lootMeshes.filter(m=>m.visible&&m.parent.visible),false)[0];if(!hit)return;
 selectedLoot=hit.object;const d=selectedLoot.userData;$('loot-info').textContent=`${d.name} · (${d.x}, ${d.y}), floor ${d.floor} · Ammo ${d.ammo}`;$('take-loot').disabled=false;
});
$('take-loot').onclick=()=>{if(!selectedLoot)return;selectedLoot.visible=false;$('loot-info').textContent=`Collected ${selectedLoot.userData.name} (preview only)`;selectedLoot=null;$('take-loot').disabled=true;};
$('reset-loot').onclick=()=>{lootMeshes.forEach(m=>m.visible=true);$('loot-info').textContent='Click an item to inspect it.';};
window.levelViewer={get camera(){return camera;},mapId,geometryCount:count,level,scene,liftActors,doorActors,lootMeshes};
let doorTime=0,previousDoorTime=0;
function animateDoors(time){const dt=Math.min((time-previousDoorTime)/1000,.05);previousDoorTime=time;if($('animate-doors').checked)doorTime+=dt;
 for(const a of doorActors){const phase=doorTime%8;const open=phase<2?0:phase<3.5?(phase-2)/1.5:phase<5.5?1:phase<7?1-(phase-5.5)/1.5:0;
  a.open=open;const h=.42*(1-open);a.upper.visible=a.lower.visible=h>.001;
  a.upper.scale.y=a.lower.scale.y=Math.max(.001,h);a.upper.position.y=.92-h/2;a.lower.position.y=.08+h/2;
 }
}
const occlusionMeshes=[];
scene.traverse(o=>{if(o.isMesh&&!o.material?.transparent)occlusionMeshes.push(o);});
const hiddenCells=new Set(),cameraPoint=new THREE.Vector3();
const auraBounds=new THREE.Box3(),auraCorner=new THREE.Vector3();
const auraUniforms={auraFeet:{value:new THREE.Vector2()},auraHead:{value:new THREE.Vector2()},auraRadius:{value:30},auraDepth:{value:1},auraPosition:{value:new THREE.Vector2()},auraCameraDirection:{value:new THREE.Vector2()}};
const auraMaterials=new WeakMap(),bufferSize=new THREE.Vector2();
function fadeMaterial(original){if(auraMaterials.has(original))return auraMaterials.get(original);
 const mat=original.clone();mat.transparent=true;mat.depthWrite=true;mat.alphaHash=false;
 mat.onBeforeCompile=shader=>{original.onBeforeCompile(shader,renderer);Object.assign(shader.uniforms,auraUniforms);
 shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 auraWorldPosition;').replace('#include <project_vertex>', '#include <project_vertex>\nauraWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
 varying vec3 auraWorldPosition;
 uniform vec2 auraPosition;uniform vec2 auraCameraDirection;
 uniform vec2 auraFeet;uniform vec2 auraHead;uniform float auraRadius;uniform float auraDepth;
 `).replace('#include <alphahash_fragment>',`
 vec2 segment=auraHead-auraFeet;
 float along=clamp(dot(gl_FragCoord.xy-auraFeet,segment)/max(dot(segment,segment),1.0),0.0,1.0);
 float distanceToBody=length(gl_FragCoord.xy-(auraFeet+along*segment));
 float auraOpacity=mix(.02,1.0,smoothstep(auraRadius*.4,auraRadius,distanceToBody));
 if(gl_FragCoord.z<auraDepth && dot(auraWorldPosition.xz-auraPosition,auraCameraDirection)>0.0)diffuseColor.a*=auraOpacity;
 #include <alphahash_fragment>
 `);
 };mat.customProgramCacheKey=()=>original.customProgramCacheKey()+'-character-aura-v4';auraMaterials.set(original,mat);return mat;
}
function restoreOcclusion(){for(const mesh of hiddenCells){mesh.material=mesh.userData.opaqueMaterial;}hiddenCells.clear();}
function revealCharacter(){
 if(!$('occlusion').checked||!soldier.actor.visible)return;
 scene.updateMatrixWorld(true);camera.updateMatrixWorld();camera.getWorldPosition(cameraPoint);renderer.getDrawingBufferSize(bufferSize);
 const p=soldier.actor.position;
 const project=(height)=>new THREE.Vector3(p.x,p.y+height,p.z).project(camera);
 const feet=project(.1),head=project(.82);
 auraUniforms.auraFeet.value.set((feet.x*.5+.5)*bufferSize.x,(feet.y*.5+.5)*bufferSize.y);
 auraUniforms.auraHead.value.set((head.x*.5+.5)*bufferSize.x,(head.y*.5+.5)*bufferSize.y);
 auraUniforms.auraRadius.value=5*Math.max(12*renderer.getPixelRatio(),auraUniforms.auraFeet.value.distanceTo(auraUniforms.auraHead.value)*.48);
 // Stop at the character's camera-depth plane: background walls stay opaque.
 const characterDepth=project(.45);
 auraUniforms.auraDepth.value=characterDepth.z*.5+.5;
 auraUniforms.auraPosition.value.set(p.x,p.z);
 auraUniforms.auraCameraDirection.value.set(cameraPoint.x-p.x,cameraPoint.z-p.z).normalize();
 const eligible=occlusionMeshes.filter(mesh=>{for(let parent=mesh;parent;parent=parent.parent)if(!parent.visible)return false;return true;});
 // Select every visible cell overlapping the aura, not just silhouette ray hits.
 const radius=auraUniforms.auraRadius.value;
 const minAuraX=Math.min(auraUniforms.auraFeet.value.x,auraUniforms.auraHead.value.x)-radius;
 const maxAuraX=Math.max(auraUniforms.auraFeet.value.x,auraUniforms.auraHead.value.x)+radius;
 const minAuraY=Math.min(auraUniforms.auraFeet.value.y,auraUniforms.auraHead.value.y)-radius;
 const maxAuraY=Math.max(auraUniforms.auraFeet.value.y,auraUniforms.auraHead.value.y)+radius;
 for(const mesh of eligible){
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  auraBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  // Reject whole cells behind her before changing their material.
  const direction=auraUniforms.auraCameraDirection.value;
  const frontX=direction.x>=0?auraBounds.max.x:auraBounds.min.x;
  const frontZ=direction.y>=0?auraBounds.max.z:auraBounds.min.z;
  if((frontX-p.x)*direction.x+(frontZ-p.z)*direction.y<=0)continue;
  // Keep the ground beneath her solid; upper floors still receive the aura.
  if(auraBounds.max.y<=p.y+.03)continue;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,minDepth=Infinity;
  for(let i=0;i<8;i++){
   auraCorner.set(i&1?auraBounds.max.x:auraBounds.min.x,i&2?auraBounds.max.y:auraBounds.min.y,i&4?auraBounds.max.z:auraBounds.min.z).project(camera);
   const x=(auraCorner.x*.5+.5)*bufferSize.x,y=(auraCorner.y*.5+.5)*bufferSize.y;
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);minDepth=Math.min(minDepth,auraCorner.z*.5+.5);
  }
  if(minDepth<auraUniforms.auraDepth.value&&maxX>=minAuraX&&minX<=maxAuraX&&maxY>=minAuraY&&minY<=maxAuraY)hiddenCells.add(mesh);
 }
 for(const mesh of hiddenCells){const original=mesh.material;mesh.userData.opaqueMaterial=original;mesh.material=Array.isArray(original)?original.map(fadeMaterial):fadeMaterial(original);}
}

const soldier=await addSoldier({scene,level,getCamera:()=>camera,controls});window.levelViewer.soldier=soldier;let characterTime=0;
renderer.setAnimationLoop(time=>{restoreOcclusion();const dt=Math.min((time-characterTime)/1000,.05);characterTime=time;soldier.update(dt);sun.target.position.copy(soldier.actor.position);sun.position.copy(soldier.actor.position).add(new THREE.Vector3(-12,22,10));updateWallLights(dt);animateLifts(time);animateDoors(time);animatePortals(time);updateAmbience();controls.update();revealCharacter();renderer.render(scene,camera);});
}catch(error){$('error').textContent=error.message;console.error(error);}
