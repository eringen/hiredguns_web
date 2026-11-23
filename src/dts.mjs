// Drawviews.s scan_view, descan_view and window3. The visibility table is in
// scan order (far to near), independent of the graphics index of each slot.
export function scanTerrain(level, player, slots, rules, seen) {
  const [dx,dy] = [[0,-1],[1,0],[0,1],[-1,0]][player.dir];
  const cells = slots.map(({depth,side,dz}) => {
    const x=player.x+depth*dx-side*dy, y=player.y+depth*dy+side*dx, z=player.floor+dz;
    if (x<0 || x>=level.width || y<0 || y>=level.depth || z<0 || z>=level.height) return null;
    return {key:(z*level.depth+y)*level.width+x, terrain:level.cell(x,y,z).terrain};
  });
  cells.forEach((cell,i)=>{
    if (!cell) return;
    if (rules[i].some(group=>group.every(j=>cells[j]?.terrain & 64))) cell.terrain=128;
    if (!slots[i].dz && !(cell.terrain & 128)) seen.add(cell.key);
  });
}

export function scannerType(player) {
  const ids=[...player.pack,player.held].map(item=>item?.id);
  return ids.includes(80) ? 80 : ids.includes(79) ? 79 : 0;
}

export function scrollMap(panel,x,y) {
  panel.x=Math.max(4,Math.min(18,x));
  panel.y=Math.max(2,Math.min(20,y));
}

export function mapTile(level,x,y,z,playerIndex,scanner,seen) {
  const cell=level.cell(x,y,z);
  const key=(z*level.depth+y)*level.width+x;
  if (!scanner || (scanner===79 && !(cell.automap & (64<<playerIndex)) && !seen.has(key))) return 0;
  if (cell.terrain & 256) return cell.blockType===1 ? 15 : 23;
  if (cell.automap & 1024) return 31;
  return (cell.automap & 63) || (z && level.cell(x,y,z-1).blockType===1 ? 63 : 0);
}
