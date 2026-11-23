import { readFile } from 'node:fs/promises';
import { readLevel } from '../src/level.mjs';

const training = new URL('../external/original/HiredGunsCD32_DevFiles/Maps/Game/Map43_Training/43.map', import.meta.url);
const level = readLevel(await readFile(process.argv[2] ?? training));
const floor = Number(process.argv[3] ?? level.starts[0].floor);
const markers = new Map();
for (const [i, pos] of [...level.starts, level.exit].entries()) {
  const label = i === 4 ? 'E' : String(i + 1);
  console.log(label, pos);
  if (pos.floor === floor) markers.set(pos.y * level.width + pos.x, label);
}
console.log('Map %d, floor %d | # block, . floor, ~ water, E exit', level.number, floor);
for (let y = 0; y < level.depth; y++) {
  let row = '';
  for (let x = 0; x < level.width; x++) {
    const c = level.cell(x, y, floor);
    const glyph = c.blockType !== null ? '#' : c.flags & 4 ? '~' : c.floorType !== null ? '.' : ' ';
    row += markers.get(y * level.width + x) ?? glyph;
  }
  console.log(row);
}
