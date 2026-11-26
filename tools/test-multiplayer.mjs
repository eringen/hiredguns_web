import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import {readRoomUpdate} from '../src/room-wire.mjs';

test('shared squad, private rooms and socket-owned commands', {timeout:10000}, async ()=>{
  const server=spawn(process.execPath,['tools/multiplayer-server.mjs'],{env:{...process.env,PORT:'0',PUBLIC_ORIGIN:'https://hiredguns.negis.family'}});
  const sockets=[];
  try {
    const [line]=await once(server.stdout,'data');
    const host='127.0.0.1:'+line.toString().trim().split(':').pop();
    const next=async socket=>JSON.parse((await once(socket,'message'))[0]);
    const connect=id=>{
      const socket=new WebSocket('ws://'+host+'/rooms/'+id,{origin:'https://hiredguns.negis.family'});
      sockets.push(socket);
      return socket;
    };
    const a=connect('new'), first=await next(a);
    const joined=next(a), b=connect(first.room+'?updates=1'), sections={};
    const receive=async()=>readRoomUpdate(sections,await next(b));
    const second=await receive();
    assert.equal(first.slot,0);
    assert.equal(second.slot,1);
    const compare=(full,compact)=>{
      const common=({slot,token,...state})=>state;
      assert.deepEqual(common(compact),common(full));
    };
    compare(await joined,second);
    const aMoved=next(a), bMoved=next(b);
    b.send(JSON.stringify({slot:first.slot,action:'Right'}));
    b.send(JSON.stringify({slot:second.slot,action:'Right'}));
    const moved=await aMoved;
    const turn=await bMoved;
    assert.ok(!('machines' in turn.sections) && !('members' in turn.sections));
    compare(moved,readRoomUpdate(sections,turn));
    assert.equal(moved.squad[0].dir,0);
    assert.equal(moved.squad[1].dir,1);
    const changed=receive();
    a.send(JSON.stringify({slot:first.slot,action:'Store'}));
    assert.equal((await changed).squad[0].mode,1);
    const store=async action=>{
      const update=receive();
      a.send(JSON.stringify({slot:0,action}));
      return (await update).squad[0];
    };
    const equipped=await store('Right');
    assert.deepEqual(equipped.held,first.squad[0].pack[0]);
    assert.equal(equipped.dir,first.squad[0].dir);
    assert.equal((await store('Back')).index,1);
    assert.equal((await store('Forward')).index,0);
    assert.deepEqual((await store('Left')).pack,first.squad[0].pack);
    await store('Right');
    await store('View');
    const shotPacket=next(a);
    const fired=await store('Fire');
    const burst=await shotPacket;
    assert.ok(burst.effects[0].shot);
    assert.equal(burst.effects[0].flashFrames,undefined);
    assert.equal(burst.events.filter(e=>e.sample===2).length,1);
    assert.ok(fired.held.ammo<equipped.held.ammo);
    const loaded=await store('Pull');
    assert.ok(loaded.held.ammo>fired.held.ammo);
    await store('Store');
    for(let i=0;i<loaded.pack.length-1;i++) await store('Back');
    const grenade=await store('Right');
    assert.equal(grenade.held.id,27);
    await store('View');
    assert.equal((await store('Throw power')).throwPower,0);
    const thrown=await store('Fire');
    assert.equal(thrown.held.ammo,grenade.held.ammo-1);
    const disconnected=once(a,'close');
    for(const capacity of [2,3,4]){
      const state=await next(connect('new-'+capacity));
      assert.equal(state.occupied.length,capacity);
      assert.equal(state.squad.length,capacity);
      for(let slot=1;slot<capacity;slot++) assert.equal((await next(connect(state.room))).slot,slot);
      const [code,reason]=await once(connect(state.room),'close');
      assert.equal(code,1008);
      assert.equal(reason.toString(),'Room full');
    }
    const independent=connect('new');
    assert.notEqual((await next(independent)).room,first.room);
    const left=next(a);
    b.close();
    assert.deepEqual((await left).occupied,[true,false,false,false]);
    a.close();
    await disconnected;
    const rejoined=await next(connect(first.room));
    assert.equal(rejoined.room,first.room);
    assert.deepEqual(rejoined.squad,moved.squad.map((p,i)=>i===0?thrown:p));
  } finally {
    for (const socket of sockets) socket.terminate();
    server.kill();
  }
});

import {inventorySession} from '../src/inventory.mjs';
import {activeEffects,advanceEffects,syncEffects} from '../src/effects.mjs';
import {readLevel} from '../src/level.mjs';
import {readFileSync} from 'node:fs';

test('a melee hit transmits its claw sprite, health cue and duration exactly once',()=>{
  const equipment=JSON.parse(readFileSync('build/preview/equipment.json','utf8'));
  const level=readLevel(readFileSync('build/preview/maps/43.map'));
  const sounds=[],inventory=inventorySession(level,equipment,[0,1],name=>sounds.push(name));
  const p=inventory.players[0],view={},deadlines={};
  p.gruntFrames=100;
  inventory.hit(p,2000,false,'melee');
  const mark=p.claws?'claws':'bigClaws';
  assert.ok(p[mark].frames>1);
  assert.deepEqual(sounds,['MetalClang']);
  const snapshot=()=>JSON.parse(JSON.stringify(activeEffects(p)));
  syncEffects(view,snapshot(),10,deadlines);
  assert.deepEqual(view[mark],p[mark]);
  assert.equal(view.healthFrames,p.healthFrames);
  advanceEffects(view,equipment);
  const remaining=view[mark].frames;
  syncEffects(view,snapshot(),10,deadlines);
  assert.equal(view[mark].frames,remaining);
  for(let i=0;i<remaining;i++) advanceEffects(view,equipment);
  syncEffects(view,snapshot(),10,deadlines);
  assert.equal(view[mark],null);
});
