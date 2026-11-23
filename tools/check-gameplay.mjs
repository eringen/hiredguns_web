// Run after make preview-build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readLevel} from '../src/level.mjs';
import {inventorySession} from '../src/inventory.mjs';
import {machinery} from '../src/machinery.mjs';
import {combat} from '../src/combat.mjs';
import {scannerType,mapTile,scrollMap} from '../src/dts.mjs';
const load=id=>readLevel(fs.readFileSync('build/preview/maps/'+id+'.map'));
const eq=JSON.parse(fs.readFileSync('build/preview/equipment.json'));
const coordinates=k=>[k%23,Math.floor(k/23)%23,Math.floor(k/529)];
const level=load(1), inv=inventorySession(level,eq), machines=machinery(level,inv.players);
const p=inv.players[0];
const lift=level.lifts[0], [x,y,floor]=coordinates(lift.key);
Object.assign(p,{x,y,floor});
machines.panel(16,7,9);
assert.equal(lift.dir,2);
assert.equal(machines.liftsTick(),true);
assert.equal(lift.height,10);
assert.equal(p.floor,10);
const door=level.doors.find(d=>d.key && !d.dir && !d.buttonOnly);
const pos=coordinates(door.key);
assert.ok([20,21].includes(level.cell(...pos).blockType));
machines.bump(...pos,p);
for(let i=0;i<11;i++) machines.doorsTick();
assert.equal(level.cell(...pos).blockType,null);
for(let i=0;i<door.delay+11;i++) machines.doorsTick();
assert.ok([20,21].includes(level.cell(...pos).blockType));
const exceptions=[];
for(let id=1;id<=47;id++) {
  const m=load(id);
  m.buttons.forEach((b,i)=>{
    if(!b.used) return;
    b.actions.forEach((op,n)=>{
      if(op<9 || op===13 || op>18) return;
      const target=b.targets[n];
      const slot=op<=12?m.lifts[(target-9294)/10]:m.doors[(target-9616)/12];
      assert.ok(slot);
      if(!slot.key) exceptions.push([id,i,n]);
    });
  });
}
assert.deepEqual(exceptions,[[21,18,0],[21,18,1],[46,1,0]]);
assert.equal(eq.monsters.length,80);
assert.equal(scannerType(p),79);
assert.equal(scannerType(inv.players[2]),0);
assert.equal(scannerType({...p,held:{id:80}}),80);
const panel={};scrollMap(panel,-20,80);assert.deepEqual(panel,{x:4,y:20});
assert.equal(mapTile(level,...pos,0,79,new Set()),0);
assert.ok(mapTile(level,...pos,0,80,new Set()));
const test=load(43), bag=inventorySession(test,eq), battle=combat(test,eq,bag,()=>{});
battle.start();
const [gunner,victim]=bag.players;
Object.assign(gunner,{x:4,y:5,floor:8,dir:1});
Object.assign(victim,{x:5,y:5,floor:8});
const gun=eq.items.findIndex(item=>item?.category===0 && item.damagePerHit && item.burst);
gunner.held={id:gun,damage:0,ammo:1};
const initial=victim.fitness,def=eq.items[gun];
battle.use(gunner);
assert.equal(gunner.held.ammo,0);
assert.equal(victim.fitness,initial-Math.floor(def.damagePerHit*def.burst*512/victim.character.physique)*50);
const fragile=eq.items.findIndex(item=>item?.maxDamage && item.waterDamage);
victim.held={id:fragile,ammo:0,damage:0};
test.setTerrain((8*23+5)*23+5,1|4|(2<<17));
bag.waterDamageTick();
assert.ok(victim.held.damage || victim.held.id!==fragile);
const faller=bag.players[2];Object.assign(faller,{x:15,y:15,floor:8});
const k=(8*23+15)*23+15;
test.setTerrain(k,0);test.setTerrain(k-529,1);test.setTerrain(k-1058,0);
const health=faller.fitness;
bag.gravityTick();assert.equal(faller.floor,7);bag.gravityTick();assert.ok(faller.fitness<health);
const catalog=JSON.parse(fs.readFileSync('build/preview/levels.json'));
assert.deepEqual(catalog.find(m=>m.locationType===2).routes,[7]);
assert.deepEqual(catalog.find(m=>m.id===7).routes,[2,1]);
console.log('Passed machinery links, lift rider, door cycle, scanner tiers, campaign opening, burst damage, water damage and falling.');

