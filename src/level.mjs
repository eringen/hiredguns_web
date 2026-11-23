// File layout from Sources/Equates.i. Each cell has one word in each plane.
const WIDTH = 23;
const DEPTH = 23;
const HEIGHT = 20;
const LOCATION_BYTES = 542;
const STARTS = LOCATION_BYTES + 128;
const CELLS = WIDTH * DEPTH * HEIGHT;
const GUARD_BYTES = WIDTH * 5 * 4;
const PLANE_BYTES = GUARD_BYTES * 2 + CELLS * 4;
const FILE_BYTES = 157738;
const DATA = FILE_BYTES - 3 * PLANE_BYTES + GUARD_BYTES;

export function readLevel(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected map bytes');
  if (bytes[0] === 82 && bytes[1] === 78 && bytes[2] === 67) {
    throw new Error('Packed RNC map. Select the uncompressed development map.');
  }
  if (bytes.length !== FILE_BYTES) throw new Error('Unsupported map length');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function position(offset) {
    return { x: bytes[offset], y: bytes[offset + 1], floor: bytes[offset + 2] };
  }
  const changes=new Map(), questions=new Set(),drained=new Set();
  function setTerrain(key,word) {
    if(!Number.isInteger(key) || key<0 || key>=CELLS) throw new RangeError('Outside map');
    changes.set(key,word>>>0);
  }
  function cell(x, y, floor) {
    for (const [n, limit] of [[x, WIDTH], [y, DEPTH], [floor, HEIGHT]]) {
      if (!Number.isInteger(n) || n < 0 || n >= limit) throw new RangeError('Outside map');
    }
    // Controls&Movement.s / update_player_position uses the stored floor directly.
    const offset = DATA + 4 * ((floor * DEPTH + y) * WIDTH + x);
    const terrain = changes.get((offset-DATA)/4) ?? view.getUint32(offset);
    return {
      terrain, flags: terrain & 511,
      floorType: terrain & 1 ? (terrain >>> 9) & 3 : null,
      blockType: terrain & 2 ? (terrain >>> 11) & 63 : null,
      automap: ((view.getUint32(offset + PLANE_BYTES) & (drained.has((offset-DATA)/4)?~2048:-1)) | (questions.has((offset-DATA)/4)?1024:0))>>>0,
      contents: view.getUint32(offset + 2 * PLANE_BYTES)
    };
  }
  const messageAt=offset=>{
    const end=bytes.indexOf(0,offset);
    return new TextDecoder('latin1').decode(bytes.subarray(offset,end));
  };
  const triggers=[];
  for(let i=0;i<50;i++){
    const offset=3512+i*6,position=view.getUint32(offset);
    if(!position) break;
    const textOffset=view.getUint16(offset+4);
    if(position<4*CELLS && textOffset<3064) triggers.push({key:position/4,text:messageAt(3816+textOffset+8)});
  }
  return {
    intro:messageAt(550),triggers,
    width: WIDTH, depth: DEPTH, height: HEIGHT,
    number: bytes[526], firstMonster:bytes[530], secondMonster:bytes[531], sky:bytes[532], horizons:bytes.subarray(1208,3512), style: bytes[533],
    starts: Array.from({length: 4}, (_, i) => position(STARTS + 3 * i)),
    water:{position:view.getUint16(686),low:view.getUint16(688),high:view.getUint16(690),speed:view.getUint16(694),up:true},
    pushables:Array.from({length:32},(_,i)=>({key:view.getUint16(10544+i*6)/4,terrain:view.getUint32(10546+i*6)})).filter(b=>b.key),
    changes,setTerrain,questions,drained,signs:bytes.subarray(DATA-GUARD_BYTES-36*480,DATA-GUARD_BYTES),terrainOffset:DATA-LOCATION_BYTES,
    buttons:Array.from({length:32},(_,i)=>{
      const at=8940+i*28;
      return {used:bytes[at],actions:[bytes[at+1],bytes[at+2]],targets:[view.getUint32(at+4),view.getUint32(at+8)]};
    }),
    lifts:Array.from({length:32},(_,i)=>{
      const at=9836+i*10;
      return {key:view.getUint16(at)/4,height:bytes[at+2],min:bytes[at+3],max:bytes[at+4],dir:bytes[at+5],
        weight:bytes[at+6],up:bytes[at+7],down:bytes[at+8],auto:bytes[at+9]};
    }),
    doors:Array.from({length:32},(_,i)=>{
      const at=10158+i*12;
      return {key:view.getUint16(at)/4,trig:bytes[at+2],dir:bytes[at+3],type:view.getUint32(at+4),
        delay:view.getInt8(at+8),count:bytes[at+9],lock:bytes[at+10],buttonOnly:bytes[at+11]};
    }),
    exit: position(STARTS + 12), cell
  };
}