const spaceport=load(21), crew=inventorySession(spaceport,eq), carrier=crew.players[0];
for(const [mission,k,id,generator] of [[18,3209,29,1089],[11,1025,67,1091],[4,3392,68,1093],[17,3745,69,1095]]) {
  const original=inventorySession(load(mission),eq).at(...coordinates(k));
  assert.equal(original.id,id);
  const [x,y,floor]=coordinates(generator);Object.assign(carrier,{x,y,floor});
  carrier.held={id:71,ammo:0,damage:0};
  assert.equal(crew.drop(carrier),'Core does not fit.');
  carrier.held=original;
  const previous=crew.armed;crew.drop(carrier);assert.equal(crew.armed,previous+1);assert.equal(carrier.held,null);
  assert.equal(spaceport.cell(x,y,floor).terrain>>>28,1);
}
assert.equal(crew.armed,4);
const [human,mech]=[crew.players[1],crew.players[2]];
for(const member of [human,mech]) {
  const k=(member.floor*23+member.y)*23+member.x;
  spaceport.setTerrain(k,1|4|(3<<17));
}
const humanHealth=human.fitness,mechHealth=mech.fitness;
for(let t=0;t<150;t++) crew.waterDamageTick();
assert.ok(human.fitness<humanHealth);
assert.equal(mech.fitness,mechHealth);
const locked=load(2), squad=inventorySession(locked,eq);
const doors=machinery(locked,squad.players),d=locked.doors.find(d=>d.key && d.dir===3 && d.lock && !d.buttonOnly);
assert.ok(d);
const locksmith=squad.players[0];locksmith.pack=[];locksmith.held=null;
doors.bump(...coordinates(d.key),locksmith);assert.equal(d.dir,3);
locksmith.pack.push({id:d.lock,damage:0,ammo:0});doors.bump(...coordinates(d.key),locksmith);
assert.equal(locksmith.pack.length,0);assert.equal(d.trig,1);
const puzzle=load(11),team=inventorySession(puzzle,eq),blocks=machinery(puzzle,team.players);
const block=puzzle.pushables[0],origin=block.key,[bx,by,bz]=coordinates(origin);
const mover=team.players[0];Object.assign(mover,{x:bx-1,y:by,floor:bz});
puzzle.setTerrain(origin+1,1);puzzle.setTerrain(origin-1,1);
assert.equal(blocks.shove(mover,1,0),true);assert.equal(mover.x,bx);assert.equal(block.key,origin+1);
assert.equal(blocks.shove(mover,1,0,true),true);assert.equal(mover.x,bx-1);assert.equal(block.key,origin);
console.log('Passed original four-ring placements and generators, human/mech immersion, key consumption, and push/pull.');
const {environmentSound}=await import('../src/samples.mjs');
assert.deepEqual(environmentSound(spaceport,[human],7),{name:'Atmos07',period:713,volume:30});
assert.deepEqual(environmentSound(spaceport,[mech],7),{name:'Water',period:380,volume:63});
const timed=load(7),tides=machinery(timed,[]);
const previous=timed.water.position;tides.waterTick();assert.equal(Math.abs(timed.water.position-previous),1);
const {chatter}=await import('../src/chatter.mjs');
const lines=JSON.parse(fs.readFileSync('build/preview/chatter.json'));
const talk=load(9),members=inventorySession(talk,eq).players,radio=chatter(talk,members,lines,()=>0);
radio.take();
const trigger=talk.triggers[0],[tx,ty,tz]=coordinates(trigger.key);
Object.assign(members[2],{x:tx,y:ty,floor:tz});radio.observe();
assert.ok(radio.take().includes(members[2].character.name));radio.observe();assert.equal(radio.take(),undefined);
for(let i=0;i<50;i++) radio.second();
assert.ok(radio.take().includes(members[0].character.name));
const heavy=inventorySession(load(18),eq);
const crate=heavy.players[0];Object.assign(crate,{x:3209%23,y:Math.floor(3209/23)%23,floor:Math.floor(3209/529)});
crate.pack=Array.from({length:12},()=>({id:1,ammo:0,damage:0}));
assert.equal(heavy.pickup(crate),'Too heavy.');assert.equal(heavy.at(crate.x,crate.y,crate.floor).id,29);
console.log('Passed water ambience selection, tides, triggered dialogue, ambient chatter and carry-limit refusal.');
const cues=[];
const acoustic=load(1), motors=machinery(acoustic,[],(...args)=>cues.push(args));
const audibleDoor=acoustic.doors.find(d=>d.key && !d.dir && !d.buttonOnly);
motors.bump(...coordinates(audibleDoor.key),locksmith);
for(let i=0;i<22+audibleDoor.delay;i++) motors.doorsTick();
assert.ok(cues.some(([n,period])=>n==='DoorOpening' && period===428));
assert.ok(cues.some(([n,period])=>n==='DoorClosed' && period===568));
const bank=fs.readFileSync('external/original/HiredGunsCD32_DevFiles/Data/GameChip.dat/Misc.sfx');
for(const [slot,name] of [[1,'BlockSlide'],[4,'DoorClosed'],[5,'DoorOpening'],[7,'Button']]){
  const body=bank.indexOf('BODY',bank.readUInt32BE((slot-1)*4));
  assert.deepEqual(fs.readFileSync('build/preview/'+name+'.pcm'),bank.subarray(body+8,body+8+bank.readUInt32BE(body+4)));
}
console.log('Door cues use the original sample bytes and Paula periods.');

// Mission 5 has a real pressure pad wired to a dormant type-33 egg.
const hatchMap=load(5), hatchTeam=inventorySession(hatchMap,eq), hatchSounds=[];
const encounter=combat(hatchMap,eq,hatchTeam,(...cue)=>hatchSounds.push(cue));
encounter.start();
const switches=machinery(hatchMap,hatchTeam.players,()=>{},encounter.at,()=>{},encounter.hatchAt);
const eggPos=coordinates(4966), monsterDef=eq.monsters[33];
assert.equal(hatchMap.cell(...eggPos).automap>>>20,4095);
assert.equal(encounter.at(...eggPos),undefined);
switches.pad(21,10,9,false);
const spawned=encounter.at(...eggPos);
assert.equal(spawned.type,33);
assert.equal(spawned.fitness,65535);
switches.pad(21,10,9,false);
assert.equal(encounter.snapshot().actors.filter(m=>m===spawned).length,1);
const shooter=hatchTeam.players[0];
Object.assign(shooter,{x:eggPos[0]-1,y:eggPos[1],floor:eggPos[2],dir:1,held:{id:gun,ammo:1,damage:0}});
encounter.use(shooter);
assert.equal(spawned.fitness,65535-Math.floor(def.damagePerHit*def.burst*512/monsterDef.physique)*100);
const shotMap=load(5), shotTeam=inventorySession(shotMap,eq), shot=combat(shotMap,eq,shotTeam,()=>{});
shot.start();
Object.assign(shotTeam.players[0],{x:shooter.x,y:shooter.y,floor:shooter.floor,dir:1,held:{id:gun,ammo:1,damage:0}});
shot.use(shotTeam.players[0]);
assert.equal(shot.at(...eggPos).fitness,65535);
assert.equal(shotMap.cell(...eggPos).terrain>>>28,1);
for(let strength=0;strength<4;strength++) {
  const fighter=shotTeam.players[0];
  fighter.held={id:27,ammo:1,damage:0};
  const saved=JSON.parse(JSON.stringify(shot.snapshot()));
  assert.ok(shot.throwGrenade(fighter,strength));
  assert.equal(fighter.held,null);
  const grenade=shot.grenadeAt(...eggPos);
  assert.equal(grenade.horizontal,strength);
  assert.equal(grenade.velocity,[-5,-20,-16,-9][strength]);
  shot.tick();assert.equal(shot.grenadeAt(...eggPos),undefined);
  shot.restore(saved);
}
console.log('Mission 5 pressure-pad and gunfire hatches, monster hit proportions, and all four grenade throws passed.');

const burial=load(1),stores=inventorySession(burial,eq),[fallen,looter]=stores.players;
const floorKey=(8*23+12)*23+12;
burial.setTerrain(floorKey,1);burial.setTerrain(floorKey-529,0);
Object.assign(fallen,{x:12,y:12,floor:8,held:{id:71,damage:3,ammo:0},pack:[{id:76,damage:4,ammo:0}]});
stores.hit(fallen,10000000,false,'melee');
assert.equal(burial.cell(12,12,8).terrain>>>28,7);
Object.assign(looter,{x:12,y:12,floor:8,held:null,pack:[]});
stores.pickup(looter,true);assert.deepEqual(looter.held,{id:71,damage:3,ammo:0});
assert.equal(fallen.held,null);assert.equal(stores.at(12,12,8).id,76);
stores.drop(looter);assert.deepEqual(fallen.pack.map(a=>a.id),[76,71]);
stores.pickup(looter);assert.equal(looter.pack[0].damage,4);
const persisted=JSON.parse(JSON.stringify(stores.snapshot()));
stores.restore(persisted);assert.equal(stores.at(12,12,8).id,71);
looter.pack=Array.from({length:30},()=>({id:76,damage:0,ammo:0}));
assert.equal(stores.pickup(looter),'Pack full.');assert.equal(looter.noRoomFrames,150);
assert.equal(stores.at(12,12,8).id,71);

const deathMap=load(5), deathParty=inventorySession(deathMap,eq),fight=combat(deathMap,eq,deathParty,()=>{});
fight.start();
const enemy={x:8,y:8,floor:8,type:33,dir:0,wait:30,fitness:1};
const deadKey=(8*23+8)*23+8;
deathMap.setTerrain(deadKey,1);
fight.restore({...fight.snapshot(),actors:[enemy]});
Object.assign(deathParty.players[0],{x:7,y:8,floor:8,dir:1,held:{id:gun,ammo:1,damage:0}});
fight.use(deathParty.players[0]);
assert.equal(fight.at(8,8,8),undefined);
assert.equal(deathMap.cell(8,8,8).terrain>>>28,eq.monsters[33].graphics===deathMap.firstMonster?14:15);
console.log('Character remains, held-first looting, item condition, full-pack refusal and monster remains passed.');

const attackMap=load(1), attackTeam=inventorySession(attackMap,eq), shots=[];
const rangedBattle=combat(attackMap,eq,attackTeam,()=>{},(...cue)=>shots.push(cue));
rangedBattle.start();
const rangedType=eq.monsters.findIndex(m=>m.fireballDensity && m.range>=3);
Object.assign(attackTeam.players[0],{x:12,y:10,floor:8});
for(let x=9;x<=12;x++) attackMap.setTerrain((8*23+10)*23+x,1);
rangedBattle.restore({...rangedBattle.snapshot(),actors:[{x:9,y:10,floor:8,type:rangedType,dir:1,wait:1,fitness:65535}]});
rangedBattle.tick();
assert.deepEqual(shots,[['Gun',95,1,47]]);
const voices=[], voiceTeam=inventorySession(load(1),eq,[0,1,2,3],(...cue)=>voices.push(cue));
for(const member of voiceTeam.players) {
  member.gruntFrames=100;
  const expected=['MaleGrunt','FemaleGrunt'][member.character.gender]??'MetalClang';
  const before=voices.length;
  voiceTeam.loseFitness(member,1);
  assert.equal(voices.at(-1)[0],expected);
  voiceTeam.loseFitness(member,1);
  assert.equal(voices.length,before+1);
  voiceTeam.loseFitness(member,65535);
  voiceTeam.loseFitness(member,65535);
  assert.equal(voices.length,before+(member.character.gender===1?2:1));
}
console.log('Ranged monster audio attenuation, squad injury cooldowns and one-shot death cues passed.');

// Dispatch every named CD32 psi-table entry through the same held-item path as a click.
const {physique,agePowers}=await import('../src/psionics.mjs');
for(let id=82;id<=110;id++) {
  const map=load(1),bag=inventorySession(map,eq),p=bag.players[0];
  const floor=8,k=(floor*23+10)*23+10;
  for(let y=8;y<=12;y++) for(let x=8;x<=15;x++) map.setTerrain((floor*23+y)*23+x,1);
  Object.assign(p,{x:10,y:10,floor,dir:1,held:{id,ammo:2,damage:0},pack:[{id:1,ammo:0,damage:0}],fitness:50000});
  if(id===91) map.setTerrain(k+1,3|(5<<11));
  if(id===92){map.setTerrain(k+1,0);map.setTerrain(k+1-529,0);}
  if(id===98 || id===99) map.setTerrain(k,5|(2<<17));
  if(id===107 || id===108) p.poison=655;
  const sounds=[];let revealed=false;
  const battle=combat(map,eq,bag,(...s)=>sounds.push(s),()=>{},()=>{revealed=true;});
  battle.start();
  const enemy={x:12,y:10,floor,type:33,dir:3,wait:30,fitness:65535};
  battle.restore({...battle.snapshot(),actors:[enemy],flames:[]});
  // Pin Miracle to Cure Poison and Teleport to a supported, unoccupied cell.
  const random=Math.random;
  try {
    if(id===110){p.poison=655;Math.random=()=>25/28;}
    if(id===105){map.setTerrain((10*23+11)*23+11,1);Math.random=()=>0.5;}
    battle.use(p);
  } finally {Math.random=random;}
  assert.equal(p.held.ammo,1,'amp '+id);
  assert.equal(p.psiFlash,5);
  if(id<=85) assert.equal(battle.snapshot().flames.length,id<84?1:4);
  if(id===86 || id===87) {const before=p.fitness;bag.hit(p,8000,false,id===86?'fire':'bullet');assert.equal(before-p.fitness,Math.floor(1000/p.character.physique)*50);}
  if(id===88 || id===89) assert.equal(physique(p),p.character.physique+(id===88?p.character.physique>>1:p.character.physique));
  if(id===90) assert.equal(map.cell(11,10,floor).blockType,5);
  if(id===91) assert.equal(map.cell(11,10,floor).blockType,null);
  if(id===92) assert.equal(map.cell(11,10,floor).floorType,2);
  if(id===94) assert.equal(bag.weight(p),0);
  if((id>=95 && id<=96)||(id>=101 && id<=103)) assert.ok(enemy.fitness<65535);
  if(id===97||id===100) assert.equal(p.powers.water.id,id);
  if(id===98) assert.equal(map.cell(10,10,floor).terrain&4,0);
  if(id===99) assert.equal(bag.at(10,10,floor).id,56);
  if(id===104) assert.ok(revealed);
  if(id===105) assert.deepEqual([p.x,p.y,p.floor],[11,11,10]);
  if(id===107 || id===108 || id===110) assert.equal(p.poison,0);
  if(id===108) assert.equal(p.fitness,65535);
  if(id===109) assert.ok(p.pack[0].id>=54 && p.pack[0].id<=64);
  if(p.powers) {
    const save=JSON.parse(JSON.stringify(bag.snapshot()));bag.restore(save);
    const power=Object.values(p.powers)[0];power.frames=1;assert.ok(agePowers(p));assert.deepEqual(p.powers,{});
  }
}
console.log('Passed all CD32 psionic dispatch entries, charge use, terrain changes, damage, power saves and expiry.');
